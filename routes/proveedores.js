const router = require('express').Router();
const db = require('../db/connection');

// GET /api/proveedores
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const where = ['1=1'];
    const params = [];
    if (search) { where.push(`(s.name ILIKE $1 OR s.contact ILIKE $1 OR s.phone ILIKE $1)`); params.push(`%${search}%`); }

    const r = await db.query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM supplier_orders WHERE supplier_id=s.id) AS total_pedidos,
        (SELECT COUNT(*) FROM supplier_orders WHERE supplier_id=s.id AND status='pendiente') AS pedidos_pendientes,
        (SELECT COALESCE(SUM(total_amount),0) FROM supplier_orders WHERE supplier_id=s.id) AS total_comprado,
        (SELECT COALESCE(SUM(amount),0) FROM supplier_payments WHERE supplier_id=s.id) AS total_pagado
      FROM suppliers s
      WHERE ${where.join(' AND ')}
      ORDER BY s.name
    `, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/proveedores/:id — detalle con pedidos y pagos
router.get('/:id', async (req, res) => {
  try {
    const [prov, pedidos, pagos] = await Promise.all([
      db.query('SELECT * FROM suppliers WHERE id=$1', [req.params.id]),
      db.query(`
        SELECT o.*,
          (SELECT json_agg(json_build_object('description',i.description,'quantity',i.quantity,'unit_price',i.unit_price,'total',i.total))
           FROM supplier_order_items i WHERE i.order_id=o.id) AS items
        FROM supplier_orders o WHERE o.supplier_id=$1 ORDER BY o.created_at DESC
      `, [req.params.id]),
      db.query('SELECT * FROM supplier_payments WHERE supplier_id=$1 ORDER BY paid_at DESC', [req.params.id]),
    ]);
    if (!prov.rows[0]) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json({ proveedor: prov.rows[0], pedidos: pedidos.rows, pagos: pagos.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/proveedores
router.post('/', async (req, res) => {
  try {
    const f = req.body;
    if (!f.name) return res.status(400).json({ error: 'Nombre requerido' });
    const r = await db.query(`
      INSERT INTO suppliers (name, contact, phone, email, categories, notes)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [f.name, f.contact, f.phone, f.email, f.categories, f.notes]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/proveedores/:id
router.patch('/:id', async (req, res) => {
  try {
    const f = req.body;
    const r = await db.query(`
      UPDATE suppliers SET
        name = COALESCE($1,name), contact = COALESCE($2,contact),
        phone = COALESCE($3,phone), email = COALESCE($4,email),
        categories = COALESCE($5,categories), notes = COALESCE($6,notes)
      WHERE id=$7 RETURNING *
    `, [f.name, f.contact, f.phone, f.email, f.categories, f.notes, req.params.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/proveedores/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM suppliers WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PEDIDOS ───────────────────────────────────
router.get('/pedidos/list', async (req, res) => {
  try {
    const { status } = req.query;
    const where = ['1=1'];
    const params = [];
    if (status) { where.push('o.status = $1'); params.push(status); }

    const r = await db.query(`
      SELECT o.*, s.name AS supplier_name,
        (SELECT COALESCE(SUM(amount),0) FROM supplier_payments WHERE order_id=o.id) AS pagado
      FROM supplier_orders o
      JOIN suppliers s ON s.id = o.supplier_id
      WHERE ${where.join(' AND ')}
      ORDER BY o.created_at DESC
    `, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/pedidos', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const f = req.body;
    if (!f.supplier_id) return res.status(400).json({ error: 'Proveedor requerido' });

    const o = await client.query(`
      INSERT INTO supplier_orders (supplier_id, status, total_amount, estimated_arrival, notes)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [f.supplier_id, f.status || 'pendiente', f.total_amount || 0, f.estimated_arrival || null, f.notes]);

    if (Array.isArray(f.items)) {
      for (const it of f.items) {
        await client.query(`
          INSERT INTO supplier_order_items (order_id, description, quantity, unit_price, total)
          VALUES ($1,$2,$3,$4,$5)
        `, [o.rows[0].id, it.description, it.quantity || 1, it.unit_price || 0,
            (it.quantity || 1) * (it.unit_price || 0)]);
      }
    }

    await client.query('COMMIT');
    res.status(201).json(o.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

router.patch('/pedidos/:id', async (req, res) => {
  try {
    const f = req.body;
    const r = await db.query(`
      UPDATE supplier_orders SET
        status = COALESCE($1,status),
        total_amount = COALESCE($2,total_amount),
        estimated_arrival = COALESCE($3,estimated_arrival),
        actual_arrival = COALESCE($4,actual_arrival),
        notes = COALESCE($5,notes),
        updated_at = NOW()
      WHERE id=$6 RETURNING *
    `, [f.status, f.total_amount, f.estimated_arrival, f.actual_arrival, f.notes, req.params.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PAGOS ─────────────────────────────────────
router.post('/pagos', async (req, res) => {
  try {
    const f = req.body;
    if (!f.supplier_id || !f.amount) return res.status(400).json({ error: 'Proveedor y monto requeridos' });
    const r = await db.query(`
      INSERT INTO supplier_payments (supplier_id, order_id, amount, method, paid_at, notes)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [f.supplier_id, f.order_id || null, f.amount, f.method, f.paid_at || new Date(), f.notes]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
