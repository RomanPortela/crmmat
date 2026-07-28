const router = require('express').Router();
const db = require('../db/connection');

// GET /api/calendario?month=YYYY-MM
router.get('/', async (req, res) => {
  try {
    const { month, from, to } = req.query;
    const where = ['1=1'];
    const params = [];
    let i = 1;

    if (month) {
      where.push(`DATE_TRUNC('month', e.start_at) = DATE_TRUNC('month', $${i}::date)`);
      params.push(month + '-01'); i++;
    }
    if (from) { where.push(`e.start_at >= $${i}`); params.push(from); i++; }
    if (to)   { where.push(`e.start_at <= $${i}`); params.push(to); i++; }

    const r = await db.query(`
      SELECT e.*,
             ct.name AS contact_name, ct.phone AS contact_phone,
             cl.name AS client_name, cl.last_name AS client_last_name,
             (SELECT json_agg(json_build_object(
                'id', ep.id, 'producto_id', p.id, 'model', p.model,
                'storage_gb', p.storage_gb, 'color', p.color,
                'price', p.price, 'status', p.status, 'reserved', ep.reserved
              ) ORDER BY ep.id)
              FROM calendar_event_products ep
              JOIN productos p ON p.id = ep.producto_id
              WHERE ep.event_id = e.id) AS productos
      FROM calendar_events e
      LEFT JOIN contacts ct ON ct.id = e.contact_id
      LEFT JOIN clients cl ON cl.id = e.client_id
      WHERE ${where.join(' AND ')}
      ORDER BY e.start_at ASC
    `, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/calendario/:id — detalle
router.get('/:id', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT e.*,
             ct.name AS contact_name, ct.phone AS contact_phone,
             cl.name AS client_name, cl.last_name AS client_last_name,
             (SELECT json_agg(json_build_object(
                'id', ep.id, 'producto_id', p.id, 'model', p.model,
                'storage_gb', p.storage_gb, 'color', p.color,
                'price', p.price, 'status', p.status, 'reserved', ep.reserved
              ) ORDER BY ep.id)
              FROM calendar_event_products ep
              JOIN productos p ON p.id = ep.producto_id
              WHERE ep.event_id = e.id) AS productos
      FROM calendar_events e
      LEFT JOIN contacts ct ON ct.id = e.contact_id
      LEFT JOIN clients cl ON cl.id = e.client_id
      WHERE e.id = $1
    `, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Evento no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/calendario — crear evento con productos
router.post('/', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const f = req.body;
    if (!f.title || !f.start_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Título y fecha requeridos' });
    }

    const ev = await client.query(`
      INSERT INTO calendar_events (title, description, start_at, end_at, all_day, type,
        contact_id, client_id, "seña_amount", notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [f.title, f.description, f.start_at, f.end_at || null, f.all_day === true,
        f.type || 'visita', f.contact_id || null, f.client_id || null,
        f.sena_amount || null, f.notes, req.session.user.id]);

    const eventId = ev.rows[0].id;

    // Asociar productos
    if (Array.isArray(f.products)) {
      for (const p of f.products) {
        if (!p.producto_id) continue;
        await client.query(`
          INSERT INTO calendar_event_products (event_id, producto_id, reserved)
          VALUES ($1,$2,$3) ON CONFLICT (event_id, producto_id) DO UPDATE SET reserved = EXCLUDED.reserved
        `, [eventId, p.producto_id, p.reserved === true]);

        // Si se marca como reservado, cambiar estado del producto
        if (p.reserved === true) {
          await client.query(`
            UPDATE productos SET status='señado', reserved_at=NOW(), reserved_event_id=$1, updated_at=NOW()
            WHERE id=$2 AND status='en_stock'
          `, [eventId, p.producto_id]);

          await client.query(`
            INSERT INTO product_history (producto_id, action, detail, user_id) VALUES ($1,$2,$3,$4)
          `, [p.producto_id, 'Reservado', `Evento: ${f.title}`, req.session.user.id]);
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json(ev.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// PATCH /api/calendario/:id
router.patch('/:id', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const f = req.body;

    const r = await client.query(`
      UPDATE calendar_events SET
        title = COALESCE($1,title), description = COALESCE($2,description),
        start_at = COALESCE($3,start_at), end_at = COALESCE($4,end_at),
        type = COALESCE($5,type), "seña_amount" = COALESCE($6,"seña_amount"),
        notes = COALESCE($7,notes), contact_id = COALESCE($8,contact_id),
        client_id = COALESCE($9,client_id)
      WHERE id=$10 RETURNING *
    `, [f.title, f.description, f.start_at, f.end_at, f.type,
        f.sena_amount, f.notes, f.contact_id, f.client_id, req.params.id]);

    if (!r.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    // Si vienen productos, reemplazar la asociación completa
    if (Array.isArray(f.products)) {
      // Liberar productos que estaban reservados por este evento
      const prev = await client.query(`
        SELECT producto_id FROM calendar_event_products WHERE event_id=$1 AND reserved=TRUE
      `, [req.params.id]);
      for (const row of prev.rows) {
        await client.query(`
          UPDATE productos SET status='en_stock', reserved_at=NULL, reserved_event_id=NULL, updated_at=NOW()
          WHERE id=$1 AND status='señado' AND reserved_event_id=$2
        `, [row.producto_id, req.params.id]);
      }

      await client.query('DELETE FROM calendar_event_products WHERE event_id=$1', [req.params.id]);

      for (const p of f.products) {
        if (!p.producto_id) continue;
        await client.query(`
          INSERT INTO calendar_event_products (event_id, producto_id, reserved) VALUES ($1,$2,$3)
        `, [req.params.id, p.producto_id, p.reserved === true]);

        if (p.reserved === true) {
          await client.query(`
            UPDATE productos SET status='señado', reserved_at=NOW(), reserved_event_id=$1, updated_at=NOW()
            WHERE id=$2 AND status='en_stock'
          `, [req.params.id, p.producto_id]);
        }
      }
    }

    await client.query('COMMIT');
    res.json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// PATCH /api/calendario/:id/producto/:productoId — reservar / liberar un producto puntual
router.patch('/:id/producto/:productoId', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const reserved = req.body.reserved === true;

    await client.query(`
      UPDATE calendar_event_products SET reserved=$1 WHERE event_id=$2 AND producto_id=$3
    `, [reserved, req.params.id, req.params.productoId]);

    if (reserved) {
      await client.query(`
        UPDATE productos SET status='señado', reserved_at=NOW(), reserved_event_id=$1, updated_at=NOW()
        WHERE id=$2 AND status='en_stock'
      `, [req.params.id, req.params.productoId]);
      await client.query(`
        INSERT INTO product_history (producto_id, action, detail, user_id) VALUES ($1,'Reservado',$2,$3)
      `, [req.params.productoId, `Evento #${req.params.id}`, req.session.user.id]);
    } else {
      await client.query(`
        UPDATE productos SET status='en_stock', reserved_at=NULL, reserved_event_id=NULL, updated_at=NOW()
        WHERE id=$1 AND status='señado' AND reserved_event_id=$2
      `, [req.params.productoId, req.params.id]);
      await client.query(`
        INSERT INTO product_history (producto_id, action, detail, user_id) VALUES ($1,'Liberado',$2,$3)
      `, [req.params.productoId, `Reserva cancelada del evento #${req.params.id}`, req.session.user.id]);
    }

    await client.query('COMMIT');
    res.json({ ok: true, reserved });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// DELETE /api/calendario/:id/producto/:productoId — quitar producto del evento
router.delete('/:id/producto/:productoId', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    // Liberar si estaba reservado
    await client.query(`
      UPDATE productos SET status='en_stock', reserved_at=NULL, reserved_event_id=NULL, updated_at=NOW()
      WHERE id=$1 AND status='señado' AND reserved_event_id=$2
    `, [req.params.productoId, req.params.id]);
    await client.query(`
      DELETE FROM calendar_event_products WHERE event_id=$1 AND producto_id=$2
    `, [req.params.id, req.params.productoId]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// POST /api/calendario/:id/producto — agregar producto a evento existente
router.post('/:id/producto', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { producto_id, reserved } = req.body;
    if (!producto_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'producto_id requerido' });
    }

    await client.query(`
      INSERT INTO calendar_event_products (event_id, producto_id, reserved)
      VALUES ($1,$2,$3) ON CONFLICT (event_id, producto_id) DO UPDATE SET reserved = EXCLUDED.reserved
    `, [req.params.id, producto_id, reserved === true]);

    if (reserved === true) {
      await client.query(`
        UPDATE productos SET status='señado', reserved_at=NOW(), reserved_event_id=$1, updated_at=NOW()
        WHERE id=$2 AND status='en_stock'
      `, [req.params.id, producto_id]);
    }

    await client.query('COMMIT');
    res.status(201).json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// DELETE /api/calendario/:id — libera productos reservados
router.delete('/:id', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      UPDATE productos SET status='en_stock', reserved_at=NULL, reserved_event_id=NULL, updated_at=NOW()
      WHERE reserved_event_id=$1 AND status='señado'
    `, [req.params.id]);
    await client.query('DELETE FROM calendar_events WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
