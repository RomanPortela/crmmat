const router = require('express').Router();
const db = require('../db/connection');

// GET /api/appointments — lista de turnos
router.get('/', async (req, res) => {
  try {
    const { date, status, upcoming } = req.query;
    let where = ['1=1'];
    let params = [];
    let i = 1;

    if (date) {
      where.push(`DATE(a.scheduled_at) = $${i}`);
      params.push(date);
      i++;
    }

    if (status) {
      where.push(`a.status = $${i}`);
      params.push(status);
      i++;
    }

    if (upcoming === 'true') {
      where.push(`a.scheduled_at >= NOW()`);
    }

    const result = await db.query(`
      SELECT a.id, a.scheduled_at, a.status, a.product_interested, a.producto_id,
             a.has_trade_in, a.trade_in_id, a.notes, a."seña_paid", a."seña_amount",
             ct.id as contact_id, ct.name, ct.phone, ct.city,
             p.model AS producto_model, p.storage_gb AS producto_gb, p.color AS producto_color,
             p.status AS producto_status,
             ti.model AS trade_in_model, ti.estimated_value_usd AS trade_in_value
      FROM appointments a
      JOIN contacts ct ON ct.id = a.contact_id
      LEFT JOIN productos p ON p.id = a.producto_id
      LEFT JOIN trade_ins ti ON ti.id = a.trade_in_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.scheduled_at ASC
    `, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/appointments/:id — detalle
router.get('/:id', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT a.*, ct.name, ct.phone, ct.city,
             p.model AS producto_model, p.storage_gb AS producto_gb, p.color AS producto_color,
             p.price AS producto_price, p.status AS producto_status,
             ti.model AS trade_in_model, ti.storage_gb AS trade_in_gb,
             ti.battery_pct AS trade_in_battery, ti.condition_notes AS trade_in_condition,
             ti.estimated_value_usd AS trade_in_value
      FROM appointments a
      JOIN contacts ct ON ct.id = a.contact_id
      LEFT JOIN productos p ON p.id = a.producto_id
      LEFT JOIN trade_ins ti ON ti.id = a.trade_in_id
      WHERE a.id = $1
    `, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Turno no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/appointments — crear turno
router.post('/', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const {
      contact_id, conversation_id, scheduled_at,
      product_interested, producto_id, has_trade_in, trade_in_id, notes
    } = req.body;
    const senaPaid = req.body["seña_paid"] ?? req.body.sena_paid ?? false;
    const senaAmount = req.body["seña_amount"] ?? req.body.sena_amount ?? null;

    if (!contact_id || !scheduled_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'contact_id y scheduled_at son requeridos' });
    }

    const result = await client.query(`
      INSERT INTO appointments
        (contact_id, conversation_id, scheduled_at, product_interested, producto_id,
         has_trade_in, trade_in_id, notes, "seña_paid", "seña_amount")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [contact_id, conversation_id, scheduled_at, product_interested, producto_id || null,
        has_trade_in || false, trade_in_id || null, notes, senaPaid, senaAmount]);

    const appointment = result.rows[0];

    // Crear el evento de calendario vinculado a este turno
    await client.query(`
      INSERT INTO calendar_events (title, start_at, type, contact_id, "seña_amount", notes, appointment_id, created_by)
      VALUES ($1,$2,'visita',$3,$4,$5,$6,$7)
    `, [
      `Turno: ${product_interested || 'Visita'}`, scheduled_at, contact_id,
      senaPaid ? senaAmount : null, notes, appointment.id,
      req.session?.user?.id || null,
    ]);

    // Actualizar stage en conversación si aplica
    if (conversation_id) {
      await client.query(`
        UPDATE conversations SET stage = 'turno_agendado', updated_at = NOW()
        WHERE id = $1 AND stage NOT IN ('ganado','perdido')
      `, [conversation_id]);
    }

    // Si se marcó producto de interés, reservarlo (pasa a señado) solo si dejó seña
    if (producto_id && senaPaid) {
      await client.query(`
        UPDATE productos SET status='señado', reserved_at=NOW(), updated_at=NOW()
        WHERE id=$1 AND status='en_stock'
      `, [producto_id]);
      await client.query(
        `INSERT INTO product_history (producto_id, action, detail) VALUES ($1,$2,$3)`,
        [producto_id, 'Señado', `Turno agendado con seña de $${senaAmount || 0}`]
      );
    }

    // Si dejó seña, crear el cobro automáticamente
    if (senaPaid && senaAmount) {
      const contact = await client.query('SELECT * FROM contacts WHERE id=$1', [contact_id]);
      let clientId = null;
      const existingClient = await client.query('SELECT id FROM clients WHERE contact_id=$1', [contact_id]);
      if (existingClient.rows[0]) clientId = existingClient.rows[0].id;

      const num = await client.query(`SELECT COUNT(*)+1 AS n FROM cobros`);
      const receiptNum = `R-${String(num.rows[0].n).padStart(5, '0')}`;

      const cobro = await client.query(`
        INSERT INTO cobros (client_id, producto_id, type, total_amount, notes, receipt_num, appointment_id)
        VALUES ($1,$2,'seña',$3,$4,$5,$6) RETURNING id
      `, [clientId, producto_id || null, senaAmount,
          `Seña por turno del ${new Date(scheduled_at).toLocaleDateString('es-AR')}`,
          receiptNum, appointment.id]);

      await client.query(`
        INSERT INTO cobro_payments (cobro_id, method, amount) VALUES ($1,'efectivo_pesos',$2)
      `, [cobro.rows[0].id, senaAmount]);
    }

    await client.query('COMMIT');
    res.status(201).json(appointment);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// PATCH /api/appointments/:id — actualizar turno
router.patch('/:id', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { scheduled_at, status, notes, product_interested, producto_id, has_trade_in, trade_in_id } = req.body;
    const senaPaid = req.body["seña_paid"] ?? req.body.sena_paid ?? null;
    const senaAmount = req.body["seña_amount"] ?? req.body.sena_amount ?? null;

    const prev = await client.query('SELECT * FROM appointments WHERE id=$1', [id]);
    if (!prev.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Turno no encontrado' }); }

    const result = await client.query(`
      UPDATE appointments SET
        scheduled_at = COALESCE($1, scheduled_at),
        status = COALESCE($2, status),
        notes = COALESCE($3, notes),
        "seña_paid" = COALESCE($4, "seña_paid"),
        "seña_amount" = COALESCE($5, "seña_amount"),
        product_interested = COALESCE($6, product_interested),
        producto_id = COALESCE($7, producto_id),
        has_trade_in = COALESCE($8, has_trade_in),
        trade_in_id = COALESCE($9, trade_in_id),
        updated_at = NOW()
      WHERE id = $10 RETURNING *
    `, [scheduled_at, status, notes, senaPaid, senaAmount, product_interested,
        producto_id, has_trade_in, trade_in_id, id]);

    const appt = result.rows[0];

    // Sincronizar el evento de calendario vinculado
    await client.query(`
      UPDATE calendar_events SET
        start_at = COALESCE($1, start_at),
        "seña_amount" = COALESCE($2, "seña_amount"),
        notes = COALESCE($3, notes)
      WHERE appointment_id = $4
    `, [scheduled_at, senaAmount, notes, id]);

    // Si recién ahora se marca la seña como pagada y no existía cobro previo, crearlo
    if (senaPaid === true && !prev.rows[0]["seña_paid"]) {
      const amount = senaAmount || appt["seña_amount"];
      if (amount) {
        let clientId = null;
        const existingClient = await client.query('SELECT id FROM clients WHERE contact_id=$1', [appt.contact_id]);
        if (existingClient.rows[0]) clientId = existingClient.rows[0].id;

        const num = await client.query(`SELECT COUNT(*)+1 AS n FROM cobros`);
        const receiptNum = `R-${String(num.rows[0].n).padStart(5, '0')}`;

        const cobro = await client.query(`
          INSERT INTO cobros (client_id, producto_id, type, total_amount, notes, receipt_num, appointment_id)
          VALUES ($1,$2,'seña',$3,$4,$5,$6) RETURNING id
        `, [clientId, appt.producto_id || null, amount,
            `Seña por turno del ${new Date(appt.scheduled_at).toLocaleDateString('es-AR')}`,
            receiptNum, appt.id]);

        await client.query(`
          INSERT INTO cobro_payments (cobro_id, method, amount) VALUES ($1,'efectivo_pesos',$2)
        `, [cobro.rows[0].id, amount]);

        if (appt.producto_id) {
          await client.query(`
            UPDATE productos SET status='señado', reserved_at=NOW(), updated_at=NOW()
            WHERE id=$1 AND status='en_stock'
          `, [appt.producto_id]);
        }
      }
    }

    await client.query('COMMIT');
    res.json(appt);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// DELETE /api/appointments/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM appointments WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
