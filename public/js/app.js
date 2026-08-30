/* ═══════════════════════════════════════════════
   Altech CRM — Frontend App
═══════════════════════════════════════════════ */

const API = '';
let currentView = 'dashboard';
let contactsPage = 0;
const PER_PAGE = 30;
let stageSelected = null;
let stageConvId = null;

// ── API helper ─────────────────────────────────
async function api(path, opts = {}) {
  try {
    const res = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) { showLogin(); return null; }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error desconocido');
    }
    return res.json();
  } catch (err) {
    if (err.message !== 'Failed to fetch') toast(err.message, 'error');
    throw err;
  }
}

// ── Toast notifications ────────────────────────
function toast(msg, type = 'success') {
  const icon = type === 'success' ? '✓' : '✕';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icon}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Auth ───────────────────────────────────────
async function init() {
  const me = await api('/api/auth/me').catch(() => null);
  if (me) {
    setUser(me.user);
    showApp();
    loadView('dashboard');
  } else {
    showLogin();
  }
}

function setUser(user) {
  document.getElementById('user-name').textContent = user.name.split(' ')[0];
  document.getElementById('user-avatar').textContent = user.name[0].toUpperCase();
}

function showLogin() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}
function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const el = document.getElementById('login-error');
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: { email: document.getElementById('email').value, password: document.getElementById('password').value }
    });
    setUser(data.user);
    showApp();
    loadView('dashboard');
    el.classList.add('hidden');
  } catch {
    el.textContent = 'Email o contraseña incorrectos';
    el.classList.remove('hidden');
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  showLogin();
});

// ── Navigation ─────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    loadView(item.dataset.view);
  });
});

function loadView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
  const el = document.getElementById(`view-${view}`);
  el.classList.remove('hidden');
  el.classList.add('active');
  const loaders = { dashboard: loadDashboard, pipeline: loadPipeline, contacts: loadContacts, appointments: loadAppointments, sales: loadSales };
  loaders[view]?.();
}

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════
async function loadDashboard() {
  const data = await api('/api/dashboard');
  if (!data) return;

  document.getElementById('dashboard-date').textContent =
    new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  const k = data.kpis;
  document.getElementById('kpi-leads').textContent = k.leadsHoy;
  document.getElementById('kpi-turnos').textContent = k.turnosHoy;
  document.getElementById('kpi-ventas').textContent = k.ventasSemana.count + ' ventas';
  document.getElementById('kpi-ventas-usd').textContent = '$' + fmt(k.ventasSemana.total_usd) + ' USD';
  document.getElementById('kpi-conv').textContent = k.conversionRate + '%';

  // Segunda fila de KPIs (métricas de negocio)
  const extra = document.getElementById('dashboard-extra-kpis');
  if (extra) {
    extra.innerHTML = `
      <div class="kpi-card"><div class="kpi-label">Clientes</div><div class="kpi-value">${k.clientesTotal}</div><div class="kpi-sub">+${k.clientesNuevosMes} este mes</div></div>
      <div class="kpi-card"><div class="kpi-label">Stock</div><div class="kpi-value">${k.productosStock}</div><div class="kpi-sub">${k.productosSenados} señados</div></div>
      <div class="kpi-card green"><div class="kpi-label">Vendidos mes</div><div class="kpi-value">${k.productosVendidosMes}</div></div>
      <div class="kpi-card ${k.tareasVencidas > 0 ? 'accent' : ''}"><div class="kpi-label">Tareas</div><div class="kpi-value">${k.tareasPendientes}</div><div class="kpi-sub" style="${k.tareasVencidas > 0 ? 'color:var(--red)' : ''}">${k.tareasVencidas} vencidas</div></div>
      <div class="kpi-card green"><div class="kpi-label">Facturación mes</div><div class="kpi-value">$${fmt(k.facturacionMes)}</div><div class="kpi-sub">Ganancia: $${fmt(k.gananciaMes)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Proveedores</div><div class="kpi-value">${k.proveedores}</div></div>
    `;
  }

  // Panel de caja
  const cajaPanel = document.getElementById('dashboard-caja');
  if (cajaPanel && data.caja) {
    cajaPanel.innerHTML = `
      <div class="pipeline-bar-item"><span class="stage-dot" style="background:var(--accent)"></span><span class="stage-name">Capital pendiente</span><strong class="stage-count">$${fmt(data.caja.capital_pendiente)}</strong></div>
      <div class="pipeline-bar-item"><span class="stage-dot" style="background:var(--green)"></span><span class="stage-name">Ganancia pendiente</span><strong class="stage-count">$${fmt(data.caja.ganancia_pendiente)}</strong></div>
      <div class="pipeline-bar-item"><span class="stage-dot" style="background:var(--text-muted)"></span><span class="stage-name">Ganancia retirada</span><strong class="stage-count">$${fmt(data.caja.ganancia_retirada)}</strong></div>
      <div class="pipeline-bar-item"><span class="stage-dot" style="background:var(--yellow)"></span><span class="stage-name">Capital en stock</span><strong class="stage-count">$${fmt(data.caja.capital_en_stock)}</strong></div>
    `;
  }

  // Cumpleaños
  const cumplePanel = document.getElementById('dashboard-cumples');
  if (cumplePanel) {
    cumplePanel.innerHTML = data.cumpleanos?.length
      ? data.cumpleanos.map(c => `
          <div class="turno-item">
            <div class="turno-time">${c.fecha}</div>
            <div class="turno-info">
              <div class="turno-name">${c.name} ${c.last_name || ''}</div>
              <div class="turno-product">${c.phone || ''}</div>
            </div>
          </div>`).join('')
      : '<p class="text-muted">Sin cumpleaños próximos</p>';
  }

  document.getElementById('pipeline-summary').innerHTML = data.pipeline.length
    ? data.pipeline.map(s => `
        <div class="pipeline-bar-item">
          <span class="stage-dot" style="background:${s.color}"></span>
          <span class="stage-name">${s.label}</span>
          <strong class="stage-count">${s.count}</strong>
        </div>`).join('')
    : '<p class="text-muted">Sin leads activos</p>';

  document.getElementById('turnos-proximos').innerHTML = data.turnosProximos.length
    ? data.turnosProximos.map(t => `
        <div class="turno-item">
          <div class="turno-time">${fmtTime(t.scheduled_at)}<br><span style="font-size:10px">${fmtDate(t.scheduled_at)}</span></div>
          <div class="turno-info">
            <div class="turno-name">${t.name || t.phone}</div>
            <div class="turno-product">${t.product_interested || '—'}</div>
            <div class="turno-badges">
              ${t.seña_paid ? '<span class="badge badge-seña">Seña ✓</span>' : ''}
              ${t.has_trade_in ? '<span class="badge badge-canje">Canje</span>' : ''}
            </div>
          </div>
        </div>`).join('')
    : '<p class="text-muted">Sin turnos próximos</p>';

  document.getElementById('ventas-recientes').innerHTML = data.ventasRecientes.length
    ? data.ventasRecientes.map(v => `
        <div class="venta-item">
          <div style="flex:1">
            <div class="venta-name">${v.name || v.phone || '—'}</div>
            <div class="venta-product">${v.product_name}</div>
          </div>
          <span class="venta-amount">$${fmt(v.price_usd)} USD</span>
          <span class="venta-date">${fmtDate(v.sold_at)}</span>
        </div>`).join('')
    : '<p class="text-muted">Sin ventas recientes</p>';
}

// ═══════════════════════════════════════════════
// PIPELINE / KANBAN
// ═══════════════════════════════════════════════
let kanbanData = [];
let pipelineSearchVal = '';

document.getElementById('pipeline-search').addEventListener('input', e => {
  pipelineSearchVal = e.target.value.toLowerCase();
  renderKanban();
});

async function loadPipeline() {
  kanbanData = await api('/api/conversations/kanban');
  if (!kanbanData) return;
  renderKanban();
  loadSourceStats();
}

async function loadSourceStats() {
  const d = await api('/api/contacts/stats/source');
  if (!d) return;
  const el = document.getElementById('pipeline-source-stats');
  if (!el) return;

  const labels = { whatsapp: 'WhatsApp', instagram: 'Instagram', local: 'Local', referido: 'Referido' };
  const colors = { whatsapp: '#10b981', instagram: '#e1306c', local: '#6366f1', referido: '#f59e0b' };

  el.innerHTML = d.stats.length
    ? `<div class="source-stats-inner">
        ${d.stats.map(s => `
          <div class="source-stat-item">
            <span class="stage-dot" style="background:${colors[s.source]||'#6b7280'}"></span>
            <span>${labels[s.source] || s.source}</span>
            <strong>${s.pct}%</strong>
            <span class="text-muted">(${s.count})</span>
          </div>`).join('')}
        <div class="source-stat-item text-muted">Total: ${d.total} leads</div>
      </div>`
    : '';
}

function renderKanban() {
  const board = document.getElementById('kanban-board');
  board.innerHTML = kanbanData.map(col => {
    const cards = pipelineSearchVal
      ? col.cards.filter(c => (c.name || '').toLowerCase().includes(pipelineSearchVal) || (c.phone || '').includes(pipelineSearchVal))
      : col.cards;

    return `
      <div class="kanban-col">
        <div class="kanban-col-header">
          <div class="kanban-col-title">
            <span class="stage-dot" style="background:${col.color}"></span>
            ${col.label}
          </div>
          <span class="kanban-count">${cards.length}</span>
        </div>
        <div class="kanban-cards">
          ${cards.length ? cards.map(card => {
            const desactivado = card.ai_enabled === false || card.followups_enabled === false;
            return `
            <div class="kanban-card ${desactivado ? 'kanban-card-disabled' : ''}" onclick="openContact(${card.contact_id})">
              <div class="kanban-card-name">
              ${card.ai_enabled === false ? '<span class="ai-off-dot" title="IA desactivada">🔇</span>' : ''}
              ${card.followups_enabled === false ? '<span class="ai-off-dot" title="Seguimientos desactivados">🔕</span>' : ''}
              ${card.name || '(sin nombre)'}
            </div>
              <div class="kanban-card-phone">${card.phone || '—'}${card.instagram ? ` · @${card.instagram.replace('@','')}` : ''}</div>
              ${card.product_interest ? `<div class="kanban-card-product">${card.product_interest}</div>` : ''}
              <div class="kanban-card-footer">
                <span class="kanban-card-date">${fmtRelative(card.stage_changed_at || card.last_message_at)}</span>
                <div class="kanban-card-actions">
                  ${card.has_trade_in ? '<span class="badge badge-canje">Canje</span>' : ''}
                  <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();openStageModal(${card.id},'${card.stage}','${card.name || card.phone}')">Mover →</button>
                </div>
              </div>
            </div>`;
          }).join('')
          : `<div class="kanban-empty">Sin leads</div>`}
        </div>
      </div>`;
  }).join('');
}

// ── Stage change modal ─────────────────────────
const STAGES = [
  { name: 'nuevo',          label: 'Nuevo',            color: '#6B7280' },
  { name: 'contactado',     label: 'Contactado',       color: '#3B82F6' },
  { name: 'interesado',     label: 'Interesado',       color: '#8B5CF6' },
  { name: 'propuesta',      label: 'Propuesta enviada',color: '#F59E0B' },
  { name: 'turno_agendado', label: 'Turno agendado',   color: '#10B981' },
  { name: 'ganado',         label: 'Ganado ✓',         color: '#059669' },
  { name: 'perdido',        label: 'Perdido',          color: '#EF4444' },
];

function openStageModal(convId, currentStage, name) {
  stageConvId = convId;
  stageSelected = currentStage;
  document.getElementById('stage-contact-name').textContent = `Lead: ${name}`;

  document.getElementById('stage-buttons').innerHTML = STAGES.map(s => `
    <button class="stage-btn ${s.name === currentStage ? 'selected' : ''}"
      onclick="selectStage('${s.name}')" data-stage="${s.name}">
      <span class="stage-dot" style="background:${s.color}"></span>
      ${s.label}
    </button>`).join('');

  document.getElementById('stage-lost-reason').classList.add('hidden');
  document.getElementById('lost-reason-input').value = '';
  openModal('modal-stage');
}

function selectStage(name) {
  stageSelected = name;
  document.querySelectorAll('.stage-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.stage === name);
  });
  document.getElementById('stage-lost-reason').classList.toggle('hidden', name !== 'perdido');
}

document.getElementById('stage-confirm-btn').addEventListener('click', async () => {
  if (!stageSelected || !stageConvId) return;
  const lostReason = document.getElementById('lost-reason-input').value;
  try {
    await api(`/api/conversations/${stageConvId}/stage`, {
      method: 'PATCH',
      body: { stage: stageSelected, lost_reason: lostReason || undefined }
    });
    toast('Etapa actualizada');
    closeModal('modal-stage');
    loadPipeline();
  } catch {}
});

// ═══════════════════════════════════════════════
// CONTACTOS
// ═══════════════════════════════════════════════
let contactsSearch = '';
let contactsStage = '';

document.getElementById('contacts-search').addEventListener('input', e => { contactsSearch = e.target.value; contactsPage = 0; loadContacts(); });
document.getElementById('contacts-stage-filter').addEventListener('change', e => { contactsStage = e.target.value; contactsPage = 0; loadContacts(); });

async function loadContacts() {
  // Cargar stages en el filtro si no están
  const stageFilter = document.getElementById('contacts-stage-filter');
  if (stageFilter.options.length === 1) {
    STAGES.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = s.label;
      stageFilter.appendChild(opt);
    });
  }

  const params = new URLSearchParams({ limit: PER_PAGE, offset: contactsPage * PER_PAGE });
  if (contactsSearch) params.set('search', contactsSearch);
  if (contactsStage) params.set('stage', contactsStage);

  const data = await api(`/api/contacts?${params}`);
  if (!data) return;

  document.getElementById('contacts-table-body').innerHTML = data.contacts.length
    ? data.contacts.map(c => `
        <tr onclick="openContact(${c.id})">
          <td>
            <strong>${c.name || '—'}</strong>
            ${c.ai_enabled === false ? '<span class="badge-mini" title="IA desactivada">🔇</span>' : ''}
            ${c.followups_enabled === false ? '<span class="badge-mini" title="Sin seguimientos">🔕</span>' : ''}
          </td>
          <td>${c.phone}</td>
          <td>${c.city || '—'}</td>
          <td>${c.stage ? `<span class="stage-pill" style="background:${c.stage_color}22;color:${c.stage_color}">${c.stage_label}</span>` : '<span class="text-muted">—</span>'}</td>
          <td class="text-muted">${c.product_interest || '—'}</td>
          <td class="text-muted">${fmtRelative(c.last_message_at || c.created_at)}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openContact(${c.id})">Ver</button>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editContacto(${c.id})">✎</button>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin resultados</td></tr>`;

  const totalPages = Math.ceil(data.total / PER_PAGE);
  document.getElementById('contacts-pagination').innerHTML = totalPages > 1
    ? Array.from({ length: totalPages }, (_, i) =>
        `<button class="${i === contactsPage ? 'active' : ''}" onclick="goContactsPage(${i})">${i + 1}</button>`
      ).join('')
    : '';
}

function goContactsPage(p) { contactsPage = p; loadContacts(); }

// ═══════════════════════════════════════════════
// CONTACT DETAIL MODAL
// ═══════════════════════════════════════════════
async function openContact(id) {
  const data = await api(`/api/contacts/${id}`);
  if (!data) return;
  const { contact, conversations, appointments, sales, cobros, productosComprados } = data;

  document.getElementById('modal-contact-title').textContent = contact.name || contact.phone;
  document.getElementById('modal-contact-wa').style.display = '';
  document.getElementById('modal-contact-wa').href = `https://wa.me/${contact.phone.replace(/\D/g,'')}`;
  document.getElementById('modal-contact-wa').onclick = (e) => { e.preventDefault(); window.open(`https://wa.me/${contact.phone.replace(/\D/g,'')}`, '_blank'); };

  const activeConv = conversations.find(c => !['ganado','perdido'].includes(c.stage));

  document.getElementById('modal-contact-body').innerHTML = `
    <div class="contact-detail">

      ${renderToggles('contacto', contact.id, contact.ai_enabled !== false, contact.followups_enabled !== false, contact.ai_disabled_reason)}

      <div style="display:flex;gap:.5rem;margin-bottom:.75rem">
        <button class="btn btn-ghost btn-sm" onclick="closeModal('modal-contact');editContacto(${contact.id})">✎ Editar</button>
        ${!activeConv ? `<button class="btn btn-ghost btn-sm" onclick="convertirACliente(${contact.id})">→ Cliente</button>` : ''}
      </div>

      <div class="contact-section">
        <div class="contact-meta-grid">
          <div class="contact-meta-item"><label>Teléfono</label><span>${contact.phone || '—'}</span></div>
          <div class="contact-meta-item"><label>Instagram</label><span>${contact.instagram ? '@'+contact.instagram.replace('@','') : '—'}</span></div>
          <div class="contact-meta-item"><label>Ciudad</label><span>${contact.city || '—'}</span></div>
          <div class="contact-meta-item"><label>Fuente</label><span>${sourceLabel(contact.source)}</span></div>
          <div class="contact-meta-item"><label>iPhone</label><span>${contact.is_first_iphone === true ? 'Primer iPhone' : contact.is_first_iphone === false ? `Viene de: ${contact.current_device || 'iPhone'}` : '—'}</span></div>
          <div class="contact-meta-item"><label>Cliente desde</label><span>${fmtDateFull(contact.created_at)}</span></div>
        </div>
        ${activeConv ? `
          <div style="display:flex;align-items:center;gap:.75rem;margin-top:.5rem;padding:.75rem;background:var(--bg3);border-radius:8px;border:1px solid var(--border)">
            <div style="flex:1">
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:2px">Etapa actual</div>
              <span class="stage-pill" style="background:${activeConv.stage_color}22;color:${activeConv.stage_color}">${activeConv.stage_label}</span>
              ${activeConv.product_interest ? `<span style="font-size:13px;margin-left:.5rem">${activeConv.product_interest}</span>` : ''}
            </div>
            <button class="btn btn-ghost btn-sm" onclick="openStageModal(${activeConv.id},'${activeConv.stage}','${contact.name || contact.phone}');closeModal('modal-contact')">Cambiar etapa</button>
            <button class="btn btn-ghost btn-sm" onclick="convertirACliente(${contact.id})">→ Cliente</button>
            <button class="btn btn-primary btn-sm" onclick='prefillAppointment(${contact.id}, "${(contact.phone||"").replace(/"/g,"")}", ${JSON.stringify(contact.name||null)});closeModal("modal-contact")'>+ Turno</button>
          </div>
        ` : ''}
        ${contact.notes ? `<p style="margin-top:.75rem;font-size:13px;color:var(--text-muted)">${contact.notes}</p>` : ''}
      </div>

      ${conversations.length ? `
      <div class="contact-section">
        <div class="contact-section-title">Conversaciones</div>
        ${conversations.map(c => `
          <div class="timeline-item">
            <div class="timeline-content">
              <span class="stage-pill" style="background:${c.stage_color}22;color:${c.stage_color}">${c.stage_label}</span>
              ${c.product_interest ? `<span style="margin-left:.5rem;font-size:13px">${c.product_interest}</span>` : ''}
              ${c.agent_notes ? `<p style="font-size:12px;color:var(--text-muted);margin-top:3px">${c.agent_notes}</p>` : ''}
            </div>
            <span class="timeline-date">${fmtDate(c.last_message_at)}</span>
          </div>`).join('')}
      </div>` : ''}

      ${appointments.length ? `
      <div class="contact-section">
        <div class="contact-section-title">Turnos</div>
        ${appointments.map(a => `
          <div class="timeline-item">
            <div class="timeline-content">
              <strong>${fmtDateFull(a.scheduled_at)}</strong>
              <span class="status-badge status-${a.status}" style="margin-left:.5rem">${statusLabel(a.status)}</span>
              ${a.product_interested ? `<p style="font-size:12px;color:var(--text-muted);margin-top:2px">${a.product_interested}</p>` : ''}
            </div>
            ${a.seña_paid ? '<span class="badge badge-seña">Seña ✓</span>' : ''}
          </div>`).join('')}
      </div>` : ''}

      ${sales.length ? `
      <div class="contact-section">
        <div class="contact-section-title">Ventas cerradas</div>
        ${sales.map(s => `
          <div class="timeline-item">
            <div class="timeline-content">
              <strong>${s.product_name}</strong>
              <p style="font-size:12px;color:var(--text-muted)">${paymentLabel(s.payment_method)}${s.cuotas > 1 ? ` · ${s.cuotas} cuotas` : ''}</p>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700;color:var(--green)">$${fmt(s.price_usd)} USD</div>
              <div style="font-size:11px;color:var(--text-muted)">${fmtDate(s.sold_at)}</div>
            </div>
          </div>`).join('')}
      </div>` : ''}

      ${cobros && cobros.length ? `
      <div class="contact-section">
        <div class="contact-section-title">Cobros (${cobros.length})</div>
        ${cobros.map(c => `
          <div class="timeline-item">
            <div class="timeline-content">
              <strong>${c.receipt_num || '—'} — ${cobroTypeLabel(c.type)}</strong>
              <p style="font-size:12px;color:var(--text-muted)">${(c.payments||[]).map(p=>paymentLabel(p.method)).join(', ') || '—'}</p>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700">$${fmtARS(c.total_amount)}</div>
              <div style="font-size:11px;color:var(--text-muted)">${fmtDate(c.created_at)}</div>
            </div>
          </div>`).join('')}
      </div>` : ''}

      ${productosComprados && productosComprados.length ? `
      <div class="contact-section">
        <div class="contact-section-title">Productos comprados (${productosComprados.length})</div>
        ${productosComprados.map(p => `
          <div class="timeline-item">
            <div class="timeline-content">
              <strong>${p.model} ${p.storage_gb || ''}GB ${p.color || ''}</strong>
              <p style="font-size:12px;color:var(--text-muted)">IMEI: ${p.imei || '—'}</p>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700;color:var(--green)">$${fmt(p.price)} USD</div>
              <div style="font-size:11px;color:var(--text-muted)">${fmtDate(p.sold_at)}</div>
            </div>
          </div>`).join('')}
      </div>` : ''}

    </div>
  `;

  openModal('modal-contact');
}

// ═══════════════════════════════════════════════
// TURNOS
// ═══════════════════════════════════════════════
document.getElementById('apt-filter-status').addEventListener('change', loadAppointments);
document.getElementById('apt-filter-date').addEventListener('change', loadAppointments);

