/* ==============================
   SUPABASE INIT
   ============================== */
const SUPABASE_URL = 'https://vdtpdwjvqabhydoxbqqg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkdHBkd2p2cWFiaHlkb3hicXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MTU0OTAsImV4cCI6MjA5OTk5MTQ5MH0.Y8Q0ohBfCdRquOOclPampF3L0Gd1j8opdfYYyxMYz_w';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ==============================
   DATA
   ============================== */
let chartInstances = {};
let selectedIds = new Set();
let auditLogCache = [];

const COLUMNS = [
  { id: 'incoming', label: 'Входящие', icon: '📥' },
  { id: 'inprogress', label: 'В работе', icon: '⚙️' },
  { id: 'done', label: 'Готово', icon: '✅' },
  { id: 'completed', label: 'Выполнено', icon: '🏁' },
  { id: 'cancelled', label: 'Отменён', icon: '❌' },
];

const DIR_MAP = { tipografia: 'Типография', promotion: 'Промоушен', repair: 'Ремонт' };
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

let calCurrentDate = new Date(2026, 6, 1);

/* ==============================
   HELPERS
   ============================== */
function fmtDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function fmtDateTime(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtMoney(n) {
  return Number(n || 0).toLocaleString('ru-RU') + ' ₸';
}
function dirLabel(d) {
  return DIR_MAP[d] || d;
}
function statusLabel(s) {
  return { paid:'Оплачено', unpaid:'Не оплачено', partial:'Частично' }[s] || s;
}
function columnLabel(c) {
  const col = COLUMNS.find(x => x.id === c);
  return col ? col.label : c;
}
function getActiveDirections() {
  const toggles = document.querySelectorAll('.direction-toggle');
  const active = [];
  toggles.forEach(t => {
    if (t.classList.contains('on')) active.push(t.dataset.dir);
  });
  return active;
}

/* ==============================
   SUPABASE HELPERS
   ============================== */
const DB = {
  async orders(filters = {}) {
    try {
      let q = sb.from('orders').select('*').eq('trashed', false);
      const dirs = getActiveDirections();
      if (dirs.length < 3 && dirs.length > 0) q = q.in('direction', dirs);
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.search) q = q.or(`client.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      if (filters.limit) q = q.limit(filters.limit);
      q = q.order('id', { ascending: false });
      const { data, error } = await q;
      if (error) { console.error('DB.orders error:', error); return []; }
      return data || [];
    } catch(e) { console.error('DB.orders exception:', e); return []; }
  },

  async trashed() {
    const { data } = await sb.from('orders').select('*').eq('trashed', true).order('deleted_at', { ascending: false });
    return data || [];
  },

  async createOrder(o) {
    const { data, error } = await sb.from('orders').insert([{
      date: o.date || new Date().toISOString().slice(0,10),
      client: o.client,
      phone: o.phone || null,
      description: o.description || o.desc || null,
      direction: o.direction || o.dir,
      total_amount: o.total_amount || o.amount || 0,
      payment_status: o.payment_status || o.payStatus || 'unpaid',
      status: o.status || o.column || 'incoming',
      source: 'manual',
    }]).select();
    if (!error && data) return data[0];
    return null;
  },

  async updateOrder(id, updates) {
    const { error } = await sb.from('orders').update(updates).eq('id', id);
    return !error;
  },

  async trashOrder(id) {
    const { error } = await sb.from('orders').update({ trashed: true, deleted_at: new Date().toISOString() }).eq('id', id);
    return !error;
  },

  async restoreOrder(id) {
    const { error } = await sb.from('orders').update({ trashed: false, deleted_at: null }).eq('id', id);
    return !error;
  },

  async deleteOrderPermanently(id) {
    const { error } = await sb.from('orders').delete().eq('id', id);
    return !error;
  },

  async templates() {
    const { data } = await sb.from('templates').select('*').order('id');
    return data || [];
  },

  async createTemplate(t) {
    const { data, error } = await sb.from('templates').insert([t]).select();
    if (!error && data) return data[0];
    return null;
  },

  async updateTemplate(id, updates) {
    const { error } = await sb.from('templates').update(updates).eq('id', id);
    return !error;
  },

  async deleteTemplate(id) {
    const { error } = await sb.from('templates').delete().eq('id', id);
    return !error;
  },

  async materials() {
    const { data } = await sb.from('materials').select('*').order('id');
    return data || [];
  },

  async clients() {
    const { data } = await sb.from('clients').select('*').order('total_orders', { ascending: false });
    return data || [];
  },

  async logAudit(type, subject, detail, orderId) {
    await sb.from('audit_log').insert([{ type, subject, detail, order_id: orderId || null }]);
  },

  async getAuditLog() {
    const { data } = await sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200);
    return data || [];
  },

  async getStats() {
    try {
      const dirs = getActiveDirections();
      let q = sb.from('orders').select('status,payment_status,total_amount').eq('trashed', false);
      if (dirs.length < 3 && dirs.length > 0) q = q.in('direction', dirs);
      const { data, error } = await q;
      if (error) { console.error('getStats error:', error); return { total:0,active:0,completed:0,revenue:0,overdue:0 }; }
      const all = data || [];
      const active = all.filter(o => !['completed','cancelled'].includes(o.status));
      const completed = all.filter(o => o.status === 'completed');
      const revenue = completed.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const overdue = all.filter(o => o.status === 'incoming').length;
      return { total: all.length, active: active.length, completed: completed.length, revenue, overdue };
    } catch(e) { console.error('getStats exception:', e); return { total:0,active:0,completed:0,revenue:0,overdue:0 }; }
  }
};

/* ==============================
   NAVIGATION
   ============================== */
async function navigateTo(pageId) {
  document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById(pageId);
  if (page) page.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (nav) nav.classList.add('active');

  const titles = {
    'kanban-page': ['Канбан-доска','Управление заказами всех направлений'],
    'calendar-page': ['Календарь','Заказы по датам'],
    'finance-page': ['Финансы','Выручка, расходы и аналитика'],
    'clients-page': ['Клиенты','История заказов и задолженности'],
    'materials-page': ['Склад','Учёт материалов и расходников'],
    'templates-page': ['Шаблоны','Быстрое создание заказов'],
    'archive-page': ['Корзина','Удалённые заказы'],
    'history-page': ['История','Все изменения в системе'],
  };
  const [title, sub] = titles[pageId] || ['Страница',''];
  document.getElementById('topbarTitle').textContent = title;
  document.getElementById('topbarSubtitle').textContent = sub;
  document.getElementById('searchInput').value = '';
  document.getElementById('batchBar').classList.remove('open');
  selectedIds.clear();

  if (pageId === 'kanban-page') renderKanban();
  else if (pageId === 'calendar-page') renderCalendar();
  else if (pageId === 'finance-page') renderFinance();
  else if (pageId === 'clients-page') renderClients();
  else if (pageId === 'materials-page') renderMaterials();
  else if (pageId === 'templates-page') renderTemplates();
  else if (pageId === 'archive-page') renderArchive();
  else if (pageId === 'history-page') renderHistory();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    if (page) navigateTo(page);
  });
});

/* ==============================
   STATS
   ============================== */
async function updateStats() {
  const all = await DB.orders();
  const dirF = document.getElementById('filterDirection').value;
  const payF = document.getElementById('filterPayment').value;
  const yearF = document.getElementById('filterYear').value;

  let filtered = all;
  if (dirF !== 'all') filtered = filtered.filter(o => o.direction === dirF);
  if (payF !== 'all') filtered = filtered.filter(o => o.payment_status === payF);
  if (yearF !== 'all') filtered = filtered.filter(o => o.date && o.date.startsWith(yearF));

  const active = filtered.filter(o => !['completed','cancelled'].includes(o.status));
  const completed = filtered.filter(o => ['completed','done'].includes(o.status));
  const revenue = completed.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const overdue = filtered.filter(o => o.deadline && new Date(o.deadline) < new Date() && !['completed','done','canceled'].includes(o.status)).length;

  document.getElementById('statActive').textContent = active.length;
  document.getElementById('statCompleted').textContent = completed.length;
  document.getElementById('statRevenue').textContent = fmtMoney(revenue);
  document.getElementById('statOverdue').textContent = overdue;
  document.getElementById('kanbanBadge').textContent = filtered.length;
}

/* ==============================
   KANBAN
   ============================== */
async function renderKanban() {
  await updateStats();
  const board = document.getElementById('kanbanBoard');
  const searchQ = (document.getElementById('searchInput').value || '').trim().toLowerCase();
  const dirF = document.getElementById('filterDirection').value;
  const payF = document.getElementById('filterPayment').value;
  const yearF = document.getElementById('filterYear').value;
  const dateFrom = document.getElementById('filterDateFrom').value;
  const dateTo = document.getElementById('filterDateTo').value;

  const all = await DB.orders({ search: searchQ || undefined });

  let filtered = all;
  if (dirF !== 'all') filtered = filtered.filter(o => o.direction === dirF);
  if (payF !== 'all') filtered = filtered.filter(o => o.payment_status === payF);
  if (yearF !== 'all') filtered = filtered.filter(o => o.date && o.date.startsWith(yearF));
  if (dateFrom) filtered = filtered.filter(o => o.date && o.date >= dateFrom);
  if (dateTo) filtered = filtered.filter(o => o.date && o.date <= dateTo);

  document.getElementById('filterCount').textContent = `Показано: ${filtered.length}`;

  board.innerHTML = '';
  COLUMNS.forEach(col => {
    const items = filtered.filter(o => o.status === col.id);
    const div = document.createElement('div');
    div.className = 'kanban-col';
    div.innerHTML = `
      <div class="kanban-col-header">
        <span>${col.icon} ${col.label}</span>
        <span class="kanban-col-count">${items.length}</span>
      </div>
      <div class="kanban-col-body" data-col="${col.id}"></div>`;
    const body = div.querySelector('.kanban-col-body');
    items.forEach(card => {
      body.appendChild(cardElement(card));
    });
    board.appendChild(div);
    setupDnD(body);
  });
}

function cardElement(order) {
  const div = document.createElement('div');
  div.className = `card${selectedIds.has(order.id) ? ' selected' : ''}`;
  div.draggable = true;
  div.dataset.id = order.id;
  const sel = selectedIds.has(order.id);
  const isOverdue = order.deadline && new Date(order.deadline) < new Date() && !['completed','done','canceled'].includes(order.status);
  const phoneStr = order.phone ? `<div class="card-phone">📞 ${order.phone}</div>` : '';
  const deadlineStr = order.deadline
    ? `<div class="card-deadline ${isOverdue ? 'overdue' : ''}">${isOverdue ? '⚠️ ' : '📅 '}${fmtDate(order.deadline)}</div>`
    : '';
  div.innerHTML = `
    <div class="card-checkbox" onclick="event.stopPropagation();toggleSelect(${order.id})">${sel ? '✓' : ''}</div>
    <div class="card-top">
      <div class="card-id">#${order.id}</div>
      <div class="card-dir ${order.direction}">${dirLabel(order.direction)}</div>
    </div>
    <div class="card-client">${order.client}</div>
    ${phoneStr}
    <div class="card-desc">${order.description || ''}</div>
    <div class="card-footer">
      <span class="card-amount">${fmtMoney(order.total_amount)}</span>
      <span class="card-pay ${order.payment_status}">${statusLabel(order.payment_status)}</span>
    </div>
    <div class="card-bottom">
      <span class="card-date">${fmtDate(order.date)}</span>
      ${deadlineStr}
    </div>`;
  div.addEventListener('click', (e) => {
    if (e.target.closest('.card-checkbox')) return;
    openDetailModal(order.id);
  });
  div.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', order.id);
    setTimeout(() => div.classList.add('dragging'), 0);
  });
  div.addEventListener('dragend', () => div.classList.remove('dragging'));
  return div;
}

function setupDnD(body) {
  body.addEventListener('dragover', (e) => {
    e.preventDefault();
    body.classList.add('drag-over');
  });
  body.addEventListener('dragleave', () => {
    body.classList.remove('drag-over');
  });
  body.addEventListener('drop', async (e) => {
    e.preventDefault();
    body.classList.remove('drag-over');
    const id = parseInt(e.dataTransfer.getData('text/plain'));
    const col = body.dataset.col;
    const { data: order } = await sb.from('orders').select('*').eq('id', id).single();
    if (order && order.status !== col) {
      const prev = order.status;
      await DB.updateOrder(id, { status: col });
      await DB.logAudit('edit', order.client, `Статус: ${columnLabel(prev)} → ${columnLabel(col)} (заказ #${id})`);
      renderKanban();
    }
  });
}

async function populateYearFilter() {
  try {
    const { data } = await sb.from('orders').select('date');
    const years = new Set();
    (data || []).forEach(o => {
      if (o.date && o.date.length >= 4) years.add(o.date.slice(0, 4));
    });
    const sorted = [...years].sort().reverse();
    ['filterYear', 'finYear'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const current = sel.value;
      sel.innerHTML = '<option value="all">Все года</option>';
      sorted.forEach(y => { sel.innerHTML += `<option value="${y}">${y}</option>`; });
      sel.value = current;
    });
  } catch(e) { console.error('populateYearFilter error:', e); }
}

