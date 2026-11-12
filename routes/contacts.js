const router = require('express').Router();
const db = require('../db/connection');

// GET /api/contacts — lista con filtros
router.get('/', async (req, res) => {
  try {
    const { search, stage, limit = 50, offset = 0 } = req.query;

    let where = ['1=1'];
    let params = [];
    let i = 1;

    if (search) {
      where.push(`(ct.name ILIKE $${i} OR ct.phone ILIKE $${i})`);
      params.push(`%${search}%`);
      i++;
    }

    if (stage) {
      where.push(`c.stage = $${i}`);
      params.push(stage);
      i++;
    }

    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(`
      SELECT ct.id, ct.name, ct.phone, ct.city, ct.source, ct.instagram,
             ct.is_first_iphone, ct.current_device, ct.created_at,
             ct.ai_enabled, ct.followups_enabled,
             c.id as conv_id, c.stage, c.product_interest,
             c.last_message_at,
             ps.label as stage_label, ps.color as stage_color
      FROM contacts ct
      LEFT JOIN conversations c ON c.contact_id = ct.id
        AND c.id = (SELECT id FROM conversations WHERE contact_id = ct.id ORDER BY created_at DESC LIMIT 1)
      LEFT JOIN pipeline_stages ps ON ps.name = c.stage
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(c.last_message_at, ct.created_at) DESC
      LIMIT $${i} OFFSET $${i + 1}
    `, params);

    const countResult = await db.query(`
      SELECT COUNT(DISTINCT ct.id) FROM contacts ct
      LEFT JOIN conversations c ON c.contact_id = ct.id
      WHERE ${where.join(' AND ')}
    `, params.slice(0, -2));

    res.json({
      contacts: result.rows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contacts/:id — detalle completo
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [contact, conversations, appointments, sales, tradeIns, cobros, productos] = await Promise.all([
      db.query(`SELECT * FROM contacts WHERE id = $1`, [id]),
      db.query(`SELECT c.*, ps.label as stage_label, ps.color as stage_color
                FROM conversations c
                LEFT JOIN pipeline_stages ps ON ps.name = c.stage
                WHERE c.contact_id = $1 ORDER BY c.created_at DESC`, [id]),
      db.query(`SELECT a.*, p.model AS producto_model, p.storage_gb AS producto_gb, p.color AS producto_color
                FROM appointments a
                LEFT JOIN productos p ON p.id = a.producto_id
                WHERE a.contact_id = $1 ORDER BY a.scheduled_at DESC`, [id]),
      db.query(`SELECT * FROM sales WHERE contact_id = $1 ORDER BY sold_at DESC`, [id]),
      db.query(`SELECT * FROM trade_ins WHERE contact_id = $1 ORDER BY created_at DESC`, [id]),
      db.query(`SELECT co.*,
                       (SELECT json_agg(json_build_object('method',cp.method,'amount',cp.amount))
                        FROM cobro_payments cp WHERE cp.cobro_id = co.id) AS payments
                FROM cobros co
                JOIN clients cl ON cl.id = co.client_id
                WHERE cl.contact_id = $1 ORDER BY co.created_at DESC`, [id]),
      db.query(`SELECT p.* FROM productos p
                JOIN clients cl ON cl.id = p.client_id
                WHERE cl.contact_id = $1 AND p.status = 'vendido'
                ORDER BY p.sold_at DESC`, [id]),
    ]);

    if (!contact.rows[0]) return res.status(404).json({ error: 'Contacto no encontrado' });

    res.json({
      contact: contact.rows[0],
      conversations: conversations.rows,
      appointments: appointments.rows,
      sales: sales.rows,
      tradeIns: tradeIns.rows,
      cobros: cobros.rows,
      productosComprados: productos.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contacts — crear contacto
router.post('/', async (req, res) => {
  try {
    const { name, phone, whatsapp_id, city, source, is_first_iphone, current_device, notes, instagram } = req.body;

    if (!name && !phone) {
      return res.status(400).json({ error: 'Ingresá al menos un nombre o un teléfono' });
    }

    // Si viene whatsapp_id (mensaje entrante real) y ya existe un contacto con ese whatsapp_id,
    // se actualiza ese registro puntual en vez de crear uno nuevo. El teléfono ya no es
    // identificador único — puede repetirse entre distintos contactos.
    if (whatsapp_id) {
      const existing = await db.query('SELECT * FROM contacts WHERE whatsapp_id = $1', [whatsapp_id]);
      if (existing.rows[0]) {
        const updated = await db.query(`
          UPDATE contacts SET
            name = COALESCE($1, name),
            phone = COALESCE($2, phone),
            instagram = COALESCE($3, instagram),
            updated_at = NOW()
          WHERE id = $4 RETURNING *
        `, [name, phone, instagram, existing.rows[0].id]);
        return res.status(200).json(updated.rows[0]);
      }
    }

    const result = await db.query(`
      INSERT INTO contacts (name, phone, whatsapp_id, city, source, is_first_iphone, current_device, notes, instagram)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [name || null, phone || null, whatsapp_id || null, city || 'Bahía Blanca', source || 'whatsapp', is_first_iphone, current_device, notes, instagram]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/contacts/:id — actualizar
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, city, source, is_first_iphone, current_device, notes, instagram,
            ai_enabled, followups_enabled, ai_disabled_reason } = req.body;

    const result = await db.query(`
      UPDATE contacts SET
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        city = COALESCE($3, city),
        source = COALESCE($4, source),
        is_first_iphone = COALESCE($5, is_first_iphone),
        current_device = COALESCE($6, current_device),
        notes = COALESCE($7, notes),
        instagram = COALESCE($8, instagram),
        ai_enabled = COALESCE($9, ai_enabled),
        followups_enabled = COALESCE($10, followups_enabled),
        ai_disabled_reason = COALESCE($11, ai_disabled_reason),
        ai_disabled_at = CASE WHEN $9 = FALSE AND ai_enabled = TRUE THEN NOW()
                              WHEN $9 = TRUE THEN NULL ELSE ai_disabled_at END,
        updated_at = NOW()
      WHERE id = $12 RETURNING *
    `, [name, phone, city, source, is_first_iphone, current_device, notes, instagram,
        ai_enabled, followups_enabled, ai_disabled_reason, id]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/contacts/:id/toggle — activar/desactivar IA o seguimientos
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { field, value, reason } = req.body;
    if (!['ai_enabled', 'followups_enabled'].includes(field)) {
      return res.status(400).json({ error: 'Campo inválido' });
    }
    const extra = field === 'ai_enabled'
      ? `, ai_disabled_at = ${value ? 'NULL' : 'NOW()'}, ai_disabled_reason = $3`
      : '';
    const params = field === 'ai_enabled'
      ? [value, req.params.id, reason || null]
      : [value, req.params.id];

    const r = await db.query(
      `UPDATE contacts SET ${field} = $1${extra}, updated_at = NOW() WHERE id = $2 RETURNING *`,
      params
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/contacts/:id/trade-in — registrar canje del lead
router.post('/:id/trade-in', async (req, res) => {
  try {
    const f = req.body;
    if (!f.model) return res.status(400).json({ error: 'El modelo es requerido' });

    const r = await db.query(`
      INSERT INTO trade_ins (
        contact_id, model, storage_gb, battery_pct, condition_notes,
        has_broken_screen, has_broken_back, has_no_face_id, has_incell_screen,
        estimated_value_usd
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [
      req.params.id, f.model, f.storage_gb || null, f.battery_pct || null, f.condition_notes || null,
      f.has_broken_screen || false, f.has_broken_back || false,
      f.has_no_face_id || false, f.has_incell_screen || false,
      f.estimated_value_usd || null,
    ]);

    // Marcar has_trade_in en la conversación activa
    await db.query(`
      UPDATE conversations SET has_trade_in = TRUE, updated_at = NOW()
      WHERE contact_id = $1 AND stage NOT IN ('ganado','perdido')
    `, [req.params.id]);

    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/contacts/trade-in/:tradeInId
router.patch('/trade-in/:tradeInId', async (req, res) => {
  try {
    const f = req.body;
    const r = await db.query(`
      UPDATE trade_ins SET
        model = COALESCE($1, model), storage_gb = COALESCE($2, storage_gb),
        battery_pct = COALESCE($3, battery_pct), condition_notes = COALESCE($4, condition_notes),
        has_broken_screen = COALESCE($5, has_broken_screen), has_broken_back = COALESCE($6, has_broken_back),
        has_no_face_id = COALESCE($7, has_no_face_id), has_incell_screen = COALESCE($8, has_incell_screen),
        estimated_value_usd = COALESCE($9, estimated_value_usd),
        actual_value_usd = COALESCE($10, actual_value_usd),
        status = COALESCE($11, status)
      WHERE id=$12 RETURNING *
    `, [f.model, f.storage_gb, f.battery_pct, f.condition_notes,
        f.has_broken_screen, f.has_broken_back, f.has_no_face_id, f.has_incell_screen,
        f.estimated_value_usd, f.actual_value_usd, f.status, req.params.tradeInId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Canje no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/contacts/trade-in/:tradeInId
router.delete('/trade-in/:tradeInId', async (req, res) => {
  try {
    await db.query('DELETE FROM trade_ins WHERE id=$1', [req.params.tradeInId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/contacts/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM contacts WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/contacts/stats/source — % de leads por fuente (whatsapp/instagram/local/referido)
router.get('/stats/source', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT source, COUNT(*) AS count
      FROM contacts
      GROUP BY source
    `);
    const total = r.rows.reduce((s, x) => s + parseInt(x.count), 0);
    const stats = r.rows.map(x => ({
      source: x.source,
      count: parseInt(x.count),
      pct: total > 0 ? Math.round(parseInt(x.count) / total * 100) : 0,
    }));
    res.json({ total, stats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