async function loadAppointments() {
  const status = document.getElementById('apt-filter-status').value;
  const date = document.getElementById('apt-filter-date').value;
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (date) params.set('date', date);
  if (!status && !date) params.set('upcoming', 'true');

  const apts = await api(`/api/appointments?${params}`);
  if (!apts) return;

  document.getElementById('appointments-list').innerHTML = apts.length
    ? apts.map(a => {
        const dt = new Date(a.scheduled_at);
        const isPast = dt < new Date();
        return `
        <div class="appointment-card" style="${isPast && a.status === 'pendiente' ? 'border-color:#ef444440' : ''}">
          <div class="apt-time" style="${isPast && a.status === 'pendiente' ? 'background:#ef44440d' : ''}">
            <div class="apt-time-hour">${dt.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}</div>
            <div class="apt-time-date">${dt.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'})}</div>
          </div>
          <div class="apt-info">
            <div class="apt-name">${a.name || a.phone}</div>
            <div class="apt-product">${[a.product_interested, a.city].filter(Boolean).join(' · ')}</div>
            <div class="apt-badges">
              ${a.seña_paid ? '<span class="badge badge-seña">Seña pagada</span>' : ''}
              ${a.has_trade_in ? '<span class="badge badge-canje">Canje</span>' : ''}
              ${isPast && a.status === 'pendiente' ? '<span class="badge" style="background:#ef444420;color:var(--red)">Vencido</span>' : ''}
            </div>
          </div>
          <div class="apt-actions">
            <span class="status-badge status-${a.status}">${statusLabel(a.status)}</span>
            <div class="apt-btn-group">
              ${a.status === 'pendiente' ? `<button class="btn btn-green btn-sm" onclick="updateApt(${a.id},'confirmado')">Confirmar</button>` : ''}
              ${!['completado','cancelado'].includes(a.status) ? `
                <button class="btn btn-ghost btn-sm" onclick="updateApt(${a.id},'completado')">✓ Completado</button>
                <button class="btn btn-danger btn-sm" onclick="updateApt(${a.id},'no_vino')">No vino</button>
              ` : ''}
              <button class="btn btn-ghost btn-sm" onclick='editTurno(${a.id}, ${JSON.stringify(a).replace(/'/g,"&apos;")})'>✎</button>
            </div>
          </div>
        </div>`;
      }).join('')
    : '<div class="card" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin turnos</div>';
}

async function updateApt(id, status) {
  await api(`/api/appointments/${id}`, { method: 'PATCH', body: { status } });
  toast(status === 'completado' ? 'Turno completado ✓' : status === 'no_vino' ? 'Marcado como no vino' : 'Turno confirmado ✓');
  loadAppointments();
}

// ── Estado del modal de turno ──
let aptSelectedContact = null;
let aptSelectedProducto = null;

function openNewAppointment(prefillContactId = null, prefillName = null, prefillPhone = null) {
  const form = document.getElementById('form-new-appointment');
  form.reset();
  form.id.value = '';
  document.getElementById('apt-modal-title').textContent = 'Nuevo turno';
  aptSelectedContact = null;
  aptSelectedProducto = null;
  document.getElementById('apt-contact-id').value = '';
  document.getElementById('apt-conversation-id').value = '';
  document.getElementById('apt-producto-id').value = '';
  document.getElementById('apt-contact-selected').classList.add('hidden');
  document.getElementById('apt-producto-selected').classList.add('hidden');
  document.getElementById('apt-contact-search').value = '';
  document.getElementById('apt-producto-search').value = '';
  document.getElementById('apt-sena-select').value = 'false';
  document.getElementById('apt-sena-amount-field').classList.add('hidden');
  document.getElementById('apt-canje-select').value = 'false';
  document.getElementById('apt-canje-fields').classList.add('hidden');
  ['apt-ti-model','apt-ti-gb','apt-ti-battery','apt-ti-value','apt-ti-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });

  if (prefillContactId) {
    selectAptContact(prefillContactId, prefillName || prefillPhone, prefillPhone);
  }

  openModal('modal-new-appointment');
}

// Buscador de contacto
let aptContactSearchTimer = null;
document.getElementById('apt-contact-search')?.addEventListener('input', e => {
  clearTimeout(aptContactSearchTimer);
  const q = e.target.value.trim();
  const box = document.getElementById('apt-contact-results');
  if (q.length < 2) { box.classList.add('hidden'); return; }

  aptContactSearchTimer = setTimeout(async () => {
    const d = await api(`/api/contacts?search=${encodeURIComponent(q)}&limit=8`);
    if (!d?.contacts?.length) {
      box.innerHTML = '<div class="autocomplete-empty">Sin resultados</div>';
      box.classList.remove('hidden');
      return;
    }
    box.innerHTML = d.contacts.map(c => `
      <div class="autocomplete-item" onclick='selectAptContact(${c.id}, ${JSON.stringify(c.name||"").replace(/'/g,"&apos;")}, "${c.phone}", ${c.conv_id || 'null'})'>
        <strong>${c.name || '(sin nombre)'}</strong>
        <span style="color:var(--text-muted);font-size:12px">${c.phone}</span>
      </div>`).join('');
    box.classList.remove('hidden');
  }, 250);
});

function selectAptContact(id, name, phone, convId = null) {
  aptSelectedContact = { id, name, phone };
  document.getElementById('apt-contact-id').value = id;
  document.getElementById('apt-conversation-id').value = convId || '';
  document.getElementById('apt-contact-search').value = '';
  document.getElementById('apt-contact-results').classList.add('hidden');
  const chip = document.getElementById('apt-contact-selected');
  chip.innerHTML = `<span>${name || phone}</span><button type="button" class="chip-remove" onclick="clearAptContact()">✕</button>`;
  chip.classList.remove('hidden');
}

function clearAptContact() {
  aptSelectedContact = null;
  document.getElementById('apt-contact-id').value = '';
  document.getElementById('apt-conversation-id').value = '';
  document.getElementById('apt-contact-selected').classList.add('hidden');
}

// Buscador de producto
let aptProductoSearchTimer = null;
document.getElementById('apt-producto-search')?.addEventListener('input', e => {
  clearTimeout(aptProductoSearchTimer);
  const q = e.target.value.trim();
  const box = document.getElementById('apt-producto-results');
  if (q.length < 2) { box.classList.add('hidden'); return; }

  aptProductoSearchTimer = setTimeout(async () => {
    const d = await api(`/api/productos?search=${encodeURIComponent(q)}&status=en_stock&limit=8`);
    if (!d?.productos?.length) {
      box.innerHTML = '<div class="autocomplete-empty">Sin resultados en stock</div>';
      box.classList.remove('hidden');
      return;
    }
    box.innerHTML = d.productos.map(p => `
      <div class="autocomplete-item" onclick='selectAptProducto(${p.id}, ${JSON.stringify(p.model)}, ${p.storage_gb||'null'}, ${JSON.stringify(p.color||"")}, ${p.price||0})'>
        <strong>${p.model} ${p.storage_gb || ''}GB</strong>
        <span style="color:var(--text-muted);font-size:12px">${p.color || ''} · $${fmt(p.price)}</span>
      </div>`).join('');
    box.classList.remove('hidden');
  }, 250);
});

function selectAptProducto(id, model, gb, color, price) {
  aptSelectedProducto = { id, model, gb, color, price };
  document.getElementById('apt-producto-id').value = id;
  document.getElementById('apt-producto-search').value = '';
  document.getElementById('apt-producto-results').classList.add('hidden');
  const label = `${model} ${gb ? gb+'GB' : ''} ${color || ''} · $${fmt(price)}`;
  const chip = document.getElementById('apt-producto-selected');
  chip.innerHTML = `<span>${label}</span><button type="button" class="chip-remove" onclick="clearAptProducto()">✕</button>`;
  chip.classList.remove('hidden');
}

function clearAptProducto() {
  aptSelectedProducto = null;
  document.getElementById('apt-producto-id').value = '';
  document.getElementById('apt-producto-selected').classList.add('hidden');
}

// Cerrar autocompletes al hacer click afuera
document.addEventListener('click', e => {
  if (!e.target.closest('#apt-contact-search') && !e.target.closest('#apt-contact-results'))
    document.getElementById('apt-contact-results')?.classList.add('hidden');
  if (!e.target.closest('#apt-producto-search') && !e.target.closest('#apt-producto-results'))
    document.getElementById('apt-producto-results')?.classList.add('hidden');
});

// Toggle de seña — mostrar campo de monto
document.getElementById('apt-sena-select')?.addEventListener('change', e => {
  document.getElementById('apt-sena-amount-field').classList.toggle('hidden', e.target.value !== 'true');
});

// Toggle de canje — mostrar sub-formulario
document.getElementById('apt-canje-select')?.addEventListener('change', e => {
  document.getElementById('apt-canje-fields').classList.toggle('hidden', e.target.value !== 'true');
});

// Form nuevo/editar turno
document.getElementById('form-new-appointment').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const data = Object.fromEntries(form.entries());

  if (!data.contact_id) {
    toast('Elegí un contacto de la lista', 'error');
    return;
  }

  try {
    let tradeInId = null;
    const tieneCanje = data.has_trade_in === 'true';

    if (tieneCanje) {
      const tiModel = document.getElementById('apt-ti-model').value;
      if (tiModel) {
        const ti = await api(`/api/contacts/${data.contact_id}/trade-in`, {
          method: 'POST',
          body: {
            model: tiModel,
            storage_gb: document.getElementById('apt-ti-gb').value || null,
            battery_pct: document.getElementById('apt-ti-battery').value || null,
            condition_notes: document.getElementById('apt-ti-notes').value || null,
            estimated_value_usd: document.getElementById('apt-ti-value').value || null,
          }
        });
        tradeInId = ti?.id || null;
      }
    }

    await api('/api/appointments', {
      method: 'POST',
      body: {
        contact_id: parseInt(data.contact_id),
        conversation_id: data.conversation_id ? parseInt(data.conversation_id) : null,
        scheduled_at: data.scheduled_at,
        product_interested: aptSelectedProducto
          ? `${aptSelectedProducto.model} ${aptSelectedProducto.gb || ''}GB`.trim()
          : null,
        producto_id: aptSelectedProducto?.id || null,
        has_trade_in: tieneCanje,
        trade_in_id: tradeInId,
        sena_paid: data.sena_paid === 'true',
        sena_amount: data.sena_paid === 'true' ? (parseFloat(data.sena_amount) || null) : null,
        notes: data.notes,
      }
    });
    toast('Turno agendado ✓');
    closeModal('modal-new-appointment');
    loadAppointments();
    if (typeof loadCalendario === 'function' && currentView === 'calendario') loadCalendario();
  } catch {}
});

function prefillAppointment(contactId, phone, name = null) {
  openNewAppointment(contactId, name, phone);
}

// ═══════════════════════════════════════════════
// VENTAS
// ═══════════════════════════════════════════════
// Mostrar/ocultar campo de cuotas
document.getElementById('sale-payment-method').addEventListener('change', e => {
  const show = e.target.value === 'tarjeta';
  document.getElementById('sale-cuotas-field').style.display = show ? '' : 'none';
  updateSalePreview();
});

['price_usd','cotizacion','trade_in_value','accessories','cuotas'].forEach(name => {
  const el = document.querySelector(`#form-new-sale [name="${name}"]`);
  if (el) el.addEventListener('input', updateSalePreview);
  if (el) el.addEventListener('change', updateSalePreview);
});

function updateSalePreview() {
  const f = (n) => parseFloat(document.querySelector(`#form-new-sale [name="${n}"]`)?.value || 0) || 0;
  const price = f('price_usd');
  const cotizacion = f('cotizacion');
  const tradeIn = f('trade_in_value');
  const accessories = document.querySelector('#form-new-sale [name="accessories"]')?.value === 'true' ? 30000 : 0;
  const cuotas = parseInt(document.querySelector('#form-new-sale [name="cuotas"]')?.value || 1);
  const method = document.getElementById('sale-payment-method')?.value;

  if (!price) { document.getElementById('sale-total-preview').classList.add('hidden'); return; }

  const saldo = price - tradeIn;
  const factores = { 1: 1.12, 3: 1.35, 6: 1.50 };
  const factor = method === 'tarjeta' ? (factores[cuotas] || 1) : 1;

  let html = `<div class="sale-preview-line"><span>Precio equipo</span><span>$${fmt(price)} USD</span></div>`;
  if (tradeIn > 0) html += `<div class="sale-preview-line"><span>Canje</span><span style="color:var(--green)">-$${fmt(tradeIn)} USD</span></div>`;
  if (tradeIn > 0) html += `<div class="sale-preview-line"><span>Saldo USD</span><span>$${fmt(saldo)} USD</span></div>`;
  if (accessories > 0) html += `<div class="sale-preview-line"><span>Cargador</span><span>$${fmtARS(accessories)}</span></div>`;

  if (cotizacion > 0) {
    const enPesos = saldo * cotizacion;
    const total = enPesos * factor;
    html += `<div class="sale-preview-line"><span>Cotización</span><span>$${fmtARS(cotizacion)}/USD</span></div>`;
    if (method === 'tarjeta' && cuotas > 1) {
      html += `<div class="sale-preview-line"><span>Recargo (${cuotas}c)</span><span>×${factor}</span></div>`;
      html += `<div class="sale-preview-line total"><span>${cuotas} cuotas de</span><span style="color:var(--accent)">$${fmtARS(Math.round(total/cuotas))} c/u</span></div>`;
    } else {
      html += `<div class="sale-preview-line total"><span>Total en pesos</span><span>$${fmtARS(Math.round(total + accessories))}</span></div>`;
    }
  } else {
    html += `<div class="sale-preview-line total"><span>Total USD a pagar</span><span style="color:var(--green)">$${fmt(saldo)} USD</span></div>`;
  }

  const preview = document.getElementById('sale-total-preview');
  preview.innerHTML = html;
  preview.classList.remove('hidden');
}

