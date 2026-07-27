require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./db/connection');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'altech_secret_2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }, // 24hs
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

// ─── API routes (protegidas) ──────────────────
app.use('/api/dashboard',     requireAuth, require('./routes/dashboard'));
app.use('/api/contacts',      requireAuth, require('./routes/contacts'));
app.use('/api/conversations',  requireAuth, require('./routes/conversations'));
app.use('/api/appointments',  requireAuth, require('./routes/appointments'));
app.use('/api/sales',         requireAuth, require('./routes/sales'));

// ─── Webhook público (n8n → CRM) ─────────────
// Permite que n8n registre leads sin autenticación de sesión
app.post('/webhook/lead', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.WEBHOOK_API_KEY) {
    return res.status(403).json({ error: 'API key inválida' });
  }

  try {
    const { name, phone, whatsapp_id, product_interest, is_first_iphone, current_device, source } = req.body;

    // Crear o actualizar contacto
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

    // Crear conversación si no tiene una activa
    const existingConv = await db.query(`
      SELECT id FROM conversations WHERE contact_id = $1 AND stage NOT IN ('ganado','perdido')
      LIMIT 1
    `, [contact.id]);

    let convId;
    if (existingConv.rows.length === 0) {
      const convResult = await db.query(`
        INSERT INTO conversations (contact_id, product_interest, stage)
        VALUES ($1,$2,'nuevo') RETURNING id
      `, [contact.id, product_interest]);
      convId = convResult.rows[0].id;
    } else {
      convId = existingConv.rows[0].id;
      await db.query(`
        UPDATE conversations SET
          product_interest = COALESCE($1, product_interest),
          last_message_at = NOW()
        WHERE id = $2
      `, [product_interest, convId]);
    }

    res.json({ contact_id: contact.id, conversation_id: convId });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Webhook para actualizar stage desde n8n
app.post('/webhook/stage', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.WEBHOOK_API_KEY) {
    return res.status(403).json({ error: 'API key inválida' });
  }

  try {
    const { phone, stage, agent_notes } = req.body;
    const contact = await db.query('SELECT id FROM contacts WHERE phone = $1', [phone]);
    if (!contact.rows[0]) return res.status(404).json({ error: 'Contacto no encontrado' });

    await db.query(`
      UPDATE conversations SET stage = $1, agent_notes = COALESCE($2, agent_notes),
        last_message_at = NOW(), updated_at = NOW()
      WHERE contact_id = $3 AND stage NOT IN ('ganado','perdido')
    `, [stage, agent_notes, contact.rows[0].id]);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Frontend SPA ─────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Altech CRM corriendo en http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
});
