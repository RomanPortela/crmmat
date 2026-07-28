const router = require('express').Router();
const db = require('../db/connection');

// GET /api/tareas
router.get('/', async (req, res) => {
  try {
    const { search, status, assigned_to } = req.query;
    const where = ['1=1'];
    const params = [];
    let i = 1;

    if (search)      { where.push(`(t.title ILIKE $${i} OR t.description ILIKE $${i})`); params.push(`%${search}%`); i++; }
    if (status)      { where.push(`t.status = $${i}`); params.push(status); i++; }
    if (assigned_to) { where.push(`t.assigned_to = $${i}`); params.push(assigned_to); i++; }

    const r = await db.query(`
      SELECT t.*, u.name AS assigned_name,
             ct.name AS contact_name, ct.phone AS contact_phone,
             cl.name AS client_name, cl.last_name AS client_last_name
      FROM tasks t
      LEFT JOIN crm_users u ON u.id = t.assigned_to
      LEFT JOIN contacts ct ON ct.id = t.contact_id
      LEFT JOIN clients cl ON cl.id = t.client_id
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE t.priority WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        t.due_date ASC NULLS LAST, t.created_at DESC
    `, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/tareas/kanban
router.get('/kanban', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT t.*, u.name AS assigned_name,
             ct.name AS contact_name, cl.name AS client_name
      FROM tasks t
      LEFT JOIN crm_users u ON u.id = t.assigned_to
      LEFT JOIN contacts ct ON ct.id = t.contact_id
      LEFT JOIN clients cl ON cl.id = t.client_id
      ORDER BY
        CASE t.priority WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        t.due_date ASC NULLS LAST
    `);
    const cols = [
      { name: 'pendiente',   label: 'Pendientes',  color: '#F59E0B' },
      { name: 'en_progreso', label: 'En progreso', color: '#3B82F6' },
      { name: 'completada',  label: 'Completadas', color: '#10B981' },
    ];
    res.json(cols.map(c => ({ ...c, tasks: r.rows.filter(t => t.status === c.name) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/tareas/stats
router.get('/stats', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status != 'completada') AS pendientes,
        COUNT(*) FILTER (WHERE status != 'completada' AND due_date < NOW()) AS vencidas,
        COUNT(*) FILTER (WHERE status != 'completada' AND DATE(due_date) = CURRENT_DATE) AS hoy
      FROM tasks
    `);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/tareas
router.post('/', async (req, res) => {
  try {
    const f = req.body;
    if (!f.title) return res.status(400).json({ error: 'Título requerido' });
    const r = await db.query(`
      INSERT INTO tasks (title, description, status, priority, type, due_date,
        assigned_to, contact_id, client_id, producto_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [f.title, f.description, f.status || 'pendiente', f.priority || 'normal',
        f.type || 'manual', f.due_date || null, f.assigned_to || null,
        f.contact_id || null, f.client_id || null, f.producto_id || null]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/tareas/:id
router.patch('/:id', async (req, res) => {
  try {
    const f = req.body;
    const r = await db.query(`
      UPDATE tasks SET
        title = COALESCE($1,title), description = COALESCE($2,description),
        status = COALESCE($3,status), priority = COALESCE($4,priority),
        due_date = COALESCE($5,due_date), assigned_to = COALESCE($6,assigned_to),
        completed_at = CASE WHEN $3='completada' THEN NOW() ELSE completed_at END,
        updated_at = NOW()
      WHERE id=$7 RETURNING *
    `, [f.title, f.description, f.status, f.priority, f.due_date, f.assigned_to, req.params.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/tareas/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/tareas/generar-automaticas — genera tareas de cumpleaños y seguimientos
router.post('/generar-automaticas', async (req, res) => {
  try {
    let creadas = 0;

    // Cumpleaños próximos 7 días
    const cumples = await db.query(`
      SELECT id, name, last_name, birthday FROM clients
      WHERE birthday IS NOT NULL
        AND TO_CHAR(birthday,'MM-DD') BETWEEN TO_CHAR(NOW(),'MM-DD')
        AND TO_CHAR(NOW() + INTERVAL '7 days','MM-DD')
    `);
    for (const c of cumples.rows) {
      const exists = await db.query(`
        SELECT id FROM tasks WHERE client_id=$1 AND type='cumpleaños'
          AND DATE_TRUNC('year', created_at) = DATE_TRUNC('year', NOW())
      `, [c.id]);
      if (!exists.rows.length) {
        await db.query(`
          INSERT INTO tasks (title, description, type, priority, due_date, client_id)
          VALUES ($1,$2,'cumpleaños','normal',$3,$4)
        `, [`Cumpleaños de ${c.name} ${c.last_name || ''}`,
            'Enviar saludo y ofrecer beneficio', c.birthday, c.id]);
        creadas++;
      }
    }

    // Seguimiento 3 meses post-venta
    const seguimientos = await db.query(`
      SELECT DISTINCT p.client_id, c.name, c.last_name, p.model, p.sold_at
      FROM productos p
      JOIN clients c ON c.id = p.client_id
      WHERE p.status='vendido' AND p.sold_at IS NOT NULL
        AND p.sold_at BETWEEN NOW() - INTERVAL '95 days' AND NOW() - INTERVAL '85 days'
    `);
    for (const s of seguimientos.rows) {
      const exists = await db.query(
        `SELECT id FROM tasks WHERE client_id=$1 AND type='seguimiento_3m'`, [s.client_id]
      );
      if (!exists.rows.length) {
        await db.query(`
          INSERT INTO tasks (title, description, type, priority, due_date, client_id)
          VALUES ($1,$2,'seguimiento_3m','normal',NOW(),$3)
        `, [`Seguimiento 3 meses — ${s.name} ${s.last_name || ''}`,
            `Compró ${s.model}. Consultar cómo le está yendo.`, s.client_id]);
        creadas++;
      }
    }

    res.json({ creadas });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
