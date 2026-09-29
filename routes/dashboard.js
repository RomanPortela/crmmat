const router = require('express').Router();
const db = require('../db/connection');

async function safe(query, params = [], fallback = { rows: [{}] }) {
  try { return await db.query(query, params); }
  catch { return fallback; }
}

router.get('/', async (req, res) => {
  try {
    const [
      leadsHoy, leadsTotal, turnosHoy, ventasSemana, pipeline,
      ventasRecientes, turnosProximos,
      clientesStats, productosStats, tareasStats,
      cajaResumen, proveedoresCount, cumples,
    ] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM conversations WHERE DATE(created_at) = CURRENT_DATE`),
      db.query(`SELECT COUNT(*) FROM conversations`),
      db.query(`SELECT COUNT(*) FROM appointments
                WHERE DATE(scheduled_at) = CURRENT_DATE AND status IN ('pendiente','confirmado')`),
      db.query(`SELECT COUNT(*) as count, COALESCE(SUM(total_paid_usd),0) as total_usd
                FROM sales WHERE sold_at >= DATE_TRUNC('week', NOW())`),
      db.query(`SELECT c.stage, ps.label, ps.color, COUNT(*) as count
                FROM conversations c
                JOIN pipeline_stages ps ON ps.name = c.stage
                WHERE c.stage NOT IN ('ganado','perdido')
                GROUP BY c.stage, ps.label, ps.color, ps.order_index
                ORDER BY ps.order_index`),
      db.query(`SELECT s.id, ct.name, ct.phone, s.product_name, s.price_usd,
                       s.payment_method, s.sold_at
                FROM sales s LEFT JOIN contacts ct ON ct.id = s.contact_id
                ORDER BY s.sold_at DESC LIMIT 5`),
      db.query(`SELECT a.id, a.scheduled_at, a.status, a.product_interested,
                       a.has_trade_in, a."seña_paid", ct.name, ct.phone
                FROM appointments a LEFT JOIN contacts ct ON ct.id = a.contact_id
                WHERE a.scheduled_at >= NOW() AND a.scheduled_at < NOW() + INTERVAL '3 days'
                  AND a.status IN ('pendiente','confirmado')
                ORDER BY a.scheduled_at ASC LIMIT 10`),
      safe(`SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())) AS nuevos_mes
            FROM clients`),
      safe(`SELECT
              COUNT(*) FILTER (WHERE status='en_stock') AS en_stock,
              COUNT(*) FILTER (WHERE status='señado')   AS senados,
              COUNT(*) FILTER (WHERE status='vendido' AND DATE_TRUNC('month',sold_at)=DATE_TRUNC('month',NOW())) AS vendidos_mes
            FROM productos`),
      safe(`SELECT
              COUNT(*) FILTER (WHERE status != 'completada') AS pendientes,
              COUNT(*) FILTER (WHERE status != 'completada' AND due_date < NOW()) AS vencidas
            FROM tasks`),
      safe(`SELECT
              COALESCE(SUM(capital_pendiente)  FILTER (WHERE capital_reintegrado = FALSE), 0) AS capital_pendiente,
              COALESCE(SUM(ganancia_pendiente) FILTER (WHERE ganancia_retirada   = FALSE), 0) AS ganancia_pendiente,
              COALESCE(SUM(ganancia_pendiente) FILTER (WHERE ganancia_retirada   = TRUE),  0) AS ganancia_retirada,
              COALESCE(SUM(price)  FILTER (WHERE DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())), 0) AS facturacion_mes,
              COALESCE(SUM(profit) FILTER (WHERE DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())), 0) AS ganancia_mes
            FROM caja_entries`),
      safe(`SELECT COUNT(*) AS total FROM suppliers`),
      safe(`SELECT id, name, last_name, phone, TO_CHAR(birthday,'DD/MM') AS fecha
            FROM clients WHERE birthday IS NOT NULL
              AND TO_CHAR(birthday,'MM-DD') BETWEEN TO_CHAR(NOW(),'MM-DD')
              AND TO_CHAR(NOW() + INTERVAL '15 days','MM-DD')
            ORDER BY TO_CHAR(birthday,'MM-DD') LIMIT 5`, [], { rows: [] }),
    ]);

    const [total30, ganados30] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM conversations WHERE created_at >= NOW() - INTERVAL '30 days'`),
      db.query(`SELECT COUNT(*) FROM conversations WHERE stage='ganado' AND updated_at >= NOW() - INTERVAL '30 days'`),
    ]);
    const totalConv = parseInt(total30.rows[0].count);
    const convRate = totalConv > 0 ? Math.round(parseInt(ganados30.rows[0].count) / totalConv * 100) : 0;

    const caja = cajaResumen.rows[0] || {};
    const capitalStock = await safe(
      `SELECT COALESCE(SUM(cost),0) AS v FROM productos WHERE status IN ('en_stock','señado')`
    );

    res.json({
      kpis: {
        leadsHoy: parseInt(leadsHoy.rows[0].count),
        leadsTotal: parseInt(leadsTotal.rows[0].count),
        turnosHoy: parseInt(turnosHoy.rows[0].count),
        ventasSemana: {
          count: parseInt(ventasSemana.rows[0].count),
          total_usd: parseFloat(ventasSemana.rows[0].total_usd),
        },
        conversionRate: convRate,
        clientesTotal: parseInt(clientesStats.rows[0]?.total || 0),
        clientesNuevosMes: parseInt(clientesStats.rows[0]?.nuevos_mes || 0),
        productosStock: parseInt(productosStats.rows[0]?.en_stock || 0),
        productosSenados: parseInt(productosStats.rows[0]?.senados || 0),
        productosVendidosMes: parseInt(productosStats.rows[0]?.vendidos_mes || 0),
        tareasPendientes: parseInt(tareasStats.rows[0]?.pendientes || 0),
        tareasVencidas: parseInt(tareasStats.rows[0]?.vencidas || 0),
        proveedores: parseInt(proveedoresCount.rows[0]?.total || 0),
        facturacionMes: parseFloat(caja.facturacion_mes || 0),
        gananciaMes: parseFloat(caja.ganancia_mes || 0),
      },
      caja: {
        capital_pendiente: parseFloat(caja.capital_pendiente || 0),
        ganancia_pendiente: parseFloat(caja.ganancia_pendiente || 0),
        ganancia_retirada: parseFloat(caja.ganancia_retirada || 0),
        capital_en_stock: parseFloat(capitalStock.rows[0]?.v || 0),
      },
      pipeline: pipeline.rows,
      ventasRecientes: ventasRecientes.rows,
      turnosProximos: turnosProximos.rows,
      cumpleanos: cumples.rows || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/ventas-mes', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT DATE(sold_at) as fecha, COUNT(*) as ventas,
             COALESCE(SUM(total_paid_usd), 0) as total_usd
      FROM sales WHERE sold_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(sold_at) ORDER BY fecha ASC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
