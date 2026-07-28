const router = require('express').Router();
const db = require('../db/connection');

// GET /api/appointments — lista de turnos
router.get('/', async (req, res) => {
  try {
    const { date, status, upcoming } = req.query;
    let where = ['1=1'];
    let params = [];
    let i = 1;

    if (date) {
      where.push(`DATE(a.scheduled_at) = $${i}`);
      params.push(date);
      i++;
    }

    if (status) {
      where.push(`a.status = $${i}`);
      params.push(status);
      i++;
    }

    if (upcoming === 'true') {
      where.push(`a.scheduled_at >= NOW()`);
    }

    const result = await db.query(`
      SELECT a.id, a.scheduled_at, a.status, a.product_interested,
             a.has_trade_in, a.notes, a."seña_paid", a."seña_amount",
             ct.id as contact_id, ct.name, ct.phone, ct.city
      FROM appointments a
      JOIN contacts ct ON ct.id = a.contact_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.scheduled_at ASC
    `, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/appointments — crear turno
router.post('/', async (req, res) => {
  try {
    const {
      contact_id, conversation_id, scheduled_at,
      product_interested, has_trade_in, notes
    } = req.body;
    const senaPaid = req.body["seña_paid"] ?? req.body.sena_paid ?? false;

    if (!contact_id || !scheduled_at) {
      return res.status(400).json({ error: 'contact_id y scheduled_at son requeridos' });
    }

    const result = await db.query(`
      INSERT INTO appointments
        (contact_id, conversation_id, scheduled_at, product_interested, has_trade_in, notes, "seña_paid")
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [contact_id, conversation_id, scheduled_at, product_interested, has_trade_in, notes, senaPaid]);

    // Actualizar stage en conversación si aplica
    if (conversation_id) {
      await db.query(`
        UPDATE conversations SET stage = 'turno_agendado', updated_at = NOW()
        WHERE id = $1 AND stage NOT IN ('ganado','perdido')
      `, [conversation_id]);
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/appointments/:id — actualizar turno
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduled_at, status, notes, product_interested } = req.body;
    const senaPaid = req.body["seña_paid"] ?? req.body.sena_paid ?? null;

    const result = await db.query(`
      UPDATE appointments SET
        scheduled_at = COALESCE($1, scheduled_at),
        status = COALESCE($2, status),
        notes = COALESCE($3, notes),
        "seña_paid" = COALESCE($4, "seña_paid"),
        product_interested = COALESCE($5, product_interested),
        updated_at = NOW()
      WHERE id = $6 RETURNING *
    `, [scheduled_at, status, notes, senaPaid, product_interested, id]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/appointments/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM appointments WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