function clearFilters() {
  document.getElementById('filterDirection').value = 'all';
  document.getElementById('filterPayment').value = 'all';
  document.getElementById('filterYear').value = 'all';
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';
  document.getElementById('searchInput').value = '';
  renderKanban();
}
function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  updateBatchBar();
  renderKanban();
}
function clearSelection() {
  selectedIds.clear();
  updateBatchBar();
  renderKanban();
}
function updateBatchBar() {
  const bar = document.getElementById('batchBar');
  const count = selectedIds.size;
  document.getElementById('batchCount').textContent = count;
  if (count > 0) bar.classList.add('open');
  else bar.classList.remove('open');
}
async function batchStatus(status) {
  for (const id of selectedIds) {
    await DB.updateOrder(id, { payment_status: status });
    await DB.logAudit('edit', `Заказ #${id}`, `Оплата: ${statusLabel(status)}`);
  }
  clearSelection();
}
async function batchMove(col) {
  for (const id of selectedIds) {
    const { data: order } = await sb.from('orders').select('status').eq('id', id).single();
    if (order) {
      const prev = order.status;
      await DB.updateOrder(id, { status: col });
      await DB.logAudit('edit', `Заказ #${id}`, `Статус: ${columnLabel(prev)} → ${columnLabel(col)}`);
    }
  }
  clearSelection();
}
async function batchTrash() {
  for (const id of selectedIds) {
    const { data: order } = await sb.from('orders').select('client,description').eq('id', id).single();
    if (order) {
      await DB.trashOrder(id);
      await DB.logAudit('delete', order.client, `Удалён заказ #${id} — ${order.description}`);
    }
  }
  clearSelection();
}

