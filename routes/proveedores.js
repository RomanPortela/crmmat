const router = require('express').Router();
const db = require('../db/connection');

// ═══════════════ PROVEEDORES ═══════════════
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const where = ['1=1'];
    const params = [];
    if (search) {
      where.push(`(s.name ILIKE $1 OR s.contact ILIKE $1 OR s.phone ILIKE $1 OR s.email ILIKE $1)`);
      params.push(`%${search}%`);
    }
    const r = await db.query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM supplier_orders WHERE supplier_id=s.id) AS total_pedidos,
        (SELECT COUNT(*) FROM supplier_orders WHERE supplier_id=s.id AND status IN ('pendiente','en_camino')) AS pedidos_activos,
        (SELECT COALESCE(SUM(total_amount),0) FROM supplier_orders WHERE supplier_id=s.id) AS total_comprado,
        (SELECT COALESCE(SUM(amount),0) FROM supplier_payments WHERE supplier_id=s.id) AS total_pagado,
        (SELECT COUNT(*) FROM supplier_notes WHERE supplier_id=s.id) AS total_notas
      FROM suppliers s WHERE ${where.join(' AND ')} ORDER BY s.name
    `, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PEDIDOS (antes de /:id para no chocar) ──
router.get('/pedidos/list', async (req, res) => {
  try {
    const { status, search, supplier_id } = req.query;
    const where = ['1=1'];
    const params = [];
    let i = 1;
    if (status)      { where.push(`o.status = $${i}`); params.push(status); i++; }
    if (supplier_id) { where.push(`o.supplier_id = $${i}`); params.push(supplier_id); i++; }
    if (search) {
      where.push(`(s.name ILIKE $${i} OR o.order_number ILIKE $${i} OR o.notes ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }
    const r = await db.query(`
      SELECT o.*, s.name AS supplier_name, s.phone AS supplier_phone,
        (SELECT COALESCE(SUM(amount),0) FROM supplier_payments WHERE order_id=o.id) AS pagado,
        (SELECT COUNT(*) FROM supplier_order_items WHERE order_id=o.id) AS total_items,
        (SELECT COUNT(*) FROM supplier_order_items WHERE order_id=o.id AND loaded_to_stock=TRUE) AS items_cargados,
        (SELECT COUNT(*) FROM order_notes WHERE order_id=o.id) AS total_notas,
        (SELECT json_agg(json_build_object(
          'id', i.id, 'model', i.model, 'storage_gb', i.storage_gb, 'color', i.color,
          'battery_pct', i.battery_pct, 'quantity', i.quantity, 'unit_price', i.unit_price,
          'retail_price', i.retail_price, 'condition_notes', i.condition_notes,
          'loaded_to_stock', i.loaded_to_stock
        ) ORDER BY i.id) FROM supplier_order_items i WHERE i.order_id=o.id) AS items
      FROM supplier_orders o
      JOIN suppliers s ON s.id = o.supplier_id
      WHERE ${where.join(' AND ')}
      ORDER BY CASE o.status WHEN 'pendiente' THEN 1 WHEN 'en_camino' THEN 2 WHEN 'llegado' THEN 3 ELSE 4 END,
               o.created_at DESC
    `, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pedidos/stats', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='pendiente')  AS pendientes,
        COUNT(*) FILTER (WHERE status='en_camino')  AS en_camino,
        COUNT(*) FILTER (WHERE status='llegado' AND loaded_to_stock=FALSE) AS por_cargar,
        COALESCE(SUM(total_amount) FILTER (WHERE status IN ('pendiente','en_camino')),0) AS invertido_transito
      FROM supplier_orders
    `);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pedidos/:id', async (req, res) => {
  try {
    const [pedido, notas, pagos] = await Promise.all([
      db.query(`
        SELECT o.*, s.name AS supplier_name,
          (SELECT json_agg(json_build_object(
            'id', i.id, 'description', i.description, 'model', i.model,
            'storage_gb', i.storage_gb, 'color', i.color, 'battery_pct', i.battery_pct,
            'quantity', i.quantity, 'unit_price', i.unit_price,
            'retail_price', i.retail_price, 'total', i.total,
            'condition_notes', i.condition_notes, 'loaded_to_stock', i.loaded_to_stock
          ) ORDER BY i.id) FROM supplier_order_items i WHERE i.order_id=o.id) AS items
        FROM supplier_orders o JOIN suppliers s ON s.id = o.supplier_id WHERE o.id=$1
      `, [req.params.id]),
      db.query(`SELECT n.*, u.name AS user_name FROM order_notes n
                LEFT JOIN crm_users u ON u.id = n.user_id
                WHERE n.order_id=$1 ORDER BY n.created_at DESC`, [req.params.id]),
      db.query('SELECT * FROM supplier_payments WHERE order_id=$1 ORDER BY paid_at DESC', [req.params.id]),
    ]);
    if (!pedido.rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json({ pedido: pedido.rows[0], notas: notas.rows, pagos: pagos.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/pedidos', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const f = req.body;
    if (!f.supplier_id) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Proveedor requerido' }); }

    const num = await client.query(`SELECT COUNT(*)+1 AS n FROM supplier_orders`);
    const orderNum = `P-${String(num.rows[0].n).padStart(4, '0')}`;

    let total = 0;
    if (Array.isArray(f.items)) total = f.items.reduce((s, it) => s + (it.quantity || 1) * (it.unit_price || 0), 0);

    const o = await client.query(`
      INSERT INTO supplier_orders (supplier_id, order_number, status, total_amount, estimated_arrival, notes)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [f.supplier_id, orderNum, f.status || 'pendiente', f.total_amount || total, f.estimated_arrival || null, f.notes]);

    if (Array.isArray(f.items)) {
      for (const it of f.items) {
        const qty = it.quantity || 1, unit = it.unit_price || 0;
        await client.query(`
          INSERT INTO supplier_order_items
            (order_id, description, model, storage_gb, color, battery_pct,
             quantity, unit_price, retail_price, total, condition_notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `, [o.rows[0].id, it.description || it.model, it.model, it.storage_gb || null,
            it.color, it.battery_pct || null, qty, unit, it.retail_price || null,
            qty * unit, it.condition_notes]);
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
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const f = req.body;
    const r = await client.query(`
      UPDATE supplier_orders SET
        status = COALESCE($1,status),
        estimated_arrival = COALESCE($2,estimated_arrival), actual_arrival = COALESCE($3,actual_arrival),
        notes = COALESCE($4,notes),
        delivered_at = CASE WHEN $1='llegado' AND delivered_at IS NULL THEN NOW() ELSE delivered_at END,
        updated_at = NOW()
      WHERE id=$5 RETURNING *
    `, [f.status, f.estimated_arrival, f.actual_arrival, f.notes, req.params.id]);

    if (!r.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No encontrado' });
    }

    // Procesar items: actualizar los que tienen id, crear los que no
    if (Array.isArray(f.items)) {
      const existingIds = (await client.query(
        'SELECT id FROM supplier_order_items WHERE order_id=$1', [req.params.id]
      )).rows.map(x => x.id);
      const sentIds = f.items.filter(it => it.id).map(it => it.id);

      // Borrar los que ya no están en la lista enviada
      const toDelete = existingIds.filter(id => !sentIds.includes(id));
      if (toDelete.length) {
        await client.query('DELETE FROM supplier_order_items WHERE id = ANY($1)', [toDelete]);
      }

      for (const it of f.items) {
        const qty = it.quantity || 1;
        const unit = it.unit_price || 0;
        if (it.id) {
          await client.query(`
            UPDATE supplier_order_items SET
              model = $1, description = $2, storage_gb = $3, color = $4, battery_pct = $5,
              quantity = $6, unit_price = $7, retail_price = $8, total = $9, condition_notes = $10
            WHERE id = $11
          `, [it.model, it.description || it.model, it.storage_gb || null, it.color,
              it.battery_pct || null, qty, unit, it.retail_price || null,
              qty * unit, it.condition_notes, it.id]);
        } else if (it.model) {
          await client.query(`
            INSERT INTO supplier_order_items
              (order_id, description, model, storage_gb, color, battery_pct,
               quantity, unit_price, retail_price, total, condition_notes)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          `, [req.params.id, it.description || it.model, it.model, it.storage_gb || null,
              it.color, it.battery_pct || null, qty, unit, it.retail_price || null,
              qty * unit, it.condition_notes]);
        }
      }

      // Recalcular el total del pedido a partir de los items reales
      await client.query(`
        UPDATE supplier_orders SET total_amount =
          (SELECT COALESCE(SUM(total),0) FROM supplier_order_items WHERE order_id=$1)
        WHERE id=$1
      `, [req.params.id]);
    } else if (f.total_amount !== undefined) {
      await client.query(`UPDATE supplier_orders SET total_amount=$1 WHERE id=$2`, [f.total_amount, req.params.id]);
    }

    const final = await client.query('SELECT * FROM supplier_orders WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json(final.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

router.delete('/pedidos/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM supplier_orders WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/pedidos/:id/items', async (req, res) => {
  try {
    const it = req.body;
    const qty = it.quantity || 1, unit = it.unit_price || 0;
    const r = await db.query(`
      INSERT INTO supplier_order_items
        (order_id, description, model, storage_gb, color, battery_pct,
         quantity, unit_price, retail_price, total, condition_notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [req.params.id, it.description || it.model, it.model, it.storage_gb || null,
        it.color, it.battery_pct || null, qty, unit, it.retail_price || null, qty * unit, it.condition_notes]);
    await db.query(`UPDATE supplier_orders SET total_amount =
      (SELECT COALESCE(SUM(total),0) FROM supplier_order_items WHERE order_id=$1) WHERE id=$1`, [req.params.id]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/pedidos/items/:itemId', async (req, res) => {
  try {
    const it = req.body;
    const r = await db.query(`
      UPDATE supplier_order_items SET
        model = COALESCE($1,model), storage_gb = COALESCE($2,storage_gb),
        color = COALESCE($3,color), battery_pct = COALESCE($4,battery_pct),
        quantity = COALESCE($5,quantity), unit_price = COALESCE($6,unit_price),
        retail_price = COALESCE($7,retail_price), condition_notes = COALESCE($8,condition_notes),
        total = COALESCE($5,quantity) * COALESCE($6,unit_price)
      WHERE id=$9 RETURNING *
    `, [it.model, it.storage_gb, it.color, it.battery_pct, it.quantity,
        it.unit_price, it.retail_price, it.condition_notes, req.params.itemId]);
    if (r.rows[0]) {
      await db.query(`UPDATE supplier_orders SET total_amount =
        (SELECT COALESCE(SUM(total),0) FROM supplier_order_items WHERE order_id=$1) WHERE id=$1`, [r.rows[0].order_id]);
    }
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/pedidos/items/:itemId', async (req, res) => {
  try {
    const item = await db.query('SELECT order_id FROM supplier_order_items WHERE id=$1', [req.params.itemId]);
    await db.query('DELETE FROM supplier_order_items WHERE id=$1', [req.params.itemId]);
    if (item.rows[0]) {
      await db.query(`UPDATE supplier_orders SET total_amount =
        (SELECT COALESCE(SUM(total),0) FROM supplier_order_items WHERE order_id=$1) WHERE id=$1`, [item.rows[0].order_id]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ACCIÓN 1: Marcar como entregado
router.post('/pedidos/:id/entregar', async (req, res) => {
  try {
    const r = await db.query(`
      UPDATE supplier_orders SET status='llegado',
        actual_arrival = COALESCE($1, CURRENT_DATE), delivered_at = NOW(), updated_at = NOW()
      WHERE id=$2 RETURNING *
    `, [req.body.actual_arrival || null, req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    await db.query(`INSERT INTO order_notes (order_id, note, user_id) VALUES ($1,$2,$3)`,
      [req.params.id, 'Pedido marcado como entregado', req.session.user.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ACCIÓN 2: Cargar a stock
router.post('/pedidos/:id/cargar-stock', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const order = await client.query('SELECT * FROM supplier_orders WHERE id=$1', [req.params.id]);
    if (!order.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Pedido no encontrado' }); }
    if (order.rows[0].status !== 'llegado') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El pedido debe estar marcado como entregado primero' });
    }
    const items = await client.query('SELECT * FROM supplier_order_items WHERE order_id=$1 AND loaded_to_stock=FALSE', [req.params.id]);
    if (!items.rows.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'No hay items pendientes de cargar' }); }

    const cat = await client.query(`SELECT id FROM product_categories WHERE name='iPhone' LIMIT 1`);
    const catId = cat.rows[0]?.id || null;
    let creados = 0;

    for (const it of items.rows) {
      const qty = it.quantity || 1;
      for (let n = 0; n < qty; n++) {
        const prod = await client.query(`
          INSERT INTO productos (category_id, model, color, storage_gb, battery_pct,
            status, price, cost, condition_notes, supplier_id, supplier_order_id, entry_date)
          VALUES ($1,$2,$3,$4,$5,'en_stock',$6,$7,$8,$9,$10,NOW()) RETURNING id
        `, [catId, it.model || it.description, it.color, it.storage_gb, it.battery_pct,
            it.retail_price, it.unit_price, it.condition_notes, order.rows[0].supplier_id, req.params.id]);
        await client.query(`INSERT INTO product_history (producto_id, action, detail, user_id) VALUES ($1,$2,$3,$4)`,
          [prod.rows[0].id, 'Ingreso desde pedido', `Pedido ${order.rows[0].order_number || '#'+req.params.id}`, req.session.user.id]);
        creados++;
      }
      await client.query('UPDATE supplier_order_items SET loaded_to_stock=TRUE WHERE id=$1', [it.id]);
    }
    await client.query(`UPDATE supplier_orders SET loaded_to_stock=TRUE, loaded_at=NOW(), updated_at=NOW() WHERE id=$1`, [req.params.id]);
    await client.query(`INSERT INTO order_notes (order_id, note, user_id) VALUES ($1,$2,$3)`,
      [req.params.id, `${creados} productos cargados a stock`, req.session.user.id]);
    await client.query('COMMIT');
    res.json({ creados, message: `${creados} productos cargados al stock` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

router.post('/pedidos/:id/notas', async (req, res) => {
  try {
    const { note } = req.body;
    if (!note) return res.status(400).json({ error: 'Nota vacía' });
    const r = await db.query(`INSERT INTO order_notes (order_id, note, user_id) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, note, req.session.user.id]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PAGOS ──
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

router.delete('/pagos/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM supplier_payments WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ALERTAS ──
router.get('/alertas/config', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM stock_alerts ORDER BY id');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/alertas/config', async (req, res) => {
  try {
    const f = req.body;
    if (!f.name || !f.alert_type) return res.status(400).json({ error: 'Nombre y tipo requeridos' });
    const r = await db.query(`
      INSERT INTO stock_alerts (name, alert_type, model_pattern, threshold, days_threshold, is_active)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [f.name, f.alert_type, f.model_pattern || '%', f.threshold ?? 2, f.days_threshold || null, f.is_active !== false]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/alertas/config/:id', async (req, res) => {
  try {
    const f = req.body;
    const r = await db.query(`
      UPDATE stock_alerts SET name = COALESCE($1,name), alert_type = COALESCE($2,alert_type),
        model_pattern = COALESCE($3,model_pattern), threshold = COALESCE($4,threshold),
        days_threshold = COALESCE($5,days_threshold), is_active = COALESCE($6,is_active)
      WHERE id=$7 RETURNING *
    `, [f.name, f.alert_type, f.model_pattern, f.threshold, f.days_threshold, f.is_active, req.params.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/alertas/config/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM stock_alerts WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/alertas/activas', async (req, res) => {
  try {
    const configs = await db.query('SELECT * FROM stock_alerts WHERE is_active=TRUE');
    const alertas = [];

    for (const cfg of configs.rows) {
      if (cfg.alert_type === 'modelo_bajo') {
        const r = await db.query(`
          SELECT model, storage_gb, COUNT(*) AS cantidad FROM productos
          WHERE status='en_stock' AND model ILIKE $1
          GROUP BY model, storage_gb HAVING COUNT(*) <= $2 ORDER BY COUNT(*) ASC
        `, [cfg.model_pattern || '%', cfg.threshold]);
        r.rows.forEach(x => alertas.push({
          tipo: 'modelo_bajo', nivel: x.cantidad == 0 ? 'critico' : 'warning', config_name: cfg.name,
          titulo: `${x.model} ${x.storage_gb || ''}GB`,
          detalle: `Solo ${x.cantidad} unidad${x.cantidad == 1 ? '' : 'es'} en stock`, cantidad: parseInt(x.cantidad),
        }));
      }
      if (cfg.alert_type === 'sin_stock') {
        const r = await db.query(`
          SELECT DISTINCT p.model FROM productos p
          WHERE p.model ILIKE $1 AND NOT EXISTS (
            SELECT 1 FROM productos p2 WHERE p2.model = p.model AND p2.status = 'en_stock')
          LIMIT 10
        `, [cfg.model_pattern || '%']);
        r.rows.forEach(x => alertas.push({
          tipo: 'sin_stock', nivel: 'critico', config_name: cfg.name,
          titulo: x.model, detalle: 'Sin unidades en stock', cantidad: 0,
        }));
      }
      if (cfg.alert_type === 'antiguedad' && cfg.days_threshold) {
        const r = await db.query(`
          SELECT model, storage_gb, color, id, EXTRACT(DAY FROM NOW() - entry_date)::int AS dias
          FROM productos WHERE status='en_stock' AND entry_date < NOW() - ($1 || ' days')::INTERVAL
            AND model ILIKE $2 ORDER BY entry_date ASC LIMIT 20
        `, [cfg.days_threshold, cfg.model_pattern || '%']);
        r.rows.forEach(x => alertas.push({
          tipo: 'antiguedad', nivel: 'info', config_name: cfg.name,
          titulo: `${x.model} ${x.storage_gb || ''}GB ${x.color || ''}`,
          detalle: `${x.dias} días en stock sin venderse`, producto_id: x.id,
        }));
      }
      if (cfg.alert_type === 'capital_alto') {
        const r = await db.query(`SELECT COALESCE(SUM(cost),0) AS capital FROM productos WHERE status='en_stock'`);
        const capital = parseFloat(r.rows[0].capital);
        if (capital > cfg.threshold) alertas.push({
          tipo: 'capital_alto', nivel: 'warning', config_name: cfg.name,
          titulo: 'Capital inmovilizado alto',
          detalle: `$${capital.toLocaleString('es-AR')} USD en stock sin vender`,
        });
      }
    }

    const demorados = await db.query(`
      SELECT o.id, o.order_number, s.name AS supplier_name,
             EXTRACT(DAY FROM NOW() - o.estimated_arrival)::int AS dias_demora
      FROM supplier_orders o JOIN suppliers s ON s.id = o.supplier_id
      WHERE o.status IN ('pendiente','en_camino') AND o.estimated_arrival IS NOT NULL
        AND o.estimated_arrival < CURRENT_DATE
      ORDER BY o.estimated_arrival ASC
    `);
    demorados.rows.forEach(x => alertas.push({
      tipo: 'pedido_demorado', nivel: 'warning', config_name: 'Pedidos demorados',
      titulo: `${x.order_number || 'Pedido'} — ${x.supplier_name}`,
      detalle: `${x.dias_demora} días de demora`, order_id: x.id,
    }));

    const sinCargar = await db.query(`
      SELECT o.id, o.order_number, s.name AS supplier_name,
             (SELECT COUNT(*) FROM supplier_order_items WHERE order_id=o.id AND loaded_to_stock=FALSE) AS items
      FROM supplier_orders o JOIN suppliers s ON s.id = o.supplier_id
      WHERE o.status='llegado' AND o.loaded_to_stock=FALSE
    `);
    sinCargar.rows.forEach(x => alertas.push({
      tipo: 'sin_cargar', nivel: 'info', config_name: 'Pedidos sin cargar',
      titulo: `${x.order_number || 'Pedido'} — ${x.supplier_name}`,
      detalle: `${x.items} items entregados pendientes de cargar a stock`, order_id: x.id,
    }));

    res.json(alertas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DETALLE PROVEEDOR (después de rutas específicas) ──
router.get('/:id', async (req, res) => {
  try {
    const [prov, pedidos, pagos, notas] = await Promise.all([
      db.query('SELECT * FROM suppliers WHERE id=$1', [req.params.id]),
      db.query(`
        SELECT o.*,
          (SELECT json_agg(json_build_object('id',i.id,'model',i.model,'storage_gb',i.storage_gb,
            'color',i.color,'quantity',i.quantity,'unit_price',i.unit_price,'retail_price',i.retail_price,
            'loaded_to_stock',i.loaded_to_stock) ORDER BY i.id)
           FROM supplier_order_items i WHERE i.order_id=o.id) AS items,
          (SELECT COALESCE(SUM(amount),0) FROM supplier_payments WHERE order_id=o.id) AS pagado
        FROM supplier_orders o WHERE o.supplier_id=$1 ORDER BY o.created_at DESC
      `, [req.params.id]),
      db.query('SELECT * FROM supplier_payments WHERE supplier_id=$1 ORDER BY paid_at DESC', [req.params.id]),
      db.query(`SELECT n.*, u.name AS user_name FROM supplier_notes n
                LEFT JOIN crm_users u ON u.id = n.user_id
                WHERE n.supplier_id=$1 ORDER BY n.created_at DESC`, [req.params.id]),
    ]);
    if (!prov.rows[0]) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json({ proveedor: prov.rows[0], pedidos: pedidos.rows, pagos: pagos.rows, notas: notas.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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

router.patch('/:id', async (req, res) => {
  try {
    const f = req.body;
    const r = await db.query(`
      UPDATE suppliers SET name = COALESCE($1,name), contact = COALESCE($2,contact),
        phone = COALESCE($3,phone), email = COALESCE($4,email),
        categories = COALESCE($5,categories), notes = COALESCE($6,notes)
      WHERE id=$7 RETURNING *
    `, [f.name, f.contact, f.phone, f.email, f.categories, f.notes, req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM suppliers WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/notas', async (req, res) => {
  try {
    const { note } = req.body;
    if (!note) return res.status(400).json({ error: 'Nota vacía' });
    const r = await db.query(`INSERT INTO supplier_notes (supplier_id, note, user_id) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, note, req.session.user.id]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
