/* ─── Altech CRM — Frontend App ──────────────── */

const API = '';
let currentView = 'dashboard';
let contactsPage = 0;
const PER_PAGE = 30;

// ─── Fetch helper ─────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { showLogin(); return null; }
  return res.ok ? res.json() : Promise.reject(await res.json());
}

// ─── Auth ──────────────────────────────────────
async function init() {
  const me = await api('/api/auth/me');
  if (me) {
    document.getElementById('user-name').textContent = me.user.name.split(' ')[0];
    showApp();
    loadView('dashboard');
  } else {
    showLogin();
  }
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
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  try {
    await api('/api/auth/login', { method: 'POST', body: { email, password } });
    showApp();
    loadView('dashboard');
    document.getElementById('user-name').textContent = email.split('@')[0];
  } catch (err) {
    const el = document.getElementById('login-error');
    el.textContent = 'Email o contraseña incorrectos';
    el.classList.remove('hidden');
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  showLogin();
});

// ─── Navigation ────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const view = item.dataset.view;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    loadView(view);
  });
});

function loadView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.classList.add('hidden');
  });
  const el = document.getElementById(`view-${view}`);
  el.classList.remove('hidden');
  el.classList.add('active');

  switch (view) {
    case 'dashboard':    loadDashboard(); break;
    case 'pipeline':     loadPipeline(); break;
    case 'contacts':     loadContacts(); break;
    case 'appointments': loadAppointments(); break;
    case 'sales':        loadSales(); break;
  }
}

// ─── Dashboard ─────────────────────────────────
async function loadDashboard() {
  const data = await api('/api/dashboard');
  if (!data) return;

  // Fecha
  document.getElementById('dashboard-date').textContent =
    new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  // KPIs
  document.getElementById('kpi-leads').textContent = data.kpis.leadsHoy;
  document.getElementById('kpi-turnos').textContent = data.kpis.turnosHoy;
  document.getElementById('kpi-ventas').textContent = data.kpis.ventasSemana.count + ' ventas';
  document.getElementById('kpi-ventas-usd').textContent = '$' + fmtUSD(data.kpis.ventasSemana.total_usd) + ' USD';
  document.getElementById('kpi-conv').textContent = data.kpis.conversionRate + '%';

  // Pipeline summary
  document.getElementById('pipeline-summary').innerHTML = data.pipeline.map(s => `
    <div class="pipeline-bar-item">
      <span class="stage-dot" style="background:${s.color}"></span>
      <span class="stage-name">${s.label}</span>
      <strong class="stage-count">${s.count}</strong>
    </div>
  `).join('') || '<p class="text-muted">Sin leads activos</p>';

  // Próximos turnos
  document.getElementById('turnos-proximos').innerHTML = data.turnosProximos.map(t => `
    <div class="turno-item">
      <div class="turno-time text-muted">${fmtTime(t.scheduled_at)}</div>
      <div class="turno-info">
        <div class="turno-name">${t.name || t.phone}</div>
        <div class="turno-product">${t.product_interested || '—'}</div>
        <div class="turno-badges">
          ${t.seña_paid ? '<span class="badge badge-seña">Seña ✓</span>' : ''}
          ${t.has_trade_in ? '<span class="badge badge-canje">Canje</span>' : ''}
        </div>
      </div>
    </div>
  `).join('') || '<p class="text-muted">Sin turnos próximos</p>';

  // Ventas recientes
  document.getElementById('ventas-recientes').innerHTML = data.ventasRecientes.map(v => `
    <div class="venta-item">
      <div style="flex:1">
        <div class="venta-name">${v.name || v.phone}</div>
        <div class="venta-product">${v.product_name}</div>
      </div>
      <div class="venta-amount">$${fmtUSD(v.price_usd)}</div>
      <div class="venta-date">${fmtDate(v.sold_at)}</div>
    </div>
  `).join('') || '<p class="text-muted">Sin ventas recientes</p>';
}

// ─── Pipeline / Kanban ─────────────────────────
async function loadPipeline() {
  const kanban = await api('/api/conversations/kanban');
  if (!kanban) return;

  document.getElementById('kanban-board').innerHTML = kanban.map(col => `
    <div class="kanban-col">
      <div class="kanban-col-header">
        <div class="kanban-col-title">
          <span class="stage-dot" style="background:${col.color}"></span>
          ${col.label}
        </div>
        <span class="kanban-count">${col.cards.length}</span>
      </div>
      <div class="kanban-cards">
        ${col.cards.length ? col.cards.map(card => `
          <div class="kanban-card" onclick="openContact(${card.contact_id})">
            <div class="kanban-card-name">${card.name || card.phone}</div>
            <div class="kanban-card-phone">${card.phone}</div>
            ${card.product_interest ? `<div class="kanban-card-product">${card.product_interest}</div>` : ''}
            <div class="kanban-card-footer">
              <span class="kanban-card-date">${fmtDate(card.last_message_at)}</span>
              ${card.has_trade_in ? '<span class="badge badge-canje">Canje</span>' : ''}
            </div>
          </div>
        `).join('') : `<p class="text-muted" style="padding:0.5rem 0">Sin leads</p>`}
      </div>
    </div>
  `).join('');
}

