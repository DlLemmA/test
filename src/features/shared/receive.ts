import { orderRepository, itemRepository } from "@/features/orders/infrastructure.js";
import { drawer, closeDrawer } from "@/core/drawer.js";
import { on } from "@/core/listeners.js";
import { toastState } from "@/core/state.js";
import { uiState } from "@/core/state.js";
import { I, esc, kg, money } from "@/core/utils.js";
import { BrowserQRCodeReader } from "@zxing/browser";
import { Item } from "@/features/orders/domain.js";

let html5QrcodeScanner: BrowserQRCodeReader | null = null;

export async function openReceiveModal(order: {
  id: number;
  title: string;
  boxWeightG?: number;
  shippingCost?: number;
  shippedAt?: string;
  status: string;
}): Promise<void> {
  const items = await itemRepository.findByOrderId(order.id);
  const pending = items.filter((i) => i.status === "Ожидает взвешивания");

  drawer(
    "Приёмка посылки",
    `
    <div class="panel" style="margin-bottom:12px">
      <h3>${esc(order.title)}</h3>
      <div class="grid four">
        <div class="metric"><b>${kg(order.boxWeightG)}</b><span>Вес коробки</span></div>
        <div class="metric"><b>${order.shippingCost ? money(order.shippingCost) : "—"}</b><span>Доставка</span></div>
        <div class="metric"><b>${pending.length}</b><span>Ожидает взвешивания</span></div>
      </div>
    </div>

    <div class="field">
      <label>Вес коробки (г) *</label>
      <input type="number" id="boxWeight" min="0" step="1" inputmode="numeric" autocomplete="off" autofocus value="${order.boxWeightG ?? ""}" placeholder="Например, 6000" required>
    </div>
    <div class="field">
      <label>Стоимость доставки (BYN) *</label>
      <input type="number" id="shippingCost" min="0" step="0.01" inputmode="decimal" autocomplete="off" value="${order.shippingCost ?? ""}" placeholder="Например, 30.00" required>
    </div>
    <div class="field">
      <label>Дата отправления</label>
      <input type="date" id="shippedAt" value="${order.shippedAt || ""}">
    </div>

    ${
      pending.length
        ? `
      <h3 style="margin:16px 0 8px">Товары для взвешивания (${pending.length})</h3>
      <div id="pendingList">${pending
        .map(
          (i) => `
        <div class="item row between">
          <div><b>${esc(i.name)}</b><div class="item-meta">${esc(i.track || "—")}</div></div>
          <button class="secondary" data-manual-item="${i.id}">Указать вес</button>
        </div>
      `,
        )
        .join("")}</div>
    `
        : '<div class="notice good">Все товары взвешены или отмечены как потерянные.</div>'
    }

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
  `,
  );

  bindReceiveEvents(order.id);
}

function bindReceiveEvents(orderId: number): void {
  // Save box info
  on(document.getElementById("boxWeight"), "change", async () => {
    const w = parseInt((document.getElementById("boxWeight") as HTMLInputElement).value);
    await orderRepository.save(
      (await orderRepository.findById(orderId))!.update({ boxWeightG: w }),
    );
  });

  on(document.getElementById("shippingCost"), "change", async () => {
    const c = parseFloat((document.getElementById("shippingCost") as HTMLInputElement).value);
    await orderRepository.save(
      (await orderRepository.findById(orderId))!.update({ shippingCost: c }),
    );
  });

  on(document.getElementById("shippedAt"), "change", async () => {
    const d = (document.getElementById("shippedAt") as HTMLInputElement).value;
    await orderRepository.save((await orderRepository.findById(orderId))!.update({ shippedAt: d }));
  });

  // Manual weigh buttons
  document.querySelectorAll("[data-manual-item]").forEach((btn) => {
    const b = btn as HTMLElement;
    on(b, "click", () => weighItem(parseInt(b.dataset.manualItem!)));
  });

  // Scanner
  on(document.getElementById("startScan"), "click", startScanner);
  on(document.getElementById("stopScan"), "click", stopScanner);
  on(document.getElementById("closeReceive"), "click", closeDrawer);
}

async function startScanner(): Promise<void> {
  const box = document.getElementById("scanBox");
  if (!box) return;
  try {
    const codeReader = new BrowserQRCodeReader();
    html5QrcodeScanner = codeReader;
    const devices = await BrowserQRCodeReader.listVideoInputDevices();
    if (!devices.length) {
      toastState.add({ message: "Камера не найдена", type: "error" });
      return;
    }
    const deviceId = devices[0]?.deviceId;
    if (!deviceId) {
      toastState.add({ message: "Камера не найдена", type: "error" });
      return;
    }
    box.innerHTML = "";
    await codeReader.decodeFromVideoDevice(
      deviceId,
      box as unknown as HTMLVideoElement,
      (result, _err) => {
        if (result) onScanSuccess(result.getText());
      },
    );
    toastState.add({ message: "Сканер запущен", type: "success" });
  } catch (e) {
    toastState.add({
      message: "Ошибка сканера: " + (e instanceof Error ? e.message : String(e)),
      type: "error",
    });
  }
}

function stopScanner(): void {
  if (html5QrcodeScanner) {
    // BrowserQRCodeReader doesn't have reset(), just set to null and clear the box
    html5QrcodeScanner = null;
    const box = document.getElementById("scanBox");
    if (box) box.innerHTML = '<div class="scanplaceholder">Сканер остановлен</div>';
  }
}