async function loadSales() {
  const month = document.getElementById('sales-filter-month').value;
  const params = new URLSearchParams();
  if (month) {
    params.set('from', `${month}-01`);
    const d = new Date(month + '-01');
    d.setMonth(d.getMonth() + 1);
    params.set('to', d.toISOString().split('T')[0]);
  }

  const [sales, stats] = await Promise.all([
    api(`/api/sales?${params}`),
    api('/api/sales/stats'),
  ]);
  if (!sales || !stats) return;

  document.getElementById('sales-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Ventas este mes</div>
      <div class="stat-value">${stats.mesActual.ventas}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total USD este mes</div>
      <div class="stat-value" style="color:var(--green)">$${fmt(stats.mesActual.total_usd)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Ticket promedio</div>
      <div class="stat-value">$${fmt(stats.mesActual.promedio_usd)}</div>
    </div>
  `;

  document.getElementById('sales-table-body').innerHTML = sales.length
    ? sales.map(s => `
        <tr>
          <td class="text-muted">${fmtDate(s.sold_at)}</td>
          <td><strong>${s.name || s.phone || '—'}</strong></td>
          <td>${s.product_name}</td>
          <td style="color:var(--green);font-weight:700">$${fmt(s.price_usd)}</td>
          <td>${paymentLabel(s.payment_method)}${s.cuotas > 1 ? ` (${s.cuotas}c)` : ''}</td>
          <td>${s.trade_in_value > 0 ? `$${fmt(s.trade_in_value)} off` : '—'}</td>
          <td><button class="btn btn-ghost btn-sm" onclick='editVenta(${s.id}, ${JSON.stringify(s).replace(/'/g,"&apos;")})'>✎</button></td>
        </tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin ventas</td></tr>`;
}

document.getElementById('sales-filter-month').addEventListener('change', loadSales);

// ── Buscadores del modal de venta ──
let saleSelectedContact = null;
let saleSelectedProducto = null;

document.getElementById('modal-new-sale')?.addEventListener('click', function onceOpen() {
  // no-op, apertura manejada por openModal directamente
}, { once: true });

let saleContactSearchTimer = null;
document.getElementById('sale-contact-search')?.addEventListener('input', e => {
  clearTimeout(saleContactSearchTimer);
  const q = e.target.value.trim();
  const box = document.getElementById('sale-contact-results');
  if (q.length < 2) { box.classList.add('hidden'); return; }

  saleContactSearchTimer = setTimeout(async () => {
    const d = await api(`/api/contacts?search=${encodeURIComponent(q)}&limit=8`);
    if (!d?.contacts?.length) {
      box.innerHTML = '<div class="autocomplete-empty">Sin resultados</div>';
      box.classList.remove('hidden');
      return;
    }
    box.innerHTML = d.contacts.map(c => `
      <div class="autocomplete-item" onclick='selectSaleContact(${c.id}, ${JSON.stringify(c.name||"").replace(/'/g,"&apos;")}, "${c.phone}", ${c.conv_id || 'null'})'>
        <strong>${c.name || '(sin nombre)'}</strong>
        <span style="color:var(--text-muted);font-size:12px">${c.phone}</span>
      </div>`).join('');
    box.classList.remove('hidden');
  }, 250);
});

function selectSaleContact(id, name, phone, convId) {
  saleSelectedContact = { id, name, phone, convId };
  document.getElementById('sale-contact-id').value = id;
  document.getElementById('sale-contact-search').value = '';
  document.getElementById('sale-contact-results').classList.add('hidden');
  const chip = document.getElementById('sale-contact-selected');
  chip.innerHTML = `<span>${name || phone}</span><button type="button" class="chip-remove" onclick="clearSaleContact()">✕</button>`;
  chip.classList.remove('hidden');
}

function clearSaleContact() {
  saleSelectedContact = null;
  document.getElementById('sale-contact-id').value = '';
  document.getElementById('sale-contact-selected').classList.add('hidden');
}

let saleProductoSearchTimer = null;
document.getElementById('sale-producto-search')?.addEventListener('input', e => {
  clearTimeout(saleProductoSearchTimer);
  const q = e.target.value.trim();
  const box = document.getElementById('sale-producto-results');
  if (q.length < 2) { box.classList.add('hidden'); return; }

  saleProductoSearchTimer = setTimeout(async () => {
    const d = await api(`/api/productos?search=${encodeURIComponent(q)}&status=en_stock&limit=8`);
    if (!d?.productos?.length) {
      box.innerHTML = '<div class="autocomplete-empty">Sin resultados en stock</div>';
      box.classList.remove('hidden');
      return;
    }
    box.innerHTML = d.productos.map(p => `
      <div class="autocomplete-item" onclick='selectSaleProducto(${p.id}, ${JSON.stringify(p.model)}, ${p.storage_gb||'null'}, ${JSON.stringify(p.color||"")}, ${p.price||0})'>
        <strong>${p.model} ${p.storage_gb || ''}GB</strong>
        <span style="color:var(--text-muted);font-size:12px">${p.color || ''} · $${fmt(p.price)}</span>
      </div>`).join('');
    box.classList.remove('hidden');
  }, 250);
});

function selectSaleProducto(id, model, gb, color, price) {
  saleSelectedProducto = { id, model, gb, color, price };
  document.getElementById('sale-producto-id').value = id;
  document.getElementById('sale-product-name').value = `${model} ${gb ? gb+'GB' : ''}`.trim();
  document.getElementById('sale-price-usd').value = price;
  document.getElementById('sale-producto-search').value = '';
  document.getElementById('sale-producto-results').classList.add('hidden');
  const chip = document.getElementById('sale-producto-selected');
  chip.innerHTML = `<span>${model} ${gb ? gb+'GB' : ''} ${color||''} · $${fmt(price)}</span><button type="button" class="chip-remove" onclick="clearSaleProducto()">✕</button>`;
  chip.classList.remove('hidden');
  updateSalePreview();
}

function clearSaleProducto() {
  saleSelectedProducto = null;
  document.getElementById('sale-producto-id').value = '';
  document.getElementById('sale-product-name').value = '';
  document.getElementById('sale-producto-selected').classList.add('hidden');
}

document.addEventListener('click', e => {
  if (!e.target.closest('#sale-contact-search') && !e.target.closest('#sale-contact-results'))
    document.getElementById('sale-contact-results')?.classList.add('hidden');
  if (!e.target.closest('#sale-producto-search') && !e.target.closest('#sale-producto-results'))
    document.getElementById('sale-producto-results')?.classList.add('hidden');
});

function resetSaleModal() {
  saleSelectedContact = null;
  saleSelectedProducto = null;
  document.getElementById('sale-contact-id').value = '';
  document.getElementById('sale-producto-id').value = '';
  document.getElementById('sale-product-name').value = '';
  document.getElementById('sale-contact-selected').classList.add('hidden');
  document.getElementById('sale-producto-selected').classList.add('hidden');
  document.getElementById('sale-contact-search').value = '';
  document.getElementById('sale-producto-search').value = '';
}

// Form registrar venta
document.getElementById('form-new-sale').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const data = Object.fromEntries(form.entries());

  if (!data.contact_id) { toast('Elegí un cliente de la lista', 'error'); return; }
  if (!data.producto_id) { toast('Elegí un producto en stock', 'error'); return; }

  try {
    const cotizacion = parseFloat(data.cotizacion) || null;
    const price_usd = parseFloat(data.price_usd);
    const trade_in_value = parseFloat(data.trade_in_value) || 0;
    const accessories = data.accessories === 'true';
    const cuotas = parseInt(data.cuotas) || 1;

    let cuota_amount = null;
    if (data.payment_method === 'tarjeta' && cotizacion) {
      const factores = { 1: 1.12, 3: 1.35, 6: 1.50 };
      const factor = factores[cuotas] || 1;
      cuota_amount = Math.round((price_usd - trade_in_value) * cotizacion * factor / cuotas);
    }

    await api('/api/sales', {
      method: 'POST',
      body: {
        contact_id: parseInt(data.contact_id),
        conversation_id: saleSelectedContact?.convId || null,
        producto_id: parseInt(data.producto_id),
        product_name: data.product_name,
        price_usd,
        cotizacion,
        payment_method: data.payment_method,
        cuotas,
        cuota_amount,
        trade_in_value,
        accessories,
        accessories_amount: accessories ? 30000 : 0,
        total_paid_usd: price_usd - trade_in_value,
        notes: data.notes,
      }
    });
    toast('Venta registrada ✓ — producto marcado como vendido');
    closeModal('modal-new-sale');
    e.target.reset();
    resetSaleModal();
    document.getElementById('sale-total-preview').classList.add('hidden');
    document.getElementById('sale-cuotas-field').style.display = 'none';
    if (currentView === 'sales') loadSales();
    if (currentView === 'pipeline') loadPipeline();
    if (currentView === 'productos') loadProductos();
  } catch {}
});

// ═══════════════════════════════════════════════
// NUEVO LEAD FORM
// ═══════════════════════════════════════════════
document.getElementById('form-new-lead').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const data = Object.fromEntries(form.entries());
  if (data.is_first_iphone === 'true') data.is_first_iphone = true;
  else if (data.is_first_iphone === 'false') data.is_first_iphone = false;
  else data.is_first_iphone = null;

  try {
    const contact = await api('/api/contacts', { method: 'POST', body: data });
    await api('/api/conversations', {
      method: 'POST',
      body: { contact_id: contact.id, product_interest: data.product_interest, agent_notes: data.agent_notes }
    });
    toast('Lead creado ✓');
    closeModal('modal-new-lead');
    e.target.reset();
    if (currentView === 'pipeline') loadPipeline();
    else if (currentView === 'contacts') loadContacts();
  } catch {}
});

// ═══════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// Cerrar con Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
  }
});

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function fmt(n) {
  return Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtARS(n) {
  return Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtDateFull(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function fmtTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
function fmtRelative(d) {
  if (!d) return '—';
  const diff = Date.now() - new Date(d);
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return fmtDate(d);
}
function statusLabel(s) {
  return { pendiente: 'Pendiente', confirmado: 'Confirmado', completado: 'Completado', cancelado: 'Cancelado', no_vino: 'No vino' }[s] || s;
}
function paymentLabel(s) {
  return { efectivo_pesos: 'Efectivo $', efectivo_usd: 'Efectivo USD', transferencia: 'Transferencia', tarjeta: 'Tarjeta', credito_personal: 'Crédito DNI' }[s] || s || '—';
}
function sourceLabel(s) {
  return { whatsapp: 'WhatsApp', instagram: 'Instagram', referido: 'Referido', local: 'Local' }[s] || s || '—';
}

// ═══════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════
// Setear mes actual en filtro de ventas
document.getElementById('sales-filter-month').value = new Date().toISOString().slice(0, 7);

init();

// ═══════════════════════════════════════════════
// REPORTES
// ═══════════════════════════════════════════════
let chartVentas = null;
let chartFunnel = null;
let chartPagos = null;
let currentNoteConvId = null;

document.getElementById('reports-period').addEventListener('change', loadReports);

async function loadReports() {
  const dias = document.getElementById('reports-period').value;
  const [resumen, ventasDiarias, funnel, metodos, modelos] = await Promise.all([
    api('/api/reports/resumen'),
    api(`/api/reports/ventas-diarias?dias=${dias}`),
    api('/api/reports/funnel'),
    api('/api/reports/metodos-pago'),
    api('/api/reports/modelos-top'),
  ]);
  if (!resumen) return;

  // KPIs
  const crec = resumen.crecimiento;
  const crecHtml = crec !== null
    ? `<div class="kpi-sub" style="color:${crec >= 0 ? 'var(--green)' : 'var(--red)'}">${crec >= 0 ? '↑' : '↓'} ${Math.abs(crec)}% vs mes anterior</div>`
    : '';

  document.getElementById('reports-kpis').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Total ventas históricas</div><div class="kpi-value">${resumen.global.total_ventas}</div></div>
    <div class="kpi-card green"><div class="kpi-label">USD total histórico</div><div class="kpi-value">$${fmt(resumen.global.total_usd)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Ticket promedio</div><div class="kpi-value">$${fmt(resumen.global.ticket_promedio)}</div></div>
    <div class="kpi-card ${resumen.crecimiento >= 0 ? 'green' : ''}">
      <div class="kpi-label">Ventas este mes</div>
      <div class="kpi-value">${resumen.mesActual.ventas} | $${fmt(resumen.mesActual.total_usd)}</div>
      ${crecHtml}
    </div>
    <div class="kpi-card accent"><div class="kpi-label">Leads activos</div><div class="kpi-value">${resumen.leads.activos}</div></div>
    <div class="kpi-card"><div class="kpi-label">Tasa conversión</div><div class="kpi-value">${resumen.convRate}%</div><div class="kpi-sub">${resumen.leads.ganados} ganados / ${resumen.leads.total} totales</div></div>
  `;

  // Chart ventas diarias
  if (chartVentas) chartVentas.destroy();
  chartVentas = new Chart(document.getElementById('chart-ventas'), {
    type: 'line',
    data: {
      labels: ventasDiarias.map(d => {
        const [y, m, day] = d.fecha.split('-');
        return `${day}/${m}`;
      }),
      datasets: [{
        label: 'USD vendidos',
        data: ventasDiarias.map(d => d.total_usd),
        borderColor: '#6366f1',
        backgroundColor: '#6366f115',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
      }, {
        label: 'Cantidad',
        data: ventasDiarias.map(d => d.cantidad),
        borderColor: '#10b981',
        backgroundColor: 'transparent',
        tension: 0.4,
        pointRadius: 3,
        yAxisID: 'y2',
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#e8e8f0', font: { size: 12 } } } },
      scales: {
        x: { ticks: { color: '#7878a0', maxTicksLimit: 15 }, grid: { color: '#2a2a34' } },
        y: { ticks: { color: '#7878a0', callback: v => '$' + fmt(v) }, grid: { color: '#2a2a34' } },
        y2: { position: 'right', ticks: { color: '#10b981' }, grid: { display: false } },
      }
    }
  });

  // Chart funnel
  if (chartFunnel) chartFunnel.destroy();
  const funnelData = funnel.filter(s => s.name !== 'perdido');
  chartFunnel = new Chart(document.getElementById('chart-funnel'), {
    type: 'bar',
    data: {
      labels: funnelData.map(s => s.label),
      datasets: [{ data: funnelData.map(s => s.total), backgroundColor: funnelData.map(s => s.color + '99'), borderColor: funnelData.map(s => s.color), borderWidth: 1 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#7878a0', font: { size: 11 } }, grid: { color: '#2a2a34' } },
        y: { ticks: { color: '#7878a0' }, grid: { color: '#2a2a34' } },
      }
    }
  });

  // Chart métodos de pago
  if (chartPagos) chartPagos.destroy();
  const pagoColors = { efectivo_pesos: '#10b981', efectivo_usd: '#3b82f6', transferencia: '#f59e0b', tarjeta: '#6366f1', credito_personal: '#8b5cf6' };
  chartPagos = new Chart(document.getElementById('chart-pagos'), {
    type: 'doughnut',
    data: {
      labels: metodos.map(m => paymentLabel(m.payment_method)),
      datasets: [{ data: metodos.map(m => m.count), backgroundColor: metodos.map(m => pagoColors[m.payment_method] || '#6b7280'), borderWidth: 0 }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#e8e8f0', font: { size: 12 }, padding: 12 } }
      }
    }
  });

  // Modelos top
  document.getElementById('modelos-top-list').innerHTML = modelos.length
    ? modelos.map((m, i) => {
        const maxCount = modelos[0].count;
        const pct = Math.round(m.count / maxCount * 100);
        return `
        <div style="margin-bottom:.75rem">
          <div style="display:flex;justify-content:space-between;margin-bottom:.25rem;font-size:13px">
            <span>${i+1}. ${m.product_name}</span>
            <span style="color:var(--text-muted)">${m.count} ventas · $${fmt(m.precio_promedio)} prom.</span>
          </div>
          <div style="background:var(--bg3);border-radius:4px;height:6px">
            <div style="background:var(--accent);border-radius:4px;height:6px;width:${pct}%;transition:width .5s"></div>
          </div>
        </div>`;
      }).join('')
    : '<p class="text-muted">Sin ventas registradas</p>';
}

function exportCSV(type) {
  window.open(`/api/reports/export/${type}`, '_blank');
}

// ═══════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════
async function loadSettings() {
  // Mostrar panel de usuarios solo para admins
  try {
    const me = await api('/api/auth/me');
    if (me?.user?.role === 'admin') {
      document.getElementById('settings-admin-btn').innerHTML = '';
      loadUsers();
    } else {
      document.getElementById('users-panel').style.display = 'none';
    }
  } catch {}
}

async function loadUsers() {
  const users = await api('/api/settings/users');
  if (!users) return;
  document.getElementById('users-list').innerHTML = users.map(u => `
    <div style="display:flex;align-items:center;gap:.75rem;padding:.6rem 0;border-bottom:1px solid var(--border)">
      <div class="user-avatar" style="width:32px;height:32px;font-size:13px">${u.name[0].toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-weight:500;font-size:13px">${u.name}</div>
        <div style="font-size:12px;color:var(--text-muted)">${u.email}</div>
      </div>
      <span class="badge" style="background:${u.role==='admin'?'#6366f120':'#78789020'};color:${u.role==='admin'?'var(--accent)':'var(--text-muted)'}">${u.role}</span>
      <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id},'${u.name}')">✕</button>
    </div>
  `).join('') || '<p class="text-muted">Sin usuarios</p>';
}

async function deleteUser(id, name) {
  if (!confirm(`¿Eliminar a ${name}?`)) return;
  try {
    await api(`/api/settings/users/${id}`, { method: 'DELETE' });
    toast('Usuario eliminado');
    loadUsers();
  } catch {}
}

document.getElementById('form-new-user').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const data = Object.fromEntries(form.entries());
  try {
    await api('/api/settings/users', { method: 'POST', body: data });
    toast('Usuario creado ✓');
    closeModal('modal-new-user');
    e.target.reset();
    loadUsers();
  } catch {}
});

document.getElementById('form-change-password').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const data = Object.fromEntries(form.entries());
  if (data.newPassword !== data.confirm) {
    toast('Las contraseñas no coinciden', 'error');
    return;
  }
  try {
    await api('/api/settings/password', { method: 'PATCH', body: { current: data.current, newPassword: data.newPassword } });
    toast('Contraseña cambiada ✓');
    e.target.reset();
  } catch {}
});

// ═══════════════════════════════════════════════
// NOTAS EN CONVERSACIONES
// ═══════════════════════════════════════════════
function openNoteModal(convId) {
  currentNoteConvId = convId;
  document.getElementById('note-text').value = '';
  openModal('modal-add-note');
}

async function submitNote() {
  const note = document.getElementById('note-text').value.trim();
  if (!note || !currentNoteConvId) return;
  try {
    await api('/api/settings/notes', { method: 'POST', body: { conversation_id: currentNoteConvId, note } });
    toast('Nota guardada ✓');
    closeModal('modal-add-note');
    currentNoteConvId = null;
  } catch {}
}

// Extender loadView para nuevas vistas
const _originalLoadView = loadView;
// Patch de loadView para incluir reports y settings
const viewLoaders = {
  dashboard: loadDashboard,
  pipeline: loadPipeline,
  contacts: loadContacts,
  appointments: loadAppointments,
  sales: loadSales,
  reports: loadReports,
  settings: loadSettings,
};

// Sobreescribir loadView para manejar las nuevas vistas
window.loadView = function(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
  const el = document.getElementById(`view-${view}`);
  if (el) { el.classList.remove('hidden'); el.classList.add('active'); }
  viewLoaders[view]?.();
};

// Re-hook nav
document.querySelectorAll('.nav-item').forEach(item => {
  item.onclick = (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    window.loadView(item.dataset.view);
  };
});

// ═══════════════════════════════════════════════
// PRODUCTOS
// ═══════════════════════════════════════════════
let prodSearch = '', prodStatus = '';

document.getElementById('prod-search')?.addEventListener('input', e => { prodSearch = e.target.value; loadProductos(); });
document.getElementById('prod-filter-status')?.addEventListener('change', e => { prodStatus = e.target.value; loadProductos(); });

async function loadProductos() {
  const params = new URLSearchParams();
  if (prodSearch) params.set('search', prodSearch);
  if (prodStatus) params.set('status', prodStatus);

  const [data, stats] = await Promise.all([
    api(`/api/productos?${params}`),
    api('/api/productos/stats'),
  ]);
  if (!data) return;

  document.getElementById('productos-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">En stock</div><div class="stat-value">${stats.en_stock || 0}</div></div>
    <div class="stat-card"><div class="stat-label">Señados</div><div class="stat-value" style="color:var(--yellow)">${stats.senados || 0}</div></div>
    <div class="stat-card"><div class="stat-label">Vendidos este mes</div><div class="stat-value" style="color:var(--green)">${stats.vendidos_mes || 0}</div></div>
  `;

  document.getElementById('productos-table-body').innerHTML = data.productos.length
    ? data.productos.map(p => `
        <tr onclick="openProducto(${p.id})">
          <td><strong>${p.model}</strong></td>
          <td>${p.storage_gb || '—'}GB</td>
          <td>${p.color || '—'}</td>
          <td>${p.battery_pct ? p.battery_pct + '%' : '—'} ${p.battery_type === 'reemplazada' ? '<span class="badge" style="background:#f59e0b20;color:var(--yellow)" title="Batería cambiada por nosotros">Camb.</span>' : ''}</td>
          <td><span class="status-badge status-${p.status === 'en_stock' ? 'confirmado' : p.status === 'señado' ? 'pendiente' : 'completado'}">${prodStatusLabel(p.status)}</span></td>
          <td>$${fmt(p.price)}</td>
          <td class="text-muted">$${fmt(p.cost)}</td>
          <td style="color:var(--green);font-weight:600">$${fmt(p.profit)}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openProducto(${p.id})">Ver</button>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editProducto(${p.id})">✎</button>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin productos</td></tr>`;
}

function prodStatusLabel(s) {
  return { en_stock: 'En stock', 'señado': 'Señado', vendido: 'Vendido' }[s] || s;
}

function batteryTypeLabel(t) {
  return { original: 'Original', reemplazada: 'Cambiada' }[t] || t;
}

async function openProducto(id) {
  const data = await api(`/api/productos/${id}`);
  if (!data) return;
  const p = data.producto;
  document.getElementById('modal-contact-title').textContent = `${p.model} ${p.storage_gb || ''}GB`;
  document.getElementById('modal-contact-wa').style.display = 'none';
  document.getElementById('modal-contact-body').innerHTML = `
    <div class="contact-detail">
      <div class="contact-meta-grid">
        <div class="contact-meta-item"><label>Color</label><span>${p.color || '—'}</span></div>
        <div class="contact-meta-item"><label>Batería</label><span>${p.battery_pct || '—'}% ${p.battery_type ? `(${batteryTypeLabel(p.battery_type)})` : ''}</span></div>
        <div class="contact-meta-item"><label>IMEI</label><span>${p.imei || '—'}</span></div>
        <div class="contact-meta-item"><label>Serie</label><span>${p.serial_number || '—'}</span></div>
        <div class="contact-meta-item"><label>Face ID</label><span>${p.has_face_id ? 'Funciona' : 'No funciona'}</span></div>
        <div class="contact-meta-item"><label>True Tone</label><span>${p.has_true_tone ? 'Sí' : 'No'}</span></div>
        <div class="contact-meta-item"><label>Precio</label><span style="color:var(--green);font-weight:700">$${fmt(p.price)} USD</span></div>
        <div class="contact-meta-item"><label>Costo</label><span>$${fmt(p.cost)} USD</span></div>
        <div class="contact-meta-item"><label>Ganancia</label><span style="color:var(--green)">$${fmt(p.profit)} USD</span></div>
        <div class="contact-meta-item"><label>Garantía</label><span>${p.warranty_months} meses</span></div>
      </div>
      ${p.condition_notes ? `<div class="contact-section"><div class="contact-section-title">Notas de estado</div><p style="font-size:13px">${p.condition_notes}</p></div>` : ''}
      ${p.general_notes ? `<div class="contact-section"><div class="contact-section-title">Notas generales</div><p style="font-size:13px">${p.general_notes}</p></div>` : ''}
      <div class="contact-section">
        <div class="contact-section-title">Historial (${data.historial.length})</div>
        ${data.historial.map(h => `
          <div class="timeline-item">
            <div class="timeline-content">
              <strong style="font-size:13px">${h.action}</strong>
              <p style="font-size:12px;color:var(--text-muted)">${h.detail || ''}</p>
            </div>
            <span class="timeline-date">${fmtDateFull(h.created_at)}</span>
          </div>`).join('') || '<p class="text-muted">Sin historial</p>'}
      </div>
    </div>`;
  openModal('modal-contact');
}

// Autocompletar garantía según tipo de batería (el usuario puede modificarla después)
document.getElementById('new-prod-battery-type')?.addEventListener('change', e => {
  const warrantyField = document.getElementById('new-prod-warranty');
  warrantyField.value = e.target.value === 'reemplazada' ? 12 : 3;
});

document.getElementById('form-new-producto')?.addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  d.has_face_id = d.has_face_id === 'true';
  d.has_true_tone = d.has_true_tone === 'true';
  d.has_original_box = d.has_original_box === 'true';
  try {
    await api('/api/productos', { method: 'POST', body: d });
    toast('Producto creado ✓');
    closeModal('modal-new-producto');
    e.target.reset();
    document.getElementById('new-prod-warranty').value = 3;
    loadProductos();
  } catch {}
});

// ═══════════════════════════════════════════════
// CLIENTES
// ═══════════════════════════════════════════════
let cliSearch = '';
document.getElementById('cli-search')?.addEventListener('input', e => { cliSearch = e.target.value; loadClientes(); });

async function loadClientes() {
  const params = new URLSearchParams();
  if (cliSearch) params.set('search', cliSearch);

  const [data, stats] = await Promise.all([
    api(`/api/clients?${params}`),
    api('/api/clients/stats'),
  ]);
  if (!data) return;

  document.getElementById('clientes-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Total clientes</div><div class="stat-value">${stats.total || 0}</div></div>
    <div class="stat-card"><div class="stat-label">Nuevos este mes</div><div class="stat-value" style="color:var(--accent)">${stats.nuevos_mes || 0}</div></div>
    <div class="stat-card"><div class="stat-label">Cumpleaños próximos</div><div class="stat-value" style="color:var(--yellow)">${stats.cumples_proximos || 0}</div></div>
  `;

  document.getElementById('clientes-table-body').innerHTML = data.clients.length
    ? data.clients.map(c => `
        <tr onclick="openCliente(${c.id})">
          <td>
            <strong>${c.name || ''} ${c.last_name || ''}</strong>
            ${c.ai_enabled === true ? '<span class="badge-mini" title="IA activa">🤖</span>' : ''}
            ${c.followups_enabled === true ? '<span class="badge-mini" title="Seguimientos activos">🔔</span>' : ''}
          </td>
          <td>${c.dni || '—'}</td>
          <td>${c.phone || '—'}</td>
          <td>${c.city || '—'}</td>
          <td>${c.total_compras || 0}</td>
          <td style="color:var(--green);font-weight:600">$${fmt(c.total_facturado)}</td>
          <td class="text-muted">${c.birthday ? new Date(c.birthday).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}) : '—'}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openCliente(${c.id})">Ver</button>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editCliente(${c.id})">✎</button>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin clientes</td></tr>`;
}

async function openCliente(id) {
  const data = await api(`/api/clients/${id}`);
  if (!data) return;
  const c = data.client;
  document.getElementById('modal-contact-title').textContent = `${c.name || ''} ${c.last_name || ''}`;
  const waBtn = document.getElementById('modal-contact-wa');
  if (c.phone) {
    waBtn.style.display = '';
    waBtn.onclick = () => window.open(`https://wa.me/${c.phone.replace(/\D/g,'')}`, '_blank');
  } else { waBtn.style.display = 'none'; }
  document.getElementById('modal-contact-body').innerHTML = `
    <div class="contact-detail">
      ${renderToggles('cliente', c.id, c.ai_enabled === true, c.followups_enabled === true, c.ai_disabled_reason)}
      <div style="display:flex;gap:.5rem;margin-bottom:.75rem">
        <button class="btn btn-ghost btn-sm" onclick="closeModal('modal-contact');editCliente(${c.id})">✎ Editar</button>
      </div>
      <div class="contact-meta-grid">
        <div class="contact-meta-item"><label>DNI</label><span>${c.dni || '—'}</span></div>
        <div class="contact-meta-item"><label>Teléfono</label><span>${c.phone || '—'}</span></div>
        <div class="contact-meta-item"><label>Email</label><span>${c.email || '—'}</span></div>
        <div class="contact-meta-item"><label>Instagram</label><span>${c.instagram || '—'}</span></div>
        <div class="contact-meta-item"><label>Dirección</label><span>${c.address || '—'}</span></div>
        <div class="contact-meta-item"><label>Localidad</label><span>${c.city || '—'}</span></div>
        <div class="contact-meta-item"><label>Cumpleaños</label><span>${c.birthday ? new Date(c.birthday).toLocaleDateString('es-AR') : '—'}</span></div>
        <div class="contact-meta-item"><label>Cliente desde</label><span>${fmtDate(c.created_at)}</span></div>
      </div>
      ${data.compras.length ? `
      <div class="contact-section">
        <div class="contact-section-title">Compras (${data.compras.length})</div>
        ${data.compras.map(p => `
          <div class="timeline-item">
            <div class="timeline-content"><strong>${p.model} ${p.storage_gb || ''}GB</strong>
            <p style="font-size:12px;color:var(--text-muted)">${p.color || ''}</p></div>
            <div style="text-align:right"><div style="color:var(--green);font-weight:700">$${fmt(p.price)}</div>
            <div class="timeline-date">${fmtDate(p.sold_at)}</div></div>
          </div>`).join('')}
      </div>` : ''}
      ${data.turnos && data.turnos.length ? `
      <div class="contact-section">
        <div class="contact-section-title">Turnos (${data.turnos.length})</div>
        ${data.turnos.map(a => `
          <div class="timeline-item">
            <div class="timeline-content">
              <strong>${fmtDateFull(a.scheduled_at)}</strong>
              <span class="status-badge status-${a.status}" style="margin-left:.5rem">${statusLabel(a.status)}</span>
              ${a.producto_model ? `<p style="font-size:12px;color:var(--text-muted);margin-top:2px">${a.producto_model} ${a.producto_gb||''}GB</p>` : ''}
            </div>
            ${a["seña_paid"] ? '<span class="badge badge-seña">Seña ✓</span>' : ''}
          </div>`).join('')}
      </div>` : ''}
      ${data.cobros.length ? `
      <div class="contact-section">
        <div class="contact-section-title">Cobros (${data.cobros.length})</div>
        ${data.cobros.map(x => `
          <div class="timeline-item">
            <div class="timeline-content"><strong>${x.receipt_num || ''} — ${cobroTypeLabel(x.type)}</strong>
            <p style="font-size:12px;color:var(--text-muted)">${x.producto_model || ''}</p></div>
            <div style="text-align:right"><div style="font-weight:700">$${fmt(x.total_amount)}</div>
            <div class="timeline-date">${fmtDate(x.created_at)}</div></div>
          </div>`).join('')}
      </div>` : ''}
      ${c.notes ? `<div class="contact-section"><div class="contact-section-title">Notas</div><p style="font-size:13px">${c.notes}</p></div>` : ''}
    </div>`;
  openModal('modal-contact');
}

document.getElementById('form-new-cliente')?.addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  try {
    await api('/api/clients', { method: 'POST', body: d });
    toast('Cliente creado ✓');
    closeModal('modal-new-cliente');
    e.target.reset();
    loadClientes();
  } catch {}
});

