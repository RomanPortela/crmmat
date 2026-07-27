const router = require('express').Router();
const db = require('../db/connection');

// GET /api/reports/ventas-diarias — últimos N días
router.get('/ventas-diarias', async (req, res) => {
  try {
    const dias = parseInt(req.query.dias) || 30;
    const result = await db.query(`
      SELECT
        DATE(sold_at AT TIME ZONE 'America/Argentina/Buenos_Aires') as fecha,
        COUNT(*) as cantidad,
        COALESCE(SUM(price_usd), 0) as total_usd,
        COALESCE(SUM(total_paid_usd), 0) as cobrado_usd
      FROM sales
      WHERE sold_at >= NOW() - ($1 || ' days')::INTERVAL
      GROUP BY fecha
      ORDER BY fecha ASC
    `, [dias]);

    // Rellenar días sin ventas
    const days = [];
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const fecha = d.toISOString().split('T')[0];
      const found = result.rows.find(r => r.fecha === fecha);
      days.push({ fecha, cantidad: found ? parseInt(found.cantidad) : 0, total_usd: found ? parseFloat(found.total_usd) : 0 });
    }
    res.json(days);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/funnel — conversión por etapa
router.get('/funnel', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT ps.name, ps.label, ps.color, ps.order_index,
             COUNT(c.id) as total
      FROM pipeline_stages ps
      LEFT JOIN conversations c ON c.stage = ps.name
      GROUP BY ps.name, ps.label, ps.color, ps.order_index
      ORDER BY ps.order_index
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/metodos-pago — distribución de métodos de pago
router.get('/metodos-pago', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT payment_method, COUNT(*) as count,
             COALESCE(SUM(price_usd), 0) as total_usd
      FROM sales
      WHERE sold_at >= NOW() - INTERVAL '90 days'
      GROUP BY payment_method
      ORDER BY count DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/modelos-top — modelos más vendidos
router.get('/modelos-top', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT product_name, COUNT(*) as count,
             COALESCE(SUM(price_usd), 0) as total_usd,
             ROUND(AVG(price_usd)::numeric, 0) as precio_promedio
      FROM sales
      WHERE sold_at >= NOW() - INTERVAL '90 days'
      GROUP BY product_name
      ORDER BY count DESC
      LIMIT 10
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/resumen — KPIs globales
router.get('/resumen', async (req, res) => {
  try {
    const [global, mesActual, mesAnterior, leads] = await Promise.all([
      db.query(`
        SELECT COUNT(*) as total_ventas,
               COALESCE(SUM(price_usd), 0) as total_usd,
               COALESCE(AVG(price_usd), 0) as ticket_promedio
        FROM sales
      `),
      db.query(`
        SELECT COUNT(*) as ventas, COALESCE(SUM(price_usd), 0) as total_usd
        FROM sales WHERE DATE_TRUNC('month', sold_at) = DATE_TRUNC('month', NOW())
      `),
      db.query(`
        SELECT COUNT(*) as ventas, COALESCE(SUM(price_usd), 0) as total_usd
        FROM sales WHERE DATE_TRUNC('month', sold_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
      `),
      db.query(`
        SELECT COUNT(*) as total,
               COUNT(*) FILTER (WHERE stage = 'ganado') as ganados,
               COUNT(*) FILTER (WHERE stage = 'perdido') as perdidos,
               COUNT(*) FILTER (WHERE stage NOT IN ('ganado','perdido')) as activos
        FROM conversations
      `),
    ]);

    const convRate = parseInt(leads.rows[0].total) > 0
      ? Math.round(leads.rows[0].ganados / leads.rows[0].total * 100)
      : 0;

    const crecimiento = parseFloat(mesAnterior.rows[0].total_usd) > 0
      ? Math.round((mesActual.rows[0].total_usd - mesAnterior.rows[0].total_usd) / mesAnterior.rows[0].total_usd * 100)
      : null;

    res.json({
      global: global.rows[0],
      mesActual: mesActual.rows[0],
      mesAnterior: mesAnterior.rows[0],
      crecimiento,
      leads: leads.rows[0],
      convRate,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/export/contacts — CSV de contactos
router.get('/export/contacts', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT ct.name, ct.phone, ct.city, ct.source,
             c.stage, c.product_interest, c.last_message_at,
             ct.created_at
      FROM contacts ct
      LEFT JOIN conversations c ON c.contact_id = ct.id
        AND c.id = (SELECT id FROM conversations WHERE contact_id = ct.id ORDER BY created_at DESC LIMIT 1)
      ORDER BY ct.created_at DESC
    `);

    const headers = ['Nombre','Teléfono','Ciudad','Fuente','Etapa','Interés','Último contacto','Fecha alta'];
    const rows = result.rows.map(r => [
      r.name || '',
      r.phone,
      r.city || '',
      r.source || '',
      r.stage || '',
      r.product_interest || '',
      r.last_message_at ? new Date(r.last_message_at).toLocaleString('es-AR') : '',
      r.created_at ? new Date(r.created_at).toLocaleString('es-AR') : '',
    ]);

    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="contactos.csv"');
    res.send('\uFEFF' + csv); // BOM para Excel
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/export/sales — CSV de ventas
router.get('/export/sales', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT s.sold_at, ct.name, ct.phone, s.product_name,
             s.price_usd, s.cotizacion, s.payment_method, s.cuotas,
             s.trade_in_value, s.accessories_amount, s.total_paid_usd, s.notes
      FROM sales s
      LEFT JOIN contacts ct ON ct.id = s.contact_id
      ORDER BY s.sold_at DESC
    `);

    const headers = ['Fecha','Cliente','Teléfono','Producto','Precio USD','Cotización','Método pago','Cuotas','Canje USD','Accesorios','Total pagado USD','Notas'];
    const rows = result.rows.map(r => [
      r.sold_at ? new Date(r.sold_at).toLocaleString('es-AR') : '',
      r.name || '',
      r.phone || '',
      r.product_name,
      r.price_usd,
      r.cotizacion || '',
      r.payment_method || '',
      r.cuotas || 1,
      r.trade_in_value || 0,
      r.accessories_amount || 0,
      r.total_paid_usd || '',
      r.notes || '',
    ]);

    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ventas.csv"');
    res.send('\uFEFF' + csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