function filterCards() {
  renderKanban();
}

/* ==============================
   DETAIL MODAL
   ============================== */
async function openDetailModal(id) {
  window._detailOrderId = id;
  const modal = document.getElementById('detailModal');
  modal.classList.add('open');
  document.getElementById('detailModalTitle').textContent = `Заказ #${id}`;

  const { data: o } = await sb.from('orders').select('*').eq('id', id).single();
  if (!o) return;

  document.getElementById('detailClient').textContent = o.client;
  document.getElementById('detailPhone').textContent = o.phone || '—';
  document.getElementById('detailDirection').innerHTML = `<span class="material-tag ${o.direction}">${dirLabel(o.direction)}</span>`;
  document.getElementById('detailAmount').textContent = fmtMoney(o.total_amount);
  document.getElementById('detailPayment').textContent = statusLabel(o.payment_status);
  if (o.payment_status === 'paid') document.getElementById('detailPayment').style.color = 'var(--green)';
  else if (o.payment_status === 'unpaid') document.getElementById('detailPayment').style.color = 'var(--danger)';
  else document.getElementById('detailPayment').style.color = 'var(--yellow)';

  document.getElementById('detailStatus').textContent = columnLabel(o.status);
  document.getElementById('detailDate').textContent = fmtDate(o.date) || '—';
  document.getElementById('detailDeadline').textContent = o.deadline ? fmtDate(o.deadline) : '—';
  document.getElementById('detailDelivery').textContent = o.delivery_cost ? fmtMoney(o.delivery_cost) : '—';
  document.getElementById('detailMaterials').textContent = o.material_cost ? fmtMoney(o.material_cost) : '—';
  document.getElementById('detailDesc').textContent = o.description || '—';

  const { data: logs } = await sb.from('audit_log').select('*').ilike('detail', `%#${id}%`).order('created_at', { ascending: false }).limit(20);
  const history = document.getElementById('detailHistory');
  if (logs && logs.length) {
    history.innerHTML = logs.map(l => `
      <div class="detail-history-item">
        <div class="detail-history-time">${fmtDateTime(l.created_at)}</div>
        <div class="detail-history-text">${l.description}</div>
      </div>
    `).join('');
  } else {
    history.innerHTML = '<div style="font-size:13px;color:var(--text-dim)">История изменений отсутствует</div>';
  }
}
function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('open');
}

/* ==============================
   ORDER MODAL
   ============================== */
