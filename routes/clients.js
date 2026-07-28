const router = require('express').Router();
const db = require('../db/connection');

// GET /api/clients
router.get('/', async (req, res) => {
  try {
    const { search, from, to, limit = 50, offset = 0 } = req.query;
    const where = ['1=1'];
    const params = [];
    let i = 1;

    if (search) {
      where.push(`(c.name ILIKE $${i} OR c.last_name ILIKE $${i} OR c.phone ILIKE $${i} OR c.dni ILIKE $${i} OR c.email ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }
    if (from) { where.push(`c.created_at >= $${i}`); params.push(from); i++; }
    if (to)   { where.push(`c.created_at <= $${i}`); params.push(to); i++; }

    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(`
      SELECT c.*,
             (SELECT COUNT(*) FROM cobros WHERE client_id = c.id) AS total_cobros,
             (SELECT COUNT(*) FROM productos WHERE client_id = c.id) AS total_compras,
             (SELECT COALESCE(SUM(total_amount),0) FROM cobros WHERE client_id = c.id) AS total_facturado
      FROM clients c
      WHERE ${where.join(' AND ')}
      ORDER BY c.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `, params);

    const count = await db.query(
      `SELECT COUNT(*) FROM clients c WHERE ${where.join(' AND ')}`,
      params.slice(0, -2)
    );

    res.json({ clients: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/clients/stats
router.get('/stats', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())) AS nuevos_mes,
        COUNT(*) FILTER (WHERE birthday IS NOT NULL
          AND TO_CHAR(birthday,'MM-DD') BETWEEN TO_CHAR(NOW(),'MM-DD')
          AND TO_CHAR(NOW() + INTERVAL '30 days','MM-DD')) AS cumples_proximos
      FROM clients
    `);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/clients/cumpleanos — próximos 30 días
router.get('/cumpleanos', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT id, name, last_name, phone, birthday,
             TO_CHAR(birthday, 'DD/MM') AS fecha,
             DATE_PART('day',
               (DATE_TRUNC('year', NOW()) + (birthday - DATE_TRUNC('year', birthday))) - NOW()
             ) AS dias_faltantes
      FROM clients
      WHERE birthday IS NOT NULL
      ORDER BY TO_CHAR(birthday,'MM-DD')
      LIMIT 20
    `);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/clients/:id — ficha completa
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const [client, compras, cobros, eventos, tareas, entregados] = await Promise.all([
      db.query('SELECT * FROM clients WHERE id=$1', [id]),
      db.query(`SELECT * FROM productos WHERE client_id=$1 ORDER BY sold_at DESC NULLS LAST`, [id]),
      db.query(`
        SELECT c.*, p.model AS producto_model,
               (SELECT json_agg(json_build_object('method',cp.method,'amount',cp.amount))
                FROM cobro_payments cp WHERE cp.cobro_id = c.id) AS payments
        FROM cobros c
        LEFT JOIN productos p ON p.id = c.producto_id
        WHERE c.client_id=$1 ORDER BY c.created_at DESC
      `, [id]),
      db.query(`SELECT * FROM calendar_events WHERE client_id=$1 ORDER BY start_at DESC LIMIT 20`, [id]),
      db.query(`SELECT * FROM tasks WHERE client_id=$1 ORDER BY created_at DESC LIMIT 20`, [id]),
      db.query(`SELECT * FROM trade_ins WHERE contact_id = (SELECT contact_id FROM clients WHERE id=$1)`, [id]),
    ]);

    if (!client.rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });

    res.json({
      client: client.rows[0],
      compras: compras.rows,
      cobros: cobros.rows,
      eventos: eventos.rows,
      tareas: tareas.rows,
      entregados: entregados.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/clients
router.post('/', async (req, res) => {
  try {
    const f = req.body;
    if (!f.name && !f.phone) return res.status(400).json({ error: 'Nombre o teléfono requerido' });

    const r = await db.query(`
      INSERT INTO clients (contact_id, name, last_name, dni, phone, email, instagram, address, city, birthday, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [
      f.contact_id || null, f.name, f.last_name, f.dni, f.phone, f.email,
      f.instagram, f.address, f.city, f.birthday || null, f.notes,
    ]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/clients/from-contact/:contactId — convertir lead a cliente
router.post('/from-contact/:contactId', async (req, res) => {
  try {
    const contactId = req.params.contactId;
    const contact = await db.query('SELECT * FROM contacts WHERE id=$1', [contactId]);
    if (!contact.rows[0]) return res.status(404).json({ error: 'Contacto no encontrado' });

    const existing = await db.query('SELECT id FROM clients WHERE contact_id=$1', [contactId]);
    if (existing.rows[0]) return res.json({ ...existing.rows[0], already_exists: true });

    const c = contact.rows[0];
    const parts = (c.name || '').trim().split(' ');

    // Al convertir: IA y seguimientos desactivados por defecto
    const r = await db.query(`
      INSERT INTO clients (contact_id, name, last_name, phone, city, notes,
        ai_enabled, followups_enabled, ai_disabled_at, ai_disabled_reason)
      VALUES ($1,$2,$3,$4,$5,$6,FALSE,FALSE,NOW(),'Convertido a cliente')
      RETURNING *
    `, [contactId, parts[0] || '', parts.slice(1).join(' ') || '', c.phone, c.city, c.notes]);

    // También apagar en el contacto original
    await db.query(`
      UPDATE contacts SET ai_enabled = FALSE, followups_enabled = FALSE,
        ai_disabled_at = NOW(), ai_disabled_reason = 'Convertido a cliente', updated_at = NOW()
      WHERE id = $1
    `, [contactId]);

    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/clients/:id
router.patch('/:id', async (req, res) => {
  try {
    const f = req.body;
    const r = await db.query(`
      UPDATE clients SET
        name = COALESCE($1,name), last_name = COALESCE($2,last_name),
        dni = COALESCE($3,dni), phone = COALESCE($4,phone),
        email = COALESCE($5,email), instagram = COALESCE($6,instagram),
        address = COALESCE($7,address), city = COALESCE($8,city),
        birthday = COALESCE($9,birthday), notes = COALESCE($10,notes),
        ai_enabled = COALESCE($11,ai_enabled),
        followups_enabled = COALESCE($12,followups_enabled),
        ai_disabled_reason = COALESCE($13,ai_disabled_reason),
        updated_at = NOW()
      WHERE id=$14 RETURNING *
    `, [f.name, f.last_name, f.dni, f.phone, f.email, f.instagram,
        f.address, f.city, f.birthday, f.notes, f.ai_enabled,
        f.followups_enabled, f.ai_disabled_reason, req.params.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/clients/export/csv
router.get('/export/csv', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT c.name, c.last_name, c.dni, c.phone, c.email, c.instagram,
             c.address, c.city, c.birthday, c.created_at,
             (SELECT COUNT(*) FROM productos WHERE client_id=c.id) AS compras,
             (SELECT COALESCE(SUM(total_amount),0) FROM cobros WHERE client_id=c.id) AS facturado
      FROM clients c ORDER BY c.created_at DESC
    `);
    const headers = ['Nombre','Apellido','DNI','Teléfono','Email','Instagram','Dirección','Localidad','Cumpleaños','Alta','Compras','Facturado'];
    const rows = r.rows.map(x => [
      x.name||'', x.last_name||'', x.dni||'', x.phone||'', x.email||'', x.instagram||'',
      x.address||'', x.city||'',
      x.birthday ? new Date(x.birthday).toLocaleDateString('es-AR') : '',
      new Date(x.created_at).toLocaleDateString('es-AR'),
      x.compras, x.facturado,
    ]);
    const csv = [headers, ...rows].map(rr => rr.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="clientes.csv"');
    res.send('\uFEFF' + csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/clients/:id/toggle
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
      `UPDATE clients SET ${field} = $1${extra}, updated_at = NOW() WHERE id = $2 RETURNING *`,
      params
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/clients/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM clients WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
