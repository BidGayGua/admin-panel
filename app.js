/* ========== SUPABASE ========== */
const SUPABASE_URL = 'https://vdtpdwjvqabhydoxbqqg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkdHBkd2p2cWFiaHlkb3hicXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MTU0OTAsImV4cCI6MjA5OTk5MTQ5MH0.Y8Q0ohBfCdRquOOclPampF3L0Gd1j8opdfYYyxMYz_w';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DIR = {tipografia:'Типография',promotion:'Промоушен',repair:'Ремонт / Заправка картриджей'};
const PAY_ST = {paid:'Оплачено',unpaid:'Не оплачено',partial:'Частично'};
const PAY_TP = {nal:'Наличные',kaspi:'Каспи / Перевод',beznal:'Безнал / Расчётный счёт'};
const COL = [{id:'incoming',l:'Входящие'},{id:'inprogress',l:'В работе'},{id:'done',l:'Готово'},{id:'completed',l:'Выполнено'},{id:'cancelled',l:'Отменён'}];

let allOrders = [], allMats = [], allTpls = [], allClients = [], currentPage = 'orders';

function esc(s){return s?s.toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'):''}
function fd(d){if(!d)return'';return new Date(d).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'})}
function fdt(d){if(!d)return'';return new Date(d).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
function fm(n){return Number(n||0).toLocaleString('ru-RU')+' ₸'}
function dl(d){return DIR[d]||d}
function ps(s){return PAY_ST[s]||s}
function pt(s){return PAY_TP[s]||s}
function cl(s){const c=COL.find(x=>x.id===s);return c?c.l:s}

/* DB */
const DB={
  async orders(f={}){
    try{
      let q=sb.from('orders').select('*').eq('trashed',false).order('id',{ascending:false});
      if(f.search)q=q.or(`client.ilike.%${f.search}%,description.ilike.%${f.search}%`);
      if(f.limit)q=q.limit(f.limit);
      const{data,error}=await q;
      if(error){console.error(error);return[]}
      return data||[]
    }catch(e){console.error(e);return[]}
  },
  async createOrder(o){
    const{data,error}=await sb.from('orders').insert([{
      date:o.date||new Date().toISOString().slice(0,10),client:o.client,phone:o.phone||null,
      description:o.description||null,direction:o.direction,
      total_amount:Number(o.total_amount||0),material_cost:Number(o.material_cost||0),
      delivery_cost:Number(o.delivery_cost||0),payment_status:o.payment_status||'unpaid',
      payment_method:o.payment_method||null,status:o.status||'incoming',
      deadline:o.deadline||null,source:'manual'
    }]).select();
    return(!error&&data)?data[0]:null
  },
  async updateOrder(id,u){await sb.from('orders').update(u).eq('id',id)},
  async trashOrder(id){await sb.from('orders').update({trashed:true,deleted_at:new Date().toISOString()}).eq('id',id)},
  async restoreOrder(id){await sb.from('orders').update({trashed:false,deleted_at:null}).eq('id',id)},
  async getTemplates(){const{data}=await sb.from('templates').select('*').order('id');return data||[]},
  async createTemplate(t){const{data,error}=await sb.from('templates').insert([t]).select();return(!error&&data)?data[0]:null},
  async updateTemplate(id,u){await sb.from('templates').update(u).eq('id',id)},
  async deleteTemplate(id){await sb.from('templates').delete().eq('id',id)},
  async getMaterials(){const{data}=await sb.from('materials').select('*').order('id');return data||[]},
  async getClients(){const{data}=await sb.from('clients').select('*').order('id');return data||[]},
  async createClient(c){const{data,error}=await sb.from('clients').insert([c]).select();return(!error&&data)?data[0]:null},
  async updateClient(id,u){await sb.from('clients').update(u).eq('id',id)},
  async logAudit(t,s,d){await sb.from('audit_log').insert([{type:t,subject:s,detail:d}])},
  async getAuditLog(){const{data}=await sb.from('audit_log').select('*').order('created_at',{ascending:false}).limit(200);return data||[]}
}

/* ========== NAVIGATION ========== */
document.querySelectorAll('.nav-item').forEach(el=>{
  el.addEventListener('click',()=>{
    const p=el.dataset.page;
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    el.classList.add('active');
    document.querySelectorAll('.page').forEach(pa=>pa.classList.remove('active'));
    document.getElementById('page-'+p).classList.add('active');
    currentPage=p;
    document.getElementById('searchInput').value='';
    renderPage();
  })
});

function renderPage(){
  const titles={orders:['Заказы','Реестр всех заказов'],warehouse:['Склад','Учёт материалов'],
    clients:['Клиенты','История и LTV'],templates:['Шаблоны','Быстрое создание']};
  const[t,sub]=titles[currentPage]||['',''];
  document.getElementById('pageTitle').textContent=t;
  document.getElementById('pageSub').textContent=sub;
  if(currentPage==='orders')renderOrders();
  else if(currentPage==='warehouse')renderWarehouse();
  else if(currentPage==='clients')renderClients();
  else if(currentPage==='templates'){loadTemplates();renderTemplates();}
}

/* ========== ORDERS ========== */
async function renderOrders(){
  if(!allOrders.length)allOrders=await DB.orders();
  const sq=(document.getElementById('searchInput').value||'').trim().toLowerCase();
  const dir=document.getElementById('fDir').value;
  const pay=document.getElementById('fPay').value;
  const payT=document.getElementById('fPayType').value;
  const yr=document.getElementById('fYear').value;
  const df=document.getElementById('fDateFrom').value;
  const dt=document.getElementById('fDateTo').value;
  let f=allOrders;
  if(dir!='all')f=f.filter(o=>o.direction===dir);
  if(pay!='all')f=f.filter(o=>o.payment_status===pay);
  if(payT!='all')f=f.filter(o=>o.payment_method===payT);
  if(yr!='all')f=f.filter(o=>o.date&&o.date.startsWith(yr));
  if(df)f=f.filter(o=>o.date&&o.date>=df);
  if(dt)f=f.filter(o=>o.date&&o.date<=dt);
  if(sq)f=f.filter(o=>(o.client||'').toLowerCase().includes(sq)||(o.description||'').toLowerCase().includes(sq));
  document.getElementById('filterCount').textContent='Показано: '+f.length+' / Всего: '+allOrders.length;
  const aRev=allOrders.reduce((s,o)=>s+Number(o.total_amount||0),0);
  const aCost=allOrders.reduce((s,o)=>s+Number(o.material_cost||0)+Number(o.delivery_cost||0),0);
  const aProfit=aRev-aCost;
  const aMargin=aRev>0?aProfit/aRev*100:0;
  document.getElementById('mRevenue').textContent=fm(aRev);
  document.getElementById('mCost').textContent=fm(aCost);
  const mp=document.getElementById('mProfit');mp.textContent=fm(aProfit);mp.style.color=aProfit>=0?'var(--green)':'var(--danger)';
  const mm=document.getElementById('mMargin');mm.textContent=aMargin.toFixed(1)+'%';mm.style.color=aProfit>=0?'var(--green)':'var(--danger)';
  const b=document.getElementById('ordersBody');
  b.innerHTML=f.map(o=>{
    const cst=Number(o.material_cost||0)+Number(o.delivery_cost||0);
    const pr=Number(o.total_amount||0)-cst;
    const ov=o.deadline&&new Date(o.deadline)<new Date()&&!['completed','done','canceled'].includes(o.status);
    const pm=o.payment_method;
    return `<tr>
      <td style="white-space:nowrap"><span style="font-weight:600;color:var(--text)">#${o.id}</span><br><span style="font-size:11px;color:var(--text-dim)">${fd(o.date)}</span></td>
      <td><div class="cl-name" onclick="openDetail(${o.id})">${esc(o.client)}</div><div class="cl-phone">${o.phone||''}</div></td>
      <td><span class="badge badge-${o.direction}">${dl(o.direction)}</span></td>
      <td><span style="font-size:11px;color:var(--text-dim)">${pm?pt(pm):'—'}</span></td>
      <td><span class="badge badge-${o.payment_status}">${ps(o.payment_status)}</span></td>
      <td style="font-weight:600;color:var(--text)">${fm(o.total_amount)}</td>
      <td>${fm(cst)}</td>
      <td style="font-weight:600;color:${pr>=0?'var(--green)':'var(--danger)'}">${fm(pr)}</td>
      <td style="white-space:nowrap"><span class="badge ${ov?'badge-critical':'badge-ok'}">${cl(o.status)}</span>${o.deadline?`<br><span style="font-size:10px;color:${ov?'var(--danger)':'var(--text-dim)'}">${ov?'⚠️ ':'📅 '}${fd(o.deadline)}</span>`:''}</td>
      <td style="white-space:nowrap">
        <button class="act" onclick="openDetail(${o.id})" title="Подробнее">👁</button>
        <button class="act" onclick="openOrderModal(${o.id})" title="Редактировать">✎</button>
        <button class="act" onclick="delOrder(${o.id})" title="Удалить">✕</button>
      </td>
    </tr>`
  }).join('');
}

async function delOrder(id){
  if(!confirm('Удалить заказ #'+id+'?'))return;
  await DB.trashOrder(id);
  await DB.logAudit('delete','Заказ #'+id,'Удалён заказ #'+id);
  allOrders=await DB.orders();renderOrders();
}

function clearFilters(){
  document.getElementById('fDir').value='all';
  document.getElementById('fPay').value='all';
  document.getElementById('fPayType').value='all';
  document.getElementById('fYear').value='all';
  document.getElementById('fDateFrom').value='';
  document.getElementById('fDateTo').value='';
  document.getElementById('searchInput').value='';
  renderOrders();
}

/* ========== CLIENTS ========== */
async function renderClients(){
  const sq=(document.getElementById('clSearch').value||'').trim().toLowerCase();
  const dir=document.getElementById('clDir').value;
  if(!allOrders.length)allOrders=await DB.orders();
  const colors=['#6c5ce7','#3b82f6','#28c76f','#f59e0b','#ef4444','#f97316'];
  const map={};
  allOrders.forEach(o=>{
    const n=(o.client||'').trim();
    if(!n||n.length<2)return;
    if(dir!='all'&&o.direction!==dir)return;
    if(!map[n])map[n]={name:n,orders:[],phones:new Set(),rev:0,cost:0};
    map[n].orders.push(o);
    if(o.phone)map[n].phones.add(o.phone);
    map[n].rev+=Number(o.total_amount||0);
    map[n].cost+=Number(o.material_cost||0)+Number(o.delivery_cost||0);
  });
  let clients=Object.values(map).sort((a,b)=>b.orders.length-a.orders.length);
  if(sq)clients=clients.filter(c=>c.name.toLowerCase().includes(sq));
  const g=document.getElementById('clientsGrid');
  g.innerHTML=clients.map((c,i)=>{
    const profit=c.rev-c.cost;
    const status=c.rev>100000?'VIP':c.orders.length>=5?'Постоянный':'Новый';
    const color=colors[i%colors.length];
    return `<div class="client-card">
      <div class="ch"><div class="ca" style="background:${color}22;color:${color}">${c.name[0]}</div>
      <div style="flex:1"><div class="cn">${esc(c.name)}</div><div class="cp">${[...c.phones][0]||'Нет телефона'}</div>
      <div style="font-size:11px;margin-top:2px"><span class="badge" style="background:${status==='VIP'?'rgba(245,158,11,.15)':status==='Постоянный'?'rgba(40,199,111,.15)':'rgba(108,92,231,.15)'};color:${status==='VIP'?'var(--yellow)':status==='Постоянный'?'var(--green)':'var(--primary)'}">${status}</span></div></div>
      <button class="act" onclick="openClientModalForClient('${esc(c.name)}')" title="Редактировать">✎</button></div>
      <div class="cs"><div><div class="v">${c.orders.length}</div><div class="l">Заказов</div></div>
      <div><div class="v" style="color:var(--green)">${fm(c.rev)}</div><div class="l">LTV (выручка)</div></div>
      <div><div class="v" style="color:${profit>=0?'var(--green)':'var(--danger)'}">${fm(profit)}</div><div class="l">Прибыль</div></div></div>
    </div>`
  }).join('');
  if(!clients.length)g.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-dim)">Нет клиентов. Добавьте заказы или клиента вручную.</div>';
}

async function openClientModal(id){
  document.getElementById('clientModal').classList.add('open');
  document.getElementById('cEditId').value=id||'';
  if(id){
    const{data:c}=await sb.from('clients').select('*').eq('id',id).single();
    if(c){
      document.getElementById('cmTitle').textContent='Редактировать клиента';
      document.getElementById('cName').value=c.name;
      document.getElementById('cPhone').value=c.phone||'';
      document.getElementById('cCompany').value=c.email||'';
      document.getElementById('cPayType').value=c.city||'nal';
    }
  }else{
    document.getElementById('cmTitle').textContent='Новый клиент';
    document.getElementById('cName').value='';
    document.getElementById('cPhone').value='';
    document.getElementById('cCompany').value='';
    document.getElementById('cPayType').value='nal';
  }
}
function openClientModalForClient(name){
  sb.from('clients').select('*').eq('name',name).single().then(({data:c})=>{
    if(c)openClientModal(c.id);
    else{
      // client not in clients table, create from order data
      const o=allOrders.find(x=>x.client===name);
      if(o){openClientModal();document.getElementById('cName').value=o.client;document.getElementById('cPhone').value=o.phone||'';}
      else openClientModal();
    }
  });
}
function closeClientModal(){document.getElementById('clientModal').classList.remove('open')}
async function saveClient(){
  const id=parseInt(document.getElementById('cEditId').value);
  const name=document.getElementById('cName').value.trim();
  if(!name){alert('Введите имя');return}
  const data={name,phone:document.getElementById('cPhone').value.trim()||null,email:document.getElementById('cCompany').value.trim()||null,city:document.getElementById('cPayType').value};
  if(id)await DB.updateClient(id,data);
  else await DB.createClient(data);
  closeClientModal();
  allClients=await DB.getClients();
  if(currentPage==='clients')renderClients();
}

/* ========== TEMPLATES ========== */
async function loadTemplates(){allTpls=await DB.getTemplates()}

async function renderTemplates(){
  const g=document.getElementById('tplGrid');
  if(!allTpls.length)allTpls=await DB.getTemplates();
  g.innerHTML=allTpls.map(t=>{
    const uc=t.unit_cost||0;
    const up=t.unit_price||t.amount||0;
    return `<div class="tpl-card">
      <div class="th"><span class="tn">${esc(t.name)}</span><span class="badge badge-${t.direction}">${dl(t.direction)}</span></div>
      <div class="td">${esc(t.description||'')}</div>
      <div style="display:flex;gap:12px;margin-bottom:6px">
        <div><span style="font-size:11px;color:var(--text-dim)">Себест. 1 шт:</span><span style="font-weight:600;margin-left:4px">${fm(uc)}</span></div>
        <div><span style="font-size:11px;color:var(--text-dim)">Цена 1 шт:</span><span style="font-weight:600;margin-left:4px">${fm(up)}</span></div>
        <div><span style="font-size:11px;color:var(--text-dim)">Маржа:</span><span style="font-weight:600;margin-left:4px;color:${up>uc?'var(--green)':'var(--danger)'}">${up>uc?Math.round((up-uc)/up*100):0}%</span></div>
      </div>
      <div class="taf">
        <button class="btn btn-ghost btn-sm" onclick="useTpl(${t.id})">Использовать</button>
        <button class="btn btn-ghost btn-sm" onclick="editTpl(${t.id})">Ред.</button>
        <button class="btn btn-sm" style="background:var(--danger);color:#fff" onclick="delTpl(${t.id})">Удал.</button>
      </div>
    </div>`
  }).join('');
  if(!allTpls.length)g.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-dim)">Нет шаблонов. Создайте первый шаблон.</div>';
}

async function openTemplateModal(id){
  document.getElementById('templateModal').classList.add('open');
  document.getElementById('tEditId').value=id||'';
  if(id){
    const{data:t}=await sb.from('templates').select('*').eq('id',id).single();
    if(!t)return;
    document.getElementById('tmTitle').textContent='Редактировать шаблон';
    document.getElementById('tName').value=t.name;
    document.getElementById('tDir').value=t.direction;
    document.getElementById('tUnitCost').value=t.unit_cost||'';
    document.getElementById('tUnitPrice').value=t.unit_price||t.amount||'';
    document.getElementById('tDesc').value=t.description||'';
  }else{
    document.getElementById('tmTitle').textContent='Новый шаблон';
    ['tName','tUnitCost','tUnitPrice','tDesc'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('tDir').value='tipografia';
  }
}
function closeTemplateModal(){document.getElementById('templateModal').classList.remove('open')}

async function saveTemplate(){
  const id=parseInt(document.getElementById('tEditId').value);
  const name=document.getElementById('tName').value.trim();
  if(!name){alert('Введите название');return}
  const unitCost=parseFloat(document.getElementById('tUnitCost').value)||0;
  const unitPrice=parseFloat(document.getElementById('tUnitPrice').value)||0;
  const data={
    name,direction:document.getElementById('tDir').value,
    amount:unitPrice,unit_cost:unitCost,unit_price:unitPrice,
    description:document.getElementById('tDesc').value.trim()||''
  };
  if(id){
    await DB.updateTemplate(id,data);
    await DB.logAudit('edit',name,'Изменён шаблон #'+id);
  }else{
    const c=await DB.createTemplate(data);
    if(c)await DB.logAudit('create',name,'Создан шаблон #'+c.id);
  }
  closeTemplateModal();
  allTpls=await DB.getTemplates();
  renderTemplates();
}

async function useTpl(id){
  document.querySelector('.nav-item[data-page="orders"]').click();
  openOrderModal();
  document.getElementById('fTpl').value=id;
  await applyTemplate();
}
function editTpl(id){openTemplateModal(id)}
async function delTpl(id){
  if(!confirm('Удалить шаблон?'))return;
  const t=allTpls.find(x=>x.id===id);
  await DB.deleteTemplate(id);
  if(t)await DB.logAudit('delete',t.name,'Удалён шаблон #'+id);
  allTpls=await DB.getTemplates();
  renderTemplates();
}

/* ========== ORDER MODAL ========== */
async function openOrderModal(id){
  document.getElementById('orderModal').classList.add('open');
  document.getElementById('omTitle').textContent=id?'Редактировать заказ':'Новый заказ';
  document.getElementById('omSave').textContent=id?'Сохранить':'Создать заказ';
  document.getElementById('fEditId').value=id||'';
  document.getElementById('calcSection').style.display='none';
  ['fPhone','fCompany','fAmount','fDelivery','fCostManual','fMatData'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('fDesc').value='';
  document.getElementById('fModalDir').value='tipografia';
  document.getElementById('fModalPay').value='unpaid';
  document.getElementById('fModalPayType').value='nal';
  document.getElementById('fCol').value='incoming';
  document.getElementById('fDeadline').value='';
  document.getElementById('fQty').value=1;
  document.getElementById('fClientNew').value='';
  document.getElementById('fClientSelect').value='';

  // Load clients into select
  allClients=await DB.getClients();
  const sel=document.getElementById('fClientSelect');
  sel.innerHTML='<option value="">— Выберите клиента —</option>';
  allClients.forEach(c=>sel.innerHTML+=`<option value="${c.id}">${esc(c.name)}${c.phone?' ('+esc(c.phone)+')':''}</option>`);

  // Load templates
  allTpls=await DB.getTemplates();
  const tplSel=document.getElementById('fTpl');
  tplSel.innerHTML='<option value="">— Без шаблона —</option>';
  allTpls.forEach(t=>tplSel.innerHTML+=`<option value="${t.id}">${esc(t.name)}</option>`);

  if(id){
    const{data:o}=await sb.from('orders').select('*').eq('id',id).single();
    if(o){
      document.getElementById('fClientNew').value=o.client;
      document.getElementById('fPhone').value=o.phone||'';
      document.getElementById('fDesc').value=o.description||'';
      document.getElementById('fModalDir').value=o.direction;
      document.getElementById('fAmount').value=o.total_amount;
      document.getElementById('fDelivery').value=o.delivery_cost||'';
      document.getElementById('fCostManual').value=(Number(o.material_cost||0)+Number(o.delivery_cost||0))||'';
      document.getElementById('fModalPay').value=o.payment_status;
      document.getElementById('fModalPayType').value=o.payment_method||'nal';
      document.getElementById('fCol').value=o.status;
      document.getElementById('fDeadline').value=o.deadline||'';
      // Find client in dropdown
      const match=allClients.find(c=>c.name===o.client);
      if(match)document.getElementById('fClientSelect').value=match.id;
    }
  }
}

function closeOrderModal(){document.getElementById('orderModal').classList.remove('open')}

function onClientSelect(){
  const id=parseInt(document.getElementById('fClientSelect').value);
  if(!id)return;
  const c=allClients.find(x=>x.id===id);
  if(!c)return;
  document.getElementById('fClientNew').value=c.name;
  document.getElementById('fPhone').value=c.phone||'';
  document.getElementById('fCompany').value=c.email||'';
  if(c.city&&PAY_TP[c.city])document.getElementById('fModalPayType').value=c.city;
}

async function applyTemplate(){
  const id=parseInt(document.getElementById('fTpl').value);
  const sec=document.getElementById('calcSection');
  if(!id){sec.style.display='none';return}
  sec.style.display='block';
  const tpl=allTpls.find(t=>t.id===id);
  if(!tpl)return;
  const unitCost=Number(tpl.unit_cost||0);
  const unitPrice=Number(tpl.unit_price||tpl.amount||0);
  document.getElementById('fModalDir').value=tpl.direction;
  document.getElementById('calcResult').innerHTML=
    `Шаблон: <strong>${esc(tpl.name)}</strong> — Себестоимость 1 шт: <strong>${fm(unitCost)}</strong>, Цена 1 шт: <strong>${fm(unitPrice)}</strong>`;
  recalc();
}

function recalc(){
  const id=parseInt(document.getElementById('fTpl').value);
  if(!id)return;
  const tpl=allTpls.find(t=>t.id===id);
  if(!tpl)return;
  const unitCost=Number(tpl.unit_cost||0);
  const unitPrice=Number(tpl.unit_price||tpl.amount||0);
  const qty=parseInt(document.getElementById('fQty').value)||1;
  const totalCost=unitCost*qty;
  const totalRev=unitPrice*qty;
  const profit=totalRev-totalCost;
  const margin=totalRev>0?profit/totalRev*100:0;
  document.getElementById('cCost').textContent=fm(totalCost);
  document.getElementById('cRevenue').textContent=fm(totalRev);
  document.getElementById('cProfit').textContent=fm(profit);
  document.getElementById('cMargin').textContent=margin.toFixed(1)+'%';
  document.getElementById('fCostManual').value=totalCost;
  document.getElementById('fAmount').value=totalRev;
}

function recalcManual(){
  const rev=parseFloat(document.getElementById('fAmount').value)||0;
  const cost=parseFloat(document.getElementById('fCostManual').value)||0;
  const profit=rev-cost;
  const margin=rev>0?profit/rev*100:0;
  document.getElementById('cCost').textContent=fm(cost);
  document.getElementById('cRevenue').textContent=fm(rev);
  document.getElementById('cProfit').textContent=fm(profit);
  document.getElementById('cMargin').textContent=margin.toFixed(1)+'%';
}

async function saveOrder(){
  const id=parseInt(document.getElementById('fEditId').value);
  const client=document.getElementById('fClientNew').value.trim();
  if(!client){alert('Введите клиента');return}
  const amount=parseFloat(document.getElementById('fAmount').value)||0;
  const fmc=parseFloat(document.getElementById('fCostManual').value)||0;
  const deliv=parseFloat(document.getElementById('fDelivery').value)||0;
  const matCost=Math.max(0,fmc-deliv);
  const data={
    client,phone:document.getElementById('fPhone').value.trim()||null,
    description:document.getElementById('fDesc').value.trim()||null,
    direction:document.getElementById('fModalDir').value,
    total_amount:amount,material_cost:matCost,delivery_cost:deliv,
    payment_status:document.getElementById('fModalPay').value,
    payment_method:document.getElementById('fModalPayType').value,
    status:document.getElementById('fCol').value,
    deadline:document.getElementById('fDeadline').value||null,
    date:new Date().toISOString().slice(0,10)
  };
  // Auto-save the client name to clients table if new
  if(!allClients.find(c=>c.name===client)){
    await DB.createClient({name:client,phone:data.phone,email:document.getElementById('fCompany').value.trim()||null,city:data.payment_method});
  }
  if(id){
    await DB.updateOrder(id,data);
    await DB.logAudit('edit',data.client,'Изменён заказ #'+id);
    const idx=allOrders.findIndex(o=>o.id===id);
    if(idx>=0)allOrders[idx]={...allOrders[idx],...data};
  }else{
    const c=await DB.createOrder(data);
    if(c){allOrders.unshift(c);await DB.logAudit('create',data.client,'Создан заказ #'+c.id);}
  }
  closeOrderModal();
  renderOrders();
}

/* ========== DETAIL ========== */
async function openDetail(id){
  window._detId=id;
  document.getElementById('detailModal').classList.add('open');
  document.getElementById('dmTitle').textContent='Заказ #'+id;
  const{data:o}=await sb.from('orders').select('*').eq('id',id).single();
  if(!o)return;
  document.getElementById('dClient').textContent=o.client;
  document.getElementById('dPhone').textContent=o.phone||'—';
  document.getElementById('dDir').innerHTML='<span class="badge badge-'+o.direction+'">'+dl(o.direction)+'</span>';
  document.getElementById('dAmount').textContent=fm(o.total_amount);
  document.getElementById('dPayType').textContent=o.payment_method?pt(o.payment_method):'—';
  const pe=document.getElementById('dPay');
  pe.textContent=ps(o.payment_status);
  pe.style.color=o.payment_status==='paid'?'var(--green)':o.payment_status==='unpaid'?'var(--danger)':'var(--yellow)';
  document.getElementById('dStatus').textContent=cl(o.status);
  document.getElementById('dDate').textContent=fd(o.date)||'—';
  document.getElementById('dDeadline').textContent=o.deadline?fd(o.deadline):'—';
  const cst=Number(o.material_cost||0)+Number(o.delivery_cost||0);
  const prf=Number(o.total_amount||0)-cst;
  document.getElementById('dCost').textContent=fm(cst);
  const prEl=document.getElementById('dProfit');
  prEl.textContent=fm(prf);
  prEl.style.color=prf>=0?'var(--green)':'var(--danger)';
  document.getElementById('dDesc').textContent=o.description||'—';
  try{
    const{data:logs}=await sb.from('audit_log').select('*').ilike('detail','%#'+id+'%').order('created_at',{ascending:false}).limit(20);
    const h=document.getElementById('dHistory');
    if(logs&&logs.length)h.innerHTML=logs.map(l=>`<div style="display:flex;gap:6px;padding:5px 0;border-bottom:1px solid var(--border);align-items:flex-start"><span style="font-size:10px;color:var(--text-dim);white-space:nowrap">${fdt(l.created_at)}</span><span>${esc(l.detail)}</span></div>`).join('');
    else h.innerHTML='<div>Нет истории</div>';
  }catch(e){document.getElementById('dHistory').innerHTML='<div>Нет истории</div>'}
}
function closeDetailModal(){document.getElementById('detailModal').classList.remove('open')}
function editFromDetail(){closeDetailModal();setTimeout(()=>openOrderModal(window._detId),200)}

/* ========== WAREHOUSE ========== */
async function renderWarehouse(){
  allMats=await DB.getMaterials();
  const sq=(document.getElementById('whSearch').value||'').trim().toLowerCase();
  const cat=document.getElementById('whCat').value;
  let f=allMats;
  if(cat!='all')f=f.filter(m=>(m.category||'Прочее')===cat);
  if(sq)f=f.filter(m=>(m.name||'').toLowerCase().includes(sq));
  let n=0,l=0,c=0;
  f.forEach(m=>{const st=m.quantity>=m.min_level*2?'ok':m.quantity>=m.min_level?'low':'critical';if(st==='ok')n++;else if(st==='low')l++;else c++;});
  document.getElementById('whTotal').textContent=f.length;
  document.getElementById('whNormal').textContent=n;
  document.getElementById('whLow').textContent=l;
  document.getElementById('whCritical').textContent=c;
  const b=document.getElementById('warehouseBody');
  b.innerHTML=f.map(m=>{
    const st=m.quantity>=m.min_level*2?'ok':m.quantity>=m.min_level?'low':'critical';
    const lb=st==='ok'?'Норма':st==='low'?'Мало':'Требуется закупка';
    const clr=st==='ok'?'var(--green)':st==='low'?'var(--yellow)':'var(--danger)';
    const tv=Number(m.quantity||0)*Number(m.purchase_price||0);
    const catName=m.category||'Прочее';
    return `<tr>
      <td><span class="cl-name" onclick="openMaterialModal(${m.id})">${esc(m.name)}</span></td>
      <td><span style="font-size:11px;color:var(--text-dim)">${esc(catName)}</span></td>
      <td>${m.unit||'шт'}</td>
      <td style="font-weight:600;color:${clr}">${m.quantity}</td>
      <td>${m.min_level}</td>
      <td>${fm(m.purchase_price)}</td>
      <td style="font-weight:600">${fm(tv)}</td>
      <td><span class="badge badge-${st==='critical'?'critical':st==='low'?'low':'ok'}">${lb}</span></td>
      <td style="white-space:nowrap">
        <button class="act" onclick="openMovement(${m.id},'income')" title="Приход">+</button>
        <button class="act" onclick="openMovement(${m.id},'expense')" title="Расход">−</button>
        <button class="act" onclick="delMat(${m.id})" title="Удалить">✕</button>
      </td>
    </tr>`
  }).join('');
}

function openMaterialModal(id){
  document.getElementById('materialModal').classList.add('open');
  document.getElementById('mEditId').value=id||'';
  if(id){
    sb.from('materials').select('*').eq('id',id).single().then(({data:m})=>{
      if(!m)return;
      document.getElementById('mmTitle').textContent='Редактировать материал';
      document.getElementById('mName').value=m.name;
      document.getElementById('mCat').value=m.category||'Прочее';
      document.getElementById('mUnit').value=m.unit||'';
      document.getElementById('mDir').value=m.direction;
      document.getElementById('mQty').value=m.quantity;
      document.getElementById('mMin').value=m.min_level;
      document.getElementById('mPrice').value=m.purchase_price;
    });
  }else{
    document.getElementById('mmTitle').textContent='Новый материал';
    ['mName','mUnit','mQty','mMin','mPrice'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('mCat').value='Прочее';
    document.getElementById('mDir').value='tipografia';
  }
}
function closeMaterialModal(){document.getElementById('materialModal').classList.remove('open')}
async function saveMaterial(){
  const id=parseInt(document.getElementById('mEditId').value);
  const name=document.getElementById('mName').value.trim();
  if(!name){alert('Введите название');return}
  const data={name,category:document.getElementById('mCat').value,direction:document.getElementById('mDir').value,unit:document.getElementById('mUnit').value.trim()||'шт',quantity:parseFloat(document.getElementById('mQty').value)||0,min_level:parseFloat(document.getElementById('mMin').value)||0,purchase_price:parseFloat(document.getElementById('mPrice').value)||0};
  if(id)await sb.from('materials').update(data).eq('id',id);
  else await sb.from('materials').insert(data);
  closeMaterialModal();renderWarehouse();
}
function delMat(id){if(!confirm('Удалить материал?'))return;sb.from('materials').delete().eq('id',id).then(()=>renderWarehouse())}
function openMovement(mid,type){
  document.getElementById('movementModal').classList.add('open');
  document.getElementById('movId').value=mid;
  document.getElementById('movType').value=type;
  document.getElementById('movQty').value='';
  sb.from('materials').select('name,quantity,unit').eq('id',mid).single().then(({data:m})=>{if(m)document.getElementById('movName').textContent=m.name+' (сейчас: '+m.quantity+' '+m.unit+')'});
}
function closeMovementModal(){document.getElementById('movementModal').classList.remove('open')}
async function saveMovement(){
  const id=parseInt(document.getElementById('movId').value);
  const type=document.getElementById('movType').value;
  const qty=parseFloat(document.getElementById('movQty').value);
  if(!qty||qty<=0){alert('Введите количество');return}
  const{data:m}=await sb.from('materials').select('*').eq('id',id).single();
  if(!m)return;
  const nq=type==='income'?m.quantity+qty:m.quantity-qty;
  if(nq<0){alert('Недостаточно!');return}
  await sb.from('materials').update({quantity:nq}).eq('id',id);
  closeMovementModal();renderWarehouse();
}

/* ========== EXCEL ========== */
async function exportExcel(){
  if(typeof XLSX==='undefined'){alert('XLSX не загружена');return}
  const all=await DB.orders();
  const data=all.map(o=>({
    'ID':o.id,'Дата':o.date||'','Клиент':o.client,'Телефон':o.phone||'',
    'Направление':dl(o.direction),'Тип оплаты':o.payment_method?pt(o.payment_method):'—',
    'Статус оплаты':ps(o.payment_status),
    'Выручка':Number(o.total_amount||0),
    'Себестоимость':Number(o.material_cost||0)+Number(o.delivery_cost||0),
    'Прибыль':Number(o.total_amount||0)-Number(o.material_cost||0)-Number(o.delivery_cost||0),
    'Статус':cl(o.status),'Дедлайн':o.deadline||'','Описание':o.description||''
  }));
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Заказы');
  ws['!cols']=[{wch:6},{wch:12},{wch:22},{wch:16},{wch:16},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:12},{wch:12},{wch:30}];
  XLSX.writeFile(wb,'orders_report_'+new Date().toISOString().slice(0,10)+'.xlsx');
}

/* ========== FILTERS ========== */
async function populateYearFilter(){
  try{
    const{data}=await sb.from('orders').select('date');
    const y=new Set();
    (data||[]).forEach(o=>{if(o.date&&o.date.length>=4)y.add(o.date.slice(0,4))});
    const s=[...y].sort().reverse();
    const sel=document.getElementById('fYear');
    const cur=sel.value;
    sel.innerHTML='<option value="all">Все года</option>';
    s.forEach(y=>sel.innerHTML+=`<option value="${y}">${y}</option>`);
    sel.value=cur;
  }catch(e){}
}

/* ========== INIT ========== */
document.addEventListener('DOMContentLoaded',async()=>{
  allOrders=await DB.orders();
  allMats=await DB.getMaterials();
  allClients=await DB.getClients();
  allTpls=await DB.getTemplates();
  await populateYearFilter();
  renderOrders();
});
