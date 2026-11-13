// ─────────────────────────────────────────────────────────────
// Notificaciones y derivaciones
//
//  • n8n las carga con  POST /webhook/notificacion  (header x-api-key = WEBHOOK_API_KEY)
//  • El CRM las lista en  GET /api/notificaciones  y avisa en vivo por SSE (/api/notificaciones/stream)
//  • Check "visto":  PATCH /api/notificaciones/:id/visto
//  • Check "desconectar IA":  POST /api/notificaciones/:id/desconectar-ia
//      → llama al webhook de n8n (N8N_DESCONECTAR_IA_URL), que apaga la IA en Postgres
//        y frena las automatizaciones en ManyChat.
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const { EventEmitter } = require('events');
const db = require('../db/connection');

const bus = new EventEmitter();
bus.setMaxListeners(200);

const str = (v, max) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const bool = (v) => v === true || /^(true|si|sí|1|yes)$/i.test(String(v ?? '').trim());

// ── Ingesta por HTTP (opcional) ────────────────────────────────
// n8n carga las notificaciones directo en la tabla (nodo Postgres), pero este endpoint queda como
// alternativa:  POST /webhook/notificacion  con header x-api-key = WEBHOOK_API_KEY.
// La columna del tablero, la importancia y el título los completa el trigger de la tabla;
// el aviso en vivo lo manda el trigger por LISTEN/NOTIFY.
async function ingest(req, res) {
  if (!process.env.WEBHOOK_API_KEY || req.headers['x-api-key'] !== process.env.WEBHOOK_API_KEY) {
    return res.status(403).json({ error: 'API key inválida' });
  }
  try {
    const b = req.body || {};
    const datos = (b.datos && typeof b.datos === 'object' && !Array.isArray(b.datos)) ? b.datos : {};
    const r = await db.query(
      `INSERT INTO notificaciones (tipo, texto, numero, contact_id, nombre, ig, telefono, canal,
                                   ia_desactivada, ia_desactivada_at, ia_desactivada_por, datos)
       SELECT $1::text, $2::text, NULLIF($3::text,''), c.id,
              COALESCE(NULLIF($4::text,''), c.name),
              NULLIF(regexp_replace(COALESCE(NULLIF($5::text,''), c.instagram, ''), '^@', ''), ''),
              COALESCE(NULLIF($6::text,''), c.phone),
              COALESCE(NULLIF($7::text,''), CASE WHEN c.source = 'instagram' THEN 'instagram' ELSE 'whatsapp' END),
              $8::boolean, CASE WHEN $8::boolean THEN NOW() END, CASE WHEN $8::boolean THEN 'Ampi (n8n)' END, $9::jsonb
         FROM (SELECT 1) x
         LEFT JOIN contacts c ON c.whatsapp_id = NULLIF($3::text,'')
        WHERE NOT EXISTS (SELECT 1 FROM notificaciones n
                           WHERE n.tipo = lower($1::text) AND COALESCE(n.numero,'') = COALESCE($3::text,'')
                             AND COALESCE(n.texto,'') = COALESCE($2::text,'') AND n.created_at > NOW() - INTERVAL '1 minute')
        LIMIT 1
       RETURNING id`,
      [str(b.tipo, 40) || 'otro', str(b.texto, 8000), str(b.numero, 60), str(b.nombre, 200), str(b.ig, 100),
       str(b.telefono, 60), str(b.canal, 20) ? String(b.canal).toLowerCase() : '', bool(b.ia_desactivada), JSON.stringify(datos)]);
    res.json({ ok: true, id: r.rows[0]?.id || null, duplicada: !r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── Escucha de Postgres (LISTEN/NOTIFY): cada fila nueva avisa a las pantallas abiertas ──
function iniciarListener() {
  const { Client } = require('pg');
  let cerrado = false;
  const conectar = async () => {
    const c = new Client(db.pool.options);
    const reintentar = () => { if (cerrado) return; cerrado = true; setTimeout(() => { cerrado = false; conectar(); }, 5000); };
    c.on('error', (e) => { console.error('Listener notificaciones:', e.message); c.end().catch(() => {}); reintentar(); });
    c.on('end', reintentar);
    c.on('notification', (msg) => {
      try { bus.emit('evento', JSON.parse(msg.payload)); } catch {}
    });
    try {
      await c.connect();
      await c.query('LISTEN notificaciones');
      console.log('👂 Escuchando notificaciones de Postgres');
    } catch (e) {
      console.error('Listener notificaciones:', e.message);
      c.end().catch(() => {});
      reintentar();
    }
  };
  conectar();
}

// ── Listado ────────────────────────────────────────────────────
// Trae TODAS las no vistas y las vistas de los últimos N días (default 3).
const SELECT_ITEM = `
  SELECT n.id, n.tipo, n.categoria, n.prioridad, n.titulo, n.texto, n.datos, n.numero,
         COALESCE(n.contact_id, c.id) AS contact_id,
         COALESCE(n.nombre, c.name) AS nombre, n.ig, n.telefono, n.canal,
         (n.ia_desactivada OR COALESCE(c.ai_enabled, TRUE) = FALSE) AS ia_desactivada,
         n.ia_desactivada_at, n.ia_desactivada_por,
         n.visto, n.visto_at, n.visto_por, n.created_at
    FROM notificaciones n
    LEFT JOIN LATERAL (
      SELECT ct.id, ct.name, ct.ai_enabled FROM contacts ct
       WHERE ct.id = n.contact_id OR (n.contact_id IS NULL AND n.numero IS NOT NULL AND ct.whatsapp_id = n.numero)
       ORDER BY ct.id LIMIT 1
    ) c ON TRUE`;

router.get('/', async (req, res) => {
  try {
    const dias = Math.min(Math.max(parseInt(req.query.vistas_dias, 10) || 3, 0), 60);
    const r = await db.query(
      `${SELECT_ITEM}
        WHERE n.visto = FALSE OR n.visto_at > NOW() - ($1 || ' days')::interval
        ORDER BY n.visto ASC, n.prioridad ASC, n.created_at DESC
        LIMIT 500`, [String(dias)]);
    const pend = await db.query(
      `SELECT categoria, COUNT(*)::int AS n FROM notificaciones WHERE visto = FALSE GROUP BY categoria`);
    const por_categoria = {};
    let total = 0;
    for (const row of pend.rows) { por_categoria[row.categoria] = row.n; total += row.n; }
    res.json({ items: r.rows, pendientes: total, por_categoria });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Solo el contador (para el globito del menú)
router.get('/pendientes', async (req, res) => {
  try {
    const r = await db.query('SELECT COUNT(*)::int AS n FROM notificaciones WHERE visto = FALSE');
    res.json({ pendientes: r.rows[0].n });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Tiempo real (Server-Sent Events) ───────────────────────────
router.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // que nginx/Traefik no retengan el stream
  });
  res.flushHeaders?.();
  res.write('retry: 3000\n\n');
  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  bus.on('evento', send);
  const hb = setInterval(() => res.write(': latido\n\n'), 25000);
  req.on('close', () => { clearInterval(hb); bus.off('evento', send); });
});

// ── Check "visto" ──────────────────────────────────────────────
router.patch('/:id/visto', async (req, res) => {
  try {
    const visto = req.body?.visto !== false;
    const quien = req.session?.user?.name || null;
    const r = await db.query(
      `UPDATE notificaciones
          SET visto = $2, visto_at = CASE WHEN $2 THEN NOW() END, visto_por = CASE WHEN $2 THEN $3 END
        WHERE id = $1 RETURNING id, visto`, [req.params.id, visto, quien]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Notificación no encontrada' });
    bus.emit('evento', { evento: 'actualizada', id: r.rows[0].id });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Marcar como vistas todas las pendientes (opcionalmente de una sola columna)
router.post('/marcar-vistas', async (req, res) => {
  try {
    const quien = req.session?.user?.name || null;
    const cat = str(req.body?.categoria, 20);
    const r = await db.query(
      `UPDATE notificaciones SET visto = TRUE, visto_at = NOW(), visto_por = $1
        WHERE visto = FALSE AND ($2::text IS NULL OR categoria = $2) RETURNING id`, [quien, cat]);
    if (r.rowCount) bus.emit('evento', { evento: 'actualizada' });
    res.json({ ok: true, marcadas: r.rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Check "desconectar IA" → n8n ───────────────────────────────
router.post('/:id/desconectar-ia', async (req, res) => {
  try {
    const url = process.env.N8N_DESCONECTAR_IA_URL;
    if (!url) {
      return res.status(503).json({ error: 'Falta configurar N8N_DESCONECTAR_IA_URL en el CRM (URL del webhook de n8n)' });
    }
    const r = await db.query(`${SELECT_ITEM} WHERE n.id = $1`, [req.params.id]);
    const n = r.rows[0];
    if (!n) return res.status(404).json({ error: 'Notificación no encontrada' });
    if (!n.numero) return res.status(400).json({ error: 'Esta notificación no tiene el ID de ManyChat del cliente (numero)' });

    const quien = req.session?.user?.name || 'CRM';
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-crm-secret': process.env.N8N_WEBHOOK_SECRET || '' },
        body: JSON.stringify({
          numero: n.numero, nombre: n.nombre, ig: n.ig, telefono: n.telefono,
          notificacion_id: n.id, motivo: `Desconectada desde el CRM por ${quien}`,
        }),
        signal: AbortSignal.timeout(25000),
      });
    } catch (e) {
      return res.status(502).json({ error: `No se pudo comunicar con n8n (${e.message})` });
    }
    const out = await resp.json().catch(() => ({}));
    if (!resp.ok || out.ok === false) {
      return res.status(502).json({ error: out.error || out.mensaje || `n8n respondió ${resp.status}` });
    }

    // Se marca en todas las tarjetas de ese cliente
    await db.query(
      `UPDATE notificaciones SET ia_desactivada = TRUE, ia_desactivada_at = COALESCE(ia_desactivada_at, NOW()),
              ia_desactivada_por = COALESCE(ia_desactivada_por, $2)
        WHERE numero = $1`, [n.numero, quien]);
    bus.emit('evento', { evento: 'actualizada', id: n.id });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.ingest = ingest;
router.bus = bus;
router.iniciarListener = iniciarListener;
module.exports = router;
