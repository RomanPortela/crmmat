const router = require('express').Router();
const db = require('../db/connection');

// ═══════════════ MODELOS ═══════════════
router.get('/modelos', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT m.*,
        (SELECT COUNT(*) FROM cotizacion_entries WHERE model_id = m.id) AS total_entries,
        (SELECT MIN(base_price) FROM cotizacion_entries WHERE model_id = m.id) AS precio_min,
        (SELECT MAX(base_price) FROM cotizacion_entries WHERE model_id = m.id) AS precio_max
      FROM cotizacion_models m
      WHERE m.is_active = TRUE
      ORDER BY
        CASE WHEN m.model_name ~ 'iPhone ([0-9]+)'
             THEN (regexp_match(m.model_name, 'iPhone ([0-9]+)'))[1]::int
             ELSE 0 END,
        CASE m.line WHEN 'base' THEN 1 WHEN 'plus' THEN 2 WHEN 'pro' THEN 3 WHEN 'pro_max' THEN 4 ELSE 5 END
    `);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/modelos/:id', async (req, res) => {
  try {
    const [modelo, entries, mods] = await Promise.all([
      db.query('SELECT * FROM cotizacion_models WHERE id=$1', [req.params.id]),
      db.query(`SELECT * FROM cotizacion_entries WHERE model_id=$1
                ORDER BY storage_gb, battery_min`, [req.params.id]),
      db.query(`SELECT * FROM cotizacion_modifiers
                WHERE (model_id=$1 OR model_id IS NULL) AND is_active=TRUE
                ORDER BY model_id NULLS LAST`, [req.params.id]),
    ]);
    if (!modelo.rows[0]) return res.status(404).json({ error: 'Modelo no encontrado' });
    res.json({ modelo: modelo.rows[0], entries: entries.rows, modificadores: mods.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/modelos', async (req, res) => {
  try {
    const { model_name, line } = req.body;
    if (!model_name || !line) return res.status(400).json({ error: 'Modelo y línea requeridos' });
    const r = await db.query(
      'INSERT INTO cotizacion_models (model_name, line) VALUES ($1,$2) RETURNING *',
      [model_name, line]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Ese modelo ya existe' });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/modelos/:id', async (req, res) => {
  try {
    const { model_name, line, is_active } = req.body;
    const r = await db.query(`
      UPDATE cotizacion_models SET
        model_name = COALESCE($1, model_name),
        line = COALESCE($2, line),
        is_active = COALESCE($3, is_active)
      WHERE id=$4 RETURNING *
    `, [model_name, line, is_active, req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/modelos/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM cotizacion_models WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════ ENTRADAS (rangos de precio) ═══════════════
router.post('/entries', async (req, res) => {
  try {
    const { model_id, storage_gb, battery_min, battery_max, base_price, notes } = req.body;
    if (!model_id || !storage_gb || base_price === undefined || base_price === null || base_price === '') {
      return res.status(400).json({ error: 'Modelo, capacidad y precio son requeridos' });
    }
    const bMin = battery_min === '' || battery_min == null ? 0 : parseInt(battery_min);
    const bMax = battery_max === '' || battery_max == null ? 100 : parseInt(battery_max);
    if (bMin > bMax) return res.status(400).json({ error: 'La batería mínima no puede ser mayor a la máxima' });

    const r = await db.query(`
      INSERT INTO cotizacion_entries (model_id, storage_gb, battery_min, battery_max, base_price, notes)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (model_id, storage_gb, battery_min, battery_max)
      DO UPDATE SET base_price = EXCLUDED.base_price, notes = EXCLUDED.notes
      RETURNING *
    `, [model_id, parseInt(storage_gb), bMin, bMax, parseFloat(base_price), notes || null]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/entries/:id', async (req, res) => {
  try {
    const { storage_gb, battery_min, battery_max, base_price, notes } = req.body;

    const cur = await db.query('SELECT * FROM cotizacion_entries WHERE id=$1', [req.params.id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Rango no encontrado' });

    const bMin = battery_min !== undefined && battery_min !== '' ? parseInt(battery_min) : cur.rows[0].battery_min;
    const bMax = battery_max !== undefined && battery_max !== '' ? parseInt(battery_max) : cur.rows[0].battery_max;
    if (bMin > bMax) return res.status(400).json({ error: 'La batería mínima no puede ser mayor a la máxima' });

    const r = await db.query(`
      UPDATE cotizacion_entries SET
        storage_gb  = $1,
        battery_min = $2,
        battery_max = $3,
        base_price  = $4,
        notes       = $5
      WHERE id=$6 RETURNING *
    `, [
      storage_gb !== undefined && storage_gb !== '' ? parseInt(storage_gb) : cur.rows[0].storage_gb,
      bMin, bMax,
      base_price !== undefined && base_price !== '' ? parseFloat(base_price) : cur.rows[0].base_price,
      notes !== undefined ? notes : cur.rows[0].notes,
      req.params.id,
    ]);
    res.json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Ya existe un rango igual para ese modelo' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/entries/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM cotizacion_entries WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════ DESCUENTOS (costos de reparación) ═══════════════
router.get('/descuentos', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM cotizacion_discounts ORDER BY is_active DESC, name');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/descuentos', async (req, res) => {
  try {
    const { name, amount_usd, applies_to, notes } = req.body;
    if (!name || amount_usd === undefined || amount_usd === '') {
      return res.status(400).json({ error: 'Nombre y monto requeridos' });
    }
    const r = await db.query(
      'INSERT INTO cotizacion_discounts (name, amount_usd, applies_to, notes) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, parseFloat(amount_usd), applies_to || 'all', notes || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/descuentos/:id', async (req, res) => {
  try {
    const { name, amount_usd, applies_to, is_active, notes } = req.body;
    const cur = await db.query('SELECT * FROM cotizacion_discounts WHERE id=$1', [req.params.id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Descuento no encontrado' });

    const r = await db.query(`
      UPDATE cotizacion_discounts SET
        name = $1, amount_usd = $2, applies_to = $3, is_active = $4, notes = $5
      WHERE id=$6 RETURNING *
    `, [
      name !== undefined ? name : cur.rows[0].name,
      amount_usd !== undefined && amount_usd !== '' ? parseFloat(amount_usd) : cur.rows[0].amount_usd,
      applies_to !== undefined ? applies_to : cur.rows[0].applies_to,
      is_active !== undefined ? is_active : cur.rows[0].is_active,
      notes !== undefined ? notes : cur.rows[0].notes,
      req.params.id,
    ]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/descuentos/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM cotizacion_discounts WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════ MODIFICADORES ═══════════════
router.get('/modificadores', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT mo.*, m.model_name
      FROM cotizacion_modifiers mo
      LEFT JOIN cotizacion_models m ON m.id = mo.model_id
      ORDER BY mo.is_active DESC, mo.mod_type, mo.name
    `);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/modificadores', async (req, res) => {
  try {
    const { name, mod_type, condition, amount_usd, model_id, notes } = req.body;
    if (!name || !mod_type || !condition || amount_usd === undefined) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }
    const r = await db.query(`
      INSERT INTO cotizacion_modifiers (name, mod_type, condition, amount_usd, model_id, notes)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [name, mod_type, condition, parseFloat(amount_usd), model_id || null, notes || null]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/modificadores/:id', async (req, res) => {
  try {
    const { name, amount_usd, condition, is_active, notes } = req.body;
    const cur = await db.query('SELECT * FROM cotizacion_modifiers WHERE id=$1', [req.params.id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'No encontrado' });

    const r = await db.query(`
      UPDATE cotizacion_modifiers SET
        name = $1, amount_usd = $2, condition = $3, is_active = $4, notes = $5
      WHERE id=$6 RETURNING *
    `, [
      name !== undefined ? name : cur.rows[0].name,
      amount_usd !== undefined && amount_usd !== '' ? parseFloat(amount_usd) : cur.rows[0].amount_usd,
      condition !== undefined ? condition : cur.rows[0].condition,
      is_active !== undefined ? is_active : cur.rows[0].is_active,
      notes !== undefined ? notes : cur.rows[0].notes,
      req.params.id,
    ]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/modificadores/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM cotizacion_modifiers WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════ CALCULAR ═══════════════
router.post('/calcular', async (req, res) => {
  try {
    const { model_id, storage_gb, battery_pct, discount_ids = [] } = req.body;
    if (!model_id || !storage_gb || battery_pct === undefined) {
      return res.status(400).json({ error: 'Modelo, capacidad y batería requeridos' });
    }

    const modelo = await db.query('SELECT * FROM cotizacion_models WHERE id=$1', [model_id]);
    if (!modelo.rows[0]) return res.status(404).json({ error: 'Modelo no encontrado' });

    const gb = parseInt(storage_gb);
    const bat = parseInt(battery_pct);

    // Regla: 512GB y 1TB se cotizan como 256GB
    let gbBusqueda = gb;
    let notaCapacidad = null;
    if (gb >= 512) {
      const tiene512 = await db.query(
        'SELECT 1 FROM cotizacion_entries WHERE model_id=$1 AND storage_gb=$2 LIMIT 1',
        [model_id, gb]
      );
      if (!tiene512.rows[0]) {
        gbBusqueda = 256;
        notaCapacidad = `${gb}GB se cotiza como 256GB — no se paga el espacio extra`;
      }
    }

    // Buscar el rango que matchea
    let entry = await db.query(`
      SELECT * FROM cotizacion_entries
      WHERE model_id=$1 AND storage_gb=$2 AND $3 BETWEEN battery_min AND battery_max
      ORDER BY battery_min DESC LIMIT 1
    `, [model_id, gbBusqueda, bat]);

    // Si no hay para esa capacidad, buscar base 128 y aplicar modificador
    let modAplicado = null;
    if (!entry.rows[0] && gbBusqueda !== 128) {
      entry = await db.query(`
        SELECT * FROM cotizacion_entries
        WHERE model_id=$1 AND storage_gb=128 AND $2 BETWEEN battery_min AND battery_max
        ORDER BY battery_min DESC LIMIT 1
      `, [model_id, bat]);

      if (entry.rows[0]) {
        const mod = await db.query(`
          SELECT * FROM cotizacion_modifiers
          WHERE mod_type='storage' AND condition=$1 AND is_active=TRUE
            AND (model_id=$2 OR model_id IS NULL)
          ORDER BY model_id NULLS LAST LIMIT 1
        `, [String(gbBusqueda), model_id]);
        if (mod.rows[0]) modAplicado = mod.rows[0];
      }
    }

    if (!entry.rows[0]) {
      return res.status(404).json({
        error: `No hay cotización cargada para ${modelo.rows[0].model_name} ${gb}GB con ${bat}% de batería`,
      });
    }

    const basePrice = parseFloat(entry.rows[0].base_price);
    const modAmount = modAplicado ? parseFloat(modAplicado.amount_usd) : 0;

    // Descuentos por daño
    let descuentos = [];
    let totalDescuento = 0;
    if (discount_ids.length) {
      const d = await db.query(
        'SELECT * FROM cotizacion_discounts WHERE id = ANY($1) AND is_active=TRUE',
        [discount_ids]
      );
      descuentos = d.rows;
      totalDescuento = d.rows.reduce((s, x) => s + parseFloat(x.amount_usd), 0);
    }

    const subtotal = basePrice + modAmount;
    const valorFinal = Math.max(0, subtotal - totalDescuento);

    res.json({
      modelo: modelo.rows[0],
      storage_gb: gb,
      battery_pct: bat,
      rango: `${entry.rows[0].battery_min}% - ${entry.rows[0].battery_max}%`,
      base_price: basePrice,
      modificador: modAplicado,
      modificador_amount: modAmount,
      subtotal,
      descuentos,
      total_descuento: totalDescuento,
      valor_final: valorFinal,
      nota_capacidad: notaCapacidad,
      nota_rango: entry.rows[0].notes,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════ CHECKLIST ═══════════════
router.get('/checklist', async (req, res) => {
  const { CHECKLIST } = require('../db/cotizaciones-seed');
  res.json(CHECKLIST);
});

// ═══════════════ RESET + SEED ═══════════════
router.post('/reset', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { MODELS, ENTRIES, DISCOUNTS, MODIFIERS } = require('../db/cotizaciones-seed');

    // Borrar todo
    await client.query('DELETE FROM cotizacion_modifiers');
    await client.query('DELETE FROM cotizacion_entries');
    await client.query('DELETE FROM cotizacion_discounts');
    await client.query('DELETE FROM cotizacion_models');

    // Modelos
    const modelMap = {};
    for (const [name, line] of MODELS) {
      const r = await client.query(
        'INSERT INTO cotizacion_models (model_name, line) VALUES ($1,$2) RETURNING id',
        [name, line]
      );
      modelMap[name] = r.rows[0].id;
    }

    // Entradas
    let entriesOk = 0;
    for (const [modelName, gb, bMin, bMax, price, notes] of ENTRIES) {
      const mid = modelMap[modelName];
      if (!mid) continue;
      await client.query(`
        INSERT INTO cotizacion_entries (model_id, storage_gb, battery_min, battery_max, base_price, notes)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (model_id, storage_gb, battery_min, battery_max) DO UPDATE
          SET base_price = EXCLUDED.base_price, notes = EXCLUDED.notes
      `, [mid, gb, bMin, bMax, price, notes || null]);
      entriesOk++;
    }

    // Descuentos
    for (const [name, amount, applies, notes] of DISCOUNTS) {
      await client.query(
        'INSERT INTO cotizacion_discounts (name, amount_usd, applies_to, notes) VALUES ($1,$2,$3,$4)',
        [name, amount, applies, notes || null]
      );
    }

    // Modificadores
    for (const [name, type, cond, amount, modelName, notes] of MODIFIERS) {
      await client.query(`
        INSERT INTO cotizacion_modifiers (name, mod_type, condition, amount_usd, model_id, notes)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [name, type, cond, amount, modelName ? modelMap[modelName] || null : null, notes || null]);
    }

    await client.query('COMMIT');
    res.json({
      message: `Tabla recargada: ${MODELS.length} modelos, ${entriesOk} rangos, ${DISCOUNTS.length} descuentos, ${MODIFIERS.length} modificadores`,
      modelos: MODELS.length, entries: entriesOk,
      descuentos: DISCOUNTS.length, modificadores: MODIFIERS.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
