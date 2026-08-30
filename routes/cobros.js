const router = require('express').Router();
const db = require('../db/connection');

// GET /api/cobros
router.get('/', async (req, res) => {
  try {
    const { search, type, from, to, limit = 50, offset = 0 } = req.query;
    const where = ['1=1'];
    const params = [];
    let i = 1;

    if (search) {
      where.push(`(cl.name ILIKE $${i} OR cl.last_name ILIKE $${i} OR cl.phone ILIKE $${i} OR p.model ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }
    if (type) { where.push(`c.type = $${i}`); params.push(type); i++; }
    if (from) { where.push(`c.created_at >= $${i}`); params.push(from); i++; }
    if (to)   { where.push(`c.created_at <= $${i}`); params.push(to); i++; }

    params.push(parseInt(limit), parseInt(offset));

    const r = await db.query(`
      SELECT c.*,
             cl.name AS client_name, cl.last_name AS client_last_name, cl.phone AS client_phone,
             p.model AS producto_model, p.storage_gb, p.color,
             u.name AS seller_name,
             (SELECT json_agg(json_build_object(
                'method',cp.method,'amount',cp.amount,
                'currency',cp.currency,'cotizacion',cp.cotizacion,'amount_usd',cp.amount_usd))
              FROM cobro_payments cp WHERE cp.cobro_id = c.id) AS payments
      FROM cobros c
      LEFT JOIN clients cl ON cl.id = c.client_id
      LEFT JOIN productos p ON p.id = c.producto_id
      LEFT JOIN crm_users u ON u.id = c.seller_id
      WHERE ${where.join(' AND ')}
      ORDER BY c.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `, params);

    const count = await db.query(`
      SELECT COUNT(*) FROM cobros c
      LEFT JOIN clients cl ON cl.id = c.client_id
      LEFT JOIN productos p ON p.id = c.producto_id
      WHERE ${where.join(' AND ')}
    `, params.slice(0, -2));

    res.json({ cobros: r.rows, total: parseInt(count.rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/cobros/stats
// La facturación se expresa siempre en USD (moneda de referencia del negocio).
// Los totales en pesos se muestran aparte, sin mezclarlos con los dólares.
router.get('/stats', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())) AS cobros_mes,
        COALESCE(SUM(COALESCE(amount_usd, CASE WHEN currency='USD' THEN total_amount ELSE 0 END))
                 FILTER (WHERE DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())),0) AS facturado_mes_usd,
        COALESCE(SUM(total_amount) FILTER (WHERE currency='ARS' AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())),0) AS facturado_mes_ars,
        COUNT(*) FILTER (WHERE type='seña' AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())) AS senas_mes,
        COALESCE(SUM(COALESCE(amount_usd, CASE WHEN currency='USD' THEN total_amount ELSE 0 END))
                 FILTER (WHERE DATE(created_at)=CURRENT_DATE),0) AS cobrado_hoy_usd,
        COALESCE(SUM(total_amount) FILTER (WHERE currency='ARS' AND DATE(created_at)=CURRENT_DATE),0) AS cobrado_hoy_ars
      FROM cobros
    `);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/cobros/:id — detalle para recibo
router.get('/:id', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT c.*,
             cl.name AS client_name, cl.last_name AS client_last_name,
             cl.dni AS client_dni, cl.phone AS client_phone, cl.address AS client_address,
             p.model AS producto_model, p.storage_gb, p.color, p.imei, p.battery_pct,
             u.name AS seller_name,
             (SELECT json_agg(json_build_object('method',cp.method,'amount',cp.amount,'notes',cp.notes))
              FROM cobro_payments cp WHERE cp.cobro_id = c.id) AS payments
      FROM cobros c
      LEFT JOIN clients cl ON cl.id = c.client_id
      LEFT JOIN productos p ON p.id = c.producto_id
      LEFT JOIN crm_users u ON u.id = c.seller_id
      WHERE c.id=$1
    `, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Cobro no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cobros — registrar cobro (actualiza producto y caja)
router.post('/', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const f = req.body;

    if (!f.total_amount || !f.type) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Tipo e importe son requeridos' });
    }

    // Moneda y cotización: el cobro se registra en la moneda real en que se cobró.
    // Si es en pesos, se guarda la cotización para poder expresarlo en USD (moneda de facturación).
    const currency = f.currency || 'ARS';
    let cotizacion = f.cotizacion ? parseFloat(f.cotizacion) : null;

    // Si es en pesos y no vino cotización, se toma la configurada en el sistema
    if (currency === 'ARS' && !cotizacion) {
      const cfg = await client.query(`SELECT value FROM system_config WHERE key='cotizacion_dolar'`);
      cotizacion = parseFloat(cfg.rows[0]?.value) || null;
    }

    const totalAmount = parseFloat(f.total_amount);
    const amountUsd = currency === 'USD'
      ? totalAmount
      : (cotizacion ? +(totalAmount / cotizacion).toFixed(2) : null);

    // Número de recibo
    const num = await client.query(`SELECT COUNT(*)+1 AS n FROM cobros`);
    const receiptNum = `R-${String(num.rows[0].n).padStart(5, '0')}`;

    const cobro = await client.query(`
      INSERT INTO cobros (client_id, producto_id, seller_id, type, total_amount, notes, receipt_num,
                          currency, cotizacion, amount_usd, sale_id, appointment_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
    `, [f.client_id || null, f.producto_id || null, req.session.user.id,
        f.type, totalAmount, f.notes, receiptNum,
        currency, cotizacion, amountUsd, f.sale_id || null, f.appointment_id || null]);

    const cobroId = cobro.rows[0].id;

    // Medios de pago múltiples — cada uno con su moneda y equivalente
    if (Array.isArray(f.payments)) {
      for (const p of f.payments) {
        if (p.amount > 0) {
          const pCurrency = p.currency || currency;
          const pCotizacion = p.cotizacion ? parseFloat(p.cotizacion) : cotizacion;
          const pAmount = parseFloat(p.amount);
          const pAmountUsd = pCurrency === 'USD'
            ? pAmount
            : (pCotizacion ? +(pAmount / pCotizacion).toFixed(2) : null);

          await client.query(
            `INSERT INTO cobro_payments (cobro_id, method, amount, notes, currency, cotizacion, amount_usd)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [cobroId, p.method, pAmount, p.notes || null, pCurrency, pCotizacion, pAmountUsd]
          );
        }
      }
    }

    // Actualizar estado del producto + registrar en caja
    if (f.producto_id) {
      const newStatus = f.type === 'seña' ? 'señado' : 'vendido';
      const prod = await client.query('SELECT * FROM productos WHERE id=$1', [f.producto_id]);

      await client.query(`
        UPDATE productos SET status=$1, client_id=COALESCE($2, client_id),
          reserved_at = CASE WHEN $1='señado'  THEN NOW() ELSE reserved_at END,
          sold_at     = CASE WHEN $1='vendido' THEN NOW() ELSE sold_at END,
          updated_at = NOW()
        WHERE id=$3
      `, [newStatus, f.client_id || null, f.producto_id]);

      await client.query(
        `INSERT INTO product_history (producto_id, action, detail, user_id) VALUES ($1,$2,$3,$4)`,
        [f.producto_id, f.type === 'seña' ? 'Señado' : 'Vendido',
         `${receiptNum} — $${f.total_amount}`, req.session.user.id]
      );

      // Caja: solo al vender (no en seña)
      if (newStatus === 'vendido' && prod.rows[0]) {
        const price = parseFloat(prod.rows[0].price || 0);
        const cost  = parseFloat(prod.rows[0].cost || 0);
        const profit = price - cost;
        await client.query(`
          INSERT INTO caja_entries (cobro_id, producto_id, price, cost, profit,
            capital_pendiente, ganancia_pendiente)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [cobroId, f.producto_id, price, cost, profit, cost, profit]);
      }
    }

    await client.query('COMMIT');
    res.status(201).json(cobro.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/cobros/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM cobros WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/cobros/:id
router.patch('/:id', async (req, res) => {
  try {
    const f = req.body;
    const r = await db.query(`
      UPDATE cobros SET total_amount = COALESCE($1,total_amount),
        type = COALESCE($2,type), notes = COALESCE($3,notes)
      WHERE id=$4 RETURNING *
    `, [f.total_amount, f.type, f.notes, req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Cobro no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
