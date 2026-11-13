const router = require('express').Router();
const db = require('../db/connection');

// GET /api/conversations — pipeline kanban
router.get('/', async (req, res) => {
  try {
    const { stage } = req.query;
    let whereClause = "c.stage NOT IN ('ganado','perdido')";
    let params = [];

    if (stage) {
      whereClause = 'c.stage = $1';
      params.push(stage);
    }

    const result = await db.query(`
      SELECT c.id, c.stage, c.product_interest, c.budget_usd,
             c.has_trade_in, c.payment_method, c.agent_notes,
             c.last_message_at, c.created_at,
             ct.id as contact_id, ct.name, ct.phone, ct.city,
             ct.is_first_iphone, ct.current_device,
             ps.label as stage_label, ps.color as stage_color,
             a.scheduled_at as next_appointment
      FROM conversations c
      JOIN contacts ct ON ct.id = c.contact_id
      JOIN pipeline_stages ps ON ps.name = c.stage
      LEFT JOIN appointments a ON a.contact_id = ct.id
        AND a.status IN ('pendiente','confirmado')
        AND a.scheduled_at > NOW()
      WHERE ${whereClause}
      ORDER BY c.last_message_at DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conversations/kanban — agrupado por etapa
router.get('/kanban', async (req, res) => {
  try {
    const stages = await db.query(`SELECT * FROM pipeline_stages ORDER BY order_index`);
    const convs = await db.query(`
      SELECT c.id, c.stage, c.product_interest, c.budget_usd,
             c.has_trade_in, c.last_message_at, c.agent_notes, c.stage_changed_at,
             ct.id as contact_id, ct.name, ct.phone, ct.instagram,
             ct.ai_enabled, ct.followups_enabled
      FROM conversations c
      JOIN contacts ct ON ct.id = c.contact_id
      WHERE c.stage NOT IN ('ganado','perdido')
      ORDER BY
        (ct.ai_enabled = FALSE OR ct.followups_enabled = FALSE) DESC,
        c.stage_changed_at DESC
    `);

    const kanban = stages.rows
      .filter(s => !['ganado','perdido'].includes(s.name))
      .map(stage => ({
        ...stage,
        cards: convs.rows.filter(c => c.stage === stage.name),
      }));

    res.json(kanban);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/conversations — nueva conversación
router.post('/', async (req, res) => {
  try {
    const { contact_id, product_interest, budget_usd, has_trade_in, payment_method, agent_notes } = req.body;

    if (!contact_id) return res.status(400).json({ error: 'contact_id requerido' });

    const result = await db.query(`
      INSERT INTO conversations (contact_id, product_interest, budget_usd, has_trade_in, payment_method, agent_notes)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [contact_id, product_interest, budget_usd, has_trade_in, payment_method, agent_notes]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/conversations/:id/stage — mover en el pipeline
router.patch('/:id/stage', async (req, res) => {
  try {
    const { id } = req.params;
    const { stage, lost_reason } = req.body;

    const validStages = ['nuevo','contactado','interesado','propuesta','turno_agendado','ganado','perdido'];
    if (!validStages.includes(stage)) {
      return res.status(400).json({ error: 'Etapa inválida' });
    }

    const closedAt = ['ganado','perdido'].includes(stage) ? 'NOW()' : 'NULL';

    const result = await db.query(`
      UPDATE conversations SET
        stage = $1,
        lost_reason = $2,
        closed_at = ${closedAt},
        stage_changed_at = NOW(),
        updated_at = NOW()
      WHERE id = $3 RETURNING *
    `, [stage, lost_reason || null, id]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/conversations/:id — actualizar datos
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { product_interest, budget_usd, has_trade_in, payment_method, agent_notes } = req.body;

    const result = await db.query(`
      UPDATE conversations SET
        product_interest = COALESCE($1, product_interest),
        budget_usd = COALESCE($2, budget_usd),
        has_trade_in = COALESCE($3, has_trade_in),
        payment_method = COALESCE($4, payment_method),
        agent_notes = COALESCE($5, agent_notes),
        last_message_at = NOW(),
        updated_at = NOW()
      WHERE id = $6 RETURNING *
    `, [product_interest, budget_usd, has_trade_in, payment_method, agent_notes, id]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/conversations/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM conversations WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
