const router = require('express').Router();
const db = require('../db/connection');

// GET /api/dashboard — KPIs principales
router.get('/', async (req, res) => {
  try {
    const [
      leadsHoy,
      turnosHoy,
      ventasSemana,
      pipeline,
      ventasRecientes,
      turnosProximos,
    ] = await Promise.all([
      // Leads nuevos hoy
      db.query(`SELECT COUNT(*) FROM conversations WHERE DATE(created_at) = CURRENT_DATE`),

      // Turnos de hoy
      db.query(`SELECT COUNT(*) FROM appointments
                WHERE DATE(scheduled_at) = CURRENT_DATE AND status IN ('pendiente','confirmado')`),

      // Ventas de la semana (monto y cantidad)
      db.query(`SELECT COUNT(*) as count, COALESCE(SUM(total_paid_usd),0) as total_usd
                FROM sales WHERE sold_at >= DATE_TRUNC('week', NOW())`),

      // Pipeline por etapa
      db.query(`SELECT c.stage, ps.label, ps.color, COUNT(*) as count
                FROM conversations c
                JOIN pipeline_stages ps ON ps.name = c.stage
                WHERE c.stage NOT IN ('ganado','perdido')
                GROUP BY c.stage, ps.label, ps.color, ps.order_index
                ORDER BY ps.order_index`),

      // Últimas 5 ventas
      db.query(`SELECT s.id, ct.name, ct.phone, s.product_name, s.price_usd,
                       s.payment_method, s.sold_at
                FROM sales s
                LEFT JOIN contacts ct ON ct.id = s.contact_id
                ORDER BY s.sold_at DESC LIMIT 5`),

      // Próximos turnos (hoy y mañana)
      db.query(`SELECT a.id, a.scheduled_at, a.status, a.product_interested,
                       a.has_trade_in, a.seña_paid,
                       ct.name, ct.phone
                FROM appointments a
                LEFT JOIN contacts ct ON ct.id = a.contact_id
                WHERE a.scheduled_at >= NOW()
                  AND a.scheduled_at < NOW() + INTERVAL '2 days'
                  AND a.status IN ('pendiente','confirmado')
                ORDER BY a.scheduled_at ASC LIMIT 10`),
    ]);

    // Tasa de conversión (últimos 30 días)
    const [total30, ganados30] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM conversations WHERE created_at >= NOW() - INTERVAL '30 days'`),
      db.query(`SELECT COUNT(*) FROM conversations WHERE stage = 'ganado' AND updated_at >= NOW() - INTERVAL '30 days'`),
    ]);
    const totalConv = parseInt(total30.rows[0].count);
    const ganadosConv = parseInt(ganados30.rows[0].count);
    const convRate = totalConv > 0 ? Math.round((ganadosConv / totalConv) * 100) : 0;

    res.json({
      kpis: {
        leadsHoy: parseInt(leadsHoy.rows[0].count),
        turnosHoy: parseInt(turnosHoy.rows[0].count),
        ventasSemana: {
          count: parseInt(ventasSemana.rows[0].count),
          total_usd: parseFloat(ventasSemana.rows[0].total_usd),
        },
        conversionRate: convRate,
      },
      pipeline: pipeline.rows,
      ventasRecientes: ventasRecientes.rows,
      turnosProximos: turnosProximos.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/ventas-mes — gráfico ventas últimos 30 días
router.get('/ventas-mes', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT DATE(sold_at) as fecha,
             COUNT(*) as ventas,
             COALESCE(SUM(total_paid_usd), 0) as total_usd
      FROM sales
      WHERE sold_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(sold_at)
      ORDER BY fecha ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
