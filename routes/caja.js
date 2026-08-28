const router = require('express').Router();
const db = require('../db/connection');

// GET /api/caja — listado de operaciones
router.get('/', async (req, res) => {
  try {
    const { estado, from, to, limit = 100, offset = 0 } = req.query;
    const where = ['1=1'];
    const params = [];
    let i = 1;

    if (estado === 'pendiente') {
      where.push(`(ce.capital_reintegrado = FALSE OR ce.ganancia_retirada = FALSE)`);
    } else if (estado === 'cerrado') {
      where.push(`(ce.capital_reintegrado = TRUE AND ce.ganancia_retirada = TRUE)`);
    }
    if (from) { where.push(`ce.created_at >= $${i}`); params.push(from); i++; }
    if (to)   { where.push(`ce.created_at <= $${i}`); params.push(to); i++; }

    params.push(parseInt(limit), parseInt(offset));

    const r = await db.query(`
      SELECT ce.*,
             p.model AS producto_model, p.storage_gb, p.color,
             c.receipt_num, c.created_at AS cobro_date,
             cl.name AS client_name, cl.last_name AS client_last_name
      FROM caja_entries ce
      LEFT JOIN productos p ON p.id = ce.producto_id
      LEFT JOIN cobros c ON c.id = ce.cobro_id
      LEFT JOIN clients cl ON cl.id = c.client_id
      WHERE ${where.join(' AND ')}
      ORDER BY ce.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `, params);

    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/caja/resumen — KPIs de capital
router.get('/resumen', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT
        COALESCE(SUM(capital_pendiente)  FILTER (WHERE capital_reintegrado = FALSE), 0) AS capital_pendiente,
        COALESCE(SUM(ganancia_pendiente) FILTER (WHERE ganancia_retirada   = FALSE), 0) AS ganancia_pendiente,
        COALESCE(SUM(capital_pendiente)  FILTER (WHERE capital_reintegrado = TRUE),  0) AS capital_reintegrado,
        COALESCE(SUM(ganancia_pendiente) FILTER (WHERE ganancia_retirada   = TRUE),  0) AS ganancia_retirada,
        COALESCE(SUM(price), 0)  AS facturacion_total,
        COALESCE(SUM(profit), 0) AS ganancia_total,
        COUNT(*) AS operaciones,
        COUNT(*) FILTER (WHERE capital_reintegrado = TRUE AND ganancia_retirada = TRUE) AS operaciones_cerradas
      FROM caja_entries
    `);

    const mes = await db.query(`
      SELECT
        COALESCE(SUM(price), 0)  AS facturacion_mes,
        COALESCE(SUM(profit), 0) AS ganancia_mes,
        COUNT(*) AS ventas_mes
      FROM caja_entries
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
    `);

    // Capital en stock (lo que está invertido y no vendido)
    const stock = await db.query(`
      SELECT COALESCE(SUM(cost), 0) AS capital_en_stock
      FROM productos WHERE status IN ('en_stock','señado')
    `);

    const data = r.rows[0];
    const rentabilidad = parseFloat(data.facturacion_total) > 0
      ? Math.round(parseFloat(data.ganancia_total) / parseFloat(data.facturacion_total) * 100)
      : 0;

    res.json({
      ...data,
      ...mes.rows[0],
      capital_en_stock: stock.rows[0].capital_en_stock,
      rentabilidad,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/caja/:id/capital — marcar capital reintegrado
router.patch('/:id/capital', async (req, res) => {
  try {
    const { value } = req.body;
    const r = await db.query(`
      UPDATE caja_entries SET
        capital_reintegrado = $1,
        capital_reintegrado_at = CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END
      WHERE id = $2 RETURNING *
    `, [value === true, req.params.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/caja/:id/ganancia — marcar ganancia retirada
router.patch('/:id/ganancia', async (req, res) => {
  try {
    const { value } = req.body;
    const r = await db.query(`
      UPDATE caja_entries SET
        ganancia_retirada = $1,
        ganancia_retirada_at = CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END
      WHERE id = $2 RETURNING *
    `, [value === true, req.params.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/caja/manual — registrar operación manual
router.post('/manual', async (req, res) => {
  try {
    const { price, cost, notes } = req.body;
    if (!price || cost === undefined) return res.status(400).json({ error: 'Precio y costo requeridos' });
    const profit = parseFloat(price) - parseFloat(cost);
    const r = await db.query(`
      INSERT INTO caja_entries (price, cost, profit, capital_pendiente, ganancia_pendiente)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [price, cost, profit, cost, profit]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
