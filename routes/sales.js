const router = require('express').Router();
const db = require('../db/connection');

// GET /api/sales — historial de ventas
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, from, to } = req.query;
    let where = ['1=1'];
    let params = [];
    let i = 1;

    if (from) { where.push(`s.sold_at >= $${i}`); params.push(from); i++; }
    if (to)   { where.push(`s.sold_at <= $${i}`); params.push(to);   i++; }

    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(`
      SELECT s.*, ct.name, ct.phone,
             ti.model as trade_in_model, ti.actual_value_usd as trade_in_actual
      FROM sales s
      LEFT JOIN contacts ct ON ct.id = s.contact_id
      LEFT JOIN trade_ins ti ON ti.id = s.trade_in_id
      WHERE ${where.join(' AND ')}
      ORDER BY s.sold_at DESC
      LIMIT $${i} OFFSET $${i+1}
    `, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sales — registrar venta
router.post('/', async (req, res) => {
  try {
    const {
      contact_id, conversation_id, appointment_id, trade_in_id,
      product_name, product_gb, price_usd, cotizacion,
      payment_method, cuotas, cuota_amount,
      trade_in_value, accessories, accessories_amount, notes
    } = req.body;

    if (!product_name || !price_usd) {
      return res.status(400).json({ error: 'product_name y price_usd son requeridos' });
    }

    const price_ars = cotizacion ? price_usd * cotizacion : null;
    const total_paid_usd = price_usd - (trade_in_value || 0);

    const result = await db.query(`
      INSERT INTO sales (
        contact_id, conversation_id, appointment_id, trade_in_id,
        product_name, product_gb, price_usd, cotizacion, price_ars,
        payment_method, cuotas, cuota_amount,
        trade_in_value, accessories, accessories_amount,
        total_paid_usd, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [
      contact_id, conversation_id, appointment_id, trade_in_id,
      product_name, product_gb, price_usd, cotizacion, price_ars,
      payment_method, cuotas || 1, cuota_amount,
      trade_in_value || 0, accessories || false, accessories_amount || 0,
      total_paid_usd, notes
    ]);

    // Marcar conversación como ganada
    if (conversation_id) {
      await db.query(`
        UPDATE conversations SET stage = 'ganado', closed_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `, [conversation_id]);
    }

    // Marcar turno como completado
    if (appointment_id) {
      await db.query(`
        UPDATE appointments SET status = 'completado', updated_at = NOW()
        WHERE id = $1
      `, [appointment_id]);
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sales/trade-in — registrar canje
router.post('/trade-in', async (req, res) => {
  try {
    const {
      contact_id, model, storage_gb, battery_pct, condition_notes,
      has_broken_screen, has_broken_back, has_no_face_id, has_incell_screen,
      estimated_value_usd
    } = req.body;

    const result = await db.query(`
      INSERT INTO trade_ins (
        contact_id, model, storage_gb, battery_pct, condition_notes,
        has_broken_screen, has_broken_back, has_no_face_id, has_incell_screen,
        estimated_value_usd
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [
      contact_id, model, storage_gb, battery_pct, condition_notes,
      has_broken_screen || false, has_broken_back || false,
      has_no_face_id || false, has_incell_screen || false,
      estimated_value_usd
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/stats — estadísticas del mes
router.get('/stats', async (req, res) => {
  try {
    const [mesActual, metodosPago, modelosTop] = await Promise.all([
      db.query(`
        SELECT COUNT(*) as ventas,
               COALESCE(SUM(total_paid_usd), 0) as total_usd,
               COALESCE(AVG(total_paid_usd), 0) as promedio_usd
        FROM sales WHERE DATE_TRUNC('month', sold_at) = DATE_TRUNC('month', NOW())
      `),
      db.query(`
        SELECT payment_method, COUNT(*) as count
        FROM sales WHERE DATE_TRUNC('month', sold_at) = DATE_TRUNC('month', NOW())
        GROUP BY payment_method ORDER BY count DESC
      `),
      db.query(`
        SELECT product_name, COUNT(*) as count
        FROM sales WHERE sold_at >= NOW() - INTERVAL '30 days'
        GROUP BY product_name ORDER BY count DESC LIMIT 5
      `),
    ]);

    res.json({
      mesActual: mesActual.rows[0],
      metodosPago: metodosPago.rows,
      modelosTop: modelosTop.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/sales/:id
router.patch('/:id', async (req, res) => {
  try {
    const f = req.body;
    const r = await db.query(`
      UPDATE sales SET
        product_name = COALESCE($1,product_name), product_gb = COALESCE($2,product_gb),
        price_usd = COALESCE($3,price_usd), cotizacion = COALESCE($4,cotizacion),
        payment_method = COALESCE($5,payment_method), cuotas = COALESCE($6,cuotas),
        cuota_amount = COALESCE($7,cuota_amount), trade_in_value = COALESCE($8,trade_in_value),
        notes = COALESCE($9,notes)
      WHERE id=$10 RETURNING *
    `, [f.product_name, f.product_gb, f.price_usd, f.cotizacion, f.payment_method,
        f.cuotas, f.cuota_amount, f.trade_in_value, f.notes, req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Venta no encontrada' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/sales/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM sales WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