// ═══════════════════════════════════════════════
// COBROS
// ═══════════════════════════════════════════════
let cobroSearch = '', cobroType = '';
document.getElementById('cobros-search')?.addEventListener('input', e => { cobroSearch = e.target.value; loadCobros(); });
document.getElementById('cobros-filter-type')?.addEventListener('change', e => { cobroType = e.target.value; loadCobros(); });

async function loadCobros() {
  const params = new URLSearchParams();
  if (cobroSearch) params.set('search', cobroSearch);
  if (cobroType) params.set('type', cobroType);

  const [data, stats] = await Promise.all([
    api(`/api/cobros?${params}`),
    api('/api/cobros/stats'),
  ]);
  if (!data) return;

  document.getElementById('cobros-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Cobros del mes</div><div class="stat-value">${stats.cobros_mes || 0}</div></div>
    <div class="stat-card"><div class="stat-label">Facturado mes</div><div class="stat-value" style="color:var(--green)">$${fmtARS(stats.facturado_mes)}</div></div>
    <div class="stat-card"><div class="stat-label">Cobrado hoy</div><div class="stat-value">$${fmtARS(stats.cobrado_hoy)}</div></div>
  `;

  document.getElementById('cobros-table-body').innerHTML = data.cobros.length
    ? data.cobros.map(c => `
        <tr>
          <td><strong>${c.receipt_num || '—'}</strong></td>
          <td class="text-muted">${fmtDate(c.created_at)}</td>
          <td>${c.client_name || ''} ${c.client_last_name || ''}</td>
          <td>${c.producto_model || '—'}</td>
          <td><span class="status-badge status-${c.type === 'seña' ? 'pendiente' : 'completado'}">${cobroTypeLabel(c.type)}</span></td>
          <td style="font-weight:700">$${fmtARS(c.total_amount)}</td>
          <td class="text-muted">${(c.payments || []).map(p => paymentLabel(p.method)).join(', ') || '—'}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-ghost btn-sm" onclick="printRecibo(${c.id})">🖨</button>
            <button class="btn btn-ghost btn-sm" onclick='editCobro(${c.id}, ${JSON.stringify({total_amount:c.total_amount,type:c.type,notes:c.notes})})'>✎</button>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin cobros</td></tr>`;
}

function cobroTypeLabel(t) {
  return { 'seña': 'Seña', cobro_total: 'Cobro total', cobro_parcial: 'Parcial' }[t] || t;
}

// Medios de pago dinámicos
let paymentRowCount = 0;
function addPaymentRow() {
  const id = paymentRowCount++;
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:.4rem;margin-bottom:.4rem';
  div.innerHTML = `
    <select class="pay-method" style="flex:1">
      <option value="efectivo_pesos">Efectivo pesos</option>
      <option value="efectivo_usd">Efectivo USD</option>
      <option value="transferencia">Transferencia</option>
      <option value="tarjeta">Tarjeta</option>
      <option value="credito_personal">Crédito DNI</option>
    </select>
    <input type="number" class="pay-amount" placeholder="Monto" step="0.01" style="width:120px" />
    <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>
  `;
  document.getElementById('cobro-payments-list').appendChild(div);
}

document.getElementById('form-new-cobro')?.addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  const payments = [...document.querySelectorAll('#cobro-payments-list > div')].map(row => ({
    method: row.querySelector('.pay-method').value,
    amount: parseFloat(row.querySelector('.pay-amount').value) || 0,
  })).filter(p => p.amount > 0);

  try {
    await api('/api/cobros', { method: 'POST', body: { ...d, payments } });
    toast('Cobro registrado ✓');
    closeModal('modal-new-cobro');
    e.target.reset();
    document.getElementById('cobro-payments-list').innerHTML = '';
    loadCobros();
  } catch {}
});

async function printRecibo(id) {
  const c = await api(`/api/cobros/${id}`);
  if (!c) return;
  const w = window.open('', '_blank');
  const payments = (c.payments || []).map(p => `${paymentLabel(p.method)}: $${fmtARS(p.amount)}`).join(' · ');
  w.document.write(`
    <html><head><title>Recibo ${c.receipt_num}</title>
    <style>
      @page { size: A4 landscape; margin: 0; }
      body { font-family: system-ui,sans-serif; margin:0; display:flex; height:100vh; }
      .cliente { width:80%; padding:2rem; border-right:2px dashed #ccc; }
      .interno { width:20%; padding:1rem; font-size:11px; }
      h1 { font-size:1.5rem; margin:0 0 .5rem; }
      .row { display:flex; justify-content:space-between; padding:.4rem 0; border-bottom:1px solid #eee; }
      .total { font-size:1.4rem; font-weight:700; margin-top:1rem; }
    </style></head><body>
    <div class="cliente">
      <h1>Altech Store</h1>
      <p style="color:#666;margin:0 0 1.5rem">Estomba 546 entrepiso B, Bahía Blanca</p>
      <h2>Recibo ${c.receipt_num}</h2>
      <div class="row"><span>Fecha</span><strong>${new Date(c.created_at).toLocaleString('es-AR')}</strong></div>
      <div class="row"><span>Cliente</span><strong>${c.client_name || ''} ${c.client_last_name || ''}</strong></div>
      ${c.client_dni ? `<div class="row"><span>DNI</span><strong>${c.client_dni}</strong></div>` : ''}
      ${c.producto_model ? `<div class="row"><span>Producto</span><strong>${c.producto_model} ${c.storage_gb||''}GB ${c.color||''}</strong></div>` : ''}
      ${c.imei ? `<div class="row"><span>IMEI</span><strong>${c.imei}</strong></div>` : ''}
      <div class="row"><span>Concepto</span><strong>${cobroTypeLabel(c.type)}</strong></div>
      <div class="row"><span>Medios de pago</span><strong>${payments}</strong></div>
      <div class="total">TOTAL: $${fmtARS(c.total_amount)}</div>
      ${c.notes ? `<p style="margin-top:1.5rem;color:#666">${c.notes}</p>` : ''}
      <p style="margin-top:3rem;border-top:1px solid #333;padding-top:.5rem;width:200px">Firma</p>
    </div>
    <div class="interno">
      <strong>CONTROL INTERNO</strong>
      <p>${c.receipt_num}</p>
      <p>${new Date(c.created_at).toLocaleDateString('es-AR')}</p>
      <p>${c.client_name || ''}</p>
      <p><strong>$${fmtARS(c.total_amount)}</strong></p>
      <p>${cobroTypeLabel(c.type)}</p>
      <p>Vendedor: ${c.seller_name || '—'}</p>
    </div>
    </body></html>
  `);
  w.document.close();
  setTimeout(() => { w.print(); }, 300);
}

// ═══════════════════════════════════════════════
// CAJA
// ═══════════════════════════════════════════════
document.getElementById('caja-filter')?.addEventListener('change', loadCaja);

async function loadCaja() {
  const filter = document.getElementById('caja-filter')?.value || '';
  const params = new URLSearchParams();
  if (filter) params.set('estado', filter);

  const [entries, resumen] = await Promise.all([
    api(`/api/caja?${params}`),
    api('/api/caja/resumen'),
  ]);
  if (!entries || !resumen) return;

  document.getElementById('caja-resumen').innerHTML = `
    <div class="kpi-card accent"><div class="kpi-label">Capital pendiente</div><div class="kpi-value">$${fmt(resumen.capital_pendiente)}</div><div class="kpi-sub">Por reintegrar</div></div>
    <div class="kpi-card green"><div class="kpi-label">Ganancia pendiente</div><div class="kpi-value">$${fmt(resumen.ganancia_pendiente)}</div><div class="kpi-sub">Por retirar</div></div>
    <div class="kpi-card"><div class="kpi-label">Ganancia retirada</div><div class="kpi-value">$${fmt(resumen.ganancia_retirada)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Capital en stock</div><div class="kpi-value">$${fmt(resumen.capital_en_stock)}</div><div class="kpi-sub">Invertido sin vender</div></div>
    <div class="kpi-card green"><div class="kpi-label">Facturación mes</div><div class="kpi-value">$${fmt(resumen.facturacion_mes)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Rentabilidad</div><div class="kpi-value">${resumen.rentabilidad}%</div><div class="kpi-sub">${resumen.operaciones_cerradas}/${resumen.operaciones} cerradas</div></div>
  `;

  document.getElementById('caja-table-body').innerHTML = entries.length
    ? entries.map(e => `
        <tr style="${e.capital_reintegrado && e.ganancia_retirada ? 'opacity:.5' : ''}">
          <td class="text-muted">${fmtDate(e.created_at)}</td>
          <td>${e.producto_model || '—'} ${e.storage_gb ? e.storage_gb + 'GB' : ''}</td>
          <td>${e.client_name || ''} ${e.client_last_name || ''}</td>
          <td>$${fmt(e.price)}</td>
          <td class="text-muted">$${fmt(e.cost)}</td>
          <td style="color:var(--green);font-weight:600">$${fmt(e.profit)}</td>
          <td><input type="checkbox" ${e.capital_reintegrado ? 'checked' : ''} onchange="toggleCaja(${e.id},'capital',this.checked)" style="width:auto;cursor:pointer" /></td>
          <td><input type="checkbox" ${e.ganancia_retirada ? 'checked' : ''} onchange="toggleCaja(${e.id},'ganancia',this.checked)" style="width:auto;cursor:pointer" /></td>
        </tr>`).join('')
    : `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin operaciones</td></tr>`;
}

async function toggleCaja(id, tipo, value) {
  try {
    await api(`/api/caja/${id}/${tipo}`, { method: 'PATCH', body: { value } });
    toast(tipo === 'capital' ? 'Capital actualizado ✓' : 'Ganancia actualizada ✓');
    loadCaja();
  } catch {}
}

// ═══════════════════════════════════════════════
// TAREAS
// ═══════════════════════════════════════════════
async function loadTareas() {
  const kanban = await api('/api/tareas/kanban');
  if (!kanban) return;

  document.getElementById('tareas-kanban').innerHTML = kanban.map(col => `
    <div class="kanban-col">
      <div class="kanban-col-header">
        <div class="kanban-col-title"><span class="stage-dot" style="background:${col.color}"></span>${col.label}</div>
        <span class="kanban-count">${col.tasks.length}</span>
      </div>
      <div class="kanban-cards">
        ${col.tasks.length ? col.tasks.map(t => {
          const vencida = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completada';
          return `
          <div class="kanban-card" style="${vencida ? 'border-color:#ef444450' : ''}">
            <div class="kanban-card-name">${t.title}</div>
            ${t.description ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${t.description.slice(0,60)}</div>` : ''}
            <div class="kanban-card-footer">
              <span class="kanban-card-date" style="${vencida ? 'color:var(--red)' : ''}">${t.due_date ? fmtDate(t.due_date) : '—'}</span>
              <div style="display:flex;gap:.25rem">
                ${t.priority === 'alta' ? '<span class="badge" style="background:#ef444420;color:var(--red)">Alta</span>' : ''}
                ${t.status !== 'completada' ? `<button class="btn btn-xs btn-green" onclick="moveTarea(${t.id},'${t.status === 'pendiente' ? 'en_progreso' : 'completada'}')">→</button>` : ''}
                <button class="btn btn-xs btn-ghost" onclick='editTarea(${t.id}, ${JSON.stringify(t).replace(/'/g,"&apos;")})'>✎</button>
              </div>
            </div>
          </div>`;
        }).join('') : '<div class="kanban-empty">Sin tareas</div>'}
      </div>
    </div>`).join('');
}

async function moveTarea(id, status) {
  await api(`/api/tareas/${id}`, { method: 'PATCH', body: { status } });
  toast('Tarea actualizada ✓');
  loadTareas();
}

async function generarTareasAuto() {
  try {
    const r = await api('/api/tareas/generar-automaticas', { method: 'POST' });
    toast(`${r.creadas} tareas automáticas creadas ✓`);
    loadTareas();
  } catch {}
}

document.getElementById('form-new-tarea')?.addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  try {
    await api('/api/tareas', { method: 'POST', body: d });
    toast('Tarea creada ✓');
    closeModal('modal-new-tarea');
    e.target.reset();
    loadTareas();
  } catch {}
});

// ═══════════════════════════════════════════════
// AUTOMATIZACIONES
// ═══════════════════════════════════════════════
async function loadAutomatizaciones() {
  const autos = await api('/api/automatizaciones');
  if (!autos) return;

  document.getElementById('automatizaciones-list').innerHTML = autos.length
    ? autos.map(a => `
        <div class="appointment-card">
          <div class="apt-info">
            <div class="apt-name">${a.name}</div>
            <div class="apt-product">${autoTypeLabel(a.type)} ${a.days_offset !== 0 ? `· ${a.days_offset > 0 ? '+' : ''}${a.days_offset} días` : ''}</div>
            ${a.message ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">${a.message.slice(0,80)}</div>` : ''}
          </div>
          <div class="apt-actions">
            <select onchange="updateAutoStatus(${a.id}, this.value)" style="width:130px;font-size:12px">
              <option value="activa" ${a.status === 'activa' ? 'selected' : ''}>Activa</option>
              <option value="desactivada" ${a.status === 'desactivada' ? 'selected' : ''}>Desactivada</option>
              <option value="revision" ${a.status === 'revision' ? 'selected' : ''}>En revisión</option>
            </select>
            <button class="btn btn-ghost btn-sm" onclick='editAutomatizacion(${a.id}, ${JSON.stringify(a).replace(/'/g,"&apos;")})'>Editar</button>
          </div>
        </div>`).join('')
    : '<div class="card" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin automatizaciones</div>';
}

function autoTypeLabel(t) {
  return {
    'cumpleaños': 'Cumpleaños', aniversario: 'Aniversario', vencimiento: 'Vencimiento cuota',
    seguimiento_3m: 'Seguimiento 3 meses', seguimiento_6m: 'Seguimiento 6 meses',
    seguimiento_anual: 'Seguimiento anual', post_venta: 'Post venta',
  }[t] || t;
}

async function updateAutoStatus(id, status) {
  await api(`/api/automatizaciones/${id}`, { method: 'PATCH', body: { status } });
  toast('Automatización actualizada ✓');
}

async function deleteAuto(id) {
  if (!confirm('¿Eliminar esta automatización?')) return;
  await api(`/api/automatizaciones/${id}`, { method: 'DELETE' });
  toast('Eliminada');
  loadAutomatizaciones();
}

document.getElementById('form-new-automatizacion')?.addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  try {
    await api('/api/automatizaciones', { method: 'POST', body: d });
    toast('Automatización creada ✓');
    closeModal('modal-new-automatizacion');
    e.target.reset();
    loadAutomatizaciones();
  } catch {}
});

// ═══════════════════════════════════════════════
// ROUTER FINAL — todas las vistas
// ═══════════════════════════════════════════════
const allViewLoaders = {
  dashboard: loadDashboard,
  pipeline: loadPipeline,
  contacts: loadContacts,
  appointments: loadAppointments,
  sales: loadSales,
  reports: loadReports,
  settings: loadSettings,
  productos: loadProductos,
  clientes: loadClientes,
  cobros: loadCobros,
  caja: loadCaja,
  calendario: loadCalendario,
  tareas: loadTareas,
  proveedores: loadProveedores,
  cotizaciones: loadCotizaciones,
  automatizaciones: loadAutomatizaciones,
};

window.loadView = function(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
  const el = document.getElementById(`view-${view}`);
  if (el) { el.classList.remove('hidden'); el.classList.add('active'); }
  allViewLoaders[view]?.();
};

document.querySelectorAll('.nav-item').forEach(item => {
  item.onclick = (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    window.loadView(item.dataset.view);
  };
});

// Precargar selects del modal de cobro
document.getElementById('modal-new-cobro')?.addEventListener('click', async function once() {
  const [clients, productos] = await Promise.all([
    api('/api/clients?limit=200'),
    api('/api/productos?status=en_stock&limit=200'),
  ]);
  const cSel = document.getElementById('cobro-client-select');
  const pSel = document.getElementById('cobro-producto-select');
  if (cSel && clients) cSel.innerHTML = '<option value="">Seleccionar...</option>' +
    clients.clients.map(c => `<option value="${c.id}">${c.name} ${c.last_name || ''} — ${c.phone || ''}</option>`).join('');
  if (pSel && productos) pSel.innerHTML = '<option value="">Sin producto</option>' +
    productos.productos.map(p => `<option value="${p.id}">${p.model} ${p.storage_gb || ''}GB ${p.color || ''} — $${p.price}</option>`).join('');
  this.removeEventListener('click', once);
}, { once: true });


// ═══════════════════════════════════════════════
// CONVERSIÓN LEAD → CLIENTE
// ═══════════════════════════════════════════════
async function convertirACliente(contactId) {
  try {
    const r = await api(`/api/clients/from-contact/${contactId}`, { method: 'POST' });
    if (r.already_exists) {
      toast('Este contacto ya es cliente');
    } else {
      toast('Cliente creado ✓ — IA y seguimientos desactivados automáticamente');
    }
    closeModal('modal-contact');
    window.loadView('clientes');
    document.querySelectorAll('.nav-item').forEach(i => {
      i.classList.toggle('active', i.dataset.view === 'clientes');
    });
  } catch {}
}

// ═══════════════════════════════════════════════
// PERMISOS (UI de configuración)
// ═══════════════════════════════════════════════
const SECTION_LABELS = {
  dashboard: 'Dashboard', leads: 'Leads', calendario: 'Calendario',
  productos: 'Productos', clientes: 'Clientes', cobros: 'Cobros',
  caja: 'Caja', proveedores: 'Proveedores', tareas: 'Tareas',
  cotizaciones: 'Cotizaciones', automatizaciones: 'Automatizaciones',
  reportes: 'Reportes', configuracion: 'Configuración',
};

async function openPermisos(userId, userName) {
  const perms = await api(`/api/settings/permissions/${userId}`);
  if (!perms) return;

  document.getElementById('modal-contact-title').textContent = `Permisos — ${userName}`;
  document.getElementById('modal-contact-wa').style.display = 'none';
  document.getElementById('modal-contact-body').innerHTML = `
    <div class="contact-detail">
      <table class="data-table">
        <thead><tr><th>Sección</th><th>Ver</th><th>Crear</th><th>Editar</th><th>Eliminar</th><th>Exportar</th></tr></thead>
        <tbody>
          ${perms.map(p => `
            <tr>
              <td><strong>${SECTION_LABELS[p.section] || p.section}</strong></td>
              <td><input type="checkbox" ${p.can_view?'checked':''} onchange="updatePerm(${p.id},'can_view',this.checked)" style="width:auto;cursor:pointer" /></td>
              <td><input type="checkbox" ${p.can_create?'checked':''} onchange="updatePerm(${p.id},'can_create',this.checked)" style="width:auto;cursor:pointer" /></td>
              <td><input type="checkbox" ${p.can_edit?'checked':''} onchange="updatePerm(${p.id},'can_edit',this.checked)" style="width:auto;cursor:pointer" /></td>
              <td><input type="checkbox" ${p.can_delete?'checked':''} onchange="updatePerm(${p.id},'can_delete',this.checked)" style="width:auto;cursor:pointer" /></td>
              <td><input type="checkbox" ${p.can_export?'checked':''} onchange="updatePerm(${p.id},'can_export',this.checked)" style="width:auto;cursor:pointer" /></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  openModal('modal-contact');
}

async function updatePerm(id, field, value) {
  try {
    await api(`/api/settings/permissions/${id}`, { method: 'PATCH', body: { [field]: value } });
    toast('Permiso actualizado');
  } catch {}
}

// ═══════════════════════════════════════════════
// CONFIGURACIÓN DE EMPRESA
// ═══════════════════════════════════════════════
async function loadSystemConfig() {
  const cfg = await api('/api/settings/config');
  if (!cfg) return;
  const form = document.getElementById('form-company-config');
  if (!form) return;
  form.company_name.value = cfg.company_name || '';
  form.company_phone.value = cfg.company_phone || '';
  form.company_address.value = cfg.company_address || '';
  form.cotizacion_dolar.value = cfg.cotizacion_dolar || '';
  form["seña_default"].value = cfg["seña_default"] || '';
  form.cable_cargador.value = cfg.cable_cargador || '';
  const aiToggle = document.getElementById('ai-global-toggle');
  if (aiToggle) aiToggle.checked = cfg.ai_enabled === 'true';
}

document.getElementById('form-company-config')?.addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  d.ai_enabled = document.getElementById('ai-global-toggle').checked;
  try {
    await api('/api/settings/config', { method: 'PATCH', body: d });
    toast('Configuración guardada ✓');
  } catch {}
});

// Agregar botón de permisos en la lista de usuarios
const _origLoadUsers = loadUsers;
loadUsers = async function() {
  const users = await api('/api/settings/users');
  if (!users) return;
  document.getElementById('users-list').innerHTML = users.map(u => `
    <div style="display:flex;align-items:center;gap:.75rem;padding:.6rem 0;border-bottom:1px solid var(--border)">
      <div class="user-avatar" style="width:32px;height:32px;font-size:13px">${u.name[0].toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-weight:500;font-size:13px">${u.name}</div>
        <div style="font-size:12px;color:var(--text-muted)">${u.email}</div>
      </div>
      <span class="badge" style="background:${u.role==='admin'?'#6366f120':'#78789020'};color:${u.role==='admin'?'var(--accent)':'var(--text-muted)'}">${u.role}</span>
      <button class="btn btn-ghost btn-sm" onclick="openPermisos(${u.id},'${u.name}')">Permisos</button>
      <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id},'${u.name}')">✕</button>
    </div>
  `).join('') || '<p class="text-muted">Sin usuarios</p>';
};

// Extender loadSettings para cargar config
const _origLoadSettings = loadSettings;
loadSettings = async function() {
  await _origLoadSettings();
  await loadSystemConfig();
};
allViewLoaders.settings = loadSettings;

// ═══════════════════════════════════════════════
// REPORTES EXTENDIDOS
// ═══════════════════════════════════════════════
let chartMensual = null, chartStock = null;

const _origLoadReports = loadReports;
loadReports = async function() {
  await _origLoadReports();

  const [mensual, stock, vendedores, provs] = await Promise.all([
    api('/api/reports/ventas-mes').catch(() => []),
    api('/api/reports/stock').catch(() => []),
    api('/api/reports/vendedores').catch(() => []),
    api('/api/reports/proveedores').catch(() => []),
  ]);

  // Chart facturación mensual
  const elMensual = document.getElementById('chart-mensual');
  if (elMensual && mensual?.length) {
    if (chartMensual) chartMensual.destroy();
    chartMensual = new Chart(elMensual, {
      type: 'bar',
      data: {
        labels: mensual.map(m => m.mes),
        datasets: [
          { label: 'Facturación', data: mensual.map(m => m.facturacion), backgroundColor: '#6366f199' },
          { label: 'Ganancia', data: mensual.map(m => m.ganancia), backgroundColor: '#10b98199' },
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#e8e8f0', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#7878a0', font: { size: 10 } }, grid: { color: '#2a2a34' } },
          y: { ticks: { color: '#7878a0', callback: v => '$' + fmt(v) }, grid: { color: '#2a2a34' } },
        }
      }
    });
  }

  // Chart stock
  const elStock = document.getElementById('chart-stock');
  if (elStock && stock?.length) {
    if (chartStock) chartStock.destroy();
    const colors = { en_stock: '#3b82f6', 'señado': '#f59e0b', vendido: '#10b981' };
    chartStock = new Chart(elStock, {
      type: 'doughnut',
      data: {
        labels: stock.map(s => prodStatusLabel(s.status)),
        datasets: [{ data: stock.map(s => s.cantidad), backgroundColor: stock.map(s => colors[s.status] || '#6b7280'), borderWidth: 0 }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { color: '#e8e8f0', font: { size: 12 }, padding: 12 } } }
      }
    });
  }

  // Vendedores
  const elVend = document.getElementById('vendedores-list');
  if (elVend) {
    elVend.innerHTML = vendedores?.length
      ? vendedores.map((v, i) => `
          <div style="display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border);font-size:13px">
            <span>${i+1}. ${v.vendedor}</span>
            <span><strong>${v.cobros}</strong> cobros · <span style="color:var(--green)">$${fmtARS(v.total)}</span></span>
          </div>`).join('')
      : '<p class="text-muted">Sin datos de vendedores</p>';
  }

  // Proveedores
  const elProv = document.getElementById('proveedores-report-list');
  if (elProv) {
    elProv.innerHTML = provs?.length
      ? provs.map(p => {
          const pendiente = parseFloat(p.total_comprado) - parseFloat(p.total_pagado);
          return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:.5rem 0;border-bottom:1px solid var(--border);font-size:13px">
            <span><strong>${p.proveedor}</strong> · ${p.pedidos} pedidos</span>
            <span>
              Comprado: $${fmt(p.total_comprado)} ·
              Pagado: $${fmt(p.total_pagado)}
              ${pendiente > 0 ? ` · <span style="color:var(--red)">Debe: $${fmt(pendiente)}</span>` : ''}
            </span>
          </div>`;
        }).join('')
      : '<p class="text-muted">Sin proveedores</p>';
  }
};
allViewLoaders.reports = loadReports;