async function onScanSuccess(code: string): Promise<void> {
  toastState.add({ message: "Отсканировано: " + code, type: "info" });
  await findBarcode(code);
}

async function findBarcode(code: string): Promise<void> {
  const orderId = uiState.currentOrderId;
  if (!orderId) return;

  const items = await itemRepository.findByOrderId(orderId);
  const matches = items.filter((i) => i.track === code);
  const root = document.getElementById("scanResult");
  if (!root) return;

  if (!matches.length) {
    root.innerHTML = `<div class="notice warn"><b>Товар не найден</b><br>Трек: ${esc(code)}</div>
      <div class="actions"><button id="createUnknown">Создать товар</button><button class="secondary" id="bindExisting">Привязать к существующему</button></div>`;
    on(document.getElementById("createUnknown"), "click", () => {
      closeDrawer();
      openItemForm(null, code);
    });
    on(document.getElementById("bindExisting"), "click", () => chooseExisting(code));
    return;
  }

  if (matches.length === 1) {
    const item = matches[0];
    if (item) showMatch(item);
    return;
  }

  root.innerHTML = `<div class="notice">Найдено несколько товаров с этим трек-номером. Выберите нужный.</div>
    ${matches.map((i) => `<div class="item row between"><div><b>${esc(i.name)}</b><div class="item-meta">${esc(i.track || "—")} · ${esc(i.status)} ${i.weightG !== null ? "· " + kg(i.weightG) : ""}</div></div><button class="secondary" data-match="${i.id}">Выбрать</button></div>`).join("")}`;
  root.querySelectorAll("[data-match]").forEach((btn) => {
    const b = btn as HTMLElement;
    const matchId = parseInt(b.dataset.match!);
    const matchItem = matches.find((i) => i.id === matchId);
    if (matchItem) on(b, "click", () => showMatch(matchItem));
  });
}

function showMatch(item: Item): void {
  const root = document.getElementById("scanResult");
  if (!root) return;
  root.innerHTML = `<div class="panel" style="margin-top:12px;box-shadow:none">
    <div class="row between"><b>${esc(item.name)}</b><span class="pill ${item.status === "Взвешен" ? "good" : ""}">${esc(item.status)}</span></div>
    <div class="item-meta">Трек: ${esc(item.track || "—")}<br>Цена: ${money(item.price)} Br<br>${item.weightG !== null ? "Текущий вес: " + kg(item.weightG) : "Вес ещё не указан"}</div>
    <div class="actions" style="margin-top:10px"><button id="weighMatch">${item.weightG !== null ? "Обновить вес" : "Указать вес"}</button><button class="secondary" id="matchDone">Готово</button></div>
  </div>`;
  on(document.getElementById("weighMatch"), "click", () => {
    closeDrawer();
    weighItem(item.id);
  });
  on(document.getElementById("matchDone"), "click", () => {
    root.innerHTML = "";
  });
}

function chooseExisting(code: string): void {
  const orderId = uiState.currentOrderId;
  if (!orderId) return;

  itemRepository.findByOrderId(orderId).then((list) => {
    drawer(
      "Привязать трек-номер",
      `
      <div class="field"><label>Выберите товар текущего заказа</label><select id="existingItem" autofocus>${list.map((i) => `<option value="${i.id}">${esc(i.name)} — ${esc(i.track || "—")}</option>`).join("")}</select></div>
      <button id="bindNow">Привязать трек-номер</button>
    `,
    );
    on(document.getElementById("bindNow"), "click", async () => {
      const id = parseInt((document.getElementById("existingItem") as HTMLSelectElement).value);
      await itemRepository.save((await itemRepository.findById(id))!.update({ track: code }));
      closeDrawer();
      if (uiState.currentOrderId) {
        const order = await orderRepository.findById(uiState.currentOrderId);
        if (order) openReceiveModal(order);
      }
      toastState.add({ message: "Трек-номер привязан", type: "success" });
    });
  });
}

async function weighItem(itemId: number): Promise<void> {
  const item = await itemRepository.findById(itemId);
  if (!item) return;

  drawer(
    "Взвесить товар",
    `
    <form id="weighForm">
      <div class="field"><label>Вес (г) *</label><input name="weight_g" type="number" step="1" required autofocus></div>
      <div class="actions"><button type="submit">Сохранить вес</button></div>
    </form>
  `,
  );

  const form = document.getElementById("weighForm") as HTMLFormElement;
  if (form) {
    on(form, "submit", async (e) => {
      e.preventDefault();
      const weightG = parseInt(new FormData(form).get("weight_g")?.toString() || "0");
      await itemRepository.save(item.update({ weightG, status: "Взвешен" }));
      closeDrawer();
      if (uiState.currentOrderId) {
        const order = await orderRepository.findById(uiState.currentOrderId);
        if (order) openReceiveModal(order);
      }
      toastState.add({ message: "Вес сохранён", type: "success" });
    });
  }
}

function openItemForm(_itemId: number | null, _trackCode?: string): void {
  // This would need to be implemented or imported from OrdersView
  // For now, just close modal and let user add manually
  closeDrawer();
  toastState.add({ message: "Откройте форму товара вручную", type: "info" });
}
