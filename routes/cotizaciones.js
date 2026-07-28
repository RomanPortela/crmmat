const router = require('express').Router();
const db = require('../db/connection');

// GET /api/cotizaciones/modelos
router.get('/modelos', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT m.*,
        (SELECT COUNT(*) FROM cotizacion_entries WHERE model_id = m.id) AS total_entries
      FROM cotizacion_models m
      WHERE m.is_active = TRUE
      ORDER BY m.model_name
    `);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/cotizaciones/modelos/:id — con sus entries
router.get('/modelos/:id', async (req, res) => {
  try {
    const [modelo, entries] = await Promise.all([
      db.query('SELECT * FROM cotizacion_models WHERE id=$1', [req.params.id]),
      db.query(`SELECT * FROM cotizacion_entries WHERE model_id=$1
                ORDER BY storage_gb, battery_min`, [req.params.id]),
    ]);
    if (!modelo.rows[0]) return res.status(404).json({ error: 'Modelo no encontrado' });
    res.json({ modelo: modelo.rows[0], entries: entries.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cotizaciones/modelos
router.post('/modelos', async (req, res) => {
  try {
    const { model_name, line } = req.body;
    if (!model_name || !line) return res.status(400).json({ error: 'Modelo y línea requeridos' });
    const r = await db.query(
      'INSERT INTO cotizacion_models (model_name, line) VALUES ($1,$2) RETURNING *',
      [model_name, line]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cotizaciones/entries
router.post('/entries', async (req, res) => {
  try {
    const { model_id, storage_gb, battery_min, battery_max, base_price } = req.body;
    if (!model_id || !storage_gb || base_price === undefined) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }
    const r = await db.query(`
      INSERT INTO cotizacion_entries (model_id, storage_gb, battery_min, battery_max, base_price)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (model_id, storage_gb, battery_min, battery_max)
      DO UPDATE SET base_price = EXCLUDED.base_price
      RETURNING *
    `, [model_id, storage_gb, battery_min || 0, battery_max || 100, base_price]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/cotizaciones/entries/:id
router.delete('/entries/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM cotizacion_entries WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DESCUENTOS ────────────────────────────────
router.get('/descuentos', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM cotizacion_discounts WHERE is_active=TRUE ORDER BY name');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/descuentos', async (req, res) => {
  try {
    const { name, amount_usd, applies_to } = req.body;
    const r = await db.query(
      'INSERT INTO cotizacion_discounts (name, amount_usd, applies_to) VALUES ($1,$2,$3) RETURNING *',
      [name, amount_usd, applies_to || 'all']
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/descuentos/:id', async (req, res) => {
  try {
    const { name, amount_usd, is_active } = req.body;
    const r = await db.query(`
      UPDATE cotizacion_discounts SET
        name = COALESCE($1,name), amount_usd = COALESCE($2,amount_usd),
        is_active = COALESCE($3,is_active)
      WHERE id=$4 RETURNING *
    `, [name, amount_usd, is_active, req.params.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/descuentos/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM cotizacion_discounts WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cotizaciones/calcular — cotizar un equipo
router.post('/calcular', async (req, res) => {
  try {
    const { model_id, storage_gb, battery_pct, discount_ids = [] } = req.body;
    if (!model_id || !storage_gb || battery_pct === undefined) {
      return res.status(400).json({ error: 'Modelo, capacidad y batería requeridos' });
    }

    // Buscar entry que matchee
    const entry = await db.query(`
      SELECT * FROM cotizacion_entries
      WHERE model_id=$1 AND storage_gb=$2
        AND $3 BETWEEN battery_min AND battery_max
      LIMIT 1
    `, [model_id, storage_gb, battery_pct]);

    if (!entry.rows[0]) {
      return res.status(404).json({ error: 'No hay cotización cargada para esa combinación' });
    }

    const basePrice = parseFloat(entry.rows[0].base_price);
    let descuentos = [];
    let totalDescuento = 0;

    if (discount_ids.length) {
      const d = await db.query(
        'SELECT * FROM cotizacion_discounts WHERE id = ANY($1) AND is_active=TRUE',
        [discount_ids]
      );
      descuentos = d.rows;
      totalDescuento = d.rows.reduce((sum, x) => sum + parseFloat(x.amount_usd), 0);
    }

    const modelo = await db.query('SELECT * FROM cotizacion_models WHERE id=$1', [model_id]);

    res.json({
      modelo: modelo.rows[0],
      storage_gb,
      battery_pct,
      base_price: basePrice,
      descuentos,
      total_descuento: totalDescuento,
      valor_final: Math.max(0, basePrice - totalDescuento),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cotizaciones/seed — cargar tabla inicial completa
router.post('/seed', async (req, res) => {
  try {
    const modelos = await db.query('SELECT * FROM cotizacion_models');
    const byName = {};
    modelos.rows.forEach(m => { byName[m.model_name] = m.id; });

    // [modelo, gb, batMin, batMax, precio]
    const data = [
      ['iPhone 11', 64, 0, 100, 70],
      ['iPhone 11', 128, 75, 100, 100],
      ['iPhone 11 Pro', 64, 0, 89, 150],
      ['iPhone 11 Pro', 128, 0, 100, 150],
      ['iPhone 11 Pro Max', 64, 0, 100, 150],
      ['iPhone 11 Pro Max', 128, 0, 100, 150],
      ['iPhone 11 Pro Max', 256, 0, 100, 150],
      ['iPhone 12', 64, 0, 100, 100],
      ['iPhone 12', 128, 0, 100, 150],
      ['iPhone 12 Pro', 128, 0, 100, 150],
      ['iPhone 12 Pro Max', 128, 0, 100, 150],
      ['iPhone 13', 128, 78, 85, 200],
      ['iPhone 13', 128, 86, 94, 250],
      ['iPhone 13', 128, 95, 100, 300],
      ['iPhone 13', 256, 78, 85, 250],
      ['iPhone 13', 256, 86, 94, 300],
      ['iPhone 13', 256, 95, 100, 350],
      ['iPhone 13 Pro', 128, 0, 89, 360],
      ['iPhone 13 Pro', 128, 90, 100, 400],
      ['iPhone 13 Pro', 256, 0, 89, 390],
      ['iPhone 13 Pro', 256, 90, 100, 430],
      ['iPhone 13 Pro Max', 128, 0, 89, 410],
      ['iPhone 13 Pro Max', 128, 90, 100, 450],
      ['iPhone 13 Pro Max', 256, 0, 89, 440],
      ['iPhone 13 Pro Max', 256, 90, 100, 480],
      ['iPhone 14', 128, 78, 85, 200],
      ['iPhone 14', 128, 86, 94, 250],
      ['iPhone 14', 128, 95, 100, 300],
      ['iPhone 14', 256, 78, 85, 250],
      ['iPhone 14', 256, 86, 94, 300],
      ['iPhone 14', 256, 95, 100, 350],
      ['iPhone 14 Pro', 128, 0, 90, 400],
      ['iPhone 14 Pro', 128, 91, 100, 450],
      ['iPhone 14 Pro', 256, 0, 90, 450],
      ['iPhone 14 Pro', 256, 91, 100, 500],
      ['iPhone 14 Pro Max', 128, 0, 90, 450],
      ['iPhone 14 Pro Max', 128, 91, 100, 500],
      ['iPhone 14 Pro Max', 256, 0, 90, 500],
      ['iPhone 14 Pro Max', 256, 91, 100, 550],
      ['iPhone 15', 128, 0, 88, 400],
      ['iPhone 15', 128, 89, 94, 400],
      ['iPhone 15', 128, 95, 100, 500],
      ['iPhone 15', 256, 0, 94, 450],
      ['iPhone 15', 256, 95, 100, 550],
      ['iPhone 15 Pro', 128, 0, 89, 550],
      ['iPhone 15 Pro', 128, 90, 100, 580],
      ['iPhone 15 Pro', 256, 0, 89, 600],
      ['iPhone 15 Pro', 256, 90, 100, 630],
      ['iPhone 15 Pro Max', 256, 0, 89, 650],
      ['iPhone 15 Pro Max', 256, 90, 100, 680],
      ['iPhone 16', 128, 0, 94, 550],
      ['iPhone 16', 128, 95, 96, 600],
      ['iPhone 16', 128, 97, 100, 650],
      ['iPhone 16', 256, 0, 94, 600],
      ['iPhone 16', 256, 95, 100, 700],
      ['iPhone 16 Pro', 128, 88, 94, 700],
      ['iPhone 16 Pro', 128, 95, 100, 750],
      ['iPhone 16 Pro', 256, 88, 94, 750],
      ['iPhone 16 Pro', 256, 95, 100, 800],
      ['iPhone 16 Pro Max', 256, 0, 94, 850],
      ['iPhone 16 Pro Max', 256, 95, 100, 900],
      ['iPhone 16 Pro Max', 512, 0, 100, 1050],
      ['iPhone 17', 128, 0, 100, 750],
      ['iPhone 17', 256, 0, 100, 800],
      ['iPhone 17 Pro', 256, 0, 100, 1150],
    ];

    let cargados = 0;
    for (const [modelName, gb, bMin, bMax, price] of data) {
      const modelId = byName[modelName];
      if (!modelId) continue;
      await db.query(`
        INSERT INTO cotizacion_entries (model_id, storage_gb, battery_min, battery_max, base_price)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (model_id, storage_gb, battery_min, battery_max)
        DO UPDATE SET base_price = EXCLUDED.base_price
      `, [modelId, gb, bMin, bMax, price]);
      cargados++;
    }

    res.json({ cargados, message: `${cargados} cotizaciones cargadas` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
