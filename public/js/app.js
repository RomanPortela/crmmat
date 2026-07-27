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

  document.getElementById('kpi-leads').textContent = data.kpis.leadsHoy;
  document.getElementById('kpi-turnos').textContent = data.kpis.turnosHoy;
  document.getElementById('kpi-ventas').textContent = data.kpis.ventasSemana.count + ' ventas';
  document.getElementById('kpi-ventas-usd').textContent = '$' + fmt(data.kpis.ventasSemana.total_usd) + ' USD';
  document.getElementById('kpi-conv').textContent = data.kpis.conversionRate + '%';

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
