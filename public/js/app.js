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
}

function renderKanban() {
  const board = document.getElementById('kanban-board');
  board.innerHTML = kanbanData.map(col => {
    const cards = pipelineSearchVal
      ? col.cards.filter(c => (c.name || '').toLowerCase().includes(pipelineSearchVal) || c.phone.includes(pipelineSearchVal))
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
          ${cards.length ? cards.map(card => `
            <div class="kanban-card" onclick="openContact(${card.contact_id})">
              <div class="kanban-card-name">${card.name || '(sin nombre)'}</div>
              <div class="kanban-card-phone">${card.phone}</div>
              ${card.product_interest ? `<div class="kanban-card-product">${card.product_interest}</div>` : ''}
              <div class="kanban-card-footer">
                <span class="kanban-card-date">${fmtRelative(card.last_message_at)}</span>
                <div class="kanban-card-actions">
                  ${card.has_trade_in ? '<span class="badge badge-canje">Canje</span>' : ''}
                  <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();openStageModal(${card.id},'${card.stage}','${card.name || card.phone}')">Mover →</button>
                </div>
              </div>
            </div>`).join('')
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
          <td><strong>${c.name || '—'}</strong></td>
          <td>${c.phone}</td>
          <td>${c.city || '—'}</td>
          <td>${c.stage ? `<span class="stage-pill" style="background:${c.stage_color}22;color:${c.stage_color}">${c.stage_label}</span>` : '<span class="text-muted">—</span>'}</td>
          <td class="text-muted">${c.product_interest || '—'}</td>
          <td class="text-muted">${fmtRelative(c.last_message_at || c.created_at)}</td>
          <td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openContact(${c.id})">Ver →</button></td>
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
  const { contact, conversations, appointments, sales } = data;

  document.getElementById('modal-contact-title').textContent = contact.name || contact.phone;
  document.getElementById('modal-contact-wa').style.display = '';
  document.getElementById('modal-contact-wa').href = `https://wa.me/${contact.phone.replace(/\D/g,'')}`;
  document.getElementById('modal-contact-wa').onclick = (e) => { e.preventDefault(); window.open(`https://wa.me/${contact.phone.replace(/\D/g,'')}`, '_blank'); };

  const activeConv = conversations.find(c => !['ganado','perdido'].includes(c.stage));

  document.getElementById('modal-contact-body').innerHTML = `
    <div class="contact-detail">

      <div class="contact-section">
        <div class="contact-meta-grid">
          <div class="contact-meta-item"><label>Teléfono</label><span>${contact.phone}</span></div>
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
            <button class="btn btn-primary btn-sm" onclick="prefillAppointment(${contact.id},'${contact.phone}');closeModal('modal-contact')">+ Turno</button>
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

// Form nuevo turno
document.getElementById('form-new-appointment').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const data = Object.fromEntries(form.entries());

  // Buscar contacto por teléfono
  try {
    const contacts = await api(`/api/contacts?search=${encodeURIComponent(data.phone)}&limit=1`);
    if (!contacts?.contacts?.length) {
      toast('No se encontró un contacto con ese teléfono. Crealo primero.', 'error');
      return;
    }
    const contact = contacts.contacts[0];

    await api('/api/appointments', {
      method: 'POST',
      body: {
        contact_id: contact.id,
        conversation_id: contact.conv_id || null,
        scheduled_at: data.scheduled_at,
        product_interested: data.product_interested,
        has_trade_in: data.has_trade_in === 'true',
        seña_paid: data.seña_paid === 'true',
        notes: data.notes,
      }
    });
    toast('Turno agendado ✓');
    closeModal('modal-new-appointment');
    e.target.reset();
    loadAppointments();
  } catch {}
});

function prefillAppointment(contactId, phone) {
  document.querySelector('#form-new-appointment [name="phone"]').value = phone;
  openModal('modal-new-appointment');
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
        </tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin ventas</td></tr>`;
}

document.getElementById('sales-filter-month').addEventListener('change', loadSales);

// Form registrar venta
document.getElementById('form-new-sale').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const data = Object.fromEntries(form.entries());

  try {
    const contacts = await api(`/api/contacts?search=${encodeURIComponent(data.phone)}&limit=1`);
    if (!contacts?.contacts?.length) {
      toast('No se encontró el contacto. Crealo primero.', 'error');
      return;
    }
    const contact = contacts.contacts[0];
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
        contact_id: contact.id,
        conversation_id: contact.conv_id || null,
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
    toast('Venta registrada ✓');
    closeModal('modal-new-sale');
    e.target.reset();
    document.getElementById('sale-total-preview').classList.add('hidden');
    document.getElementById('sale-cuotas-field').style.display = 'none';
    if (currentView === 'sales') loadSales();
    if (currentView === 'pipeline') loadPipeline();
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
          <td>${p.battery_pct ? p.battery_pct + '%' : '—'}</td>
          <td><span class="status-badge status-${p.status === 'en_stock' ? 'confirmado' : p.status === 'señado' ? 'pendiente' : 'completado'}">${prodStatusLabel(p.status)}</span></td>
          <td>$${fmt(p.price)}</td>
          <td class="text-muted">$${fmt(p.cost)}</td>
          <td style="color:var(--green);font-weight:600">$${fmt(p.profit)}</td>
          <td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openProducto(${p.id})">Ver</button></td>
        </tr>`).join('')
    : `<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin productos</td></tr>`;
}

function prodStatusLabel(s) {
  return { en_stock: 'En stock', 'señado': 'Señado', vendido: 'Vendido' }[s] || s;
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
        <div class="contact-meta-item"><label>Batería</label><span>${p.battery_pct || '—'}%</span></div>
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
          <td><strong>${c.name || ''} ${c.last_name || ''}</strong></td>
          <td>${c.dni || '—'}</td>
          <td>${c.phone || '—'}</td>
          <td>${c.city || '—'}</td>
          <td>${c.total_compras || 0}</td>
          <td style="color:var(--green);font-weight:600">$${fmt(c.total_facturado)}</td>
          <td class="text-muted">${c.birthday ? new Date(c.birthday).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}) : '—'}</td>
          <td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openCliente(${c.id})">Ver</button></td>
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
          <td><button class="btn btn-ghost btn-sm" onclick="printRecibo(${c.id})">🖨</button></td>
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
// CALENDARIO
// ═══════════════════════════════════════════════
let calMonth = new Date();

function changeMonth(delta) {
  calMonth.setMonth(calMonth.getMonth() + delta);
  loadCalendario();
}

async function loadCalendario() {
  const monthStr = calMonth.toISOString().slice(0, 7);
  document.getElementById('cal-month-label').textContent =
    calMonth.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  const eventos = await api(`/api/calendario?month=${monthStr}`);
  if (!eventos) return;

  const year = calMonth.getFullYear(), month = calMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = firstDay === 0 ? 6 : firstDay - 1;

  let html = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
    .map(d => `<div class="cal-header">${d}</div>`).join('');

  for (let i = 0; i < offset; i++) html += '<div class="cal-day empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayEvents = eventos.filter(e => e.start_at.startsWith(dateStr));
    const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();
    html += `
      <div class="cal-day ${isToday ? 'today' : ''}">
        <div class="cal-day-num">${d}</div>
        ${dayEvents.map(e => `
          <div class="cal-event" title="${e.title}">
            ${fmtTime(e.start_at)} ${e.title}
          </div>`).join('')}
      </div>`;
  }

  document.getElementById('calendar-grid').innerHTML = html;
}

document.getElementById('form-new-evento')?.addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  try {
    await api('/api/calendario', { method: 'POST', body: d });
    toast('Evento creado ✓');
    closeModal('modal-new-evento');
    e.target.reset();
    loadCalendario();
  } catch {}
});

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
// PROVEEDORES
// ═══════════════════════════════════════════════
let provSearch = '';
document.getElementById('prov-search')?.addEventListener('input', e => { provSearch = e.target.value; loadProveedores(); });

async function loadProveedores() {
  const params = new URLSearchParams();
  if (provSearch) params.set('search', provSearch);
  const provs = await api(`/api/proveedores?${params}`);
  if (!provs) return;

  document.getElementById('proveedores-list').innerHTML = provs.length
    ? provs.map(p => `
        <div class="appointment-card">
          <div class="apt-info">
            <div class="apt-name">${p.name}</div>
            <div class="apt-product">${[p.contact, p.phone, p.email].filter(Boolean).join(' · ')}</div>
            ${p.categories ? `<div class="apt-badges"><span class="badge" style="background:#6366f120;color:var(--accent)">${p.categories}</span></div>` : ''}
          </div>
          <div class="apt-actions">
            <div style="text-align:right;font-size:12px">
              <div>${p.total_pedidos} pedidos</div>
              <div style="color:var(--text-muted)">$${fmt(p.total_comprado)} comprado</div>
            </div>
          </div>
        </div>`).join('')
    : '<div class="card" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin proveedores</div>';
}

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

// ═══════════════════════════════════════════════
// COTIZACIONES
// ═══════════════════════════════════════════════
let cotizModelId = null;

async function loadCotizaciones() {
  const [modelos, descuentos] = await Promise.all([
    api('/api/cotizaciones/modelos'),
    api('/api/cotizaciones/descuentos'),
  ]);
  if (!modelos) return;

  document.getElementById('cotiz-modelos-list').innerHTML = modelos.map(m => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border);cursor:pointer"
         onclick="openCotizModelo(${m.id},'${m.model_name}')">
      <div>
        <div style="font-weight:500;font-size:13px">${m.model_name}</div>
        <div style="font-size:11px;color:var(--text-muted)">${lineLabel(m.line)}</div>
      </div>
      <span class="kanban-count">${m.total_entries}</span>
    </div>`).join('');

  document.getElementById('cotiz-descuentos-list').innerHTML = descuentos.map(d => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border)">
      <span style="font-size:13px">${d.name}</span>
      <div style="display:flex;gap:.5rem;align-items:center">
        <strong style="color:var(--red)">-$${fmt(d.amount_usd)}</strong>
        <button class="btn btn-danger btn-xs" onclick="deleteDescuento(${d.id})">✕</button>
      </div>
    </div>`).join('') || '<p class="text-muted">Sin descuentos</p>';

  // Cargar en el modal de cálculo
  const sel = document.getElementById('calc-model');
  if (sel) sel.innerHTML = '<option value="">Seleccionar...</option>' +
    modelos.map(m => `<option value="${m.id}">${m.model_name}</option>`).join('');

  const discDiv = document.getElementById('calc-discounts');
  if (discDiv) discDiv.innerHTML = descuentos.map(d => `
    <label style="display:flex;align-items:center;gap:.5rem;padding:.25rem 0;font-size:13px;cursor:pointer">
      <input type="checkbox" class="calc-disc" value="${d.id}" style="width:auto" />
      ${d.name} <span style="color:var(--red);margin-left:auto">-$${fmt(d.amount_usd)}</span>
    </label>`).join('');
}

function lineLabel(l) {
  return { base: 'Base', plus: 'Plus', pro: 'Pro', pro_max: 'Pro Max', se: 'SE' }[l] || l;
}

async function openCotizModelo(id, name) {
  cotizModelId = id;
  const data = await api(`/api/cotizaciones/modelos/${id}`);
  if (!data) return;
  document.getElementById('cotiz-detail-card').style.display = '';
  document.getElementById('cotiz-detail-title').textContent = `${name} — Rangos de cotización`;
  document.getElementById('cotiz-entries-body').innerHTML = data.entries.length
    ? data.entries.map(e => `
        <tr>
          <td>${e.storage_gb}GB</td>
          <td>${e.battery_min}% - ${e.battery_max}%</td>
          <td style="color:var(--green);font-weight:700">$${fmt(e.base_price)}</td>
          <td><button class="btn btn-danger btn-xs" onclick="deleteEntry(${e.id})">✕</button></td>
        </tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;padding:1rem;color:var(--text-muted)">Sin rangos cargados</td></tr>';
}

async function seedCotizaciones() {
  if (!confirm('¿Cargar la tabla de cotizaciones inicial? Esto sobrescribe valores existentes.')) return;
  try {
    const r = await api('/api/cotizaciones/seed', { method: 'POST' });
    toast(r.message);
    loadCotizaciones();
  } catch {}
}

async function calcularCotizacion() {
  const model_id = document.getElementById('calc-model').value;
  const storage_gb = parseInt(document.getElementById('calc-storage').value);
  const battery_pct = parseInt(document.getElementById('calc-battery').value);
  const discount_ids = [...document.querySelectorAll('.calc-disc:checked')].map(c => parseInt(c.value));

  if (!model_id) { toast('Seleccioná un modelo', 'error'); return; }

  try {
    const r = await api('/api/cotizaciones/calcular', {
      method: 'POST', body: { model_id: parseInt(model_id), storage_gb, battery_pct, discount_ids }
    });
    const el = document.getElementById('calc-result');
    el.innerHTML = `
      <div class="sale-preview-line"><span>${r.modelo.model_name} ${r.storage_gb}GB · ${r.battery_pct}%</span><span>$${fmt(r.base_price)}</span></div>
      ${r.descuentos.map(d => `<div class="sale-preview-line"><span>${d.name}</span><span style="color:var(--red)">-$${fmt(d.amount_usd)}</span></div>`).join('')}
      <div class="sale-preview-line total"><span>Valor de toma</span><span style="color:var(--green)">$${fmt(r.valor_final)} USD</span></div>
    `;
    el.classList.remove('hidden');
  } catch {}
}

async function deleteEntry(id) {
  await api(`/api/cotizaciones/entries/${id}`, { method: 'DELETE' });
  toast('Rango eliminado');
  if (cotizModelId) openCotizModelo(cotizModelId, document.getElementById('cotiz-detail-title').textContent.split(' —')[0]);
}

async function deleteDescuento(id) {
  await api(`/api/cotizaciones/descuentos/${id}`, { method: 'DELETE' });
  toast('Descuento eliminado');
  loadCotizaciones();
}

document.getElementById('form-new-descuento')?.addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  try {
    await api('/api/cotizaciones/descuentos', { method: 'POST', body: d });
    toast('Descuento creado ✓');
    closeModal('modal-new-descuento');
    e.target.reset();
    loadCotizaciones();
  } catch {}
});

document.getElementById('form-new-entry')?.addEventListener('submit', async e => {
  e.preventDefault();
  if (!cotizModelId) { toast('Seleccioná un modelo primero', 'error'); return; }
  const d = Object.fromEntries(new FormData(e.target).entries());
  try {
    await api('/api/cotizaciones/entries', { method: 'POST', body: { ...d, model_id: cotizModelId } });
    toast('Rango agregado ✓');
    closeModal('modal-new-entry');
    e.target.reset();
    openCotizModelo(cotizModelId, document.getElementById('cotiz-detail-title').textContent.split(' —')[0]);
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
            <button class="btn btn-danger btn-sm" onclick="deleteAuto(${a.id})">Eliminar</button>
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
      toast('Cliente creado ✓ — completá sus datos');
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
