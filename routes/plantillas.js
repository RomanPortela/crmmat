const router = require('express').Router();
const db = require('../db/connection');

// GET /api/plantillas — todas agrupadas por sección
router.get('/', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT * FROM message_templates
      ORDER BY section_order, item_order
    `);

    // Agrupar por sección
    const sections = [];
    const map = {};
    for (const row of r.rows) {
      if (!map[row.section]) {
        map[row.section] = {
          section: row.section,
          section_label: row.section_label,
          section_order: row.section_order,
          items: [],
        };
        sections.push(map[row.section]);
      }
      map[row.section].items.push(row);
    }

    res.json(sections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/plantillas/:id — editar mensaje
router.patch('/:id', async (req, res) => {
  try {
    const { message } = req.body;
    if (message === undefined) return res.status(400).json({ error: 'Falta el mensaje' });

    const r = await db.query(`
      UPDATE message_templates
      SET message = $1, updated_at = NOW(), updated_by = $2
      WHERE id = $3 RETURNING *
    `, [message, req.session.user.id, req.params.id]);

    if (!r.rows[0]) return res.status(404).json({ error: 'Plantilla no encontrada' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/plantillas/:id/reset — restaurar mensaje original
router.post('/:id/reset', async (req, res) => {
  try {
    const r = await db.query(`
      UPDATE message_templates
      SET message = default_message, updated_at = NOW(), updated_by = $1
      WHERE id = $2 RETURNING *
    `, [req.session.user.id, req.params.id]);
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/plantillas/export — exportar todas para el agente n8n
router.get('/export', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT section, section_label, title, context, message
      FROM message_templates ORDER BY section_order, item_order
    `);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
