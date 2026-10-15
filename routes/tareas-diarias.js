const router = require('express').Router();
const db = require('../db/connection');

// GET /api/tareas-diarias?date=YYYY-MM-DD  (sin date, trae todo lo de hoy en adelante)
router.get('/', async (req, res) => {
  try {
    const { date, from, to } = req.query;
    const where = ['1=1'];
    const params = [];
    let i = 1;

    if (date) { where.push(`scheduled_date = $${i}`); params.push(date); i++; }
    if (from) { where.push(`scheduled_date >= $${i}`); params.push(from); i++; }
    if (to)   { where.push(`scheduled_date <= $${i}`); params.push(to); i++; }

    const r = await db.query(`
      SELECT * FROM daily_tasks
      WHERE ${where.join(' AND ')}
      ORDER BY scheduled_date ASC, scheduled_time ASC NULLS LAST, id ASC
    `, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/tareas-diarias — crear (con opción de vincular al calendario)
router.post('/', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const f = req.body;
    if (!f.client_name || !f.scheduled_date) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Nombre y fecha son requeridos' });
    }

    let calendarEventId = null;
    if (f.linked_to_calendar === true) {
      const startAt = db.toArgentinaTimestamp(
        f.scheduled_time ? `${f.scheduled_date}T${f.scheduled_time}` : `${f.scheduled_date}T00:00`
      );
      const ev = await client.query(`
        INSERT INTO calendar_events (title, description, start_at, all_day, type, notes, created_by)
        VALUES ($1,$2,$3,$4,'tarea_diaria',$5,$6) RETURNING id
      `, [
        `${f.client_name}${f.equipo ? ' — ' + f.equipo : ''}`,
        f.notes || null, startAt, !f.scheduled_time,
        f.notes || null, req.session.user.id,
      ]);
      calendarEventId = ev.rows[0].id;
    }

    const r = await client.query(`
      INSERT INTO daily_tasks
        (client_name, contact_handle, equipo, scheduled_date, scheduled_time,
         contact_channel, linked_to_calendar, calendar_event_id, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [
      f.client_name, f.contact_handle || null, f.equipo || null,
      f.scheduled_date, f.scheduled_time || null,
      f.contact_channel || 'wsp', f.linked_to_calendar === true,
      calendarEventId, f.notes || null, req.session.user.id,
    ]);

    await client.query('COMMIT');
    res.status(201).json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// PATCH /api/tareas-diarias/:id/completada — marcar/desmarcar realizada (no toca el calendario)
router.patch('/:id/completada', async (req, res) => {
  try {
    const r = await db.query(
      'UPDATE daily_tasks SET completada = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [req.body.completada === true, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/tareas-diarias/:id — editar (sincroniza el evento vinculado si corresponde)
router.patch('/:id', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const f = req.body;
    const cur = await client.query('SELECT * FROM daily_tasks WHERE id=$1', [req.params.id]);
    if (!cur.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }
    const prev = cur.rows[0];

    const clientName = f.client_name !== undefined ? f.client_name : prev.client_name;
    const equipo = f.equipo !== undefined ? f.equipo : prev.equipo;
    // prev.scheduled_date llega de pg como objeto Date (columna DATE) — lo normalizamos
    // a "YYYY-MM-DD" antes de usarlo en un template literal, si no, se inserta como
    // "Tue Sep 29 2026 00:00:00 GMT+0000 (...)" y rompe el timestamp combinado con la hora.
    const prevDateStr = prev.scheduled_date instanceof Date
      ? prev.scheduled_date.toISOString().slice(0, 10)
      : String(prev.scheduled_date).slice(0, 10);
    const scheduledDate = f.scheduled_date || prevDateStr;
    const scheduledTime = f.scheduled_time !== undefined ? f.scheduled_time : prev.scheduled_time;
    const wantLinked = f.linked_to_calendar !== undefined ? f.linked_to_calendar === true : prev.linked_to_calendar;

    let calendarEventId = prev.calendar_event_id;

    if (wantLinked && !prev.calendar_event_id) {
      // Se acaba de pedir vincular — crear el evento ahora
      const startAt = db.toArgentinaTimestamp(
        scheduledTime ? `${scheduledDate}T${scheduledTime}` : `${scheduledDate}T00:00`
      );
      const ev = await client.query(`
        INSERT INTO calendar_events (title, description, start_at, all_day, type, notes, created_by)
        VALUES ($1,$2,$3,$4,'tarea_diaria',$5,$6) RETURNING id
      `, [`${clientName}${equipo ? ' — ' + equipo : ''}`, f.notes ?? prev.notes, startAt,
          !scheduledTime, f.notes ?? prev.notes, req.session.user.id]);
      calendarEventId = ev.rows[0].id;
    } else if (!wantLinked && prev.calendar_event_id) {
      // Se pidió desvincular — se borra el evento que se había creado por esta tarea
      await client.query('DELETE FROM calendar_events WHERE id=$1', [prev.calendar_event_id]);
      calendarEventId = null;
    } else if (wantLinked && prev.calendar_event_id) {
      // Sigue vinculada — sincronizar los datos del evento existente
      const startAt = db.toArgentinaTimestamp(
        scheduledTime ? `${scheduledDate}T${scheduledTime}` : `${scheduledDate}T00:00`
      );
      await client.query(`
        UPDATE calendar_events SET
          title = $1, start_at = $2, all_day = $3,
          notes = COALESCE($4, notes)
        WHERE id = $5
      `, [`${clientName}${equipo ? ' — ' + equipo : ''}`, startAt, !scheduledTime,
          f.notes, prev.calendar_event_id]);
    }

    const r = await client.query(`
      UPDATE daily_tasks SET
        client_name = $1, contact_handle = COALESCE($2, contact_handle),
        equipo = $3, scheduled_date = $4, scheduled_time = $5,
        contact_channel = COALESCE($6, contact_channel),
        linked_to_calendar = $7, calendar_event_id = $8,
        notes = COALESCE($9, notes), updated_at = NOW()
      WHERE id = $10 RETURNING *
    `, [
      clientName, f.contact_handle, equipo, scheduledDate, scheduledTime,
      f.contact_channel, wantLinked, calendarEventId, f.notes, req.params.id,
    ]);

    await client.query('COMMIT');
    res.json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// DELETE /api/tareas-diarias/:id — borra la tarea y, si tenía, su evento vinculado
router.delete('/:id', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT calendar_event_id FROM daily_tasks WHERE id=$1', [req.params.id]);
    if (cur.rows[0]?.calendar_event_id) {
      await client.query('DELETE FROM calendar_events WHERE id=$1', [cur.rows[0].calendar_event_id]);
    }
    await client.query('DELETE FROM daily_tasks WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