async function openOrderModal(id) {
  const modal = document.getElementById('orderModal');
  modal.classList.add('open');
  const title = document.getElementById('orderModalTitle');
  const saveBtn = document.getElementById('orderModalSaveBtn');
  document.getElementById('fEditId').value = '';

  document.getElementById('fClient').value = '';
  document.getElementById('fPhone').value = '';
  document.getElementById('fDirection').value = 'tipografia';
  document.getElementById('fAmount').value = '';
  document.getElementById('fDesc').value = '';
  document.getElementById('fPayStatus').value = 'unpaid';
  document.getElementById('fColumn').value = 'incoming';

  if (id) {
    const { data: o } = await sb.from('orders').select('*').eq('id', id).single();
    if (!o) return;
    title.textContent = 'Редактировать заказ';
    saveBtn.textContent = 'Сохранить';
    document.getElementById('fEditId').value = id;
    document.getElementById('fClient').value = o.client;
    document.getElementById('fPhone').value = o.phone || '';
    document.getElementById('fDirection').value = o.direction;
    document.getElementById('fAmount').value = o.total_amount;
    document.getElementById('fDesc').value = o.description || '';
    document.getElementById('fPayStatus').value = o.payment_status;
    document.getElementById('fColumn').value = o.status;
  } else {
    title.textContent = 'Новый заказ';
    saveBtn.textContent = 'Создать заказ';
  }
  const tpls = await DB.templates();
  const sel = document.getElementById('fTemplate');
  sel.innerHTML = '<option value="">— Без шаблона —</option>';
  tpls.forEach(t => {
    sel.innerHTML += `<option value="${t.id}">${t.name}</option>`;
  });
}
function closeOrderModal() {
  document.getElementById('orderModal').classList.remove('open');
}
async function saveOrder() {
  const id = parseInt(document.getElementById('fEditId').value);
  const client = document.getElementById('fClient').value.trim();
  if (!client) { alert('Введите имя клиента'); return; }
  const data = {
    client,
    phone: document.getElementById('fPhone').value.trim() || null,
    direction: document.getElementById('fDirection').value,
    total_amount: parseFloat(document.getElementById('fAmount').value) || 0,
    description: document.getElementById('fDesc').value.trim() || null,
    payment_status: document.getElementById('fPayStatus').value,
    status: document.getElementById('fColumn').value,
  };
  if (id) {
    const { data: old } = await sb.from('orders').select('*').eq('id', id).single();
    if (old) {
      const changes = [];
      if (old.client !== data.client) changes.push(`Клиент: ${old.client} → ${data.client}`);
      if (old.total_amount !== data.total_amount) changes.push(`Сумма: ${old.total_amount} → ${data.total_amount}`);
      if (old.status !== data.status) changes.push(`Статус: ${columnLabel(old.status)} → ${columnLabel(data.status)}`);
      await DB.updateOrder(id, data);
      await DB.logAudit('edit', data.client, changes.join('; ') || `Изменён заказ #${id}`);
    }
  } else {
    const created = await DB.createOrder({ ...data, date: new Date().toISOString().slice(0,10) });
    if (created) {
      await DB.logAudit('create', data.client, `Создан заказ #${created.id} — ${data.description || ''}`);
    }
  }
  closeOrderModal();
  navigateTo('kanban-page');
}
async function applyTemplate() {
  const tplId = parseInt(document.getElementById('fTemplate').value);
  if (!tplId) return;
  const { data: t } = await sb.from('templates').select('*').eq('id', tplId).single();
  if (!t) return;
  if (!document.getElementById('fEditId').value) {
    document.getElementById('fClient').value = '';
    document.getElementById('fPhone').value = '';
  }
  document.getElementById('fDirection').value = t.direction;
  document.getElementById('fAmount').value = t.amount;
  document.getElementById('fDesc').value = t.description;
}

/* ==============================
   NOTIFICATIONS
   ============================== */
async function toggleNotifications(e) {
  e.stopPropagation();
  const dd = document.getElementById('notifDropdown');
  dd.classList.toggle('open');
  if (!dd.classList.contains('open')) return;
  const list = document.getElementById('notifList');
  list.innerHTML = '<div class="notif-item"><em>Загрузка...</em></div>';
  const items = [];

  const all = await DB.orders();
  const mats = await DB.materials();

  const overdue = all.filter(o => o.deadline && new Date(o.deadline) < new Date() && !['completed','done','canceled'].includes(o.status));
  overdue.slice(0, 5).forEach(o => items.push({ text: `Просрочен заказ #${o.id} (${o.client})`, time: fmtDate(o.deadline) }));

  const criticalMats = mats.filter(m => m.quantity <= m.min_level);
  criticalMats.slice(0, 5).forEach(m => items.push({ text: `Малый запас: ${m.name} — ${m.quantity} ${m.unit}`, time: 'Склад' }));

  const unpaid = all.filter(o => o.payment_status === 'unpaid' && o.total_amount > 0);
  unpaid.slice(0, 5).forEach(o => items.push({ text: `Не оплачен #${o.id} (${o.client}) на ${fmtMoney(o.total_amount)}`, time: 'Финансы' }));

  list.innerHTML = items.length
    ? items.map(i => `<div class="notif-item"><div>${i.text}</div><div class="notif-time">${i.time}</div></div>`).join('')
    : '<div class="notif-item"><div>Всё хорошо, уведомлений нет</div></div>';
  document.getElementById('notifCount').textContent = items.length || '';
}
document.addEventListener('click', () => {
  document.getElementById('notifDropdown').classList.remove('open');
});
function clearNotifications() {
  document.getElementById('notifList').innerHTML = '';
  document.getElementById('notifCount').textContent = '0';
  document.getElementById('notifDropdown').classList.remove('open');
}

/* ==============================
   CALENDAR
   ============================== */
