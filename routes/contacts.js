const router = require('express').Router();
const db = require('../db/connection');

// GET /api/contacts — lista con filtros
router.get('/', async (req, res) => {
  try {
    const { search, stage, limit = 50, offset = 0 } = req.query;

    let where = ['1=1'];
    let params = [];
    let i = 1;

    if (search) {
      where.push(`(ct.name ILIKE $${i} OR ct.phone ILIKE $${i})`);
      params.push(`%${search}%`);
      i++;
    }

    if (stage) {
      where.push(`c.stage = $${i}`);
      params.push(stage);
      i++;
    }

    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(`
      SELECT ct.id, ct.name, ct.phone, ct.city, ct.source,
             ct.is_first_iphone, ct.current_device, ct.created_at,
             ct.ai_enabled, ct.followups_enabled,
             c.id as conv_id, c.stage, c.product_interest,
             c.last_message_at,
             ps.label as stage_label, ps.color as stage_color
      FROM contacts ct
      LEFT JOIN conversations c ON c.contact_id = ct.id
        AND c.id = (SELECT id FROM conversations WHERE contact_id = ct.id ORDER BY created_at DESC LIMIT 1)
      LEFT JOIN pipeline_stages ps ON ps.name = c.stage
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(c.last_message_at, ct.created_at) DESC
      LIMIT $${i} OFFSET $${i + 1}
    `, params);

    const countResult = await db.query(`
      SELECT COUNT(DISTINCT ct.id) FROM contacts ct
      LEFT JOIN conversations c ON c.contact_id = ct.id
      WHERE ${where.join(' AND ')}
    `, params.slice(0, -2));

    res.json({
      contacts: result.rows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contacts/:id — detalle completo
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [contact, conversations, appointments, sales, tradeIns] = await Promise.all([
      db.query(`SELECT * FROM contacts WHERE id = $1`, [id]),
      db.query(`SELECT c.*, ps.label as stage_label, ps.color as stage_color
                FROM conversations c
                LEFT JOIN pipeline_stages ps ON ps.name = c.stage
                WHERE c.contact_id = $1 ORDER BY c.created_at DESC`, [id]),
      db.query(`SELECT * FROM appointments WHERE contact_id = $1 ORDER BY scheduled_at DESC`, [id]),
      db.query(`SELECT * FROM sales WHERE contact_id = $1 ORDER BY sold_at DESC`, [id]),
      db.query(`SELECT * FROM trade_ins WHERE contact_id = $1 ORDER BY created_at DESC`, [id]),
    ]);

    if (!contact.rows[0]) return res.status(404).json({ error: 'Contacto no encontrado' });

    res.json({
      contact: contact.rows[0],
      conversations: conversations.rows,
      appointments: appointments.rows,
      sales: sales.rows,
      tradeIns: tradeIns.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contacts — crear contacto
router.post('/', async (req, res) => {
  try {
    const { name, phone, whatsapp_id, city, source, is_first_iphone, current_device, notes } = req.body;

    if (!phone) return res.status(400).json({ error: 'El teléfono es requerido' });

    const result = await db.query(`
      INSERT INTO contacts (name, phone, whatsapp_id, city, source, is_first_iphone, current_device, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (phone) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, contacts.name),
        whatsapp_id = COALESCE(EXCLUDED.whatsapp_id, contacts.whatsapp_id),
        updated_at = NOW()
      RETURNING *
    `, [name, phone, whatsapp_id, city || 'Bahía Blanca', source || 'whatsapp', is_first_iphone, current_device, notes]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/contacts/:id — actualizar
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, city, source, is_first_iphone, current_device, notes,
            ai_enabled, followups_enabled, ai_disabled_reason } = req.body;

    const result = await db.query(`
      UPDATE contacts SET
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        city = COALESCE($3, city),
        source = COALESCE($4, source),
        is_first_iphone = COALESCE($5, is_first_iphone),
        current_device = COALESCE($6, current_device),
        notes = COALESCE($7, notes),
        ai_enabled = COALESCE($8, ai_enabled),
        followups_enabled = COALESCE($9, followups_enabled),
        ai_disabled_reason = COALESCE($10, ai_disabled_reason),
        ai_disabled_at = CASE WHEN $8 = FALSE AND ai_enabled = TRUE THEN NOW()
                              WHEN $8 = TRUE THEN NULL ELSE ai_disabled_at END,
        updated_at = NOW()
      WHERE id = $11 RETURNING *
    `, [name, phone, city, source, is_first_iphone, current_device, notes,
        ai_enabled, followups_enabled, ai_disabled_reason, id]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/contacts/:id/toggle — activar/desactivar IA o seguimientos
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { field, value, reason } = req.body;
    if (!['ai_enabled', 'followups_enabled'].includes(field)) {
      return res.status(400).json({ error: 'Campo inválido' });
    }
    const extra = field === 'ai_enabled'
      ? `, ai_disabled_at = ${value ? 'NULL' : 'NOW()'}, ai_disabled_reason = $3`
      : '';
    const params = field === 'ai_enabled'
      ? [value, req.params.id, reason || null]
      : [value, req.params.id];

    const r = await db.query(
      `UPDATE contacts SET ${field} = $1${extra}, updated_at = NOW() WHERE id = $2 RETURNING *`,
      params
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/contacts/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM contacts WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
