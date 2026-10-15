const router = require('express').Router();
const db = require('../db/connection');
const bcrypt = require('bcryptjs');

// GET /api/settings/users — listar usuarios (solo admin)
router.get('/users', async (req, res) => {
  try {
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
    const result = await db.query(`SELECT id, name, email, role, created_at FROM crm_users ORDER BY created_at`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/users — crear usuario
router.post('/users', async (req, res) => {
  try {
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Faltan campos' });
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(`
      INSERT INTO crm_users (name, email, password, role)
      VALUES ($1,$2,$3,$4) RETURNING id, name, email, role, created_at
    `, [name, email, hash, role || 'agent']);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'El email ya existe' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/settings/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
    if (parseInt(req.params.id) === req.session.user.id) return res.status(400).json({ error: 'No podés eliminar tu propio usuario' });
    await db.query(`DELETE FROM crm_users WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/settings/password — cambiar contraseña propia
router.patch('/password', async (req, res) => {
  try {
    const { current, newPassword } = req.body;
    if (!current || !newPassword) return res.status(400).json({ error: 'Faltan campos' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

    const result = await db.query('SELECT * FROM crm_users WHERE id = $1', [req.session.user.id]);
    const user = result.rows[0];
    if (!(await bcrypt.compare(current, user.password))) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE crm_users SET password = $1 WHERE id = $2', [hash, req.session.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/notes — agregar nota a una conversación
router.post('/notes', async (req, res) => {
  try {
    const { conversation_id, note } = req.body;
    if (!conversation_id || !note) return res.status(400).json({ error: 'Faltan campos' });

    const result = await db.query(`
      UPDATE conversations
      SET agent_notes = CASE
        WHEN agent_notes IS NULL OR agent_notes = '' THEN $1
        ELSE agent_notes || E'\n---\n' || $1
      END,
      last_message_at = NOW(),
      updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [`[${new Date().toLocaleDateString('es-AR')}] ${note}`, conversation_id]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CONFIGURACIÓN DEL SISTEMA ─────────────────
router.get('/config', async (req, res) => {
  try {
    const r = await db.query('SELECT key, value FROM system_config');
    const config = {};
    r.rows.forEach(x => { config[x.key] = x.value; });
    res.json(config);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/config', async (req, res) => {
  try {
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await db.query(`
        INSERT INTO system_config (key, value) VALUES ($1,$2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `, [key, String(value)]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PERMISOS ──────────────────────────────────
const SECTIONS = ['dashboard','leads','calendario','productos','clientes','cobros',
                  'caja','proveedores','tareas','cotizaciones','automatizaciones',
                  'reportes','configuracion'];

router.get('/permissions/:userId', async (req, res) => {
  try {
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
    const r = await db.query(
      'SELECT * FROM role_permissions WHERE user_id=$1 ORDER BY section',
      [req.params.userId]
    );
    // Asegurar que existan todas las secciones
    const existing = r.rows.map(x => x.section);
    for (const sec of SECTIONS) {
      if (!existing.includes(sec)) {
        await db.query(`
          INSERT INTO role_permissions (user_id, section) VALUES ($1,$2)
          ON CONFLICT DO NOTHING
        `, [req.params.userId, sec]);
      }
    }
    const final = await db.query(
      'SELECT * FROM role_permissions WHERE user_id=$1 ORDER BY section',
      [req.params.userId]
    );
    res.json(final.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/permissions/:id', async (req, res) => {
  try {
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
    const { can_view, can_create, can_edit, can_delete, can_export } = req.body;
    const r = await db.query(`
      UPDATE role_permissions SET
        can_view   = COALESCE($1, can_view),
        can_create = COALESCE($2, can_create),
        can_edit   = COALESCE($3, can_edit),
        can_delete = COALESCE($4, can_delete),
        can_export = COALESCE($5, can_export)
      WHERE id=$6 RETURNING *
    `, [can_view, can_create, can_edit, can_delete, can_export, req.params.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/settings/my-permissions — permisos del usuario logueado
router.get('/my-permissions', async (req, res) => {
  try {
    const r = await db.query(
      'SELECT section, can_view, can_create, can_edit, can_delete, can_export FROM role_permissions WHERE user_id=$1',
      [req.session.user.id]
    );
    const perms = {};
    r.rows.forEach(x => {
      perms[x.section] = {
        view: x.can_view, create: x.can_create, edit: x.can_edit,
        delete: x.can_delete, export: x.can_export,
      };
    });
    res.json(perms);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
