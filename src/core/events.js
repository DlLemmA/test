// events.js — Standalone event handlers: tab switching, backup, scanner, export
import { sql, run, one, persist } from './db.js';
import { getCurrentOrderId } from './init.js';
import { renderAll, getCurrentOrder } from './render.js';
import { openItemForm, weighItem, itemsFor, calc } from '../items/items.js';
import { esc, kg, money, notify, I } from './utils.js';
import { modal, closeModal, confirmSheet } from './sheet.js';
import { setActiveTab } from './bottombar.component.js';
import { on } from './listeners.js';

let html5QrcodeScanner = null;

// === Tab switching (called from bottombar.component.js) ===
export function switchTab(tab) {
  setActiveTab(tab);

  const apply = () => {
    document.querySelectorAll('main section').forEach(s => {
      const panelId = 'panel-' + tab;
      s.hidden = s.id !== panelId;
    });
  };

  if (document.startViewTransition) {
    document.startViewTransition(apply);
  } else {
    apply();
  }
}

// === Customer form (called from customers.component.js) ===
export function openCustomerForm(id = null) {
  const c = id ? one('SELECT * FROM customers WHERE id=?', [id]) : null;
  const isNew = !c;
  
  modal(isNew ? 'Новый заказчик' : 'Редактировать заказчика', `
    <form id="customerForm" novalidate>
      <div class="field"><label>Имя *</label><input name="name" required autocomplete="name" autofocus value="${esc(c?.name || '')}" placeholder="Иван"></div>
      <div class="field"><label><input name="is_self" type="checkbox" ${c?.is_self ? 'checked' : ''}> Это я</label></div>
      <div class="actions"><button type="submit">${isNew ? 'Добавить' : 'Сохранить'}</button></div>
    </form>
  `);

  on(document.getElementById('customerForm'), 'submit', async e => {
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

export async function deleteCustomer(id) {
  confirmSheet('Удалить заказчика', 'Заказчик будет удалён.', 'Удалить', async () => {
    run('DELETE FROM customers WHERE id=?', [id]);
    await persist();
    renderAll();
  });
}

// === Receive / Scanner ===
export function openReceive(orderId) {
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

  // Save box info — update DB only, no renderAll() (sheet would die)
  on(document.getElementById('boxWeight'), 'change', async () => {
    const w = parseInt(document.getElementById('boxWeight').value);
    run('UPDATE orders SET box_weight_g=? WHERE id=?', [w, orderId]);
    await persist();
    // Order view will update on next tab switch
  });
  
  on(document.getElementById('shippingCost'), 'change', async () => {
    const c = parseFloat(document.getElementById('shippingCost').value);
    run('UPDATE orders SET shipping_cost=? WHERE id=?', [c, orderId]);
    await persist();
  });
  
  on(document.getElementById('shippedAt'), 'change', async () => {
    const d = document.getElementById('shippedAt').value;
    run('UPDATE orders SET shipped_at=? WHERE id=?', [d, orderId]);
    await persist();
  });

  // Manual weigh buttons
  document.querySelectorAll('[data-manual-item]').forEach(b => {
    on(b, 'click', () => weighItem(parseInt(b.dataset.manualItem)));
  });

  // Scanner
  on(document.getElementById('startScan'), 'click', startScanner);
  on(document.getElementById('stopScan'), 'click', stopScanner);
  on(document.getElementById('closeReceive'), 'click', closeModal);
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
    <div class="item-meta">Заказчик: <b>${esc(i.customer_name)}</b><br>Трек: ${esc(i.track||'—')}<br>Цена: ${money(i.price)} Br<br>${i.weight_g!==null?'Текущий вес: '+kg(i.weight_g):'Вес ещё не указан'}</div>
    <div class="actions" style="margin-top:10px"><button id="weighMatch">${i.weight_g!==null?'Обновить вес':'Указать вес'}</button><button class="secondary" id="matchDone">Готово</button></div>
  </div>`;
  on(document.getElementById('weighMatch'), 'click', () => { closeModal(); weighItem(i.id); });
  on(document.getElementById('matchDone'), 'click', () => { root.innerHTML = ''; });
}

function chooseExisting(code) {
  const o = getCurrentOrder();
  const list = itemsFor(o.id);
  modal('Привязать трек-номер', `
    <div class="field"><label>Выберите товар текущего заказа</label><select id="existingItem" autofocus>${list.map(i=>`<option value="${i.id}">${esc(i.name)} — ${esc(i.customer_name)} — ${esc(i.track||'—')}</option>`).join('')}</select></div>
    <button id="bindNow">Привязать трек-номер</button>
  `);
  on(document.getElementById('bindNow'), 'click', async () => {
    const id = parseInt(document.getElementById('existingItem').value);
    run('UPDATE items SET track=? WHERE id=?', [code, id]);
    await persist();
    closeModal();
    openReceive(getCurrentOrderId());
    notify('Трек-номер привязан');
  });
}

// === Backup/Restore ===
export function openBackupModal() {
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
  
  on(document.getElementById('downloadDb'), 'click', async () => {
    const { getDB } = await import('./db.js');
    const bytes = getDB().export();
    const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parcel-backup-${new Date().toISOString().split('T')[0]}.db`;
    a.click();
    URL.revokeObjectURL(url);
  });
  
  on(document.getElementById('uploadDb'), 'click', async () => {
    const file = document.getElementById('dbFile').files[0];
    if (!file) { notify('Выберите файл', 'warn'); return; }
    
    confirmSheet('Заменить базу', 'Это заменит ВСЕ текущие данные. Продолжить?', 'Заменить', async () => {
      const arrayBuffer = await file.arrayBuffer();
      const { SQL, setDB, persist } = await import('./db.js');
      const newDb = new SQL.Database(new Uint8Array(arrayBuffer));
      setDB(newDb);
      await persist();
      closeModal();
      renderAll();
      notify('База восстановлена');
    });
  });
}

// === Excel Export ===
export async function exportOrder(o) {
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

// === History actions (called from history.component.js) ===
export function switchToOrder(id) {
  import('./init.js').then(m => m.setCurrentOrderId(id));
  renderAll();
}

export async function deleteOrder(id) {
  confirmSheet('Удалить заказ', 'Заказ будет удалён со всеми товарами. Это действие нельзя отменить.', 'Удалить', async () => {
    run('DELETE FROM items WHERE order_id=?', [id]);
    run('DELETE FROM orders WHERE id=?', [id]);
    await persist();
    renderAll();
    notify('Заказ удалён');
  });
}
