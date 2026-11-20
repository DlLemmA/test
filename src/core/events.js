// events.js — Event handlers, modals, scanner, export
import { sql, run, one, persist } from './db.js';
import { getCurrentOrderId, setCurrentOrderId, createOrder } from './init.js';
import { seedDemo } from './demo-seed.js';
import { renderAll } from './render.js';
import { customerList } from '../customers/customers.js';
import { openItemForm, moveItem, weighItem, itemsFor, itemHtml } from '../items/items.js';
import { esc, kg, money, dateNow, notify, modal, closeModal, I } from './utils.js';
import { openOrderForm, switchOrder, deleteOrder } from '../order/order.js';
import { getCurrentOrder } from './render.js';
import { renderBottomBar, setActiveTab } from './bottombar.component.js';

let html5QrcodeScanner = null;

// Main event binding
export function bindEvents() {
  // Render bottom bar
  renderBottomBar();
  
  // Re-attach tab listeners after innerHTML
  document.querySelectorAll('.bottombar-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  
  // Header buttons
  document.getElementById('demoBtn')?.addEventListener('click', async () => {
    await seedDemo();
    renderAll();
    notify('Демо данные загружены');
  });
  
  document.getElementById('backupBtn')?.addEventListener('click', openBackupModal);
  
  // Topbar button labels (no icons)
  const demoBtn = document.getElementById('demoBtn');
  const backupBtn = document.getElementById('backupBtn');
  if (demoBtn) demoBtn.textContent = 'Демо';
  if (backupBtn) backupBtn.textContent = 'Резерв';

  // Order view actions (delegated)
  document.getElementById('orderView')?.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.id === 'openReceive') openReceive(getCurrentOrderId());
    if (btn.id === 'editOrder') openOrderForm(getCurrentOrderId());
    if (btn.id === 'exportOrder') exportOrder(getCurrentOrder());
    if (btn.id === 'addItem') openItemForm(null, '');
    if (btn.id === 'createFirstOrder') createOrder().then(renderAll);
    if (btn.dataset.edit) openItemForm(parseInt(btn.dataset.edit));
    if (btn.dataset.move) moveItem(parseInt(btn.dataset.move));
    if (btn.dataset.weigh) weighItem(parseInt(btn.dataset.weigh));
  });

  // Items view search
  const searchInput = document.getElementById('itemSearch');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      const o = getCurrentOrder();
      if (!o) return;
      const list = itemsFor(o.id);
      document.getElementById('allItems').innerHTML = list.filter(i => 
        [i.name, i.track, i.customer_name].join(' ').toLowerCase().includes(q)
      ).map(i => itemHtml(i, 'В процессе')).join('') || '<div class="empty">Ничего не найдено</div>';
    });
  }

  // People view actions
  document.getElementById('peopleView')?.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.id === 'addCustomer') openCustomerForm();
    if (btn.dataset.editCustomer) openCustomerForm(parseInt(btn.dataset.editCustomer));
    if (btn.dataset.delCustomer) deleteCustomer(parseInt(btn.dataset.delCustomer));
  });

  // History view actions
  document.getElementById('historyView')?.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.switch) switchOrder(parseInt(btn.dataset.switch));
    if (btn.dataset.export) exportOrder(one('SELECT * FROM orders WHERE id=?', [parseInt(btn.dataset.export)]));
    if (btn.dataset.del) deleteOrder(parseInt(btn.dataset.del));
  });
}

function switchTab(tab) {
  // Highlight active tab button
  setActiveTab(tab);
  // Show/hide panel sections based on data-tab
  document.querySelectorAll('main section').forEach(s => {
    const panelId = 'panel-' + tab;
    s.hidden = s.id !== panelId;
  });
}

async function deleteCustomer(id) {
  if (confirm('Удалить заказчика?')) {
    run('DELETE FROM customers WHERE id=?', [id]);
    await persist();
    renderAll();
  }
}

// === Customer form ===
function openCustomerForm(id = null) {
  const c = id ? one('SELECT * FROM customers WHERE id=?', [id]) : null;
  const isNew = !c;
  
  modal(isNew ? 'Новый заказчик' : 'Редактировать заказчика', `
    <form id="customerForm" novalidate>
      <div class="field"><label>Имя *</label><input name="name" required autocomplete="name" autofocus value="${esc(c?.name || '')}" placeholder="Иван"></div>
      <div class="field"><label><input name="is_self" type="checkbox" ${c?.is_self ? 'checked' : ''}> Это я</label></div>
      <div class="actions"><button type="submit">${isNew ? 'Добавить' : 'Сохранить'}</button></div>
    </form>
  `);

  document.getElementById('customerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = f.get('name').trim();
    const is_self = f.get('is_self') ? 1 : 0;
    
    if (isNew) {
      run('INSERT INTO customers(name, is_self) VALUES(?, ?)', [name, is_self]);
    } else {
      run('UPDATE customers SET name=?, is_self=? WHERE id=?', [name, is_self, id]);
    }
    await persist();
    closeModal();
    renderAll();
    notify('Заказчик сохранён');
  });
}