// ═══════════════════════════════════════════════
// PLANTILLAS DEL AGENTE IA
// ═══════════════════════════════════════════════
let plantillasData = [];
let tplSearchVal = '';
let tplSectionFilter = '';
let tplVarsResolved = {};
let tplLastFocusedTextarea = null;

document.getElementById('tpl-search')?.addEventListener('input', e => {
  tplSearchVal = e.target.value.toLowerCase();
  renderPlantillas();
});
document.getElementById('tpl-section-filter')?.addEventListener('change', e => {
  tplSectionFilter = e.target.value;
  renderPlantillas();
});

async function loadPlantillas() {
  const [templates, vars] = await Promise.all([
    api('/api/plantillas'),
    api('/api/plantillas/variables'),
  ]);
  if (!templates) return;
  plantillasData = templates;
  tplVarsResolved = vars || {};

  // Poblar filtro de secciones
  const sel = document.getElementById('tpl-section-filter');
  if (sel && sel.options.length === 1) {
    plantillasData.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.section;
      opt.textContent = s.section_label;
      sel.appendChild(opt);
    });
  }

  renderPlantillas();
}

// Reemplaza [seña], [dolar], [cableycargador], [direccion] por sus valores actuales,
// igual que hace el backend en /api/plantillas/export — para mostrar un preview fiel.
function substituteTplVars(text) {
  if (!text) return text;
  let result = text;
  for (const [key, value] of Object.entries(tplVarsResolved)) {
    result = result.replace(new RegExp('\\[' + key + '\\]', 'gi'), value ?? '');
  }
  return result;
}

// Inserta una variable en la posición del cursor del último textarea enfocado
function insertTplVar(name) {
  const el = tplLastFocusedTextarea;
  if (!el) { toast('Hacé click en un mensaje primero', 'error'); return; }
  const token = `[${name}]`;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + token + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + token.length;
  el.dispatchEvent(new Event('input'));
  el.focus();
}

