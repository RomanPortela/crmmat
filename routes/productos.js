const router = require('express').Router();
const db = require('../db/connection');

// GET /api/productos — lista con filtros
router.get('/', async (req, res) => {
  try {
    const { search, status, category_id, limit = 100, offset = 0 } = req.query;
    const where = ['1=1'];
    const params = [];
    let i = 1;

    if (search) {
      where.push(`(p.model ILIKE $${i} OR p.imei ILIKE $${i} OR p.serial_number ILIKE $${i} OR p.color ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }
    if (status)      { where.push(`p.status = $${i}`);      params.push(status); i++; }
    if (category_id) { where.push(`p.category_id = $${i}`); params.push(category_id); i++; }

    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(`
      SELECT p.*, pc.name AS category_name,
             s.name AS supplier_name,
             c.name AS client_name, c.last_name AS client_last_name
      FROM productos p
      LEFT JOIN product_categories pc ON pc.id = p.category_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.entry_date DESC
      LIMIT $${i} OFFSET $${i + 1}
    `, params);

    const count = await db.query(
      `SELECT COUNT(*) FROM productos p WHERE ${where.join(' AND ')}`,
      params.slice(0, -2)
    );

    res.json({ productos: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/productos/stats
router.get('/stats', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='en_stock') AS en_stock,
        COUNT(*) FILTER (WHERE status='señado')   AS senados,
        COUNT(*) FILTER (WHERE status='vendido' AND DATE_TRUNC('month', sold_at)=DATE_TRUNC('month',NOW())) AS vendidos_mes,
        COALESCE(SUM(cost) FILTER (WHERE status='en_stock'),0)   AS capital_stock,
        COALESCE(SUM(price) FILTER (WHERE status='en_stock'),0)  AS valor_stock
      FROM productos
    `);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/productos/:id — detalle + historial
router.get('/:id', async (req, res) => {
  try {
    const [producto, historial] = await Promise.all([
      db.query(`
        SELECT p.*, pc.name AS category_name, s.name AS supplier_name,
               c.name AS client_name, c.last_name AS client_last_name, c.phone AS client_phone
        FROM productos p
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        LEFT JOIN clients c ON c.id = p.client_id
        WHERE p.id = $1
      `, [req.params.id]),
      db.query(`
        SELECT h.*, u.name AS user_name
        FROM product_history h
        LEFT JOIN crm_users u ON u.id = h.user_id
        WHERE h.producto_id = $1 ORDER BY h.created_at DESC
      `, [req.params.id]),
    ]);
    if (!producto.rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ producto: producto.rows[0], historial: historial.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/productos
router.post('/', async (req, res) => {
  try {
    const f = req.body;
    if (!f.model) return res.status(400).json({ error: 'El modelo es requerido' });

    const r = await db.query(`
      INSERT INTO productos (
        category_id, model, color, storage_gb, imei, serial_number, battery_pct,
        has_face_id, has_true_tone, has_original_box, accessories, warranty_months,
        status, price, cost, condition_notes, general_notes, supplier_id, entry_date
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,COALESCE($19,NOW()))
      RETURNING *
    `, [
      f.category_id || null, f.model, f.color, f.storage_gb || null, f.imei, f.serial_number,
      f.battery_pct || null, f.has_face_id !== false, f.has_true_tone !== false,
      f.has_original_box === true, f.accessories, f.warranty_months || 6,
      f.status || 'en_stock', f.price || null, f.cost || null,
      f.condition_notes, f.general_notes, f.supplier_id || null, f.entry_date || null,
    ]);

    await db.query(
      `INSERT INTO product_history (producto_id, action, detail, user_id) VALUES ($1,$2,$3,$4)`,
      [r.rows[0].id, 'Alta de producto', `Ingresó a stock — ${f.model}`, req.session.user.id]
    );

    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/productos/:id
router.patch('/:id', async (req, res) => {
  try {
    const f = req.body;
    const prev = await db.query('SELECT status, model FROM productos WHERE id=$1', [req.params.id]);
    if (!prev.rows[0]) return res.status(404).json({ error: 'No encontrado' });

    const r = await db.query(`
      UPDATE productos SET
        category_id = COALESCE($1, category_id),
        model = COALESCE($2, model),
        color = COALESCE($3, color),
        storage_gb = COALESCE($4, storage_gb),
        imei = COALESCE($5, imei),
        serial_number = COALESCE($6, serial_number),
        battery_pct = COALESCE($7, battery_pct),
        has_face_id = COALESCE($8, has_face_id),
        has_true_tone = COALESCE($9, has_true_tone),
        has_original_box = COALESCE($10, has_original_box),
        accessories = COALESCE($11, accessories),
        warranty_months = COALESCE($12, warranty_months),
        status = COALESCE($13, status),
        price = COALESCE($14, price),
        cost = COALESCE($15, cost),
        condition_notes = COALESCE($16, condition_notes),
        general_notes = COALESCE($17, general_notes),
        supplier_id = COALESCE($18, supplier_id),
        client_id = COALESCE($19, client_id),
        reserved_at = CASE WHEN $13 = 'señado'  THEN NOW() ELSE reserved_at END,
        sold_at     = CASE WHEN $13 = 'vendido' THEN NOW() ELSE sold_at END,
        updated_at = NOW()
      WHERE id = $20 RETURNING *
    `, [
      f.category_id, f.model, f.color, f.storage_gb, f.imei, f.serial_number, f.battery_pct,
      f.has_face_id, f.has_true_tone, f.has_original_box, f.accessories, f.warranty_months,
      f.status, f.price, f.cost, f.condition_notes, f.general_notes,
      f.supplier_id, f.client_id, req.params.id,
    ]);

    if (f.status && f.status !== prev.rows[0].status) {
      await db.query(
        `INSERT INTO product_history (producto_id, action, detail, user_id) VALUES ($1,$2,$3,$4)`,
        [req.params.id, 'Cambio de estado', `${prev.rows[0].status} → ${f.status}`, req.session.user.id]
      );
    }

    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/productos/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM productos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Categorías ────────────────────────────────
router.get('/categorias/list', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM product_categories ORDER BY name');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/categorias', async (req, res) => {
  try {
    const r = await db.query(
      'INSERT INTO product_categories (name) VALUES ($1) RETURNING *',
      [req.body.name]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/categorias/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM product_categories WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
