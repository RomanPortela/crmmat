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

// ═══════════════════════════════════════════════
// CAJA DEL DÍA Y CIERRES
// ═══════════════════════════════════════════════

// GET /api/caja/dia — movimientos del día en curso (sin cerrar)
router.get('/dia', async (req, res) => {
  try {
    const fecha = req.query.fecha || null;
    const dateFilter = fecha ? `DATE(c.created_at) = $1` : `DATE(c.created_at) = CURRENT_DATE`;
    const params = fecha ? [fecha] : [];

    // Cobros del día que todavía no fueron incluidos en ningún cierre
    const cobros = await db.query(`
      SELECT c.id, c.receipt_num, c.type, c.total_amount, c.currency, c.cotizacion,
             c.amount_usd, c.created_at, c.sale_id,
             cl.name AS client_name, cl.last_name AS client_last_name,
             p.model AS producto_model, p.storage_gb,
             (SELECT json_agg(json_build_object(
                'method',cp.method,'amount',cp.amount,'currency',cp.currency,'amount_usd',cp.amount_usd))
              FROM cobro_payments cp WHERE cp.cobro_id = c.id) AS payments
      FROM cobros c
      LEFT JOIN clients cl ON cl.id = c.client_id
      LEFT JOIN productos p ON p.id = c.producto_id
      WHERE ${dateFilter} AND c.cierre_id IS NULL
      ORDER BY c.created_at DESC
    `, params);

    // Totales del día separados por moneda
    const totales = await db.query(`
      SELECT
        COALESCE(SUM(c.total_amount) FILTER (WHERE c.currency='ARS'), 0) AS total_ars,
        COALESCE(SUM(c.total_amount) FILTER (WHERE c.currency='USD'), 0) AS total_usd_directo,
        COALESCE(SUM(c.amount_usd), 0) AS total_usd_equivalente,
        COUNT(*) AS cantidad_cobros,
        COUNT(*) FILTER (WHERE c.sale_id IS NOT NULL) AS cantidad_ventas,
        COUNT(*) FILTER (WHERE c.type='seña') AS cantidad_senas
      FROM cobros c
      WHERE ${dateFilter} AND c.cierre_id IS NULL
    `, params);

    // Desglose por medio de pago
    const desglose = await db.query(`
      SELECT cp.method,
             COALESCE(SUM(cp.amount) FILTER (WHERE cp.currency='ARS'), 0) AS total_ars,
             COALESCE(SUM(cp.amount) FILTER (WHERE cp.currency='USD'), 0) AS total_usd,
             COALESCE(SUM(cp.amount_usd), 0) AS total_usd_equivalente,
             COUNT(*) AS cantidad
      FROM cobro_payments cp
      JOIN cobros c ON c.id = cp.cobro_id
      WHERE ${dateFilter} AND c.cierre_id IS NULL
      GROUP BY cp.method
      ORDER BY total_usd_equivalente DESC
    `, params);

    // Ganancia generada por las ventas del día
    const ganancia = await db.query(`
      SELECT COALESCE(SUM(ce.profit), 0) AS ganancia_usd
      FROM caja_entries ce
      JOIN cobros c ON c.id = ce.cobro_id
      WHERE ${dateFilter} AND c.cierre_id IS NULL
    `, params);

    res.json({
      fecha: fecha || new Date().toISOString().split('T')[0],
      cobros: cobros.rows,
      totales: { ...totales.rows[0], ganancia_usd: ganancia.rows[0].ganancia_usd },
      desglose: desglose.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/caja/cerrar — cerrar la caja del día
router.post('/cerrar', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const fecha = req.body.fecha || new Date().toISOString().split('T')[0];

    // Verificar que haya movimientos sin cerrar
    const pendientes = await client.query(`
      SELECT COUNT(*) AS n FROM cobros
      WHERE DATE(created_at) = $1 AND cierre_id IS NULL
    `, [fecha]);

    if (parseInt(pendientes.rows[0].n) === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No hay movimientos sin cerrar para esa fecha' });
    }

    // Calcular totales
    const totales = await client.query(`
      SELECT
        COALESCE(SUM(total_amount) FILTER (WHERE currency='ARS'), 0) AS total_ars,
        COALESCE(SUM(amount_usd), 0) AS total_usd,
        COUNT(*) AS cantidad_cobros,
        COUNT(*) FILTER (WHERE sale_id IS NOT NULL) AS cantidad_ventas
      FROM cobros
      WHERE DATE(created_at) = $1 AND cierre_id IS NULL
    `, [fecha]);

    const desglose = await client.query(`
      SELECT cp.method,
             COALESCE(SUM(cp.amount) FILTER (WHERE cp.currency='ARS'), 0) AS total_ars,
             COALESCE(SUM(cp.amount) FILTER (WHERE cp.currency='USD'), 0) AS total_usd,
             COALESCE(SUM(cp.amount_usd), 0) AS total_usd_equivalente,
             COUNT(*) AS cantidad
      FROM cobro_payments cp
      JOIN cobros c ON c.id = cp.cobro_id
      WHERE DATE(c.created_at) = $1 AND c.cierre_id IS NULL
      GROUP BY cp.method
    `, [fecha]);

    const ganancia = await client.query(`
      SELECT COALESCE(SUM(ce.profit), 0) AS ganancia_usd
      FROM caja_entries ce
      JOIN cobros c ON c.id = ce.cobro_id
      WHERE DATE(c.created_at) = $1 AND c.cierre_id IS NULL
    `, [fecha]);

    const t = totales.rows[0];

    const cierre = await client.query(`
      INSERT INTO caja_cierres (fecha, closed_by, total_ars, total_usd,
        cantidad_cobros, cantidad_ventas, ganancia_usd, desglose, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [fecha, req.session.user.id, t.total_ars, t.total_usd,
        t.cantidad_cobros, t.cantidad_ventas, ganancia.rows[0].ganancia_usd,
        JSON.stringify(desglose.rows), req.body.notes || null]);

    // Marcar los cobros como incluidos en este cierre
    await client.query(`
      UPDATE cobros SET cierre_id = $1
      WHERE DATE(created_at) = $2 AND cierre_id IS NULL
    `, [cierre.rows[0].id, fecha]);

    await client.query('COMMIT');
    res.status(201).json(cierre.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// GET /api/caja/cierres — historial de cierres
router.get('/cierres', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT cc.*, u.name AS closed_by_name
      FROM caja_cierres cc
      LEFT JOIN crm_users u ON u.id = cc.closed_by
      ORDER BY cc.fecha DESC, cc.closed_at DESC
      LIMIT 60
    `);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/caja/cierres/:id — detalle de un cierre
router.get('/cierres/:id', async (req, res) => {
  try {
    const [cierre, cobros] = await Promise.all([
      db.query(`
        SELECT cc.*, u.name AS closed_by_name
        FROM caja_cierres cc
        LEFT JOIN crm_users u ON u.id = cc.closed_by
        WHERE cc.id = $1
      `, [req.params.id]),
      db.query(`
        SELECT c.*, cl.name AS client_name, cl.last_name AS client_last_name,
               p.model AS producto_model
        FROM cobros c
        LEFT JOIN clients cl ON cl.id = c.client_id
        LEFT JOIN productos p ON p.id = c.producto_id
        WHERE c.cierre_id = $1 ORDER BY c.created_at
      `, [req.params.id]),
    ]);
    if (!cierre.rows[0]) return res.status(404).json({ error: 'Cierre no encontrado' });
    res.json({ cierre: cierre.rows[0], cobros: cobros.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/caja/cierres/:id — reabrir un cierre
router.delete('/cierres/:id', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE cobros SET cierre_id = NULL WHERE cierre_id = $1', [req.params.id]);
    await client.query('DELETE FROM caja_cierres WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