async function renderCalendar() {
  const grid = document.getElementById('calGrid');
  const year = calCurrentDate.getFullYear();
  const month = calCurrentDate.getMonth();
  document.getElementById('calMonthTitle').textContent = `${MONTHS_RU[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = (firstDay.getDay() + 6) % 7;
  const totalDays = lastDay.getDate();
  const today = new Date();

  grid.innerHTML = '';
  for (let i = 0; i < startPad; i++) {
    const d = document.createElement('div');
    d.className = 'cal-day other';
    grid.appendChild(d);
  }

  const orders = await DB.orders();
  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const div = document.createElement('div');
    div.className = 'cal-day';
    if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) div.classList.add('today');

    const num = document.createElement('div');
    num.className = 'cal-day-num';
    num.textContent = day;
    div.appendChild(num);

    const events = orders.filter(o => o.date && o.date.startsWith(dateStr));
    events.forEach(e => {
      const pill = document.createElement('div');
      pill.className = `cal-event-pill ${e.direction}`;
      pill.textContent = `${e.client} — ${fmtMoney(e.total_amount)}`;
      pill.title = `${e.client}: ${e.description || ''}`;
      pill.onclick = () => openOrderModal(e.id);
      div.appendChild(pill);
    });
    grid.appendChild(div);
  }

  const remaining = (7 - ((startPad + totalDays) % 7)) % 7;
  for (let i = 0; i < remaining; i++) {
    const d = document.createElement('div');
    d.className = 'cal-day other';
    grid.appendChild(d);
  }
}

document.getElementById('calPrevBtn').addEventListener('click', () => {
  calCurrentDate.setMonth(calCurrentDate.getMonth() - 1);
  renderCalendar();
});
document.getElementById('calNextBtn').addEventListener('click', () => {
  calCurrentDate.setMonth(calCurrentDate.getMonth() + 1);
  renderCalendar();
});
document.getElementById('calTodayBtn').addEventListener('click', () => {
  calCurrentDate = new Date();
  calCurrentDate.setDate(1);
  renderCalendar();
});

/* ==============================
   FINANCE
   ============================== */
async function renderFinance() {
  const all = await DB.orders();
  const dirF = document.getElementById('finDirection').value;
  const yearF = document.getElementById('finYear').value;
  const monthF = document.getElementById('finMonth').value;
  const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];

  let filtered = all;
  if (dirF !== 'all') filtered = filtered.filter(o => o.direction === dirF);
  if (yearF !== 'all') filtered = filtered.filter(o => o.date && o.date.startsWith(yearF));
  if (monthF !== 'all') filtered = filtered.filter(o => o.date && parseInt(o.date.split('-')[1]) === parseInt(monthF));

  const completed = filtered.filter(o => o.status === 'completed');
  const totalRevenue = completed.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const debts = filtered.filter(o => o.payment_status === 'unpaid').reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const expenses = filtered.reduce((s, o) => s + (Number(o.delivery_cost || 0) + Number(o.material_cost || 0)), 0) || Math.round(totalRevenue * 0.35);
  const profit = totalRevenue - expenses;

  const periodText = yearF !== 'all' ? (monthF !== 'all' ? `${months[parseInt(monthF)-1]} ${yearF}` : `${yearF}`) : 'за всё время';
  document.getElementById('finRevPeriod').textContent = periodText;
  document.getElementById('finExpPeriod').textContent = periodText;
  document.getElementById('finProfitPeriod').textContent = periodText;
  document.getElementById('finDebtPeriod').textContent = periodText;
  document.querySelectorAll('.fin-stat-value')[0].textContent = fmtMoney(totalRevenue);
  document.querySelectorAll('.fin-stat-value')[1].textContent = fmtMoney(expenses);
  document.querySelectorAll('.fin-stat-value')[2].textContent = fmtMoney(profit);
  document.querySelectorAll('.fin-stat-value')[3].textContent = fmtMoney(debts);

  if (chartInstances.revenue) chartInstances.revenue.destroy();
  if (chartInstances.pnl) chartInstances.pnl.destroy();
  if (chartInstances.dir) chartInstances.dir.destroy();

  document.getElementById('finRevSubtitle').textContent = yearF !== 'all' ? `по месяцам ${yearF}` : 'по месяцам';
  document.getElementById('finPnlSubtitle').textContent = periodText;

  const revByMonth = Array(12).fill(0);
  let yearFilter = all;
  if (dirF !== 'all') yearFilter = yearFilter.filter(o => o.direction === dirF);
  if (yearF !== 'all') yearFilter = yearFilter.filter(o => o.date && o.date.startsWith(yearF));
  yearFilter.forEach(o => {
    if (!o.date) return;
    const m = new Date(o.date).getMonth();
    if (m >= 0 && m < 12) revByMonth[m] += Number(o.total_amount || 0);
  });

  chartInstances.revenue = new Chart(document.getElementById('revenueChart'), {
    type: 'line',
    data: { labels: months, datasets: [{ label: 'Выручка', data: revByMonth, borderColor: '#6c5ce7', backgroundColor: 'rgba(108,92,231,.1)', fill: true, tension: .3, pointBackgroundColor: '#6c5ce7' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8a8a92' } } }, scales: { x: { ticks: { color: '#5a5a62' }, grid: { color: '#2c2c30' } }, y: { ticks: { color: '#5a5a62', callback: v => (v/1000).toFixed(0)+'k' }, grid: { color: '#2c2c30' } } } }
  });

  const dirRev = { tipografia: 0, promotion: 0, repair: 0 };
  const dirExp = { tipografia: 0, promotion: 0, repair: 0 };
  filtered.forEach(o => {
    const amt = Number(o.total_amount || 0);
    if (dirRev.hasOwnProperty(o.direction)) dirRev[o.direction] += amt;
    const exp = Number(o.delivery_cost || 0) + Number(o.material_cost || 0);
    if (dirExp.hasOwnProperty(o.direction)) dirExp[o.direction] += exp;
  });

  chartInstances.pnl = new Chart(document.getElementById('pnlChart'), {
    type: 'bar',
    data: { labels: ['Типография','Промоушен','Ремонт'], datasets: [
      { label: 'Выручка', data: [dirRev.tipografia, dirRev.promotion, dirRev.repair], backgroundColor: '#28c76f' },
      { label: 'Расходы', data: [dirExp.tipografia, dirExp.promotion, dirExp.repair], backgroundColor: '#ef4444' }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8a8a92' } } }, scales: { x: { ticks: { color: '#5a5a62' }, grid: { color: '#2c2c30' } }, y: { ticks: { color: '#5a5a62' }, grid: { color: '#2c2c30' } } } }
  });

  const totalDir = dirRev.tipografia + dirRev.promotion + dirRev.repair || 1;
  chartInstances.dir = new Chart(document.getElementById('directionChart'), {
    type: 'doughnut',
    data: { labels: ['Типография','Промоушен','Ремонт'], datasets: [{ data: [
      Math.round(dirRev.tipografia / totalDir * 100),
      Math.round(dirRev.promotion / totalDir * 100),
      Math.round(dirRev.repair / totalDir * 100)
    ], backgroundColor: ['#28c76f','#3b82f6','#f59e0b'], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#8a8a92', padding: 12 } } }, cutout: '65%' }
  });
}

/* ==============================
   CLIENTS
   ============================== */
async function renderClients() {
  const grid = document.getElementById('clientsGrid');
  const tableBody = document.getElementById('clientsTableBody');
  const searchQ = (document.getElementById('clientSearch').value || '').trim().toLowerCase();
  const dirF = document.getElementById('clientDirFilter').value;
  const allOrders = await DB.orders();
  const colors = ['#6c5ce7','#3b82f6','#28c76f','#f59e0b','#ef4444','#f97316'];
  const isTableView = document.getElementById('clientsTable').style.display !== 'none';

  const clientMap = {};
  allOrders.forEach(o => {
    const name = o.client.trim();
    if (!name || name.length < 2) return;
    if (dirF !== 'all' && o.direction !== dirF) return;
    if (!clientMap[name]) clientMap[name] = { name, orders: [], phones: new Set(), directions: new Set(), debt: 0 };
    clientMap[name].orders.push(o);
    if (o.phone) clientMap[name].phones.add(o.phone);
    clientMap[name].directions.add(o.direction);
    if (o.payment_status === 'unpaid') clientMap[name].debt += Number(o.total_amount || 0);
  });

  let clients = Object.values(clientMap).sort((a,b) => b.orders.length - a.orders.length);
  if (searchQ) clients = clients.filter(c => c.name.toLowerCase().includes(searchQ));

  if (isTableView) {
    grid.style.display = 'none';
    const tbl = document.getElementById('clientsTable');
    tbl.style.display = '';
    tableBody.innerHTML = clients.map(c => {
      const totalAmt = c.orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const doneCount = c.orders.filter(o => ['done','completed'].includes(o.status)).length;
      const dirStr = [...c.directions].map(d => dirLabel(d)).join(', ');
      return `<tr>
        <td><span style="font-weight:500">${c.name}</span></td>
        <td>${[...c.phones][0] || ''}</td>
        <td>${dirStr}</td>
        <td>${c.orders.length}</td>
        <td>${fmtMoney(totalAmt)}</td>
        <td>${doneCount}</td>
        <td style="color:${c.debt > 0 ? 'var(--danger)' : 'var(--green)'}">${c.debt > 0 ? fmtMoney(c.debt) : 'Нет'}</td>
      </tr>`;
    }).join('');
    document.getElementById('clientViewToggle').textContent = 'Карточки';
  } else {
    grid.style.display = '';
    document.getElementById('clientsTable').style.display = 'none';
    grid.innerHTML = '';
    clients.forEach((c, i) => {
      const totalAmt = c.orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const doneCount = c.orders.filter(o => ['done','completed'].includes(o.status)).length;
      const color = colors[i % colors.length];
      const card = document.createElement('div');
      card.className = 'client-card';
      card.innerHTML = `
        <div class="client-header">
          <div class="client-avatar" style="background:${color}22;color:${color}">${c.name[0]}</div>
          <div>
            <div class="client-name">${c.name}</div>
            <div class="client-phone">${[...c.phones][0] || ''}</div>
            <div class="client-debt ${c.debt > 0 ? 'positive' : 'zero'}">${c.debt > 0 ? 'Долг: ' + fmtMoney(c.debt) : 'Долгов нет'}</div>
          </div>
        </div>
        <div class="client-stats">
          <div class="client-stat"><div class="client-stat-value green">${c.orders.length}</div><div class="client-stat-label">Заказов</div></div>
          <div class="client-stat"><div class="client-stat-value blue">${fmtMoney(totalAmt)}</div><div class="client-stat-label">На сумму</div></div>
          <div class="client-stat"><div class="client-stat-value yellow">${doneCount}</div><div class="client-stat-label">Выполнено</div></div>
        </div>`;
      grid.appendChild(card);
    });
    document.getElementById('clientViewToggle').textContent = 'Таблица';
  }
}

function toggleClientView() {
  const tbl = document.getElementById('clientsTable');
  tbl.style.display = tbl.style.display === 'none' ? '' : 'none';
  renderClients();
}

/* ==============================
   MATERIALS
   ============================== */
async function renderMaterials() {
  const body = document.getElementById('materialsBody');
  const mats = await DB.materials();
  body.innerHTML = '';

  let normal = 0, low = 0, critical = 0;
  mats.forEach(m => {
    const st = m.quantity >= m.min_level * 2 ? 'ok' : m.quantity >= m.min_level ? 'low' : 'critical';
    if (st === 'ok') normal++;
    else if (st === 'low') low++;
    else critical++;
  });
  document.querySelector('.materials-wrapper .mat-stat:nth-child(1) .mat-stat-value').textContent = mats.length;
  document.querySelector('.materials-wrapper .mat-stat:nth-child(2) .mat-stat-value').textContent = normal;
  document.querySelector('.materials-wrapper .mat-stat:nth-child(3) .mat-stat-value').textContent = low;
  document.querySelector('.materials-wrapper .mat-stat:nth-child(4) .mat-stat-value').textContent = critical;

  mats.forEach(m => {
    const pct = m.min_level > 0 ? Math.min(100, Math.round(m.quantity / m.min_level * 50)) : 50;
    const status = m.quantity >= m.min_level * 2 ? 'ok' : m.quantity >= m.min_level ? 'low' : 'critical';
    const label = m.quantity >= m.min_level * 2 ? 'Норма' : m.quantity >= m.min_level ? 'Мало' : 'Критично';
    const color = status === 'ok' ? 'var(--green)' : status === 'low' ? 'var(--yellow)' : 'var(--danger)';
    const stockClass = status;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="material-name" style="cursor:pointer" onclick="editMaterial(${m.id})">${m.name}</span></td>
      <td><span class="material-tag ${m.direction}">${dirLabel(m.direction)}</span></td>
      <td><span class="material-stock ${stockClass}">${m.quantity} ${m.unit}</span></td>
      <td>${m.min_level} ${m.unit}</td>
      <td><div class="stock-bar-wrap"><div class="stock-bar"><div class="stock-bar-inner ${stockClass}" style="width:${pct}%"></div></div><span style="font-size:11px;color:${color}">${label}</span></div></td>
      <td><span class="material-price">${fmtMoney(m.purchase_price)}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="openMovementModal(${m.id},'income')" title="Приход">+</button>
        <button class="btn btn-ghost btn-sm" onclick="openMovementModal(${m.id},'expense')" title="Расход">−</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMaterial(${m.id})" title="Удалить">&times;</button>
      </td>`;
    body.appendChild(tr);
  });
}

