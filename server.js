require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const db = require('./db/connection');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Esperar a que PostgreSQL esté listo ──────
async function waitForDB(retries = 15, delay = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await db.query('SELECT 1');
      console.log('✅ PostgreSQL conectado');
      return true;
    } catch (err) {
      console.log(`⏳ Esperando PostgreSQL... intento ${i}/${retries} (${err.message})`);
      if (i === retries) {
        console.error('❌ No se pudo conectar a PostgreSQL después de varios intentos');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ─── Inicializar schema y usuarios ───────────
async function initDB() {
  const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
  await db.query(schema);

  const hashMati  = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'altech2025', 10);
  const hashRoman = await bcrypt.hash('admin123', 10);

  await db.query(`
    INSERT INTO crm_users (name, email, password, role) VALUES
      ($1, $2, $3, 'admin'),
      ($4, $5, $6, 'admin')
    ON CONFLICT (email) DO NOTHING
  `, [
    'Matías Ganzero', process.env.ADMIN_EMAIL || 'mati@altech.com.ar', hashMati,
    'Roman Portela',  'portelaroman21@gmail.com', hashRoman,
  ]);

  // Seed de permisos para usuarios existentes
  const SECTIONS = ['dashboard','leads','calendario','productos','clientes','cobros',
                    'caja','proveedores','tareas','cotizaciones','automatizaciones',
                    'reportes','configuracion'];
  const users = await db.query('SELECT id, role FROM crm_users');
  for (const u of users.rows) {
    for (const sec of SECTIONS) {
      const isAdmin = u.role === 'admin';
      await db.query(`
        INSERT INTO role_permissions (user_id, section, can_view, can_create, can_edit, can_delete, can_export)
        VALUES ($1,$2,TRUE,TRUE,TRUE,$3,TRUE)
        ON CONFLICT (user_id, section) DO NOTHING
      `, [u.id, sec, isAdmin]);
    }
  }

  // Seed de plantillas de mensajes del agente IA
  const TEMPLATES = require('./db/templates-seed');
  for (const t of TEMPLATES) {
    await db.query(`
      INSERT INTO message_templates
        (section, section_label, section_order, item_order, title, context, message, default_message)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
      ON CONFLICT (section, title, item_order) DO UPDATE SET
        section_label = EXCLUDED.section_label,
        section_order = EXCLUDED.section_order,
        context = EXCLUDED.context,
        default_message = EXCLUDED.default_message
    `, [t.s, t.sl, t.so, t.io, t.t, t.c, t.m]);
  }

  console.log('✅ Schema, usuarios, permisos y plantillas listos');
}

// ─── Middleware ───────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'altech_secret_2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
}));

// ─── Auth middleware ──────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  res.status(401).json({ error: 'No autenticado' });
}

// ─── Auth routes ──────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await db.query('SELECT * FROM crm_users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ user: req.session.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'No autenticado' });
  res.json({ user: req.session.user });
});

// ─── API routes ───────────────────────────────
app.use('/api/dashboard',        requireAuth, require('./routes/dashboard'));
app.use('/api/contacts',         requireAuth, require('./routes/contacts'));
app.use('/api/conversations',    requireAuth, require('./routes/conversations'));
app.use('/api/appointments',     requireAuth, require('./routes/appointments'));
app.use('/api/sales',            requireAuth, require('./routes/sales'));
app.use('/api/reports',          requireAuth, require('./routes/reports'));
app.use('/api/settings',         requireAuth, require('./routes/settings'));
app.use('/api/productos',        requireAuth, require('./routes/productos'));
app.use('/api/clients',          requireAuth, require('./routes/clients'));
app.use('/api/cobros',           requireAuth, require('./routes/cobros'));
app.use('/api/caja',             requireAuth, require('./routes/caja'));
app.use('/api/calendario',       requireAuth, require('./routes/calendario'));
app.use('/api/tareas',           requireAuth, require('./routes/tareas'));
app.use('/api/proveedores',      requireAuth, require('./routes/proveedores'));
app.use('/api/cotizaciones',     requireAuth, require('./routes/cotizaciones'));
app.use('/api/automatizaciones', requireAuth, require('./routes/automatizaciones'));
app.use('/api/plantillas',       requireAuth, require('./routes/plantillas'));

// ─── Webhooks (n8n) ───────────────────────────
app.post('/webhook/lead', async (req, res) => {
  if (req.headers['x-api-key'] !== process.env.WEBHOOK_API_KEY)
    return res.status(403).json({ error: 'API key inválida' });
  try {
    const { name, phone, whatsapp_id, product_interest, is_first_iphone, current_device, source } = req.body;
    const contactResult = await db.query(`
      INSERT INTO contacts (name, phone, whatsapp_id, is_first_iphone, current_device, source)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (phone) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, contacts.name),
        whatsapp_id = COALESCE(EXCLUDED.whatsapp_id, contacts.whatsapp_id),
        updated_at = NOW()
      RETURNING *
    `, [name, phone, whatsapp_id, is_first_iphone, current_device, source || 'whatsapp']);

    const contact = contactResult.rows[0];
    const existingConv = await db.query(
      `SELECT id FROM conversations WHERE contact_id = $1 AND stage NOT IN ('ganado','perdido') LIMIT 1`,
      [contact.id]
    );

    let convId;
    if (!existingConv.rows.length) {
      const r = await db.query(
        `INSERT INTO conversations (contact_id, product_interest, stage) VALUES ($1,$2,'nuevo') RETURNING id`,
        [contact.id, product_interest]
      );
      convId = r.rows[0].id;
    } else {
      convId = existingConv.rows[0].id;
      await db.query(
        `UPDATE conversations SET product_interest = COALESCE($1, product_interest), last_message_at = NOW() WHERE id = $2`,
        [product_interest, convId]
      );
    }
    // Chequear si la IA global está activa
    let aiGlobal = true;
    try {
      const cfg = await db.query(`SELECT value FROM system_config WHERE key='ai_enabled'`);
      aiGlobal = cfg.rows[0]?.value !== 'false';
    } catch {}

    res.json({
      contact_id: contact.id,
      conversation_id: convId,
      ai_enabled: aiGlobal && contact.ai_enabled !== false,
      ai_global: aiGlobal,
      ai_contact: contact.ai_enabled !== false,
      followups_enabled: contact.followups_enabled !== false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/webhook/stage', async (req, res) => {
  if (req.headers['x-api-key'] !== process.env.WEBHOOK_API_KEY)
    return res.status(403).json({ error: 'API key inválida' });
  try {
    const { phone, stage, agent_notes } = req.body;
    const contact = await db.query('SELECT id FROM contacts WHERE phone = $1', [phone]);
    if (!contact.rows[0]) return res.status(404).json({ error: 'Contacto no encontrado' });
    await db.query(
      `UPDATE conversations SET stage = $1, agent_notes = COALESCE($2, agent_notes),
       last_message_at = NOW(), updated_at = NOW()
       WHERE contact_id = $3 AND stage NOT IN ('ganado','perdido')`,
      [stage, agent_notes, contact.rows[0].id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SPA ──────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────
async function start() {
  await waitForDB();
  await initDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Altech CRM → http://0.0.0.0:${PORT}`);
  });
}

start();
