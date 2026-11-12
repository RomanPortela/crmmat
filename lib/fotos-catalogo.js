// ─────────────────────────────────────────────────────────────
// Fotos automáticas por modelo + color
//
// El catálogo del socio (Rosario iPhone) publica una foto por cada modelo y color:
//     {FOTOS_CATALOGO_URL}?modelo=iPhone+15+Pro&color=Natural+Titanium
// Acá la bajamos UNA vez por combinación, la guardamos en producto_media (origen = 'catalogo')
// y así la ven el CRM y la web. Las fotos que carga una persona (origen = 'manual') nunca se pisan.
//
// Variable de entorno (opcional):
//   FOTOS_CATALOGO_URL   por defecto https://www.rosarioiphone.com/api/cover
//                        (vacía = función apagada)
// ─────────────────────────────────────────────────────────────
const db = require('../db/connection');

const BASE = process.env.FOTOS_CATALOGO_URL === undefined
  ? 'https://www.rosarioiphone.com/api/cover'
  : process.env.FOTOS_CATALOGO_URL.trim();
const MIME_OK = ['image/webp', 'image/jpeg', 'image/png'];
const MAX_BYTES = 8 * 1024 * 1024;
const TTL_OK = 60 * 60e3, TTL_NO = 10 * 60e3;
const cache = new Map();

const activa = () => !!BASE;

function limpiarModelo(m) {
  return String(m || '').replace(/\b\d+\s?(gb|tb)\b/gi, '').replace(/\s+/g, ' ').trim();
}
const claveDe = (modelo, color) => `${limpiarModelo(modelo).toLowerCase()}|${String(color || '').trim().toLowerCase()}`;

// → { ok: true, buf, mime } | { ok: false, motivo: 'sin_foto' | 'red' | 'apagado' }
async function buscarFoto(modelo, color) {
  if (!activa()) return { ok: false, motivo: 'apagado' };
  const m = limpiarModelo(modelo), c = String(color || '').trim();
  if (!m || !c) return { ok: false, motivo: 'sin_foto' };
  const key = claveDe(m, c);
  const hit = cache.get(key);
  if (hit && hit.hasta > Date.now()) return hit.val;

  const url = `${BASE}?${new URLSearchParams({ modelo: m, color: c }).toString()}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'AltechCRM/1.0', Accept: 'image/*' } });
    if (r.status === 404) { const v = { ok: false, motivo: 'sin_foto' }; cache.set(key, { val: v, hasta: Date.now() + TTL_NO }); return v; }
    if (!r.ok) return { ok: false, motivo: 'red' };
    const mime = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!MIME_OK.includes(mime)) return { ok: false, motivo: 'sin_foto' };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 500 || buf.length > MAX_BYTES) return { ok: false, motivo: 'sin_foto' };
    const v = { ok: true, buf, mime };
    cache.set(key, { val: v, hasta: Date.now() + TTL_OK });
    return v;
  } catch (e) {
    return { ok: false, motivo: 'red' };
  }
}

// Guarda la foto como portada del producto (reemplaza la automática anterior, nunca las manuales)
async function guardarFoto(productoId, foto) {
  const c = await db.pool.connect();
  try {
    await c.query('BEGIN');
    const propias = await c.query(`SELECT 1 FROM producto_media WHERE producto_id = $1 AND origen <> 'catalogo' LIMIT 1`, [productoId]);
    if (propias.rows[0]) { await c.query('ROLLBACK'); return; }
    await c.query(`DELETE FROM producto_media WHERE producto_id = $1 AND origen = 'catalogo'`, [productoId]);
    await c.query(
      `INSERT INTO producto_media (producto_id, tipo, mime, size_bytes, orden, data, origen)
       VALUES ($1, 'imagen', $2, $3, -1, $4, 'catalogo')`, [productoId, foto.mime, foto.buf.length, foto.buf]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}

// Un producto recién creado: si no tiene fotos, se le asigna la de su modelo + color
async function asignarFotoProducto(productoId) {
  if (!activa()) return { ok: false, motivo: 'apagado' };
  const p = await db.query(
    `SELECT p.model, p.color, (SELECT COUNT(*) FROM producto_media m WHERE m.producto_id = p.id)::int AS n
       FROM productos p WHERE p.id = $1`, [productoId]);
  const row = p.rows[0];
  if (!row) return { ok: false, motivo: 'no_existe' };
  if (row.n > 0) return { ok: false, motivo: 'ya_tiene' };
  const foto = await buscarFoto(row.model, row.color);
  if (!foto.ok) return foto;
  await guardarFoto(productoId, foto);
  return { ok: true };
}

// ── Recarga masiva (botón "Recargar fotos") ──
const job = { corriendo: false, total: 0, hechos: 0, asignadas: 0, sin_foto: [], errores_red: 0, modo: '', inicio: null, fin: null };

function estado() {
  return { ...job, activa: activa() };
}

// reemplazar = true  → vuelve a bajar la foto de TODOS los equipos que no tengan fotos propias
// reemplazar = false → solo completa los que no tienen ninguna
async function iniciarRecarga({ reemplazar }) {
  if (!activa()) return { ok: false, error: 'Función apagada (FOTOS_CATALOGO_URL vacía)' };
  if (job.corriendo) return { ok: true, yaCorriendo: true, estado: estado() };
  const filtro = reemplazar
    ? `NOT EXISTS (SELECT 1 FROM producto_media m WHERE m.producto_id = p.id AND m.origen <> 'catalogo')`
    : `NOT EXISTS (SELECT 1 FROM producto_media m WHERE m.producto_id = p.id)`;
  const r = await db.query(
    `SELECT p.id, p.model, p.color FROM productos p
      WHERE p.status IN ('en_stock', 'señado') AND p.model IS NOT NULL AND ${filtro} ORDER BY p.id`);
  Object.assign(job, { corriendo: true, total: r.rows.length, hechos: 0, asignadas: 0, sin_foto: [], errores_red: 0,
                       modo: reemplazar ? 'recargar' : 'completar', inicio: new Date().toISOString(), fin: null });
  // agrupa por modelo + color: se baja una sola vez cada combinación
  const grupos = new Map();
  for (const p of r.rows) {
    const k = claveDe(p.model, p.color);
    if (!grupos.has(k)) grupos.set(k, { modelo: limpiarModelo(p.model), color: String(p.color || '').trim(), ids: [] });
    grupos.get(k).ids.push(p.id);
  }
  const lista = [...grupos.values()];
  (async () => {
    let i = 0;
    const worker = async () => {
      while (i < lista.length) {
        const g = lista[i++];
        try {
          const foto = await buscarFoto(g.modelo, g.color);
          if (foto.ok) {
            for (const id of g.ids) { try { await guardarFoto(id, foto); job.asignadas++; } catch (e) { console.error('foto catálogo:', e.message); } }
          } else if (foto.motivo === 'red') job.errores_red += g.ids.length;
          else job.sin_foto.push(`${g.modelo}${g.color ? ' · ' + g.color : ''} (${g.ids.length})`);
        } catch (e) { console.error('foto catálogo:', e.message); job.errores_red += g.ids.length; }
        job.hechos += g.ids.length;
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    job.corriendo = false; job.fin = new Date().toISOString();
    console.log(`🖼️  Fotos del catálogo: ${job.asignadas}/${job.total} equipos, ${job.sin_foto.length} modelos sin foto`);
  })().catch((e) => { console.error('foto catálogo:', e.message); job.corriendo = false; job.fin = new Date().toISOString(); });
  return { ok: true, estado: estado() };
}

module.exports = { activa, buscarFoto, asignarFotoProducto, iniciarRecarga, estado };