// ─── Contacts ──────────────────────────────────
let contactsSearch = '';
document.getElementById('contacts-search').addEventListener('input', (e) => {
  contactsSearch = e.target.value;
  contactsPage = 0;
  loadContacts();
});

async function loadContacts() {
  const params = new URLSearchParams({ limit: PER_PAGE, offset: contactsPage * PER_PAGE });
  if (contactsSearch) params.set('search', contactsSearch);

  const data = await api(`/api/contacts?${params}`);
  if (!data) return;

  document.getElementById('contacts-table-body').innerHTML = data.contacts.map(c => `
    <tr onclick="openContact(${c.id})">
      <td><strong>${c.name || '—'}</strong></td>
      <td>${c.phone}</td>
      <td>${c.city || '—'}</td>
      <td>
        ${c.stage ? `<span class="stage-pill" style="background:${c.stage_color}22;color:${c.stage_color}">${c.stage_label}</span>` : '<span class="text-muted">—</span>'}
      </td>
      <td class="text-muted">${fmtDate(c.last_message_at || c.created_at)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openContact(${c.id})">Ver</button></td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="text-muted" style="text-align:center;padding:2rem">Sin contactos</td></tr>`;

  // Paginación
  const totalPages = Math.ceil(data.total / PER_PAGE);
  document.getElementById('contacts-pagination').innerHTML = Array.from({ length: totalPages }, (_, i) => `
    <button class="${i === contactsPage ? 'active' : ''}" onclick="goContactsPage(${i})">${i + 1}</button>
  `).join('');
}

function goContactsPage(page) {
  contactsPage = page;
  loadContacts();
}

// ─── Appointments ──────────────────────────────
document.getElementById('apt-filter-status').addEventListener('change', loadAppointments);

async function loadAppointments() {
  const status = document.getElementById('apt-filter-status').value;
  const params = new URLSearchParams();
  if (status) params.set('status', status);

  const apts = await api(`/api/appointments?${params}`);
  if (!apts) return;

  document.getElementById('appointments-list').innerHTML = apts.map(a => {
    const dt = new Date(a.scheduled_at);
    return `
    <div class="appointment-card">
      <div class="apt-time">
        <div class="apt-time-hour">${dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>
        <div class="apt-time-date">${dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}</div>
      </div>
      <div class="apt-info">
        <div class="apt-name">${a.name || a.phone}</div>
        <div class="apt-product">${a.product_interested || '—'} · ${a.city || ''}</div>
        <div class="apt-badges">
          ${a.seña_paid ? '<span class="badge badge-seña">Seña pagada</span>' : ''}
          ${a.has_trade_in ? '<span class="badge badge-canje">Canje</span>' : ''}
        </div>
      </div>
      <div class="apt-status">
        <span class="status-badge status-${a.status}">${statusLabel(a.status)}</span>
        <div style="display:flex;gap:0.4rem">
          ${a.status === 'pendiente' ? `<button class="btn btn-ghost btn-sm" onclick="updateAptStatus(${a.id},'confirmado')">Confirmar</button>` : ''}
          ${a.status !== 'completado' && a.status !== 'cancelado' ? `<button class="btn btn-ghost btn-sm" onclick="updateAptStatus(${a.id},'completado')">Completado</button>` : ''}
        </div>
      </div>
    </div>
  `}).join('') || '<p class="text-muted">Sin turnos</p>';
}

async function updateAptStatus(id, status) {
  await api(`/api/appointments/${id}`, { method: 'PATCH', body: { status } });
  loadAppointments();
}

// ─── Sales ─────────────────────────────────────
async function loadSales() {
  const [sales, stats] = await Promise.all([
    api('/api/sales'),
    api('/api/sales/stats'),
  ]);
  if (!sales || !stats) return;

  // Stats
  document.getElementById('sales-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Ventas este mes</div>
      <div class="stat-value">${stats.mesActual.ventas}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total USD este mes</div>
      <div class="stat-value">$${fmtUSD(stats.mesActual.total_usd)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Ticket promedio</div>
      <div class="stat-value">$${fmtUSD(stats.mesActual.promedio_usd)}</div>
    </div>
  `;

  // Tabla
  document.getElementById('sales-table-body').innerHTML = sales.map(s => `
    <tr>
      <td class="text-muted">${fmtDate(s.sold_at)}</td>
      <td><strong>${s.name || s.phone || '—'}</strong></td>
      <td>${s.product_name}</td>
      <td style="color:var(--green);font-weight:700">$${fmtUSD(s.price_usd)}</td>
      <td>${paymentLabel(s.payment_method)} ${s.cuotas > 1 ? `(${s.cuotas}c)` : ''}</td>
      <td>${s.trade_in_value > 0 ? `$${fmtUSD(s.trade_in_value)} off` : '—'}</td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="text-muted" style="text-align:center;padding:2rem">Sin ventas</td></tr>`;
}

// ─── Contact Detail Modal ──────────────────────
async function openContact(id) {
  const data = await api(`/api/contacts/${id}`);
  if (!data) return;

  const { contact, conversations, appointments, sales } = data;

  document.getElementById('modal-contact-title').textContent =
    contact.name || contact.phone;

  document.getElementById('modal-contact-body').innerHTML = `
    <div class="contact-detail">
      <div class="contact-detail-header">
        <div class="contact-meta">
          <span class="name">${contact.name || '—'}</span>
          <span class="phone">${contact.phone}</span>
          <span class="text-muted">${contact.city || ''} · ${contact.source || ''}</span>
          ${contact.is_first_iphone !== null ? `<span class="text-muted">${contact.is_first_iphone ? 'Primer iPhone' : `Viene de: ${contact.current_device || 'iPhone'}`}</span>` : ''}
        </div>
        <div style="display:flex;gap:0.5rem">
          <a href="https://wa.me/${contact.phone.replace(/\D/g,'')}" target="_blank" class="btn btn-ghost btn-sm">WhatsApp ↗</a>
        </div>
      </div>

      ${conversations.length ? `
      <div class="detail-section">
        <h4>Conversaciones</h4>
        ${conversations.map(c => `
          <div class="timeline-item">
            <div style="flex:1">
              <span class="stage-pill" style="background:${c.stage_color}22;color:${c.stage_color}">${c.stage_label}</span>
              ${c.product_interest ? `<span style="margin-left:0.5rem;font-size:13px">${c.product_interest}</span>` : ''}
              ${c.agent_notes ? `<p class="text-muted" style="margin-top:0.3rem;font-size:12px">${c.agent_notes}</p>` : ''}
            </div>
            <span class="text-muted">${fmtDate(c.last_message_at)}</span>
          </div>
        `).join('')}
      </div>` : ''}

      ${appointments.length ? `
      <div class="detail-section">
        <h4>Turnos</h4>
        ${appointments.map(a => `
          <div class="timeline-item">
            <div style="flex:1">
              <strong>${fmtDateFull(a.scheduled_at)}</strong>
              <span style="margin-left:0.75rem" class="status-badge status-${a.status}">${statusLabel(a.status)}</span>
              ${a.product_interested ? `<p class="text-muted" style="margin-top:0.2rem;font-size:12px">${a.product_interested}</p>` : ''}
            </div>
            ${a.seña_paid ? '<span class="badge badge-seña">Seña ✓</span>' : ''}
          </div>
        `).join('')}
      </div>` : ''}

      ${sales.length ? `
      <div class="detail-section">
        <h4>Ventas</h4>
        ${sales.map(s => `
          <div class="timeline-item">
            <div style="flex:1">
              <strong>${s.product_name}</strong>
              <p class="text-muted" style="font-size:12px">${paymentLabel(s.payment_method)} ${s.cuotas > 1 ? `· ${s.cuotas} cuotas` : ''}</p>
            </div>
            <span style="color:var(--green);font-weight:700">$${fmtUSD(s.price_usd)} USD</span>
          </div>
        `).join('')}
      </div>` : ''}
    </div>
  `;

  openModal('modal-contact');
}

// ─── New Lead Form ─────────────────────────────
document.getElementById('form-new-lead').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const data = Object.fromEntries(form.entries());

  if (data.is_first_iphone === 'true') data.is_first_iphone = true;
  else if (data.is_first_iphone === 'false') data.is_first_iphone = false;
  else data.is_first_iphone = null;

  try {
    const contact = await api('/api/contacts', { method: 'POST', body: data });
    if (contact) {
      await api('/api/conversations', {
        method: 'POST',
        body: {
          contact_id: contact.id,
          product_interest: data.product_interest,
          agent_notes: data.agent_notes,
        }
      });
      closeModal('modal-new-lead');
      e.target.reset();
      if (currentView === 'pipeline') loadPipeline();
      else if (currentView === 'contacts') loadContacts();
    }
  } catch (err) {
    alert('Error: ' + err.error);
  }
});

// ─── Modals ────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ─── Format helpers ────────────────────────────
function fmtUSD(n) {
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
function statusLabel(s) {
  const labels = { pendiente: 'Pendiente', confirmado: 'Confirmado', completado: 'Completado', cancelado: 'Cancelado', no_vino: 'No vino' };
  return labels[s] || s;
}
function paymentLabel(s) {
  const labels = {
    efectivo_pesos: 'Efectivo $', efectivo_usd: 'Efectivo USD',
    transferencia: 'Transferencia', tarjeta: 'Tarjeta',
    credito_personal: 'Crédito DNI',
  };
  return labels[s] || s || '—';
}

// ─── Start ─────────────────────────────────────
init();