// === Receive / Scanner ===
function openReceive(orderId) {
  const o = one('SELECT * FROM orders WHERE id=?', [orderId]);
  if (!o) return;
  
  const pending = sql(`SELECT i.*, c.name customer_name FROM items i JOIN customers c ON c.id=i.customer_id 
    WHERE i.order_id=? AND i.status='Ожидает взвешивания' ORDER BY i.id`, [orderId]);

  modal('Приёмка посылки', `
    <div class="panel" style="margin-bottom:12px">
      <h3>${esc(o.title)}</h3>
      <div class="grid four">
        <div class="metric"><b>${kg(o.box_weight_g)}</b><span>Вес коробки</span></div>
        <div class="metric"><b>${o.shipping_cost ? money(o.shipping_cost) : '—'}</b><span>Доставка</span></div>
        <div class="metric"><b>${pending.length}</b><span>Ожидает взвешивания</span></div>
      </div>
    </div>

    <div class="field">
      <label>Вес коробки (г) *</label>
      <input type="number" id="boxWeight" min="0" step="1" inputmode="numeric" autocomplete="off" autofocus value="${o.box_weight_g ?? ''}" placeholder="Например, 6000" required>
    </div>
    <div class="field">
      <label>Стоимость доставки (BYN) *</label>
      <input type="number" id="shippingCost" min="0" step="0.01" inputmode="decimal" autocomplete="off" value="${o.shipping_cost ?? ''}" placeholder="Например, 30.00" required>
    </div>
    <div class="field">
      <label>Дата отправления</label>
      <input type="date" id="shippedAt" value="${o.shipped_at || ''}">
    </div>

    ${pending.length ? `
      <h3 style="margin:16px 0 8px">Товары для взвешивания (${pending.length})</h3>
      <div id="pendingList">${pending.map(i=>`
        <div class="item row between">
          <div><b>${esc(i.name)}</b><div class="item-meta">${esc(i.customer_name)} · ${esc(i.track || '—')}</div></div>
          <button class="secondary" data-manual-item="${i.id}">Указать вес</button>
        </div>
      `).join('')}</div>
    ` : '<div class="notice good">Все товары взвешены или отмечены как потерянные.</div>'}

    <hr class="divider">
    
    <h3>Сканер штрихкодов</h3>
    <div class="scanbox" id="scanBox">
      <div class="scanplaceholder">Нажмите «Запустить сканер» для доступа к камере</div>
    </div>
    <div class="actions" style="margin-top:8px">
      <button id="startScan">${I.camera} Запустить сканер</button>
      <button class="secondary" id="stopScan">${I.stop} Остановить</button>
    </div>
    <div id="scanResult"></div>
    
    <div class="actions" style="margin-top:16px">
      <button class="secondary" id="closeReceive">Закрыть</button>
    </div>
  `);

  // Save box info
  document.getElementById('boxWeight').addEventListener('change', async () => {
    const w = parseInt(document.getElementById('boxWeight').value);
    run('UPDATE orders SET box_weight_g=? WHERE id=?', [w, orderId]);
    await persist();
    renderAll();
  });
  
  document.getElementById('shippingCost').addEventListener('change', async () => {
    const c = parseFloat(document.getElementById('shippingCost').value);
    run('UPDATE orders SET shipping_cost=? WHERE id=?', [c, orderId]);
    await persist();
    renderAll();
  });
  
  document.getElementById('shippedAt').addEventListener('change', async () => {
    const d = document.getElementById('shippedAt').value;
    run('UPDATE orders SET shipped_at=? WHERE id=?', [d, orderId]);
    await persist();
    renderAll();
  });

  // Manual weigh buttons
  document.querySelectorAll('[data-manual-item]').forEach(b => {
    b.addEventListener('click', () => weighItem(parseInt(b.dataset.manualItem)));
  });

  // Scanner
  document.getElementById('startScan')?.addEventListener('click', startScanner);
  document.getElementById('stopScan')?.addEventListener('click', stopScanner);
  document.getElementById('closeReceive')?.addEventListener('click', closeModal);
}

