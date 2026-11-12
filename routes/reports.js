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

// GET /api/reports/ventas-mes — ventas agrupadas por mes
router.get('/ventas-mes', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS mes,
             COUNT(*) AS ventas,
             COALESCE(SUM(price), 0)  AS facturacion,
             COALESCE(SUM(profit), 0) AS ganancia
      FROM caja_entries
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at)
    `);
    res.json(r.rows);
  } catch (err) { res.json([]); }
});

// GET /api/reports/stock — resumen de stock
router.get('/stock', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT status, COUNT(*) AS cantidad,
             COALESCE(SUM(cost), 0)  AS capital,
             COALESCE(SUM(price), 0) AS valor
      FROM productos GROUP BY status
    `);
    res.json(r.rows);
  } catch (err) { res.json([]); }
});

// GET /api/reports/vendedores — ventas por vendedor
router.get('/vendedores', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT u.name AS vendedor, COUNT(c.id) AS cobros,
             COALESCE(SUM(c.total_amount), 0) AS total
      FROM cobros c
      JOIN crm_users u ON u.id = c.seller_id
      WHERE c.created_at >= NOW() - INTERVAL '90 days'
      GROUP BY u.name ORDER BY total DESC
    `);
    res.json(r.rows);
  } catch (err) { res.json([]); }
});

// GET /api/reports/proveedores — compras por proveedor
router.get('/proveedores', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT s.name AS proveedor,
             COUNT(o.id) AS pedidos,
             COALESCE(SUM(o.total_amount), 0) AS total_comprado,
             COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = s.id), 0) AS total_pagado
      FROM suppliers s
      LEFT JOIN supplier_orders o ON o.supplier_id = s.id
      GROUP BY s.id, s.name ORDER BY total_comprado DESC
    `);
    res.json(r.rows);
  } catch (err) { res.json([]); }
});

// GET /api/reports/clientes-nuevos — clientes nuevos por mes
router.get('/clientes-nuevos', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS mes, COUNT(*) AS cantidad
      FROM clients
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at)
    `);
    res.json(r.rows);
  } catch (err) { res.json([]); }
});

// GET /api/reports/export/productos — CSV de productos
router.get('/export/productos', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT p.model, p.storage_gb, p.color, p.battery_pct, p.imei, p.status,
             p.price, p.cost, p.profit, p.condition_notes, p.entry_date, p.sold_at
      FROM productos p ORDER BY p.entry_date DESC
    `);
    const headers = ['Modelo','GB','Color','Batería','IMEI','Estado','Precio','Costo','Ganancia','Notas estado','Ingreso','Venta'];
    const rows = r.rows.map(x => [
      x.model, x.storage_gb||'', x.color||'', x.battery_pct||'', x.imei||'', x.status,
      x.price||0, x.cost||0, x.profit||0, x.condition_notes||'',
      x.entry_date ? new Date(x.entry_date).toLocaleDateString('es-AR') : '',
      x.sold_at ? new Date(x.sold_at).toLocaleDateString('es-AR') : '',
    ]);
    const csv = [headers, ...rows].map(rr => rr.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="productos.csv"');
    res.send('\uFEFF' + csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/export/caja — CSV de caja
router.get('/export/caja', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT ce.created_at, p.model, ce.price, ce.cost, ce.profit,
             ce.capital_reintegrado, ce.ganancia_retirada
      FROM caja_entries ce
      LEFT JOIN productos p ON p.id = ce.producto_id
      ORDER BY ce.created_at DESC
    `);
    const headers = ['Fecha','Producto','Precio','Costo','Ganancia','Capital reintegrado','Ganancia retirada'];
    const rows = r.rows.map(x => [
      new Date(x.created_at).toLocaleDateString('es-AR'),
      x.model||'', x.price||0, x.cost||0, x.profit||0,
      x.capital_reintegrado ? 'SI' : 'NO', x.ganancia_retirada ? 'SI' : 'NO',
    ]);
    const csv = [headers, ...rows].map(rr => rr.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="caja.csv"');
    res.send('\uFEFF' + csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