function renderPlantillas() {
  const container = document.getElementById('plantillas-container');
  if (!container) return;

  let sections = plantillasData;

  // Filtro por sección
  if (tplSectionFilter) {
    sections = sections.filter(s => s.section === tplSectionFilter);
  }

  // Filtro por búsqueda
  if (tplSearchVal) {
    sections = sections.map(s => ({
      ...s,
      items: s.items.filter(i =>
        i.title.toLowerCase().includes(tplSearchVal) ||
        i.context.toLowerCase().includes(tplSearchVal) ||
        i.message.toLowerCase().includes(tplSearchVal)
      )
    })).filter(s => s.items.length > 0);
  }

  if (!sections.length) {
    container.innerHTML = '<div class="card" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin resultados</div>';
    return;
  }

  container.innerHTML = sections.map(sec => `
    <div class="tpl-section">
      <div class="tpl-section-header" onclick="toggleTplSection('${sec.section}')">
        <h3>${sec.section_label}</h3>
        <div style="display:flex;align-items:center;gap:.6rem">
          <span class="kanban-count">${sec.items.length}</span>
          <span class="tpl-chevron" id="chev-${sec.section}">▼</span>
        </div>
      </div>
      <div class="tpl-section-body" id="body-${sec.section}">
        ${sec.items.map(item => `
          <div class="tpl-card">
            <div class="tpl-card-title">${item.title}</div>
            <div class="tpl-card-context">${item.context}</div>
            <textarea class="tpl-textarea" id="tpl-${item.id}"
              rows="${Math.max(2, Math.min(8, (item.message.match(/\\n/g)||[]).length + 2))}"
              oninput="updateTplPreview(${item.id})" onfocus="tplLastFocusedTextarea = this"
            >${escapeHtml(item.message)}</textarea>
            <div class="tpl-preview" id="tpl-preview-${item.id}">${escapeHtml(substituteTplVars(item.message))}</div>
            <div class="tpl-card-actions">
              <button class="btn btn-ghost btn-sm" onclick="resetPlantilla(${item.id})">↺ Restaurar original</button>
              <button class="btn btn-primary btn-sm" onclick="savePlantilla(${item.id})">Guardar</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function updateTplPreview(id) {
  const el = document.getElementById(`tpl-${id}`);
  const preview = document.getElementById(`tpl-preview-${id}`);
  if (el && preview) preview.textContent = substituteTplVars(el.value);
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function toggleTplSection(section) {
  const body = document.getElementById(`body-${section}`);
  const chev = document.getElementById(`chev-${section}`);
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? '' : 'none';
  if (chev) chev.textContent = isHidden ? '▼' : '▶';
}

async function savePlantilla(id) {
  const el = document.getElementById(`tpl-${id}`);
  if (!el) return;
  try {
    await api(`/api/plantillas/${id}`, { method: 'PATCH', body: { message: el.value } });
    toast('Mensaje guardado ✓');
    updateTplPreview(id);
    // Actualizar en memoria
    plantillasData.forEach(s => {
      const item = s.items.find(i => i.id === id);
      if (item) item.message = el.value;
    });
  } catch {}
}

async function resetPlantilla(id) {
  if (!confirm('¿Restaurar el mensaje original?')) return;
  try {
    const r = await api(`/api/plantillas/${id}/reset`, { method: 'POST' });
    const el = document.getElementById(`tpl-${id}`);
    if (el && r) el.value = r.message;
    updateTplPreview(id);
    toast('Mensaje restaurado ✓');
    plantillasData.forEach(s => {
      const item = s.items.find(i => i.id === id);
      if (item && r) item.message = r.message;
    });
  } catch {}
}

allViewLoaders.plantillas = loadPlantillas;

// ═══════════════════════════════════════════════
// PROVEEDORES — Vista con tabs
// ═══════════════════════════════════════════════
let provTab = 'proveedores';
let provSearch = '';
let pedidoItems = [];

document.getElementById('prov-search')?.addEventListener('input', e => {
  provSearch = e.target.value;
  if (provTab === 'proveedores') loadProveedores();
  else if (provTab === 'pedidos') loadPedidos();
});

document.getElementById('pedidos-filter-status')?.addEventListener('change', loadPedidos);

function switchProvTab(tab) {
  provTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.prov-tab').forEach(el => el.classList.add('hidden'));
  document.getElementById(`prov-tab-${tab}`)?.classList.remove('hidden');

  const addBtn = document.getElementById('prov-add-btn');
  if (tab === 'proveedores') { addBtn.textContent = '+ Proveedor'; addBtn.onclick = () => openModal('modal-new-proveedor'); addBtn.style.display = ''; }
  else { addBtn.style.display = 'none'; }

  if (tab === 'proveedores') loadProveedores();
  if (tab === 'pedidos') loadPedidos();
  if (tab === 'alertas') loadAlertas();
}

async function loadProveedoresView() {
  await Promise.all([loadProveedores(), loadPedidosBadge(), loadAlertasBadge()]);
}

async function loadPedidosBadge() {
  try {
    const s = await api('/api/proveedores/pedidos/stats');
    const pend = parseInt(s.pendientes || 0) + parseInt(s.en_camino || 0) + parseInt(s.por_cargar || 0);
    const el = document.getElementById('tab-badge-pedidos');
    if (el) el.textContent = pend > 0 ? pend : '';
  } catch {}
}

async function loadAlertasBadge() {
  try {
    const a = await api('/api/proveedores/alertas/activas');
    const el = document.getElementById('tab-badge-alertas');
    if (el) el.textContent = a?.length > 0 ? a.length : '';
  } catch {}
}

async function loadProveedores() {
  const params = new URLSearchParams();
  if (provSearch) params.set('search', provSearch);
  const provs = await api(`/api/proveedores?${params}`);
  if (!provs) return;

  document.getElementById('proveedores-list').innerHTML = provs.length
    ? provs.map(p => {
        const debe = parseFloat(p.total_comprado) - parseFloat(p.total_pagado);
        return `
        <div class="appointment-card" onclick="openProveedor(${p.id})" style="cursor:pointer">
          <div class="apt-info">
            <div class="apt-name">${p.name}</div>
            <div class="apt-product">${[p.contact, p.phone, p.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</div>
            <div class="apt-badges">
              ${p.categories ? `<span class="badge" style="background:#6366f120;color:var(--accent)">${p.categories}</span>` : ''}
              ${p.pedidos_activos > 0 ? `<span class="badge badge-canje">${p.pedidos_activos} pedido${p.pedidos_activos > 1 ? 's' : ''} activo${p.pedidos_activos > 1 ? 's' : ''}</span>` : ''}
              ${p.total_notas > 0 ? `<span class="badge" style="background:#78789020;color:var(--text-muted)">${p.total_notas} notas</span>` : ''}
            </div>
          </div>
          <div class="apt-actions">
            <div style="text-align:right;font-size:12px">
              <div>${p.total_pedidos} pedidos</div>
              <div style="color:var(--text-muted)">$${fmt(p.total_comprado)} comprado</div>
              ${debe > 0 ? `<div style="color:var(--red)">Debe $${fmt(debe)}</div>` : ''}
            </div>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editProveedor(${p.id})">Editar</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="card" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin proveedores</div>';
}

async function openProveedor(id) {
  const d = await api(`/api/proveedores/${id}`);
  if (!d) return;
  const p = d.proveedor;
  const debe = d.pedidos.reduce((s,x) => s + parseFloat(x.total_amount||0), 0) - d.pagos.reduce((s,x) => s + parseFloat(x.amount||0), 0);

  document.getElementById('modal-contact-title').textContent = p.name;
  document.getElementById('modal-contact-wa').style.display = p.phone ? '' : 'none';
  if (p.phone) document.getElementById('modal-contact-wa').onclick = () => window.open(`https://wa.me/${p.phone.replace(/\D/g,'')}`, '_blank');

  document.getElementById('modal-contact-body').innerHTML = `
    <div class="contact-detail">
      <div style="display:flex;gap:.5rem;margin-bottom:1rem">
        <button class="btn btn-ghost btn-sm" onclick="editProveedor(${p.id});closeModal('modal-contact')">Editar datos</button>
        <button class="btn btn-primary btn-sm" onclick="openNewPedido(${p.id});closeModal('modal-contact')">+ Nuevo pedido</button>
      </div>
      <div class="contact-meta-grid">
        <div class="contact-meta-item"><label>Contacto</label><span>${p.contact || '—'}</span></div>
        <div class="contact-meta-item"><label>Teléfono</label><span>${p.phone || '—'}</span></div>
        <div class="contact-meta-item"><label>Email</label><span>${p.email || '—'}</span></div>
        <div class="contact-meta-item"><label>Categorías</label><span>${p.categories || '—'}</span></div>
        <div class="contact-meta-item"><label>Total comprado</label><span>$${fmt(d.pedidos.reduce((s,x)=>s+parseFloat(x.total_amount||0),0))}</span></div>
        <div class="contact-meta-item"><label>Saldo</label><span style="${debe>0?'color:var(--red)':'color:var(--green)'}">${debe > 0 ? `Debe $${fmt(debe)}` : 'Al día'}</span></div>
      </div>

      <div class="contact-section">
        <div class="contact-section-title">Notas internas</div>
        <div style="display:flex;gap:.5rem;margin-bottom:.75rem">
          <input type="text" id="prov-note-input" placeholder="Escribir nota..." style="flex:1" />
          <button class="btn btn-primary btn-sm" onclick="addProvNote(${p.id})">Agregar</button>
        </div>
        <div id="prov-notes-list">
          ${d.notas.length ? d.notas.map(n => `
            <div class="timeline-item">
              <div class="timeline-content">
                <p style="font-size:13px">${n.note}</p>
                <span style="font-size:11px;color:var(--text-muted)">${n.user_name || 'Sistema'}</span>
              </div>
              <span class="timeline-date">${fmtDateFull(n.created_at)}</span>
            </div>`).join('') : '<p class="text-muted">Sin notas</p>'}
        </div>
      </div>

      ${d.pedidos.length ? `
      <div class="contact-section">
        <div class="contact-section-title">Pedidos (${d.pedidos.length})</div>
        ${d.pedidos.map(o => `
          <div class="timeline-item" style="cursor:pointer" onclick="openPedidoDetalle(${o.id});closeModal('modal-contact')">
            <div class="timeline-content">
              <strong>${o.order_number || '#'+o.id}</strong>
              <span class="status-badge status-${pedidoStatusClass(o.status)}" style="margin-left:.5rem">${pedidoStatusLabel(o.status)}</span>
              <p style="font-size:12px;color:var(--text-muted)">${(o.items||[]).length} items · $${fmt(o.total_amount)}</p>
            </div>
            <span class="timeline-date">${fmtDate(o.created_at)}</span>
          </div>`).join('')}
      </div>` : ''}

      ${d.pagos.length ? `
      <div class="contact-section">
        <div class="contact-section-title">Pagos (${d.pagos.length})</div>
        ${d.pagos.map(x => `
          <div class="timeline-item">
            <div class="timeline-content"><strong>$${fmt(x.amount)}</strong>
            <p style="font-size:12px;color:var(--text-muted)">${x.method || ''} ${x.notes || ''}</p></div>
            <span class="timeline-date">${fmtDate(x.paid_at)}</span>
          </div>`).join('')}
      </div>` : ''}
    </div>`;
  openModal('modal-contact');
}

async function addProvNote(id) {
  const input = document.getElementById('prov-note-input');
  if (!input?.value.trim()) return;
  try {
    await api(`/api/proveedores/${id}/notas`, { method: 'POST', body: { note: input.value.trim() } });
    toast('Nota agregada ✓');
    input.value = '';
    openProveedor(id);
  } catch {}
}

// ── Editar proveedor ──
async function editProveedor(id) {
  const d = await api(`/api/proveedores/${id}`);
  if (!d) return;
  const p = d.proveedor;
  openEditModal('Editar proveedor', [
    { name: 'name', label: 'Nombre', value: p.name, required: true },
    { name: 'contact', label: 'Contacto', value: p.contact },
    { name: 'phone', label: 'Teléfono', value: p.phone },
    { name: 'email', label: 'Email', value: p.email, type: 'email' },
    { name: 'categories', label: 'Categorías', value: p.categories },
    { name: 'notes', label: 'Notas', value: p.notes, type: 'textarea' },
  ], async (data) => {
    await api(`/api/proveedores/${id}`, { method: 'PATCH', body: data });
    toast('Proveedor actualizado ✓');
    loadProveedores();
  }, async () => {
    await api(`/api/proveedores/${id}`, { method: 'DELETE' });
    toast('Proveedor eliminado');
    loadProveedores();
  });
}

// ═══════════════════════════════════════════════
// PEDIDOS
// ═══════════════════════════════════════════════
function pedidoStatusLabel(s) {
  return { pendiente: 'Pendiente', en_camino: 'En camino', llegado: 'Llegado', cancelado: 'Cancelado' }[s] || s;
}
function pedidoStatusClass(s) {
  return { pendiente: 'pendiente', en_camino: 'confirmado', llegado: 'completado', cancelado: 'cancelado' }[s] || 'pendiente';
}

async function loadPedidos() {
  const status = document.getElementById('pedidos-filter-status')?.value || '';
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (provSearch) params.set('search', provSearch);

  const [pedidos, stats] = await Promise.all([
    api(`/api/proveedores/pedidos/list?${params}`),
    api('/api/proveedores/pedidos/stats'),
  ]);
  if (!pedidos) return;

  document.getElementById('pedidos-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Pendientes</div><div class="stat-value" style="color:var(--yellow)">${stats.pendientes || 0}</div></div>
    <div class="stat-card"><div class="stat-label">En camino</div><div class="stat-value" style="color:var(--accent)">${stats.en_camino || 0}</div></div>
    <div class="stat-card"><div class="stat-label">Por cargar a stock</div><div class="stat-value" style="color:var(--green)">${stats.por_cargar || 0}</div></div>
  `;

  document.getElementById('pedidos-list').innerHTML = pedidos.length
    ? pedidos.map(o => {
        const items = o.items || [];
        const demorado = o.estimated_arrival && new Date(o.estimated_arrival) < new Date() && ['pendiente','en_camino'].includes(o.status);
        const debe = parseFloat(o.total_amount||0) - parseFloat(o.pagado||0);
        return `
        <div class="appointment-card" style="${demorado ? 'border-color:#ef444450' : ''}">
          <div class="apt-info" onclick="openPedidoDetalle(${o.id})" style="cursor:pointer">
            <div class="apt-name">${o.order_number || '#'+o.id} — ${o.supplier_name}</div>
            <div class="apt-product">${items.length} items · $${fmt(o.total_amount)} ${debe > 0 ? `· <span style="color:var(--red)">Debe $${fmt(debe)}</span>` : ''}</div>
            <div class="apt-badges">
              <span class="status-badge status-${pedidoStatusClass(o.status)}">${pedidoStatusLabel(o.status)}</span>
              ${demorado ? '<span class="badge" style="background:#ef444420;color:var(--red)">Demorado</span>' : ''}
              ${o.loaded_to_stock ? '<span class="badge badge-seña">Cargado a stock ✓</span>' : ''}
              ${o.estimated_arrival ? `<span class="badge" style="background:#78789020;color:var(--text-muted)">Llega ${fmtDate(o.estimated_arrival)}</span>` : ''}
              ${o.total_notas > 0 ? `<span class="badge" style="background:#78789020;color:var(--text-muted)">${o.total_notas} notas</span>` : ''}
            </div>
          </div>
          <div class="apt-actions">
            <div class="apt-btn-group">
              ${o.status !== 'llegado' && o.status !== 'cancelado'
                ? `<button class="btn btn-green btn-sm" onclick="marcarEntregado(${o.id})">✓ Entregado</button>` : ''}
              ${o.status === 'llegado' && !o.loaded_to_stock
                ? `<button class="btn btn-primary btn-sm" onclick="cargarAStock(${o.id})">↓ Cargar a stock</button>` : ''}
              <button class="btn btn-ghost btn-sm" onclick="editPedido(${o.id})">Editar</button>
            </div>
          </div>
        </div>`;
      }).join('')
    : '<div class="card" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin pedidos</div>';
}

async function marcarEntregado(id) {
  if (!confirm('¿Marcar el pedido como entregado?')) return;
  try {
    await api(`/api/proveedores/pedidos/${id}/entregar`, { method: 'POST', body: {} });
    toast('Pedido marcado como entregado ✓');
    loadPedidos();
    loadPedidosBadge();
  } catch {}
}

async function cargarAStock(id) {
  if (!confirm('¿Cargar todos los productos de este pedido al stock?\n\nSe crearán los productos con el precio de venta configurado.')) return;
  try {
    const r = await api(`/api/proveedores/pedidos/${id}/cargar-stock`, { method: 'POST', body: {} });
    toast(r.message);
    loadPedidos();
    loadPedidosBadge();
  } catch {}
}

async function openPedidoDetalle(id) {
  const d = await api(`/api/proveedores/pedidos/${id}`);
  if (!d) return;
  const o = d.pedido;
  const items = o.items || [];
  const pagado = d.pagos.reduce((s,x) => s + parseFloat(x.amount||0), 0);
  const debe = parseFloat(o.total_amount||0) - pagado;

  document.getElementById('pedido-detalle-title').textContent = `${o.order_number || '#'+o.id} — ${o.supplier_name}`;
  document.getElementById('pedido-detalle-body').innerHTML = `
    <div class="contact-detail">
      <div style="display:flex;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap">
        ${o.status !== 'llegado' && o.status !== 'cancelado'
          ? `<button class="btn btn-green btn-sm" onclick="marcarEntregado(${o.id});closeModal('modal-pedido-detalle')">✓ Marcar entregado</button>` : ''}
        ${o.status === 'llegado' && !o.loaded_to_stock
          ? `<button class="btn btn-primary btn-sm" onclick="cargarAStock(${o.id});closeModal('modal-pedido-detalle')">↓ Cargar a stock</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="editPedido(${o.id});closeModal('modal-pedido-detalle')">Editar pedido</button>
      </div>

      <div class="contact-meta-grid">
        <div class="contact-meta-item"><label>Estado</label><span class="status-badge status-${pedidoStatusClass(o.status)}">${pedidoStatusLabel(o.status)}</span></div>
        <div class="contact-meta-item"><label>Total</label><span>$${fmt(o.total_amount)}</span></div>
        <div class="contact-meta-item"><label>Pagado</label><span style="color:var(--green)">$${fmt(pagado)}</span></div>
        <div class="contact-meta-item"><label>Saldo</label><span style="${debe>0?'color:var(--red)':''}">${debe > 0 ? '$'+fmt(debe) : 'Pagado ✓'}</span></div>
        <div class="contact-meta-item"><label>Llegada estimada</label><span>${o.estimated_arrival ? fmtDate(o.estimated_arrival) : '—'}</span></div>
        <div class="contact-meta-item"><label>Llegada real</label><span>${o.actual_arrival ? fmtDate(o.actual_arrival) : '—'}</span></div>
      </div>

      <div class="contact-section">
        <div class="contact-section-title">Productos (${items.length})</div>
        <table class="data-table">
          <thead><tr><th>Modelo</th><th>GB</th><th>Color</th><th>Bat.</th><th>Cant.</th><th>Costo</th><th>Venta</th><th>Stock</th></tr></thead>
          <tbody>
            ${items.map(i => `
              <tr>
                <td><strong>${i.model || i.description || '—'}</strong></td>
                <td>${i.storage_gb || '—'}</td>
                <td>${i.color || '—'}</td>
                <td>${i.battery_pct ? i.battery_pct+'%' : '—'}</td>
                <td>${i.quantity}</td>
                <td>$${fmt(i.unit_price)}</td>
                <td style="color:var(--green)">$${fmt(i.retail_price)}</td>
                <td>${i.loaded_to_stock ? '<span class="badge badge-seña">✓</span>' : '<span class="text-muted">—</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="contact-section">
        <div class="contact-section-title">Notas del pedido</div>
        <div style="display:flex;gap:.5rem;margin-bottom:.75rem">
          <input type="text" id="pedido-note-input" placeholder="Escribir nota..." style="flex:1" />
          <button class="btn btn-primary btn-sm" onclick="addPedidoNote(${o.id})">Agregar</button>
        </div>
        ${d.notas.length ? d.notas.map(n => `
          <div class="timeline-item">
            <div class="timeline-content">
              <p style="font-size:13px">${n.note}</p>
              <span style="font-size:11px;color:var(--text-muted)">${n.user_name || 'Sistema'}</span>
            </div>
            <span class="timeline-date">${fmtDateFull(n.created_at)}</span>
          </div>`).join('') : '<p class="text-muted">Sin notas</p>'}
      </div>
    </div>`;
  openModal('modal-pedido-detalle');
}

async function addPedidoNote(id) {
  const input = document.getElementById('pedido-note-input');
  if (!input?.value.trim()) return;
  try {
    await api(`/api/proveedores/pedidos/${id}/notas`, { method: 'POST', body: { note: input.value.trim() } });
    toast('Nota agregada ✓');
    input.value = '';
    openPedidoDetalle(id);
  } catch {}
}

// ── Crear / editar pedido ──
async function openNewPedido(supplierId = null) {
  pedidoItems = [];
  document.getElementById('modal-pedido-title').textContent = 'Nuevo pedido';
  const form = document.getElementById('form-pedido');
  form.reset();
  form.id.value = '';

  const provs = await api('/api/proveedores');
  const sel = document.getElementById('pedido-supplier-select');
  sel.innerHTML = '<option value="">Seleccionar...</option>' +
    (provs || []).map(p => `<option value="${p.id}" ${p.id == supplierId ? 'selected' : ''}>${p.name}</option>`).join('');

  addPedidoItem();
  openModal('modal-pedido');
}

async function editPedido(id) {
  const d = await api(`/api/proveedores/pedidos/${id}`);
  if (!d) return;
  const o = d.pedido;
  pedidoItems = (o.items || []).map(i => ({ ...i }));

  document.getElementById('modal-pedido-title').textContent = `Editar ${o.order_number || '#'+o.id}`;
  const provs = await api('/api/proveedores');
  const sel = document.getElementById('pedido-supplier-select');
  sel.innerHTML = (provs || []).map(p => `<option value="${p.id}" ${p.id === o.supplier_id ? 'selected' : ''}>${p.name}</option>`).join('');

  const form = document.getElementById('form-pedido');
  form.id.value = o.id;
  form.status.value = o.status;
  form.estimated_arrival.value = o.estimated_arrival ? o.estimated_arrival.split('T')[0] : '';
  form.actual_arrival.value = o.actual_arrival ? o.actual_arrival.split('T')[0] : '';
  form.notes.value = o.notes || '';

  renderPedidoItems();
  openModal('modal-pedido');
}

function addPedidoItem() {
  pedidoItems.push({ model: '', storage_gb: '', color: '', battery_pct: '', quantity: 1, unit_price: '', retail_price: '', condition_notes: '' });
  renderPedidoItems();
}

function removePedidoItem(idx) {
  pedidoItems.splice(idx, 1);
  renderPedidoItems();
}

function updatePedidoItem(idx, field, value) {
  pedidoItems[idx][field] = value;
  updatePedidoTotal();
}

function renderPedidoItems() {
  document.getElementById('pedido-items-list').innerHTML = pedidoItems.map((it, i) => `
    <div class="pedido-item-row">
      <input type="text" placeholder="Modelo *" value="${it.model || ''}" onchange="updatePedidoItem(${i},'model',this.value)" style="flex:2" />
      <input type="number" placeholder="GB" value="${it.storage_gb || ''}" onchange="updatePedidoItem(${i},'storage_gb',this.value)" style="width:70px" />
      <input type="text" placeholder="Color" value="${it.color || ''}" onchange="updatePedidoItem(${i},'color',this.value)" style="width:100px" />
      <input type="number" placeholder="Bat%" value="${it.battery_pct || ''}" onchange="updatePedidoItem(${i},'battery_pct',this.value)" style="width:70px" />
      <input type="number" placeholder="Cant" value="${it.quantity || 1}" onchange="updatePedidoItem(${i},'quantity',this.value)" style="width:60px" />
      <input type="number" placeholder="Costo" value="${it.unit_price || ''}" onchange="updatePedidoItem(${i},'unit_price',this.value)" style="width:90px" step="0.01" />
      <input type="number" placeholder="Venta" value="${it.retail_price || ''}" onchange="updatePedidoItem(${i},'retail_price',this.value)" style="width:90px" step="0.01" />
      <button type="button" class="btn btn-danger btn-xs" onclick="removePedidoItem(${i})">✕</button>
    </div>
  `).join('');
  updatePedidoTotal();
}

function updatePedidoTotal() {
  const total = pedidoItems.reduce((s, it) => s + (parseFloat(it.quantity)||1) * (parseFloat(it.unit_price)||0), 0);
  const totalVenta = pedidoItems.reduce((s, it) => s + (parseFloat(it.quantity)||1) * (parseFloat(it.retail_price)||0), 0);
  const ganancia = totalVenta - total;
  const el = document.getElementById('pedido-total-preview');
  if (!el) return;
  el.innerHTML = `
    <div class="sale-preview-line"><span>Costo total del pedido</span><span>$${fmt(total)}</span></div>
    <div class="sale-preview-line"><span>Venta estimada</span><span style="color:var(--green)">$${fmt(totalVenta)}</span></div>
    <div class="sale-preview-line total"><span>Ganancia estimada</span><span style="color:var(--green)">$${fmt(ganancia)}</span></div>
  `;
}

document.getElementById('form-pedido')?.addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  const items = pedidoItems.filter(it => it.model).map(it => ({
    ...it,
    quantity: parseInt(it.quantity) || 1,
    unit_price: parseFloat(it.unit_price) || 0,
    retail_price: parseFloat(it.retail_price) || null,
    storage_gb: it.storage_gb ? parseInt(it.storage_gb) : null,
    battery_pct: it.battery_pct ? parseInt(it.battery_pct) : null,
  }));

  if (!items.length) { toast('Agregá al menos un producto', 'error'); return; }

  try {
    if (d.id) {
      await api(`/api/proveedores/pedidos/${d.id}`, { method: 'PATCH', body: {
        status: d.status, estimated_arrival: d.estimated_arrival || null,
        actual_arrival: d.actual_arrival || null, notes: d.notes, items,
      }});
      toast('Pedido actualizado ✓');
    } else {
      await api('/api/proveedores/pedidos', { method: 'POST', body: { ...d, items } });
      toast('Pedido creado ✓');
    }
    closeModal('modal-pedido');
    loadPedidos();
    loadPedidosBadge();
  } catch {}
});

// ═══════════════════════════════════════════════
// ALERTAS DE STOCK
// ═══════════════════════════════════════════════
document.getElementById('alerta-type')?.addEventListener('change', e => {
  const isAntiguedad = e.target.value === 'antiguedad';
  document.getElementById('alerta-days-field')?.classList.toggle('hidden', !isAntiguedad);
  document.getElementById('alerta-threshold-field')?.classList.toggle('hidden', isAntiguedad);
});

async function loadAlertas() {
  const [activas, config] = await Promise.all([
    api('/api/proveedores/alertas/activas'),
    api('/api/proveedores/alertas/config'),
  ]);

  const nivelColor = { critico: 'var(--red)', warning: 'var(--yellow)', info: 'var(--accent)' };
  const nivelBg = { critico: '#ef444415', warning: '#f59e0b15', info: '#6366f115' };

  document.getElementById('alertas-activas').innerHTML = activas?.length
    ? activas.map(a => `
        <div style="display:flex;align-items:center;gap:.75rem;padding:.75rem;border-radius:8px;margin-bottom:.5rem;background:${nivelBg[a.nivel]};border:1px solid ${nivelColor[a.nivel]}30">
          <div style="width:8px;height:8px;border-radius:50%;background:${nivelColor[a.nivel]};flex-shrink:0"></div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:13.5px">${a.titulo}</div>
            <div style="font-size:12px;color:var(--text-muted)">${a.detalle}</div>
          </div>
          <span class="badge" style="background:${nivelColor[a.nivel]}20;color:${nivelColor[a.nivel]}">${a.config_name}</span>
          ${a.order_id ? `<button class="btn btn-ghost btn-sm" onclick="openPedidoDetalle(${a.order_id})">Ver</button>` : ''}
        </div>`).join('')
    : '<p class="text-muted" style="text-align:center;padding:1.5rem">Todo en orden — sin alertas activas ✓</p>';

  document.getElementById('alertas-config').innerHTML = config?.length
    ? config.map(c => `
        <div style="display:flex;align-items:center;gap:.75rem;padding:.6rem 0;border-bottom:1px solid var(--border)">
          <div style="flex:1">
            <div style="font-weight:500;font-size:13px">${c.name}</div>
            <div style="font-size:11px;color:var(--text-muted)">
              ${alertaTypeLabel(c.alert_type)} · Filtro: <code>${c.model_pattern}</code>
              ${c.alert_type === 'antiguedad' ? ` · ${c.days_threshold} días` : ` · umbral ${c.threshold}`}
            </div>
          </div>
          <label style="display:flex;align-items:center;gap:.4rem;font-size:12px;cursor:pointer">
            <input type="checkbox" ${c.is_active ? 'checked' : ''} onchange="toggleAlerta(${c.id}, this.checked)" style="width:auto" />
            Activa
          </label>
          <button class="btn btn-danger btn-sm" onclick="deleteAlerta(${c.id})">✕</button>
        </div>`).join('')
    : '<p class="text-muted">Sin alertas configuradas</p>';
}

function alertaTypeLabel(t) {
  return {
    modelo_bajo: 'Stock bajo', sin_stock: 'Sin stock',
    antiguedad: 'Antigüedad en stock', capital_alto: 'Capital inmovilizado',
  }[t] || t;
}

async function toggleAlerta(id, value) {
  await api(`/api/proveedores/alertas/config/${id}`, { method: 'PATCH', body: { is_active: value } });
  toast('Alerta actualizada');
  loadAlertasBadge();
}

async function deleteAlerta(id) {
  if (!confirm('¿Eliminar esta alerta?')) return;
  await api(`/api/proveedores/alertas/config/${id}`, { method: 'DELETE' });
  toast('Alerta eliminada');
  loadAlertas();
}

document.getElementById('form-new-alerta')?.addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  try {
    await api('/api/proveedores/alertas/config', { method: 'POST', body: d });
    toast('Alerta creada ✓');
    closeModal('modal-new-alerta');
    e.target.reset();
    loadAlertas();
  } catch {}
});

document.getElementById('form-new-proveedor')?.addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  try {
    await api('/api/proveedores', { method: 'POST', body: d });
    toast('Proveedor creado ✓');
    closeModal('modal-new-proveedor');
    e.target.reset();
    loadProveedores();
  } catch {}
});

allViewLoaders.proveedores = loadProveedoresView;

// ═══════════════════════════════════════════════
// MODAL DE EDICIÓN GENÉRICO
// ═══════════════════════════════════════════════
let editSaveCallback = null;
let editDeleteCallback = null;

function openEditModal(title, fields, onSave, onDelete = null) {
  document.getElementById('modal-edit-title').textContent = title;
  editSaveCallback = onSave;
  editDeleteCallback = onDelete;

  document.getElementById('modal-edit-fields').innerHTML = `
    <div class="form-grid">
      ${fields.map(f => {
        const val = f.value ?? '';
        if (f.type === 'textarea') return '';
        if (f.type === 'select') {
          return `<div class="field"><label>${f.label}</label>
            <select name="${f.name}" ${f.required ? 'required' : ''}>
              ${f.options.map(o => `<option value="${o.value}" ${String(o.value) === String(val) ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select></div>`;
        }
        if (f.type === 'checkbox') {
          return `<div class="field"><label>${f.label}</label>
            <select name="${f.name}"><option value="true" ${val === true ? 'selected' : ''}>Sí</option><option value="false" ${val === false ? 'selected' : ''}>No</option></select></div>`;
        }
        return `<div class="field"><label>${f.label}${f.required ? ' *' : ''}</label>
          <input type="${f.type || 'text'}" name="${f.name}" value="${escapeHtml(val)}"
            ${f.required ? 'required' : ''} ${f.step ? `step="${f.step}"` : ''} /></div>`;
      }).join('')}
    </div>
    ${fields.filter(f => f.type === 'textarea').map(f => `
      <div class="field"><label>${f.label}</label>
        <textarea name="${f.name}" rows="3">${escapeHtml(f.value ?? '')}</textarea></div>`).join('')}
  `;

  const delBtn = document.getElementById('modal-edit-delete');
  delBtn.style.display = onDelete ? '' : 'none';

  openModal('modal-edit');
}

document.getElementById('form-edit')?.addEventListener('submit', async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  // Convertir "true"/"false" a booleanos
  Object.keys(data).forEach(k => {
    if (data[k] === 'true') data[k] = true;
    else if (data[k] === 'false') data[k] = false;
    else if (data[k] === '') data[k] = null;
  });
  try {
    if (editSaveCallback) await editSaveCallback(data);
    closeModal('modal-edit');
  } catch {}
});

document.getElementById('modal-edit-delete')?.addEventListener('click', async () => {
  if (!confirm('¿Estás seguro? Esta acción no se puede deshacer.')) return;
  try {
    if (editDeleteCallback) await editDeleteCallback();
    closeModal('modal-edit');
  } catch {}
});

// ═══════════════════════════════════════════════
// FUNCIONES DE EDICIÓN POR MÓDULO
// ═══════════════════════════════════════════════

// ── Contacto / Lead ──
async function editContacto(id) {
  const d = await api(`/api/contacts/${id}`);
  if (!d) return;
  const c = d.contact;
  openEditModal('Editar contacto', [
    { name: 'name', label: 'Nombre', value: c.name },
    { name: 'phone', label: 'Teléfono', value: c.phone },
    { name: 'instagram', label: 'Usuario de Instagram', value: c.instagram },
    { name: 'city', label: 'Ciudad', value: c.city },
    { name: 'source', label: 'Fuente', value: c.source, type: 'select', options: [
      { value: 'whatsapp', label: 'WhatsApp' }, { value: 'instagram', label: 'Instagram' },
      { value: 'referido', label: 'Referido' }, { value: 'local', label: 'Local' },
    ]},
    { name: 'is_first_iphone', label: 'Primer iPhone', value: c.is_first_iphone, type: 'select', options: [
      { value: '', label: 'No sé' }, { value: 'true', label: 'Sí' }, { value: 'false', label: 'No' },
    ]},
    { name: 'current_device', label: 'iPhone actual', value: c.current_device },
    { name: 'notes', label: 'Notas', value: c.notes, type: 'textarea' },
  ], async (data) => {
    await api(`/api/contacts/${id}`, { method: 'PATCH', body: data });
    toast('Contacto actualizado ✓');
    if (currentView === 'contacts') loadContacts();
    if (currentView === 'pipeline') loadPipeline();
  }, async () => {
    await api(`/api/contacts/${id}`, { method: 'DELETE' });
    toast('Contacto eliminado');
    if (currentView === 'contacts') loadContacts();
    if (currentView === 'pipeline') loadPipeline();
  });
}

// ── Cliente ──
async function editCliente(id) {
  const d = await api(`/api/clients/${id}`);
  if (!d) return;
  const c = d.client;
  openEditModal('Editar cliente', [
    { name: 'name', label: 'Nombre', value: c.name, required: true },
    { name: 'last_name', label: 'Apellido', value: c.last_name },
    { name: 'dni', label: 'DNI', value: c.dni },
    { name: 'phone', label: 'Teléfono', value: c.phone },
    { name: 'email', label: 'Email', value: c.email, type: 'email' },
    { name: 'instagram', label: 'Instagram', value: c.instagram },
    { name: 'address', label: 'Dirección', value: c.address },
    { name: 'city', label: 'Localidad', value: c.city },
    { name: 'birthday', label: 'Cumpleaños', value: c.birthday ? c.birthday.split('T')[0] : '', type: 'date' },
    { name: 'notes', label: 'Notas', value: c.notes, type: 'textarea' },
  ], async (data) => {
    await api(`/api/clients/${id}`, { method: 'PATCH', body: data });
    toast('Cliente actualizado ✓');
    loadClientes();
  }, async () => {
    await api(`/api/clients/${id}`, { method: 'DELETE' });
    toast('Cliente eliminado');
    loadClientes();
  });
}

// ── Producto ──
async function editProducto(id) {
  const d = await api(`/api/productos/${id}`);
  if (!d) return;
  const p = d.producto;
  openEditModal('Editar producto', [
    { name: 'model', label: 'Modelo', value: p.model, required: true },
    { name: 'color', label: 'Color', value: p.color },
    { name: 'storage_gb', label: 'Capacidad GB', value: p.storage_gb, type: 'number' },
    { name: 'battery_pct', label: 'Batería %', value: p.battery_pct, type: 'number' },
    { name: 'battery_type', label: 'Tipo de batería', value: p.battery_type || 'original', type: 'select', options: [
      { value: 'original', label: 'Original' }, { value: 'reemplazada', label: 'Cambiada por nosotros' },
    ]},
    { name: 'imei', label: 'IMEI', value: p.imei },
    { name: 'serial_number', label: 'N° Serie', value: p.serial_number },
    { name: 'price', label: 'Precio USD', value: p.price, type: 'number', step: '0.01' },
    { name: 'cost', label: 'Costo USD', value: p.cost, type: 'number', step: '0.01' },
    { name: 'status', label: 'Estado', value: p.status, type: 'select', options: [
      { value: 'en_stock', label: 'En stock' }, { value: 'señado', label: 'Señado' }, { value: 'vendido', label: 'Vendido' },
    ]},
    { name: 'has_face_id', label: 'Face ID', value: p.has_face_id, type: 'checkbox' },
    { name: 'has_true_tone', label: 'True Tone', value: p.has_true_tone, type: 'checkbox' },
    { name: 'warranty_months', label: 'Garantía (meses)', value: p.warranty_months, type: 'number' },
    { name: 'condition_notes', label: 'Notas de estado', value: p.condition_notes, type: 'textarea' },
    { name: 'general_notes', label: 'Notas generales', value: p.general_notes, type: 'textarea' },
  ], async (data) => {
    await api(`/api/productos/${id}`, { method: 'PATCH', body: data });
    toast('Producto actualizado ✓');
    loadProductos();
  }, async () => {
    await api(`/api/productos/${id}`, { method: 'DELETE' });
    toast('Producto eliminado');
    loadProductos();
  });

  // Autocompletar garantía si el usuario cambia el tipo de batería (se puede editar después igual)
  const battSelect = document.querySelector('#form-edit select[name="battery_type"]');
  const warrantyInput = document.querySelector('#form-edit input[name="warranty_months"]');
  if (battSelect && warrantyInput) {
    battSelect.addEventListener('change', e => {
      warrantyInput.value = e.target.value === 'reemplazada' ? 12 : 3;
    });
  }
}

// ── Turno ──
async function editTurno(id, apt) {
  openEditModal('Editar turno', [
    { name: 'scheduled_at', label: 'Fecha y hora', value: apt.scheduled_at ? apt.scheduled_at.slice(0,16) : '', type: 'datetime-local', required: true },
    { name: 'status', label: 'Estado', value: apt.status, type: 'select', options: [
      { value: 'pendiente', label: 'Pendiente' }, { value: 'confirmado', label: 'Confirmado' },
      { value: 'completado', label: 'Completado' }, { value: 'cancelado', label: 'Cancelado' },
      { value: 'no_vino', label: 'No vino' },
    ]},
    { name: 'product_interested', label: 'Equipo de interés', value: apt.product_interested },
    { name: 'notes', label: 'Notas', value: apt.notes, type: 'textarea' },
  ], async (data) => {
    await api(`/api/appointments/${id}`, { method: 'PATCH', body: data });
    toast('Turno actualizado ✓');
    loadAppointments();
  }, async () => {
    await api(`/api/appointments/${id}`, { method: 'DELETE' });
    toast('Turno eliminado');
    loadAppointments();
  });
}

// ── Venta ──
async function editVenta(id, sale) {
  openEditModal('Editar venta', [
    { name: 'product_name', label: 'Producto', value: sale.product_name, required: true },
    { name: 'price_usd', label: 'Precio USD', value: sale.price_usd, type: 'number', step: '0.01' },
    { name: 'cotizacion', label: 'Cotización', value: sale.cotizacion, type: 'number' },
    { name: 'trade_in_value', label: 'Valor canje USD', value: sale.trade_in_value, type: 'number', step: '0.01' },
    { name: 'payment_method', label: 'Método de pago', value: sale.payment_method, type: 'select', options: [
      { value: 'efectivo_pesos', label: 'Efectivo pesos' }, { value: 'efectivo_usd', label: 'Efectivo USD' },
      { value: 'transferencia', label: 'Transferencia' }, { value: 'tarjeta', label: 'Tarjeta' },
      { value: 'credito_personal', label: 'Crédito DNI' },
    ]},
    { name: 'cuotas', label: 'Cuotas', value: sale.cuotas, type: 'number' },
    { name: 'notes', label: 'Notas', value: sale.notes, type: 'textarea' },
  ], async (data) => {
    await api(`/api/sales/${id}`, { method: 'PATCH', body: data });
    toast('Venta actualizada ✓');
    loadSales();
  }, async () => {
    await api(`/api/sales/${id}`, { method: 'DELETE' });
    toast('Venta eliminada');
    loadSales();
  });
}

// ── Tarea ──
async function editTarea(id, t) {
  openEditModal('Editar tarea', [
    { name: 'title', label: 'Título', value: t.title, required: true },
    { name: 'status', label: 'Estado', value: t.status, type: 'select', options: [
      { value: 'pendiente', label: 'Pendiente' }, { value: 'en_progreso', label: 'En progreso' },
      { value: 'completada', label: 'Completada' },
    ]},
    { name: 'priority', label: 'Prioridad', value: t.priority, type: 'select', options: [
      { value: 'baja', label: 'Baja' }, { value: 'normal', label: 'Normal' }, { value: 'alta', label: 'Alta' },
    ]},
    { name: 'due_date', label: 'Vencimiento', value: t.due_date ? t.due_date.slice(0,16) : '', type: 'datetime-local' },
    { name: 'description', label: 'Descripción', value: t.description, type: 'textarea' },
  ], async (data) => {
    await api(`/api/tareas/${id}`, { method: 'PATCH', body: data });
    toast('Tarea actualizada ✓');
    loadTareas();
  }, async () => {
    await api(`/api/tareas/${id}`, { method: 'DELETE' });
    toast('Tarea eliminada');
    loadTareas();
  });
}

// ── Cobro ──
async function editCobro(id, c) {
  openEditModal('Editar cobro', [
    { name: 'total_amount', label: 'Importe', value: c.total_amount, type: 'number', step: '0.01', required: true },
    { name: 'type', label: 'Tipo', value: c.type, type: 'select', options: [
      { value: 'seña', label: 'Seña' }, { value: 'cobro_total', label: 'Cobro total' },
      { value: 'cobro_parcial', label: 'Cobro parcial' },
    ]},
    { name: 'notes', label: 'Observaciones', value: c.notes, type: 'textarea' },
  ], async (data) => {
    await api(`/api/cobros/${id}`, { method: 'PATCH', body: data });
    toast('Cobro actualizado ✓');
    loadCobros();
  }, async () => {
    await api(`/api/cobros/${id}`, { method: 'DELETE' });
    toast('Cobro eliminado');
    loadCobros();
  });
}

// ── Evento de calendario ──
async function editEvento(id, e) {
  openEditModal('Editar evento', [
    { name: 'title', label: 'Título', value: e.title, required: true },
    { name: 'start_at', label: 'Fecha y hora', value: e.start_at ? e.start_at.slice(0,16) : '', type: 'datetime-local', required: true },
    { name: 'type', label: 'Tipo', value: e.type, type: 'select', options: [
      { value: 'visita', label: 'Visita' }, { value: 'entrega', label: 'Entrega' },
      { value: 'seña', label: 'Seña' }, { value: 'otro', label: 'Otro' },
    ]},
    { name: 'notes', label: 'Notas', value: e.notes, type: 'textarea' },
  ], async (data) => {
    await api(`/api/calendario/${id}`, { method: 'PATCH', body: data });
    toast('Evento actualizado ✓');
    loadCalendario();
  }, async () => {
    await api(`/api/calendario/${id}`, { method: 'DELETE' });
    toast('Evento eliminado');
    loadCalendario();
  });
}

// ── Automatización ──
async function editAutomatizacion(id, a) {
  openEditModal('Editar automatización', [
    { name: 'name', label: 'Nombre', value: a.name, required: true },
    { name: 'days_offset', label: 'Días offset', value: a.days_offset, type: 'number' },
    { name: 'status', label: 'Estado', value: a.status, type: 'select', options: [
      { value: 'activa', label: 'Activa' }, { value: 'desactivada', label: 'Desactivada' },
      { value: 'revision', label: 'En revisión' },
    ]},
    { name: 'message', label: 'Mensaje', value: a.message, type: 'textarea' },
  ], async (data) => {
    await api(`/api/automatizaciones/${id}`, { method: 'PATCH', body: data });
    toast('Automatización actualizada ✓');
    loadAutomatizaciones();
  }, async () => {
    await api(`/api/automatizaciones/${id}`, { method: 'DELETE' });
    toast('Automatización eliminada');
    loadAutomatizaciones();
  });
}

// ═══════════════════════════════════════════════
// CALENDARIO
// ═══════════════════════════════════════════════
let calMonth = new Date();
let calEventos = [];
let eventoProductos = [];   // [{producto_id, model, storage_gb, color, price, reserved}]
let eventoContact = null;

function changeMonth(delta) {
  calMonth.setMonth(calMonth.getMonth() + delta);
  loadCalendario();
}

async function loadCalendario() {
  const monthStr = `${calMonth.getFullYear()}-${String(calMonth.getMonth()+1).padStart(2,'0')}`;
  document.getElementById('cal-month-label').textContent =
    calMonth.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  calEventos = await api(`/api/calendario?month=${monthStr}`) || [];

  const year = calMonth.getFullYear(), month = calMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = firstDay === 0 ? 6 : firstDay - 1;

  let html = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
    .map(d => `<div class="cal-header">${d}</div>`).join('');

  for (let i = 0; i < offset; i++) html += '<div class="cal-day empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayEvents = calEventos.filter(e => e.start_at.startsWith(dateStr));
    const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();
    html += `
      <div class="cal-day ${isToday ? 'today' : ''}" ondblclick="openNewEvento('${dateStr}')">
        <div class="cal-day-num">${d}</div>
        ${dayEvents.map(e => {
          const reservados = (e.productos || []).filter(p => p.reserved).length;
          return `<div class="cal-event ${e.type}" title="${e.title}" onclick="event.stopPropagation();openEventoDetalle(${e.id})">
            ${fmtTime(e.start_at)} ${e.title}${reservados > 0 ? ` 🔒${reservados}` : ''}
          </div>`;
        }).join('')}
      </div>`;
  }

  document.getElementById('calendar-grid').innerHTML = html;
}

// ── Nuevo evento ──
function openNewEvento(dateStr = null) {
  eventoProductos = [];
  eventoContact = null;
  const form = document.getElementById('form-new-evento');
  form.reset();
  form.id.value = '';
  document.getElementById('evento-modal-title').textContent = 'Nuevo evento';
  document.getElementById('evento-contact-id').value = '';
  document.getElementById('evento-lead-selected').classList.add('hidden');
  document.getElementById('evento-lead-search').value = '';

  if (dateStr) {
    form.start_at.value = `${dateStr}T11:00`;
  }
  renderEventoProductos();
  openModal('modal-new-evento');
}

// ── Autocomplete de leads ──
let leadSearchTimer = null;
document.getElementById('evento-lead-search')?.addEventListener('input', e => {
  clearTimeout(leadSearchTimer);
  const q = e.target.value.trim();
  const box = document.getElementById('evento-lead-results');
  if (q.length < 2) { box.classList.add('hidden'); return; }

  leadSearchTimer = setTimeout(async () => {
    const d = await api(`/api/contacts?search=${encodeURIComponent(q)}&limit=8`);
    if (!d?.contacts?.length) {
      box.innerHTML = '<div class="autocomplete-empty">Sin resultados</div>';
      box.classList.remove('hidden');
      return;
    }
    box.innerHTML = d.contacts.map(c => `
      <div class="autocomplete-item" onclick="selectEventoLead(${c.id}, '${(c.name||'').replace(/'/g,"\\\\'")}', '${c.phone}')">
        <strong>${c.name || '(sin nombre)'}</strong>
        <span style="color:var(--text-muted);font-size:12px">${c.phone}</span>
      </div>`).join('');
    box.classList.remove('hidden');
  }, 250);
});

function selectEventoLead(id, name, phone) {
  eventoContact = { id, name, phone };
  document.getElementById('evento-contact-id').value = id;
  document.getElementById('evento-lead-search').value = '';
  document.getElementById('evento-lead-results').classList.add('hidden');
  const chip = document.getElementById('evento-lead-selected');
  chip.innerHTML = `
    <span>${name || phone}</span>
    <button type="button" class="chip-remove" onclick="clearEventoLead()">✕</button>`;
  chip.classList.remove('hidden');
}

function clearEventoLead() {
  eventoContact = null;
  document.getElementById('evento-contact-id').value = '';
  document.getElementById('evento-lead-selected').classList.add('hidden');
}

// ── Autocomplete de productos ──
let prodSearchTimer = null;
document.getElementById('evento-producto-search')?.addEventListener('input', e => {
  clearTimeout(prodSearchTimer);
  const q = e.target.value.trim();
  const box = document.getElementById('evento-producto-results');
  if (q.length < 2) { box.classList.add('hidden'); return; }

  prodSearchTimer = setTimeout(async () => {
    const d = await api(`/api/productos?search=${encodeURIComponent(q)}&limit=8`);
    if (!d?.productos?.length) {
      box.innerHTML = '<div class="autocomplete-empty">Sin resultados</div>';
      box.classList.remove('hidden');
      return;
    }
    box.innerHTML = d.productos.map(p => {
      const yaAgregado = eventoProductos.some(x => x.producto_id === p.id);
      return `
      <div class="autocomplete-item ${yaAgregado ? 'disabled' : ''}"
           ${yaAgregado ? '' : `onclick='addEventoProducto(${JSON.stringify(p).replace(/'/g,"&apos;")})'`}>
        <strong>${p.model} ${p.storage_gb || ''}GB</strong>
        <span style="color:var(--text-muted);font-size:12px">${p.color || ''} · $${fmt(p.price)} · ${prodStatusLabel(p.status)}</span>
        ${yaAgregado ? '<span style="font-size:11px;color:var(--green)">Ya agregado</span>' : ''}
      </div>`;
    }).join('');
    box.classList.remove('hidden');
  }, 250);
});

function addEventoProducto(p) {
  if (eventoProductos.some(x => x.producto_id === p.id)) return;
  eventoProductos.push({
    producto_id: p.id, model: p.model, storage_gb: p.storage_gb,
    color: p.color, price: p.price, status: p.status, reserved: false,
  });
  document.getElementById('evento-producto-search').value = '';
  document.getElementById('evento-producto-results').classList.add('hidden');
  renderEventoProductos();
}

function removeEventoProducto(idx) {
  eventoProductos.splice(idx, 1);
  renderEventoProductos();
}

function toggleEventoReserva(idx, value) {
  eventoProductos[idx].reserved = value;
  renderEventoProductos();
}

function renderEventoProductos() {
  const el = document.getElementById('evento-productos-list');
  if (!el) return;
  if (!eventoProductos.length) {
    el.innerHTML = '<p class="text-muted" style="font-size:12px;padding:.4rem 0">Sin productos asociados</p>';
    return;
  }
  el.innerHTML = eventoProductos.map((p, i) => `
    <div class="evento-producto-row">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500">${p.model} ${p.storage_gb || ''}GB</div>
        <div style="font-size:11px;color:var(--text-muted)">${p.color || ''} · $${fmt(p.price)}</div>
      </div>
      <label class="reserva-toggle ${p.reserved ? 'active' : ''}">
        <input type="checkbox" ${p.reserved ? 'checked' : ''} onchange="toggleEventoReserva(${i}, this.checked)" />
        ${p.reserved ? '🔒 Reservado' : 'Reservar'}
      </label>
      <button type="button" class="btn btn-danger btn-xs" onclick="removeEventoProducto(${i})">✕</button>
    </div>`).join('');
}

// Cerrar autocompletes al hacer click afuera
document.addEventListener('click', e => {
  if (!e.target.closest('#evento-lead-search') && !e.target.closest('#evento-lead-results'))
    document.getElementById('evento-lead-results')?.classList.add('hidden');
  if (!e.target.closest('#evento-producto-search') && !e.target.closest('#evento-producto-results'))
    document.getElementById('evento-producto-results')?.classList.add('hidden');
});

// ── Guardar evento ──
document.getElementById('form-new-evento')?.addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  const products = eventoProductos.map(p => ({ producto_id: p.producto_id, reserved: p.reserved }));

  try {
    if (d.id) {
      await api(`/api/calendario/${d.id}`, { method: 'PATCH', body: { ...d, products } });
      toast('Evento actualizado ✓');
    } else {
      await api('/api/calendario', { method: 'POST', body: { ...d, products } });
      const reservados = products.filter(p => p.reserved).length;
      toast(reservados > 0
        ? `Evento creado ✓ — ${reservados} producto${reservados>1?'s':''} reservado${reservados>1?'s':''}`
        : 'Evento creado ✓');
    }
    closeModal('modal-new-evento');
    loadCalendario();
    if (currentView === 'productos') loadProductos();
  } catch {}
});

// ── Detalle del evento ──
async function openEventoDetalle(id) {
  const e = await api(`/api/calendario/${id}`);
  if (!e) return;
  const productos = e.productos || [];

  document.getElementById('evento-detalle-title').textContent = e.title;
  document.getElementById('evento-detalle-body').innerHTML = `
    <div class="contact-detail">
      <div style="display:flex;gap:.5rem;margin-bottom:1rem">
        <button class="btn btn-ghost btn-sm" onclick="editEvento(${e.id});closeModal('modal-evento-detalle')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteEvento(${e.id})">Eliminar</button>
      </div>

      <div class="contact-meta-grid">
        <div class="contact-meta-item"><label>Fecha</label><span>${fmtDateFull(e.start_at)}</span></div>
        <div class="contact-meta-item"><label>Tipo</label><span>${eventoTypeLabel(e.type)}</span></div>
        ${e.contact_name ? `<div class="contact-meta-item"><label>Lead</label><span>${e.contact_name}</span></div>` : ''}
        ${e.contact_phone ? `<div class="contact-meta-item"><label>Teléfono</label><span>${e.contact_phone}</span></div>` : ''}
        ${e['seña_amount'] ? `<div class="contact-meta-item"><label>Seña</label><span style="color:var(--green)">$${fmtARS(e['seña_amount'])}</span></div>` : ''}
      </div>

      ${productos.length ? `
      <div class="contact-section">
        <div class="contact-section-title">Productos (${productos.length})</div>
        ${productos.map(p => `
          <div class="evento-producto-row" style="margin-bottom:.4rem">
            <div style="flex:1">
              <div style="font-size:13px;font-weight:500">${p.model} ${p.storage_gb || ''}GB</div>
              <div style="font-size:11px;color:var(--text-muted)">${p.color || ''} · $${fmt(p.price)} · ${prodStatusLabel(p.status)}</div>
            </div>
            <label class="reserva-toggle ${p.reserved ? 'active' : ''}">
              <input type="checkbox" ${p.reserved ? 'checked' : ''}
                onchange="toggleReservaProducto(${e.id}, ${p.producto_id}, this.checked)" />
              ${p.reserved ? '🔒 Reservado' : 'Reservar'}
            </label>
          </div>`).join('')}
      </div>` : '<p class="text-muted">Sin productos asociados</p>'}

      ${e.notes ? `<div class="contact-section"><div class="contact-section-title">Notas</div><p style="font-size:13px">${e.notes}</p></div>` : ''}
    </div>`;
  openModal('modal-evento-detalle');
}

function eventoTypeLabel(t) {
  return { visita: 'Visita', entrega: 'Entrega', 'seña': 'Seña', otro: 'Otro' }[t] || t;
}

async function toggleReservaProducto(eventId, productoId, reserved) {
  try {
    await api(`/api/calendario/${eventId}/producto/${productoId}`, {
      method: 'PATCH', body: { reserved }
    });
    toast(reserved ? 'Producto reservado 🔒' : 'Producto liberado');
    openEventoDetalle(eventId);
    loadCalendario();
    if (currentView === 'productos') loadProductos();
  } catch {}
}

async function deleteEvento(id) {
  if (!confirm('¿Eliminar el evento? Los productos reservados volverán a stock.')) return;
  try {
    await api(`/api/calendario/${id}`, { method: 'DELETE' });
    toast('Evento eliminado — productos liberados');
    closeModal('modal-evento-detalle');
    loadCalendario();
    if (currentView === 'productos') loadProductos();
  } catch {}
}

// ── Editar evento ──
async function editEvento(id) {
  const e = await api(`/api/calendario/${id}`);
  if (!e) return;

  eventoProductos = (e.productos || []).map(p => ({
    producto_id: p.producto_id, model: p.model, storage_gb: p.storage_gb,
    color: p.color, price: p.price, status: p.status, reserved: p.reserved,
  }));

  const form = document.getElementById('form-new-evento');
  form.id.value = e.id;
  form.title.value = e.title;
  form.start_at.value = e.start_at ? e.start_at.slice(0,16) : '';
  form.type.value = e.type || 'visita';
  form.sena_amount.value = e['seña_amount'] || '';
  form.notes.value = e.notes || '';

  document.getElementById('evento-modal-title').textContent = 'Editar evento';
  document.getElementById('evento-contact-id').value = e.contact_id || '';

  const chip = document.getElementById('evento-lead-selected');
  if (e.contact_name || e.contact_phone) {
    chip.innerHTML = `<span>${e.contact_name || e.contact_phone}</span>
      <button type="button" class="chip-remove" onclick="clearEventoLead()">✕</button>`;
    chip.classList.remove('hidden');
  } else {
    chip.classList.add('hidden');
  }

  renderEventoProductos();
  openModal('modal-new-evento');
}

allViewLoaders.calendario = loadCalendario;

// ═══════════════════════════════════════════════
// IMPORT / EXPORT DE STOCK
// ═══════════════════════════════════════════════
let importRows = [];

document.getElementById('import-file')?.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  importRows = parseCSV(text);

  const preview = document.getElementById('import-preview');
  const btn = document.getElementById('import-btn');

  if (!importRows.length) {
    preview.innerHTML = '<div class="import-error">No se pudieron leer filas del archivo</div>';
    preview.classList.remove('hidden');
    btn.disabled = true;
    return;
  }

  const conId = importRows.filter(r => r.id).length;
  const sinId = importRows.length - conId;

  preview.innerHTML = `
    <div class="import-preview-box">
      <div style="font-weight:600;font-size:13px;margin-bottom:.4rem">${importRows.length} filas detectadas</div>
      <div style="font-size:12px;color:var(--text-muted)">
        ${conId > 0 ? `${conId} con ID (se actualizarán)<br>` : ''}
        ${sinId > 0 ? `${sinId} sin ID (se crearán nuevos)` : ''}
      </div>
      <div style="margin-top:.5rem;font-size:11px;color:var(--text-muted)">
        Primeras filas: ${importRows.slice(0,3).map(r => r.modelo || '?').join(', ')}${importRows.length > 3 ? '...' : ''}
      </div>
    </div>`;
  preview.classList.remove('hidden');
  btn.disabled = false;
});

function parseCSV(text) {
  // Quitar BOM
  text = text.replace(/^\uFEFF/, '');
  const lines = [];
  let cur = '', inQuotes = false, row = [];

  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i+1];
    if (c === '"') {
      if (inQuotes && next === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      row.push(cur); cur = '';
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(x => x.trim())) lines.push(row);
      row = [];
    } else {
      cur += c;
    }
  }
  if (cur || row.length) { row.push(cur); if (row.some(x => x.trim())) lines.push(row); }

  if (lines.length < 2) return [];

  const headers = lines[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(l => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (l[i] || '').trim(); });
    return obj;
  });
}

async function procesarImport() {
  if (!importRows.length) return;
  const mode = document.getElementById('import-mode').value;
  const btn = document.getElementById('import-btn');
  btn.disabled = true;
  btn.textContent = 'Importando...';

  try {
    const r = await api('/api/productos/import', { method: 'POST', body: { rows: importRows, mode } });
    let msg = `${r.creados} creados`;
    if (r.actualizados) msg += `, ${r.actualizados} actualizados`;
    toast(msg + ' ✓');

    if (r.errores?.length) {
      const preview = document.getElementById('import-preview');
      preview.innerHTML = `
        <div class="import-error">
          <strong>${r.errores.length} errores:</strong><br>
          ${r.errores.slice(0,5).join('<br>')}
          ${r.errores.length > 5 ? `<br>...y ${r.errores.length - 5} más` : ''}
        </div>`;
    } else {
      closeModal('modal-import-stock');
      document.getElementById('import-file').value = '';
      document.getElementById('import-preview').classList.add('hidden');
    }
    importRows = [];
    loadProductos();
  } catch {}

  btn.disabled = false;
  btn.textContent = 'Importar productos';
}

async function seedProductos() {
  if (!confirm('¿Cargar el inventario inicial de 24 productos?\n\nNo se duplican los que ya existen.')) return;
  try {
    const r = await api('/api/productos/seed', { method: 'POST', body: {} });
    toast(r.message);
    closeModal('modal-import-stock');
    loadProductos();
  } catch {}
}

// ═══════════════════════════════════════════════
// TOGGLES DE IA Y SEGUIMIENTOS
// ═══════════════════════════════════════════════
async function toggleAI(tipo, id, value) {
  const endpoint = tipo === 'contacto' ? 'contacts' : 'clients';
  try {
    await api(`/api/${endpoint}/${id}/toggle`, {
      method: 'PATCH',
      body: { field: 'ai_enabled', value, reason: value ? null : 'Desactivado manualmente' }
    });
    toast(value ? 'IA activada 🤖' : 'IA desactivada — el agente no responderá');
    if (tipo === 'contacto') {
      if (currentView === 'contacts') loadContacts();
      if (currentView === 'pipeline') loadPipeline();
      openContact(id);
    } else {
      if (currentView === 'clientes') loadClientes();
      openCliente(id);
    }
  } catch {}
}

async function toggleSeguimientos(tipo, id, value) {
  const endpoint = tipo === 'contacto' ? 'contacts' : 'clients';
  try {
    await api(`/api/${endpoint}/${id}/toggle`, {
      method: 'PATCH', body: { field: 'followups_enabled', value }
    });
    toast(value ? 'Seguimientos activados 🔔' : 'Seguimientos desactivados');
    if (tipo === 'contacto') {
      if (currentView === 'contacts') loadContacts();
      openContact(id);
    } else {
      if (currentView === 'clientes') loadClientes();
      openCliente(id);
    }
  } catch {}
}

function renderToggles(tipo, id, aiEnabled, followupsEnabled, disabledReason) {
  return `
    <div class="toggles-panel">
      <div class="toggle-row">
        <div class="toggle-info">
          <div class="toggle-label">${aiEnabled ? '🤖' : '🔇'} Agente IA</div>
          <div class="toggle-desc">${aiEnabled
            ? 'El agente responde automáticamente en WhatsApp'
            : `Desactivado${disabledReason ? ` — ${disabledReason}` : ''}`}</div>
        </div>
        <label class="switch">
          <input type="checkbox" ${aiEnabled ? 'checked' : ''}
            onchange="toggleAI('${tipo}', ${id}, this.checked)" />
          <span class="switch-slider"></span>
        </label>
      </div>
      <div class="toggle-row">
        <div class="toggle-info">
          <div class="toggle-label">${followupsEnabled ? '🔔' : '🔕'} Seguimientos</div>
          <div class="toggle-desc">${followupsEnabled
            ? 'Recibe recordatorios y mensajes automáticos'
            : 'No se le envían seguimientos automáticos'}</div>
        </div>
        <label class="switch">
          <input type="checkbox" ${followupsEnabled ? 'checked' : ''}
            onchange="toggleSeguimientos('${tipo}', ${id}, this.checked)" />
          <span class="switch-slider"></span>
        </label>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════
// COTIZACIONES — Tabla de permuta
// ═══════════════════════════════════════════════
let cotizTab = 'tabla';
let cotizModelId = null;
let cotizModelos = [];
let cotizModelSearch = '';

document.getElementById('cotiz-model-search')?.addEventListener('input', e => {
  cotizModelSearch = e.target.value.toLowerCase();
  renderCotizModelos();
});

function switchCotizTab(tab) {
  cotizTab = tab;
  document.querySelectorAll('[data-ctab]').forEach(t => t.classList.toggle('active', t.dataset.ctab === tab));
  document.querySelectorAll('.cotiz-tab').forEach(el => el.classList.add('hidden'));
  document.getElementById(`cotiz-tab-${tab}`)?.classList.remove('hidden');
  if (tab === 'descuentos') loadDescuentos();
  if (tab === 'modificadores') loadModificadores();
}

async function loadCotizaciones() {
  cotizModelos = await api('/api/cotizaciones/modelos') || [];
  renderCotizModelos();
  await loadCalcSelects();
}

function renderCotizModelos() {
  const list = cotizModelSearch
    ? cotizModelos.filter(m => m.model_name.toLowerCase().includes(cotizModelSearch))
    : cotizModelos;

  document.getElementById('cotiz-modelos-list').innerHTML = list.length
    ? list.map(m => `
        <div class="cotiz-model-item ${m.id === cotizModelId ? 'active' : ''}" onclick="openCotizModelo(${m.id})">
          <div style="flex:1;min-width:0">
            <div style="font-weight:500;font-size:13px">${m.model_name}</div>
            <div style="font-size:11px;color:var(--text-muted)">
              ${m.total_entries} rango${m.total_entries == 1 ? '' : 's'}
              ${m.precio_min ? ` · $${fmt(m.precio_min)}${m.precio_max != m.precio_min ? `-$${fmt(m.precio_max)}` : ''}` : ''}
            </div>
          </div>
          ${m.total_entries == 0 ? '<span class="badge" style="background:#ef444420;color:var(--red)">vacío</span>' : ''}
        </div>`).join('')
    : '<p class="text-muted" style="padding:.5rem">Sin modelos</p>';
}

async function openCotizModelo(id) {
  cotizModelId = id;
  renderCotizModelos();

  const d = await api(`/api/cotizaciones/modelos/${id}`);
  if (!d) return;

  document.getElementById('cotiz-detail-empty').classList.add('hidden');
  document.getElementById('cotiz-detail-content').classList.remove('hidden');
  document.getElementById('cotiz-detail-title').textContent = d.modelo.model_name;
  document.getElementById('cotiz-detail-sub').textContent =
    `Línea ${lineLabel(d.modelo.line)} · ${d.entries.length} rangos de precio`;

  renderCotizEntries(d.entries);

  const mods = (d.modificadores || []).filter(m => m.is_active);
  document.getElementById('cotiz-mods-info').innerHTML = mods.length ? `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:.75rem 1rem">
      <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5rem">
        Modificadores que aplican
      </div>
      ${mods.map(m => `
        <div style="display:flex;justify-content:space-between;font-size:12.5px;padding:.2rem 0">
          <span>${m.name}${m.notes ? ` — ${m.notes}` : ''}</span>
          <strong style="color:${m.amount_usd > 0 ? 'var(--green)' : 'var(--text-muted)'}">
            ${m.amount_usd > 0 ? '+' : ''}$${fmt(m.amount_usd)}
          </strong>
        </div>`).join('')}
    </div>` : '';
}

function renderCotizEntries(entries) {
  const tbody = document.getElementById('cotiz-entries-body');
  tbody.innerHTML = entries.length
    ? entries.map(e => `
        <tr data-entry="${e.id}">
          <td><input type="number" class="cell-input" value="${e.storage_gb}" data-f="storage_gb" onchange="saveEntry(${e.id}, this)" /></td>
          <td class="battery-range-cell">
            <input type="number" class="cell-input cell-sm" value="${e.battery_min}" data-f="battery_min" min="0" max="100" onchange="saveEntry(${e.id}, this)" />
            <span class="range-sep">a</span>
            <input type="number" class="cell-input cell-sm" value="${e.battery_max}" data-f="battery_max" min="0" max="100" onchange="saveEntry(${e.id}, this)" />
            <span class="range-sep">%</span>
          </td>
          <td><input type="number" class="cell-input cell-price" value="${e.base_price}" data-f="base_price" step="0.01" onchange="saveEntry(${e.id}, this)" /></td>
          <td><input type="text" class="cell-input" value="${escapeHtml(e.notes || '')}" data-f="notes" placeholder="—" onchange="saveEntry(${e.id}, this)" /></td>
          <td><button class="btn btn-danger btn-xs" onclick="deleteEntry(${e.id})">✕</button></td>
        </tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:var(--text-muted)">Sin rangos cargados — agregá uno</td></tr>';
}

async function saveEntry(id, input) {
  const field = input.dataset.f;
  const value = input.value;
  input.classList.add('saving');
  try {
    await api(`/api/cotizaciones/entries/${id}`, { method: 'PATCH', body: { [field]: value } });
    input.classList.remove('saving');
    input.classList.add('saved');
    setTimeout(() => input.classList.remove('saved'), 900);
    // Refrescar lista de modelos para actualizar el rango de precios
    cotizModelos = await api('/api/cotizaciones/modelos') || [];
    renderCotizModelos();
  } catch {
    input.classList.remove('saving');
    input.classList.add('error');
    setTimeout(() => input.classList.remove('error'), 1500);
  }
}

function addEntryRow() {
  if (!cotizModelId) { toast('Seleccioná un modelo primero', 'error'); return; }
  const tbody = document.getElementById('cotiz-entries-body');
  if (tbody.querySelector('.new-row')) return;

  const tr = document.createElement('tr');
  tr.className = 'new-row';
  tr.innerHTML = `
    <td><input type="number" class="cell-input" id="new-gb" value="128" /></td>
    <td class="battery-range-cell">
      <input type="number" class="cell-input cell-sm" id="new-bmin" value="0" min="0" max="100" />
      <span class="range-sep">a</span>
      <input type="number" class="cell-input cell-sm" id="new-bmax" value="100" min="0" max="100" />
      <span class="range-sep">%</span>
    </td>
    <td><input type="number" class="cell-input cell-price" id="new-price" placeholder="0" step="0.01" /></td>
    <td><input type="text" class="cell-input" id="new-notes" placeholder="Nota opcional" /></td>
    <td style="white-space:nowrap">
      <button class="btn btn-primary btn-xs" onclick="saveNewEntry()">✓</button>
      <button class="btn btn-ghost btn-xs" onclick="this.closest('tr').remove()">✕</button>
    </td>`;
  if (tbody.querySelector('td[colspan]')) tbody.innerHTML = '';
  tbody.appendChild(tr);
  document.getElementById('new-price').focus();
}

async function saveNewEntry() {
  const body = {
    model_id: cotizModelId,
    storage_gb: document.getElementById('new-gb').value,
    battery_min: document.getElementById('new-bmin').value,
    battery_max: document.getElementById('new-bmax').value,
    base_price: document.getElementById('new-price').value,
    notes: document.getElementById('new-notes').value,
  };
  if (!body.base_price) { toast('Ingresá el precio', 'error'); return; }
  try {
    await api('/api/cotizaciones/entries', { method: 'POST', body });
    toast('Rango agregado ✓');
    openCotizModelo(cotizModelId);
    cotizModelos = await api('/api/cotizaciones/modelos') || [];
    renderCotizModelos();
  } catch {}
}

async function deleteEntry(id) {
  if (!confirm('¿Eliminar este rango?')) return;
  try {
    await api(`/api/cotizaciones/entries/${id}`, { method: 'DELETE' });
    toast('Rango eliminado');
    openCotizModelo(cotizModelId);
    cotizModelos = await api('/api/cotizaciones/modelos') || [];
    renderCotizModelos();
  } catch {}
}

// ── DESCUENTOS ──
async function loadDescuentos() {
  const d = await api('/api/cotizaciones/descuentos');
  if (!d) return;
  document.getElementById('cotiz-descuentos-body').innerHTML = d.length
    ? d.map(x => `
        <tr style="${x.is_active ? '' : 'opacity:.5'}">
          <td><input type="text" class="cell-input" value="${escapeHtml(x.name)}" data-f="name" onchange="saveDescuento(${x.id}, this)" /></td>
          <td><input type="number" class="cell-input cell-price" value="${x.amount_usd}" data-f="amount_usd" step="0.01" onchange="saveDescuento(${x.id}, this)" /></td>
          <td>
            <select class="cell-input" data-f="applies_to" onchange="saveDescuento(${x.id}, this)">
              <option value="all" ${x.applies_to === 'all' ? 'selected' : ''}>Todos</option>
              <option value="iphone11" ${x.applies_to === 'iphone11' ? 'selected' : ''}>Solo iPhone 11</option>
            </select>
          </td>
          <td><input type="text" class="cell-input" value="${escapeHtml(x.notes || '')}" data-f="notes" placeholder="—" onchange="saveDescuento(${x.id}, this)" /></td>
          <td style="text-align:center">
            <input type="checkbox" ${x.is_active ? 'checked' : ''} onchange="saveDescuentoActive(${x.id}, this.checked)" style="width:auto;cursor:pointer" />
          </td>
          <td><button class="btn btn-danger btn-xs" onclick="deleteDescuento(${x.id})">✕</button></td>
        </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:var(--text-muted)">Sin descuentos</td></tr>';
}

async function saveDescuento(id, input) {
  input.classList.add('saving');
  try {
    await api(`/api/cotizaciones/descuentos/${id}`, { method: 'PATCH', body: { [input.dataset.f]: input.value } });
    input.classList.remove('saving');
    input.classList.add('saved');
    setTimeout(() => input.classList.remove('saved'), 900);
  } catch {
    input.classList.remove('saving');
    input.classList.add('error');
  }
}

async function saveDescuentoActive(id, value) {
  await api(`/api/cotizaciones/descuentos/${id}`, { method: 'PATCH', body: { is_active: value } });
  toast(value ? 'Descuento activado' : 'Descuento desactivado');
  loadDescuentos();
}

function addDescuentoRow() {
  const tbody = document.getElementById('cotiz-descuentos-body');
  if (tbody.querySelector('.new-row')) return;
  const tr = document.createElement('tr');
  tr.className = 'new-row';
  tr.innerHTML = `
    <td><input type="text" class="cell-input" id="nd-name" placeholder="Concepto" /></td>
    <td><input type="number" class="cell-input cell-price" id="nd-amount" placeholder="0" step="0.01" /></td>
    <td><select class="cell-input" id="nd-applies"><option value="all">Todos</option><option value="iphone11">Solo iPhone 11</option></select></td>
    <td><input type="text" class="cell-input" id="nd-notes" placeholder="Nota opcional" /></td>
    <td></td>
    <td style="white-space:nowrap">
      <button class="btn btn-primary btn-xs" onclick="saveNewDescuento()">✓</button>
      <button class="btn btn-ghost btn-xs" onclick="this.closest('tr').remove()">✕</button>
    </td>`;
  if (tbody.querySelector('td[colspan]')) tbody.innerHTML = '';
  tbody.appendChild(tr);
  document.getElementById('nd-name').focus();
}

async function saveNewDescuento() {
  const body = {
    name: document.getElementById('nd-name').value,
    amount_usd: document.getElementById('nd-amount').value,
    applies_to: document.getElementById('nd-applies').value,
    notes: document.getElementById('nd-notes').value,
  };
  if (!body.name || !body.amount_usd) { toast('Completá nombre y monto', 'error'); return; }
  try {
    await api('/api/cotizaciones/descuentos', { method: 'POST', body });
    toast('Descuento agregado ✓');
    loadDescuentos();
  } catch {}
}

async function deleteDescuento(id) {
  if (!confirm('¿Eliminar este descuento?')) return;
  await api(`/api/cotizaciones/descuentos/${id}`, { method: 'DELETE' });
  toast('Descuento eliminado');
  loadDescuentos();
}

// ── MODIFICADORES ──
async function loadModificadores() {
  const m = await api('/api/cotizaciones/modificadores');
  if (!m) return;
  document.getElementById('cotiz-modificadores-body').innerHTML = m.length
    ? m.map(x => `
        <tr style="${x.is_active ? '' : 'opacity:.5'}">
          <td><input type="text" class="cell-input" value="${escapeHtml(x.name)}" data-f="name" onchange="saveModificador(${x.id}, this)" /></td>
          <td><span class="badge" style="background:#6366f120;color:var(--accent)">${x.mod_type === 'storage' ? 'Capacidad' : 'Línea'}</span></td>
          <td><input type="text" class="cell-input cell-sm" value="${x.condition}" data-f="condition" onchange="saveModificador(${x.id}, this)" /></td>
          <td><input type="number" class="cell-input cell-price" value="${x.amount_usd}" data-f="amount_usd" step="0.01" onchange="saveModificador(${x.id}, this)" /></td>
          <td class="text-muted">${x.model_name || 'Todos'}</td>
          <td style="text-align:center">
            <input type="checkbox" ${x.is_active ? 'checked' : ''} onchange="saveModActive(${x.id}, this.checked)" style="width:auto;cursor:pointer" />
          </td>
          <td><button class="btn btn-danger btn-xs" onclick="deleteModificador(${x.id})">✕</button></td>
        </tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;padding:1.5rem;color:var(--text-muted)">Sin modificadores</td></tr>';
}

async function saveModificador(id, input) {
  input.classList.add('saving');
  try {
    await api(`/api/cotizaciones/modificadores/${id}`, { method: 'PATCH', body: { [input.dataset.f]: input.value } });
    input.classList.remove('saving');
    input.classList.add('saved');
    setTimeout(() => input.classList.remove('saved'), 900);
  } catch {
    input.classList.remove('saving');
    input.classList.add('error');
  }
}

async function saveModActive(id, value) {
  await api(`/api/cotizaciones/modificadores/${id}`, { method: 'PATCH', body: { is_active: value } });
  toast(value ? 'Modificador activado' : 'Modificador desactivado');
  loadModificadores();
}

function addModificadorRow() {
  const tbody = document.getElementById('cotiz-modificadores-body');
  if (tbody.querySelector('.new-row')) return;
  const tr = document.createElement('tr');
  tr.className = 'new-row';
  tr.innerHTML = `
    <td><input type="text" class="cell-input" id="nm-name" placeholder="Nombre" /></td>
    <td><select class="cell-input" id="nm-type"><option value="storage">Capacidad</option><option value="line">Línea</option></select></td>
    <td><input type="text" class="cell-input cell-sm" id="nm-cond" placeholder="256" /></td>
    <td><input type="number" class="cell-input cell-price" id="nm-amount" placeholder="50" step="0.01" /></td>
    <td><select class="cell-input" id="nm-model"><option value="">Todos</option>${cotizModelos.map(m => `<option value="${m.id}">${m.model_name}</option>`).join('')}</select></td>
    <td></td>
    <td style="white-space:nowrap">
      <button class="btn btn-primary btn-xs" onclick="saveNewModificador()">✓</button>
      <button class="btn btn-ghost btn-xs" onclick="this.closest('tr').remove()">✕</button>
    </td>`;
  if (tbody.querySelector('td[colspan]')) tbody.innerHTML = '';
  tbody.appendChild(tr);
  document.getElementById('nm-name').focus();
}

async function saveNewModificador() {
  const body = {
    name: document.getElementById('nm-name').value,
    mod_type: document.getElementById('nm-type').value,
    condition: document.getElementById('nm-cond').value,
    amount_usd: document.getElementById('nm-amount').value,
    model_id: document.getElementById('nm-model').value || null,
  };
  if (!body.name || !body.condition || body.amount_usd === '') { toast('Completá los campos', 'error'); return; }
  try {
    await api('/api/cotizaciones/modificadores', { method: 'POST', body });
    toast('Modificador agregado ✓');
    loadModificadores();
  } catch {}
}

async function deleteModificador(id) {
  if (!confirm('¿Eliminar este modificador?')) return;
  await api(`/api/cotizaciones/modificadores/${id}`, { method: 'DELETE' });
  toast('Modificador eliminado');
  loadModificadores();
}

// ── NUEVO MODELO ──
document.getElementById('form-new-modelo')?.addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  try {
    const m = await api('/api/cotizaciones/modelos', { method: 'POST', body: d });
    toast('Modelo creado ✓');
    closeModal('modal-new-modelo');
    e.target.reset();
    cotizModelos = await api('/api/cotizaciones/modelos') || [];
    renderCotizModelos();
    if (m?.id) openCotizModelo(m.id);
  } catch {}
});

// ── CALCULADORA ──
async function loadCalcSelects() {
  const [modelos, descuentos] = await Promise.all([
    api('/api/cotizaciones/modelos'),
    api('/api/cotizaciones/descuentos'),
  ]);

  const sel = document.getElementById('calc-model');
  if (sel && modelos) {
    sel.innerHTML = '<option value="">Seleccionar...</option>' +
      modelos.map(m => `<option value="${m.id}">${m.model_name}</option>`).join('');
  }

  const div = document.getElementById('calc-discounts');
  if (div && descuentos) {
    const activos = descuentos.filter(d => d.is_active);
    div.innerHTML = activos.map(d => `
      <label class="calc-disc-item">
        <input type="checkbox" class="calc-disc" value="${d.id}" />
        <span style="flex:1">${d.name}</span>
        <span style="color:var(--red);font-weight:600">-$${fmt(d.amount_usd)}</span>
      </label>`).join('');
  }
}

async function calcularCotizacion() {
  const model_id = document.getElementById('calc-model').value;
  const storage_gb = parseInt(document.getElementById('calc-storage').value);
  const battery_pct = parseInt(document.getElementById('calc-battery').value);
  const discount_ids = [...document.querySelectorAll('.calc-disc:checked')].map(c => parseInt(c.value));

  if (!model_id) { toast('Seleccioná un modelo', 'error'); return; }

  const el = document.getElementById('calc-result');
  try {
    const r = await api('/api/cotizaciones/calcular', {
      method: 'POST', body: { model_id: parseInt(model_id), storage_gb, battery_pct, discount_ids }
    });

    el.innerHTML = `
      <div class="calc-result-box">
        <div class="calc-result-header">
          ${r.modelo.model_name} · ${r.storage_gb}GB · ${r.battery_pct}% batería
          ${r.nota_capacidad ? `<div class="calc-note">${r.nota_capacidad}</div>` : ''}
        </div>
        <div class="sale-preview-line">
          <span>Precio base <span class="text-muted">(rango ${r.rango})</span></span>
          <span>$${fmt(r.base_price)}</span>
        </div>
        ${r.modificador ? `
          <div class="sale-preview-line">
            <span>${r.modificador.name}</span>
            <span style="color:var(--green)">+$${fmt(r.modificador_amount)}</span>
          </div>` : ''}
        ${r.descuentos.map(d => `
          <div class="sale-preview-line">
            <span>${d.name}</span>
            <span style="color:var(--red)">-$${fmt(d.amount_usd)}</span>
          </div>`).join('')}
        <div class="sale-preview-line total">
          <span>Valor de toma</span>
          <span style="color:var(--green);font-size:1.15rem">$${fmt(r.valor_final)} USD</span>
        </div>
        ${r.nota_rango ? `<div class="calc-note" style="margin-top:.5rem">${r.nota_rango}</div>` : ''}
      </div>`;
    el.classList.remove('hidden');
  } catch (err) {
    el.innerHTML = `<div class="import-error">${err.message || 'No hay cotización para esa combinación'}</div>`;
    el.classList.remove('hidden');
  }
}

// ── CHECKLIST ──
async function verChecklist() {
  const items = await api('/api/cotizaciones/checklist');
  document.getElementById('checklist-body').innerHTML = `
    <p class="text-muted" style="margin-bottom:.75rem;font-size:12.5px">
      Revisá cada punto antes de confirmar el valor de toma:
    </p>
    ${(items || []).map((c, i) => `
      <label class="checklist-item">
        <input type="checkbox" style="width:auto" />
        <span>${c}</span>
      </label>`).join('')}`;
  openModal('modal-checklist');
}

// ── RESET ──
async function resetCotizaciones() {
  if (!confirm('¿Recargar la tabla oficial de ALTECH PERMUTA?\n\nEsto BORRA todos los modelos, rangos, descuentos y modificadores actuales y los reemplaza por los valores del PDF.')) return;
  try {
    const r = await api('/api/cotizaciones/reset', { method: 'POST', body: {} });
    toast(r.message);
    cotizModelId = null;
    document.getElementById('cotiz-detail-content').classList.add('hidden');
    document.getElementById('cotiz-detail-empty').classList.remove('hidden');
    loadCotizaciones();
  } catch {}
}

function lineLabel(l) {
  return { base: 'Base', plus: 'Plus', pro: 'Pro', pro_max: 'Pro Max', se: 'SE' }[l] || l;
}

allViewLoaders.cotizaciones = loadCotizaciones;