async function startScanner() {
  const box = document.getElementById('scanBox');
  try {
    if (!window.ZXing) {
      notify('Загрузка сканера...', 'info', { persistent: true });
      await import('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js');
    }
    const codeReader = new ZXing.BrowserMultiFormatReader();
    html5QrcodeScanner = codeReader;
    const devices = await codeReader.listVideoInputDevices();
    if (!devices.length) { notify('Камера не найдена', 'error'); return; }
    box.innerHTML = '';
    await codeReader.decodeFromVideoDevice(devices[0].deviceId, box, (result, err) => {
      if (result) onScanSuccess(result.getText());
    });
    notify('Сканер запущен');
  } catch (e) {
    notify('Ошибка сканера: ' + e.message, 'error');
  }
}

function stopScanner() {
  if (html5QrcodeScanner) {
    html5QrcodeScanner.reset();
    html5QrcodeScanner = null;
    document.getElementById('scanBox').innerHTML = '<div class="scanplaceholder">Сканер остановлен</div>';
  }
}

function onScanSuccess(code) {
  notify('Отсканировано: ' + code);
  findBarcode(code);
}

function findBarcode(code) {
  const o = getCurrentOrder();
  const matches = sql('SELECT i.*, c.name customer_name FROM items i JOIN customers c ON c.id=i.customer_id WHERE i.order_id=? AND i.track=? ORDER BY i.id', [o.id, code]);
  const root = document.getElementById('scanResult');
  if (!root) return;
  
  if (!matches.length) {
    root.innerHTML = `<div class="notice warn"><b>Товар не найден</b><br>Трек: ${esc(code)}</div>
      <div class="actions"><button id="createUnknown">Создать товар</button><button class="secondary" id="bindExisting">Привязать к существующему</button></div>`;
    document.getElementById('createUnknown').onclick = () => { closeModal(); openItemForm(null, code); };
    document.getElementById('bindExisting').onclick = () => chooseExisting(code);
    return;
  }
  
  if (matches.length === 1) { showMatch(matches[0]); return; }
  
  root.innerHTML = `<div class="notice">Найдено несколько товаров с этим трек-номером. Выберите нужный.</div>
    ${matches.map(i=>`<div class="item row between"><div><b>${esc(i.name)}</b><div class="item-meta">${esc(i.customer_name)} · ${esc(i.track||'—')} · ${esc(i.status)} ${i.weight_g!==null?'· '+kg(i.weight_g):''}</div></div><button class="secondary" data-match="${i.id}">Выбрать</button></div>`).join('')}`;
  root.querySelectorAll('[data-match]').forEach(b=>b.onclick=()=>showMatch(matches.find(i=>i.id===parseInt(b.dataset.match))));
}

function showMatch(i) {
  const root = document.getElementById('scanResult');
  if (!root) return;
  root.innerHTML = `<div class="panel" style="margin-top:12px;box-shadow:none">
    <div class="row between"><b>${esc(i.name)}</b><span class="pill ${i.status==='Взвешен'?'good':''}">${esc(i.status)}</span></div>
    <div class="item-meta">Заказчик: <b>${esc(i.customer_name)}</b><br>Трек: ${esc(i.track||'—')}<br>Цена: ${money(i.price)}<br>${i.weight_g!==null?'Текущий вес: '+kg(i.weight_g):'Вес ещё не указан'}</div>
    <div class="actions" style="margin-top:10px"><button id="weighMatch">${i.weight_g!==null?'Обновить вес':'Указать вес'}</button><button class="secondary" id="matchDone">Готово</button></div>
  </div>`;
  document.getElementById('weighMatch').onclick = () => { closeModal(); weighItem(i.id); };
  document.getElementById('matchDone').onclick = () => { root.innerHTML = ''; };
}

function chooseExisting(code) {
  const o = getCurrentOrder();
  const list = itemsFor(o.id);
  modal('Привязать трек-номер', `
    <div class="field"><label>Выберите товар текущего заказа</label><select id="existingItem" autofocus>${list.map(i=>`<option value="${i.id}">${esc(i.name)} — ${esc(i.customer_name)} — ${esc(i.track||'—')}</option>`).join('')}</select></div>
    <button id="bindNow">Привязать трек-номер</button>
  `);
  document.getElementById('bindNow').onclick = async () => {
    const id = parseInt(document.getElementById('existingItem').value);
    run('UPDATE items SET track=? WHERE id=?', [code, id]);
    await persist();
    closeModal();
    openReceive(getCurrentOrderId());
    notify('Трек-номер привязан');
  };
}

