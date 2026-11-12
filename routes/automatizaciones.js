const router = require('express').Router();
const db = require('../db/connection');

// GET /api/automatizaciones
router.get('/', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM automatizaciones ORDER BY type, days_offset');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/automatizaciones
router.post('/', async (req, res) => {
  try {
    const f = req.body;
    if (!f.name || !f.type) return res.status(400).json({ error: 'Nombre y tipo requeridos' });
    const r = await db.query(`
      INSERT INTO automatizaciones (name, type, days_offset, message, status, ai_enabled)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [f.name, f.type, f.days_offset || 0, f.message, f.status || 'activa', f.ai_enabled === true]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/automatizaciones/:id
router.patch('/:id', async (req, res) => {
  try {
    const f = req.body;
    const r = await db.query(`
      UPDATE automatizaciones SET
        name = COALESCE($1,name), days_offset = COALESCE($2,days_offset),
        message = COALESCE($3,message), status = COALESCE($4,status),
        ai_enabled = COALESCE($5,ai_enabled)
      WHERE id=$6 RETURNING *
    `, [f.name, f.days_offset, f.message, f.status, f.ai_enabled, req.params.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/automatizaciones/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM automatizaciones WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