function openMaterialModal(id) {
  const modal = document.getElementById('materialModal');
  modal.classList.add('open');
  document.getElementById('matEditId').value = id || '';
  if (id) {
    sb.from('materials').select('*').eq('id', id).single().then(({ data: m }) => {
      if (!m) return;
      document.getElementById('matModalTitle').textContent = 'Редактировать материал';
      document.getElementById('matName').value = m.name;
      document.getElementById('matDirection').value = m.direction;
      document.getElementById('matUnit').value = m.unit || '';
      document.getElementById('matQty').value = m.quantity;
      document.getElementById('matMin').value = m.min_level;
      document.getElementById('matPrice').value = m.purchase_price;
    });
  } else {
    document.getElementById('matModalTitle').textContent = 'Новый материал';
    ['matName','matUnit','matQty','matMin','matPrice'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('matDirection').value = 'tipografia';
  }
}
function closeMaterialModal() {
  document.getElementById('materialModal').classList.remove('open');
}
async function saveMaterial() {
  const id = parseInt(document.getElementById('matEditId').value);
  const name = document.getElementById('matName').value.trim();
  if (!name) { alert('Введите название материала'); return; }
  const data = {
    name,
    direction: document.getElementById('matDirection').value,
    unit: document.getElementById('matUnit').value.trim() || 'шт',
    quantity: parseFloat(document.getElementById('matQty').value) || 0,
    min_level: parseFloat(document.getElementById('matMin').value) || 0,
    purchase_price: parseFloat(document.getElementById('matPrice').value) || 0,
  };
  if (id) {
    await sb.from('materials').update(data).eq('id', id);
  } else {
    await sb.from('materials').insert(data);
  }
  closeMaterialModal();
  await renderMaterials();
}
function editMaterial(id) { openMaterialModal(id); }
async function deleteMaterial(id) {
  if (!confirm('Удалить материал?')) return;
  await sb.from('materials').delete().eq('id', id);
  await renderMaterials();
}

function openMovementModal(materialId, type) {
  const modal = document.getElementById('movementModal');
  modal.classList.add('open');
  document.getElementById('movMaterialId').value = materialId;
  document.getElementById('movType').value = type;
  document.getElementById('movQty').value = '';
  sb.from('materials').select('name,quantity,unit').eq('id', materialId).single().then(({ data: m }) => {
    if (!m) return;
    document.getElementById('movementModal').querySelector('.modal-title').textContent =
      type === 'income' ? 'Приход материала' : 'Расход материала';
    document.getElementById('movMaterialName').textContent = `${m.name} (сейчас: ${m.quantity} ${m.unit})`;
  });
}
function closeMovementModal() { document.getElementById('movementModal').classList.remove('open'); }
async function saveMovement() {
  const id = parseInt(document.getElementById('movMaterialId').value);
  const type = document.getElementById('movType').value;
  const qty = parseFloat(document.getElementById('movQty').value);
  if (!qty || qty <= 0) { alert('Введите корректное количество'); return; }
  const { data: m } = await sb.from('materials').select('*').eq('id', id).single();
  if (!m) return;
  const newQty = type === 'income' ? m.quantity + qty : m.quantity - qty;
  if (newQty < 0) { alert('Недостаточно материала на складе!'); return; }
  await sb.from('materials').update({ quantity: newQty }).eq('id', id);
  closeMovementModal();
  await renderMaterials();
}

/* ==============================
   TEMPLATES
   ============================== */
async function renderTemplates() {
  const grid = document.getElementById('tplGrid');
  const tpls = await DB.templates();
  grid.innerHTML = '';
  tpls.forEach(t => {
    const card = document.createElement('div');
    card.className = 'tpl-card';
    card.innerHTML = `
      <div class="tpl-card-header">
        <span class="tpl-card-name">${t.name}</span>
        <span class="tpl-card-dir ${t.direction}">${dirLabel(t.direction)}</span>
      </div>
      <div class="tpl-card-desc">${t.description || ''}</div>
      <div class="tpl-card-footer">
        <span class="tpl-card-amount">${fmtMoney(t.amount)}</span>
        <div class="tpl-card-actions">
          <button class="btn btn-ghost btn-sm" onclick="useTemplate(${t.id})">Использовать</button>
          <button class="btn btn-ghost btn-sm" onclick="editTemplate(${t.id})">Ред.</button>
          <button class="btn btn-danger btn-sm" onclick="deleteTemplate(${t.id})">Удал.</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

async function openTemplateModal(id) {
  const modal = document.getElementById('templateModal');
  modal.classList.add('open');
  document.getElementById('tplEditId').value = id || '';
  if (id) {
    const { data: t } = await sb.from('templates').select('*').eq('id', id).single();
    if (!t) return;
    document.getElementById('tplModalTitle').textContent = 'Редактировать шаблон';
    document.getElementById('tplName').value = t.name;
    document.getElementById('tplDirection').value = t.direction;
    document.getElementById('tplAmount').value = t.amount;
    document.getElementById('tplDesc').value = t.description || '';
  } else {
    document.getElementById('tplModalTitle').textContent = 'Новый шаблон';
    document.getElementById('tplName').value = '';
    document.getElementById('tplDirection').value = 'tipografia';
    document.getElementById('tplAmount').value = '';
    document.getElementById('tplDesc').value = '';
  }
}
function closeTemplateModal() {
  document.getElementById('templateModal').classList.remove('open');
}
async function saveTemplate() {
  const id = parseInt(document.getElementById('tplEditId').value);
  const name = document.getElementById('tplName').value.trim();
  if (!name) { alert('Введите название шаблона'); return; }
  const data = {
    name,
    direction: document.getElementById('tplDirection').value,
    amount: parseFloat(document.getElementById('tplAmount').value) || 0,
    description: document.getElementById('tplDesc').value.trim(),
  };
  if (id) {
    await DB.updateTemplate(id, data);
    await DB.logAudit('edit', name, `Изменён шаблон #${id}`);
  } else {
    const created = await DB.createTemplate(data);
    if (created) await DB.logAudit('create', name, `Создан шаблон #${created.id}`);
  }
  closeTemplateModal();
  navigateTo('templates-page');
}
async function useTemplate(id) {
  const { data: t } = await sb.from('templates').select('*').eq('id', id).single();
  if (!t) return;
  closeTemplateModal();
  openOrderModal();
  document.getElementById('fDirection').value = t.direction;
  document.getElementById('fAmount').value = t.amount;
  document.getElementById('fDesc').value = t.description;
}
function editTemplate(id) {
  openTemplateModal(id);
}
async function deleteTemplate(id) {
  if (!confirm('Удалить шаблон?')) return;
  const { data: t } = await sb.from('templates').select('name').eq('id', id).single();
  await DB.deleteTemplate(id);
  if (t) await DB.logAudit('delete', t.name, `Удалён шаблон #${id}`);
  navigateTo('templates-page');
}

/* ==============================
   ARCHIVE
   ============================== */
async function renderArchive() {
  const body = document.getElementById('archiveBody');
  const empty = document.getElementById('archiveEmpty');
  const trashed = await DB.trashed();
  document.getElementById('trashBadge').textContent = trashed.length;
  body.innerHTML = '';
  if (trashed.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  trashed.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${t.id}</td>
      <td>${t.client}</td>
      <td>${t.description || ''}</td>
      <td>${fmtMoney(t.total_amount)}</td>
      <td><span class="material-tag ${t.direction}">${dirLabel(t.direction)}</span></td>
      <td style="font-size:12px;color:var(--text-dim)">${fmtDate(t.deleted_at)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="restoreOrder(${t.id})">Восстановить</button></td>`;
    body.appendChild(tr);
  });
}
async function restoreOrder(id) {
  const { data: o } = await sb.from('orders').select('client,description').eq('id', id).single();
  if (o) {
    await DB.restoreOrder(id);
    await DB.logAudit('restore', o.client, `Восстановлен заказ #${id} — ${o.description}`);
  }
  renderArchive();
}

/* ==============================
   HISTORY
   ============================== */
async function renderHistory() {
  const list = document.getElementById('historyList');
  const log = await DB.getAuditLog();
  list.innerHTML = '';
  const iconMap = { create:'create', edit:'edit', delete:'delete', restore:'restore' };
  const iconChar = { create:'+', edit:'✎', delete:'✕', restore:'↩' };
  log.forEach(e => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div class="history-icon ${iconMap[e.type] || 'edit'}">${iconChar[e.type] || '?'}</div>
      <div class="history-content">
        <div class="history-event"><strong>${e.subject}</strong> — ${e.detail || ''}</div>
        <div class="history-time">${fmtDateTime(e.created_at)}</div>
      </div>`;
    list.appendChild(div);
  });
}

/* ==============================
   DIRECTION FILTER
   ============================== */
document.querySelectorAll('.direction-toggle').forEach(toggle => {
  toggle.addEventListener('click', async () => {
    toggle.classList.toggle('on');
    const active = document.querySelector('.page-container.active');
    if (active) {
      if (active.id === 'kanban-page') renderKanban();
      else if (active.id === 'calendar-page') renderCalendar();
      else if (active.id === 'finance-page') renderFinance();
      else if (active.id === 'clients-page') renderClients();
    }
  });
});

/* ==============================
   EXCEL IMPORT
   ============================== */
async function exportExcel() {
  if (typeof XLSX === 'undefined') { alert('Библиотека XLSX не загружена'); return; }
  const all = await DB.orders();
  const data = all.map(o => ({
    'ID': o.id,
    'Клиент': o.client,
    'Телефон': o.phone || '',
    'Направление': dirLabel(o.direction),
    'Описание': o.description || '',
    'Сумма': Number(o.total_amount || 0),
    'Статус': columnLabel(o.status),
    'Оплата': statusLabel(o.payment_status),
    'Дата': o.date || '',
    'Срок': o.deadline || '',
    'Доставка': Number(o.delivery_cost || 0),
    'Материалы': Number(o.material_cost || 0),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Заказы');
  ws['!cols'] = [
    { wch:6 },{ wch:18 },{ wch:14 },{ wch:12 },{ wch:30 },
    { wch:10 },{ wch:10 },{ wch:10 },{ wch:12 },{ wch:12 },{ wch:10 },{ wch:10 }
  ];
  XLSX.writeFile(wb, `orders_export_${new Date().toISOString().slice(0,10)}.xlsx`);
}

async function importExcel(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    const data = new Uint8Array(e.target.result);
    try {
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      let imported = 0;
      for (const row of json) {
        const client = row['Клиент'] || row['client'] || row['Client'] || '';
        const desc = row['Описание'] || row['desc'] || row['Description'] || row['Заказ'] || '';
        const rawAmt = row['Сумма'] || row['amount'] || row['Amount'] || row['Итого Сумма'] || row['Общая Сумма'] || 0;
        const amount = parseFloat(rawAmt) || 0;
        const rawDir = row['Направление'] || row['dir'] || row['Direction'] || 'tipografia';
        const dir = rawDir.toString().toLowerCase().includes('пром') ? 'promotion' : rawDir.toString().toLowerCase().includes('рем') ? 'repair' : 'tipografia';
        const date = row['Дата'] || row['date'] || row['Date'] || row['Дата Заказа'] || new Date().toISOString().slice(0,10);
        if (!client) continue;
        const created = await DB.createOrder({
          client,
          description: desc,
          total_amount: amount,
          direction: dir,
          date,
          payment_status: 'unpaid',
          status: 'incoming'
        });
        if (created) imported++;
      }
      if (imported > 0) {
        await DB.logAudit('create', 'Excel', `Импортировано ${imported} заказов из Excel`);
        navigateTo('kanban-page');
        alert(`Импортировано ${imported} заказов`);
      } else {
        alert('Не найдено данных для импорта.');
      }
    } catch(err) {
      alert('Ошибка импорта: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
  event.target.value = '';
}

/* ==============================
   INIT
   ============================== */
document.addEventListener('DOMContentLoaded', () => {
  populateYearFilter();
  navigateTo('kanban-page');
});