// === Backup/Restore ===
function openBackupModal() {
  modal('База / резерв', `
    <div class="panel">
      <h3>Экспорт базы (SQLite .db)</h3>
      <button id="downloadDb" class="secondary">${I.download} Скачать базу</button>
    </div>
    <div class="panel" style="margin-top:12px">
      <h3>Импорт базы</h3>
      <input type="file" id="dbFile" accept=".db,.sqlite,.sqlite3">
      <button id="uploadDb" class="secondary" style="margin-top:8px">${I.upload} Загрузить и заменить</button>
    </div>
  `);
  
  document.getElementById('downloadDb').onclick = async () => {
    const { getDB } = await import('./db.js');
    const bytes = getDB().export();
    const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parcel-backup-${new Date().toISOString().split('T')[0]}.db`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  document.getElementById('uploadDb').onclick = async () => {
    const file = document.getElementById('dbFile').files[0];
    if (!file) { notify('Выберите файл', 'warn'); return; }
    if (!confirm('Это заменит ВСЕ текущие данные. Продолжить?')) return;
    
    const arrayBuffer = await file.arrayBuffer();
    const { SQL, setDB, persist } = await import('./db.js');
    const newDb = new SQL.Database(new Uint8Array(arrayBuffer));
    setDB(newDb);
    await persist();
    closeModal();
    renderAll();
    notify('База восстановлена');
  };
}

// === Excel Export ===
async function exportOrder(o) {
  if (!window.XLSX) {
    notify('Загрузка Excel...', 'info', { persistent: true });
    await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
    if (!window.XLSX) { notify('Библиотека Excel не загрузилась', 'warn'); return; }
  }
  const c = calc(o);
  const wb = XLSX.utils.book_new();
  const rows = [];

  // Summary
  rows.push(['ОБЩАЯ СВОДКА']);
  rows.push(['Заказ', o.title]);
  rows.push(['Дата отправления', o.shipped_at || '—']);
  rows.push(['Статус', o.status]);
  rows.push(['Вес коробки, кг', kg(o.box_weight_g)]);
  rows.push(['Вес взвешенных товаров, кг', kg(c.totalW)]);
  rows.push(['Свободный вес, кг', kg(c.free)]);
  rows.push(['Стоимость доставки, BYN', money(o.shipping_cost)]);
  rows.push(['Тариф, BYN/кг', c.tariff]);
  rows.push(['Распределено доставки, BYN', money(c.deliveryTotal)]);
  rows.push(['Всего товаров', c.its.length]);
  rows.push(['Взвешено', c.its.filter(i=>i.status==='Взвешен').length]);
  rows.push(['Потеряно', c.its.filter(i=>i.status==='Потерян').length]);
  rows.push(['Пропущено', c.its.filter(i=>i.status==='Пропущен').length]);
  rows.push([]);

  // Per customer
  rows.push(['СВОДКА ПО ЗАКАЗЧИКАМ']);
  rows.push(['Заказчик','Товаров взвешено','Вес, кг','Стоимость товаров, BYN','Доставка, BYN','Итого, BYN']);
  Object.values(c.perCustomer).sort((a,b)=>a.name.localeCompare(b.name,'ru')).forEach(x=>{
    rows.push([x.name, x.items.filter(i=>i.status==='Взвешен').length, kg(x.weight), money(x.value), money(x.delivery), money(x.total)]);
  });
  rows.push([]);

  // Items
  rows.push(['ТОВАРЫ (СОРТИРОВКА ПО ЗАКАЗЧИКУ)']);
  rows.push(['Заказчик','Товар','Трек-номер','Статус','Вес, кг','Цена, BYN','Доставка, BYN','Итого, BYN']);
  
  const deliveryByItem = {};
  c.its.forEach(i => {
    if (i.weight_g && i.status === 'Взвешен' && c.tariff > 0) {
      deliveryByItem[i.id] = i.weight_g / 1000 * c.tariff;
    }
  });

  c.its.sort((a,b)=>a.customer_name.localeCompare(b.customer_name,'ru')||a.name.localeCompare(b.name,'ru'))
    .forEach(i=>{
      const d = deliveryByItem[i.id] || 0;
      rows.push([i.customer_name, i.name, i.track||'', i.status, i.weight_g===null?'':kg(i.weight_g), money(i.price), money(d), money(i.price+d)]);
    });

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Заказ');
  XLSX.writeFile(wb, `${o.title.replace(/[\\/:*?"<>|]/g,'_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  notify('Excel сохранён');
}

// === Helpers ===
export { openReceive, exportOrder };