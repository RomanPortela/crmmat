const router = require('express').Router();
const db = require('../db/connection');

// GET /api/calendario?month=YYYY-MM
router.get('/', async (req, res) => {
  try {
    const { month, from, to } = req.query;
    const where = ['1=1'];
    const params = [];
    let i = 1;

    if (month) {
      where.push(`DATE_TRUNC('month', e.start_at) = DATE_TRUNC('month', $${i}::date)`);
      params.push(month + '-01'); i++;
    }
    if (from) { where.push(`e.start_at >= $${i}`); params.push(from); i++; }
    if (to)   { where.push(`e.start_at <= $${i}`); params.push(to); i++; }

    const r = await db.query(`
      SELECT e.*,
             ct.name AS contact_name, ct.phone AS contact_phone,
             cl.name AS client_name, cl.last_name AS client_last_name,
             p.model AS producto_model
      FROM calendar_events e
      LEFT JOIN contacts ct ON ct.id = e.contact_id
      LEFT JOIN clients cl ON cl.id = e.client_id
      LEFT JOIN productos p ON p.id = e.producto_id
      WHERE ${where.join(' AND ')}
      ORDER BY e.start_at ASC
    `, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/calendario
router.post('/', async (req, res) => {
  try {
    const f = req.body;
    if (!f.title || !f.start_at) return res.status(400).json({ error: 'Título y fecha requeridos' });

    const r = await db.query(`
      INSERT INTO calendar_events (title, description, start_at, end_at, all_day, type,
        contact_id, client_id, producto_id, "seña_amount", notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
    `, [f.title, f.description, f.start_at, f.end_at || null, f.all_day === true,
        f.type || 'visita', f.contact_id || null, f.client_id || null,
        f.producto_id || null, f.sena_amount || null, f.notes, req.session.user.id]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/calendario/:id
router.patch('/:id', async (req, res) => {
  try {
    const f = req.body;
    const r = await db.query(`
      UPDATE calendar_events SET
        title = COALESCE($1,title), description = COALESCE($2,description),
        start_at = COALESCE($3,start_at), end_at = COALESCE($4,end_at),
        type = COALESCE($5,type), "seña_amount" = COALESCE($6,"seña_amount"),
        notes = COALESCE($7,notes)
      WHERE id=$8 RETURNING *
    `, [f.title, f.description, f.start_at, f.end_at, f.type, f.sena_amount, f.notes, req.params.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/calendario/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM calendar_events WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
