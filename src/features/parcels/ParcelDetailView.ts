import { parcelRepository, parcelItemRepository } from "./infrastructure";
import {
  parcelServiceInstance as parcelService,
  parcelItemServiceInstance as parcelItemService,
  getParcelWithCalculation,
  completeParcelTracks,
  toggleItemPayment,
  toggleShippingPayment,
} from "@/features/shared/services";
import { customerRepository } from "@/features/customers/infrastructure";
import { drawer, confirmDrawer, closeDrawer } from "@/core/drawer";
import { on } from "@/core/listeners";
import { router, uiState, toastState } from "@/core/state";
import { I, esc, kg, money } from "@/core/utils";
import {
  Parcel,
  ParcelItem,
  type PaymentState,
  createEmptyPaymentState,
  calculateCustomerBalance,
} from "./domain";
import type { Customer } from "@/features/customers/domain";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

export async function renderParcelDetailView(): Promise<void> {
  const root = document.getElementById("parcelView");
  if (!root) return;

  const parcelId = uiState.currentParcelId;
  if (!parcelId) {
    root.innerHTML = `<section class="section"><h2>Нет выбранной посылки</h2></section>`;
    return;
  }

  const result = await getParcelWithCalculation(parcelId);
  if (!result) {
    uiState.setCurrentParcelId(null);
    renderParcelDetailView();
    return;
  }

  const { parcel, items, customers, balances, paymentState } = result;

  root.innerHTML = `
    <section class="section">
      <header class="section-title with-action header-two-row">
        <div class="header-row1">
          <div class="header-main">
            <h2>Посылка №${parcel.id}</h2>
            <span class="pill pill-${parcel.statusClass} pill-sm">${esc(parcel.statusLabel)}</span>
          </div>
          <button class="btn-icon btn-secondary" id="editParcel" aria-label="Редактировать">${I.pencil}</button>
        </div>
        <div class="header-row2">
          <div class="actions-primary">
            ${parcel.status === "draft" ? `<button class="btn-primary btn-sm" id="shipParcel">${I.package} Отправить</button>` : ""}
            ${parcel.status === "shipped" ? `<button class="btn-primary btn-sm" id="receiveParcel">${I.check} Получить</button>` : ""}
            ${parcel.status === "received" ? `<button class="btn-primary btn-sm" id="markAsDone">${I.checkCircle} Готово</button>` : ""}
            ${parcel.status === "done" ? `<button class="btn-primary btn-sm" id="exportParcel">${I.sheet} Экспорт</button>` : ""}
            ${parcel.status === "draft" ? `<button class="btn-primary btn-sm" id="openBatchForm">${I.plus} Партия товаров</button>` : ""}
          </div>
          </div>
      </header>
    </section>

    ${parcel.status === "shipped" || parcel.status === "received" || parcel.status === "done" ? renderReceivedSummary(parcel, items, customers, balances, paymentState) : ""}

    <section class="section">
      <header class="section-title with-action">
        <h3>Товары в посылке</h3>
        ${parcel.status === "draft" ? `<button class="btn-icon btn-secondary" id="addItem" aria-label="Добавить товар">${I.plus}</button>` : ""}
      </header>
      <div id="parcelItemsList">${renderItemsList(items, parcel, customers, paymentState)}</div>
    </section>
  `;

  bindParcelDetailActions(parcel, items, customers, balances, paymentState);
}

function renderReceivedSummary(
  parcel: Parcel,
  items: ParcelItem[],
  customers: Customer[],
  balances: Map<number, { owed: number; paid: number; remaining: number }>,
  paymentState: PaymentState,
): string {
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const itemsTotalWeight = items.reduce((sum, i) => sum + i.weightsG.reduce((a, b) => a + b, 0), 0);
  const totalWeight = (parcel.boxWeightG || 0) + itemsTotalWeight;
  const shippingRate =
    parcel.shippingCostBYN && totalWeight > 0 ? parcel.shippingCostBYN / (totalWeight / 1000) : 0;

  return `
    <div class="metrics-bar mb-3 px-2">
      <div class="metric-item"><b>${kg(totalWeight)} кг</b><span>Вес</span></div>
      <div class="metric-divider"></div>
      <div class="metric-item"><b>${kg(parcel.boxWeightG ?? 0)} кг</b><span>Коробка</span></div>
      <div class="metric-divider"></div>
      <div class="metric-item"><b>${kg(itemsTotalWeight)} кг</b><span>Товары</span></div>
      <div class="metric-divider"></div>
      <div class="metric-item"><b>${parcel.shippingCostBYN ? money(parcel.shippingCostBYN) : "—"}</b><span>Доставка</span></div>
      ${parcel.shippedAt ? `<div class="metric-divider"></div><div class="metric-item"><b>${new Date(parcel.shippedAt).toLocaleDateString("ru-RU")}</b><span>Отправлена</span></div>` : ""}
      ${parcel.receivedAt ? `<div class="metric-divider"></div><div class="metric-item"><b>${new Date(parcel.receivedAt).toLocaleDateString("ru-RU")}</b><span>Получена</span></div>` : ""}
      ${shippingRate > 0 ? `<div class="metric-divider"></div><div class="metric-item highlight"><b>${money(shippingRate)}/кг</b><span>Курс</span></div>` : ""}
    </div>

    <section class="section">
      <header class="section-title">Сводка по заказчикам</header>
      <div class="tablewrap" role="region" aria-label="Сводка по заказчикам" tabindex="0">
        <table>
          <thead><tr><th scope="col">Заказчик</th><th scope="col">Товаров</th><th scope="col">Вес</th><th scope="col">Товары</th><th scope="col">Доставка</th><th scope="col">Опл. товаров</th><th scope="col">Опл. доставки</th><th scope="col">Итого</th><th scope="col">Оплачено</th><th scope="col">Остаток</th></tr></thead>
          <tbody>
            ${
              Array.from(balances.values())
                .map((b, idx) => {
                  const customerId = Array.from(balances.keys())[idx] as number;
                  const customer = customerMap.get(customerId);
                  const customerItems = items.filter((i) => i.customerId === customerId);
                  const weight = customerItems.reduce(
                    (sum, i) => sum + i.weightsG.reduce((a, c) => a + c, 0),
                    0,
                  );
                  const itemTotal = customerItems.reduce((sum, i) => sum + i.totalPriceBYN, 0);
                  const shippingShare = b.owed - itemTotal;
                  const shippingPaid = paymentState.shippingPaid.get(customerId) || false;
                  return `
                    <tr>
                      <td>${esc(customer?.name || "")}${customer?.isSelf ? " (я)" : ""}</td>
                      <td class="tabular-nums">${customerItems.length}</td>
                      <td class="tabular-nums">${kg(weight)}</td>
                      <td class="tabular-nums">${money(itemTotal)}</td>
                      <td class="tabular-nums">${money(shippingShare)}</td>
                      <td class="text-center">
                        <input type="checkbox" class="item-paid-all" data-customer="${customerId}" ${customerItems.every((i) => paymentState.itemPaid.get(i.id)) ? "checked" : ""} ${customerItems.every((i) => paymentState.itemPaid.get(i.id)) || customerItems.some((i) => paymentState.itemPaid.get(i.id)) ? "" : ""}>
                      </td>
                      <td class="text-center">
                        <input type="checkbox" class="shipping-paid" data-customer="${customerId}" ${shippingPaid ? "checked" : ""}>
                      </td>
                      <td class="tabular-nums font-semibold">${money(b.owed)}</td>
                      <td class="tabular-nums">${money(b.paid)}</td>
                      <td class="tabular-nums ${b.remaining > 0 ? "text-red-600" : ""}">${money(b.remaining)}</td>
                    </tr>
                  `;
                })
                .join("") ||
              '<tr><td colspan="10" class="text-center py-6 text-slate-400">Нет товаров</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderItemsList(
  items: ParcelItem[],
  parcel: Parcel,
  customers: Customer[],
  paymentState: PaymentState,
): string {
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const html = items
    .map((i) => itemHtml(i, parcel, customerMap.get(i.customerId), paymentState))
    .join("");
  return html || '<div class="empty">Нет товаров</div>';
}

function itemHtml(
  item: ParcelItem,
  parcel: Parcel,
  customer?: Customer,
  paymentState?: PaymentState,
): string {
  const statusCls = item.statusClass;
  const trackCount = Math.max(item.trackNumbers.length, 1);
  const trackInputs = Array.from({ length: trackCount }, (_, idx) => {
    const track = item.trackNumbers[idx] || "";
    const weight = item.weightsG[idx] || "";
    return `
      <div class="flex gap-2 items-center mb-1">
        <input class="track-input flex-1" data-item="${item.id}" data-idx="${idx}" placeholder="Трек ${idx + 1}" value="${esc(track)}" ${parcel.status !== "draft" ? "readonly" : ""}>
        ${parcel.status === "draft" && !item.tracksCompleted ? `<button type="button" class="btn-danger btn-sm" data-del-track="${item.id}" data-idx="${idx}" title="Удалить трек">×</button>` : ""}
        ${parcel.status === "received" ? `<input class="weight-input w-20" data-item="${item.id}" data-idx="${idx}" type="number" step="1" placeholder="Вес" value="${weight}" readonly>` : ""}
      </div>
    `;
  }).join("");

  const trackControls =
    parcel.status === "draft"
      ? item.tracksCompleted
        ? `<span class="text-xs text-slate-500 mt-1">Треки готовы</span>`
        : `<button type="button" class="btn-secondary btn-sm mt-1" data-add-track="${item.id}">${I.plus} Добавить трек</button>
         <button type="button" class="btn-primary btn-sm mt-1" data-complete-item-tracks="${item.id}">${I.check} Треки готовы</button>`
      : `<span class="text-xs text-slate-500">${item.tracksCompleted ? "Треки готовы" : "Треки не готовы"}</span>`;

  // Payment button for shipped/received/done
  const isItemPaid = paymentState?.itemPaid.get(item.id) || false;
  const paymentBtn =
    parcel.status === "shipped" || parcel.status === "received" || parcel.status === "done"
      ? `<button type="button" class="btn-primary btn-sm" data-toggle-payment="${item.id}" ${isItemPaid ? "disabled" : ""}>
           ${isItemPaid ? `${I.check} Оплачено` : `${I.creditcard} Оплатить`}
         </button>`
      : "";

  return `
    <div class="item">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="font-bold truncate">${esc(item.name)}</div>
          <div class="text-xs text-slate-500 mt-0.5">${esc(customer?.name || "")}${customer?.isSelf ? " (я)" : ""} · ${item.priceCNY} CNY → ${money(item.priceBYN)} BYN · ${item.quantity} ${item.unitLabel}</div>
          <div class="flex items-center gap-2 flex-wrap mt-1.5">
            <span class="pill pill-${statusCls}">${esc(item.statusLabel)}</span>
            ${item.trackNumbers.length > 0 ? `<span class="text-xs text-slate-500">${item.trackNumbers.length} трек${item.trackNumbers.length === 1 ? "" : item.trackNumbers.length < 5 ? "а" : "ов"}</span>` : ""}
            ${parcel.status === "received" ? `<span class="text-xs text-slate-500">${item.weightsG.filter((w) => w > 0).length}/${item.trackNumbers.length} весов</span>` : ""}
          </div>
          <div class="mt-2">${trackInputs}</div>
          <div class="mt-1">${trackControls}</div>
        </div>
        <div class="item-right shrink-0">
          <b class="tabular-nums ${isItemPaid ? "text-emerald-700" : "text-slate-900"}">${money(item.totalPriceBYN)}</b>
          <div class="flex gap-2 justify-end mt-1.5 items-center">
            ${paymentBtn}
            ${parcel.status === "draft" ? `<button class="btn-icon btn-secondary" data-edit="${item.id}" aria-label="Редактировать">${I.pencil}</button>` : ""}
            ${parcel.status === "draft" ? `<button class="btn-icon btn-secondary" data-move="${item.id}" aria-label="Переместить">${I.arrowRight}</button>` : ""}
            ${parcel.status === "draft" ? `<button class="btn-icon btn-danger" data-delete="${item.id}" aria-label="Удалить">${I.trash}</button>` : ""}
          </div>
        </div>
      </div>
    </div>
  `;
}

function bindParcelDetailActions(
  parcel: Parcel,
  items: ParcelItem[],
  customers: Customer[],
  balances: Map<number, { owed: number; paid: number; remaining: number }>,
  paymentState: PaymentState,
): void {
  // Ship parcel
  document.getElementById("shipParcel")?.addEventListener("click", async () => {
    if (items.length === 0) {
      toastState.add({
        message: "Нельзя отправить пустую посылку. Добавьте хотя бы один товар.",
        type: "error",
      });
      return;
    }
    const itemsWithoutTracks = items.filter((i) => !i.tracksCompleted);
    if (itemsWithoutTracks.length > 0) {
      toastState.add({
        message: `У ${itemsWithoutTracks.length} товар(ов) не заполнены все трек-номера. Заполните треки или нажмите «Треки готовы» когда всё заполнено.`,
        type: "error",
      });
      return;
    }
    await parcelService.shipParcel(parcel.id);
    renderParcelDetailView();
    toastState.add({ message: "Посылка отправлена", type: "success" });
  });

  // Receive parcel (shipped -> received, needs weight/cost form)
  document.getElementById("receiveParcel")?.addEventListener("click", () => {
    openReceiveForm(parcel);
  });

  // Mark parcel as done (received -> done)
  document.getElementById("markAsDone")?.addEventListener("click", async () => {
    await parcelService.markAsDoneParcel(parcel.id);
    renderParcelDetailView();
    toastState.add({ message: "Посылка завершена", type: "success" });
  });

  // Edit parcel
  document.getElementById("editParcel")?.addEventListener("click", () => {
    openParcelEditForm(parcel);
  });

  // Add item (for draft without batch form)
  document.getElementById("addItem")?.addEventListener("click", () => {
    openItemForm(null, parcel.id);
  });

  // Item actions
  const listRoot = document.getElementById("parcelItemsList");
  if (listRoot) {
    listRoot.querySelectorAll("[data-edit]").forEach((b) => {
      const el = b as HTMLElement;
      on(el, "click", () => openItemForm(parseInt(el.dataset.edit!), parcel.id));
    });
    listRoot.querySelectorAll("[data-move]").forEach((b) => {
      const el = b as HTMLElement;
      on(el, "click", () => moveItem(parseInt(el.dataset.move!)));
    });
    listRoot.querySelectorAll("[data-delete]").forEach((b) => {
      const el = b as HTMLElement;
      on(el, "click", () => deleteItem(parseInt(el.dataset.delete!)));
    });

    // Delete track button
    listRoot.querySelectorAll("[data-del-track]").forEach((b) => {
      const el = b as HTMLElement;
      on(el, "click", async () => {
        const itemId = parseInt(el.dataset.delTrack!);
        const idx = parseInt(el.dataset.idx!);
        const item = items.find((i) => i.id === itemId);
        if (!item) return;
        const newTracks = item.trackNumbers.filter((_, i) => i !== idx).filter((t) => t !== "");
        await parcelItemService.updateItem(itemId, {
          trackNumbers: newTracks,
          tracksCompletedAt: undefined,
        });
        renderParcelDetailView();
      });
    });

    // Complete item tracks button (mark this item's tracks filled)
    listRoot.querySelectorAll("[data-complete-item-tracks]").forEach((b) => {
      const el = b as HTMLElement;
      on(el, "click", async () => {
        const itemId = parseInt(el.dataset.completeItemTracks!);
        const item = items.find((i) => i.id === itemId);
        if (!item) return;
        if (item.trackNumbers.length === 0 || item.trackNumbers.some((t) => t.trim() === "")) {
          toastState.add({ message: "Заполните все трек-номера перед завершением", type: "error" });
          return;
        }
        const ts = new Date().toISOString();
        await parcelItemService.updateItem(itemId, { tracksCompletedAt: ts });
        renderParcelDetailView();
        toastState.add({ message: "Треки товара отмечены как готовые", type: "success" });
      });
    });

    // Add track button
    listRoot.querySelectorAll("[data-add-track]").forEach((b) => {
      const el = b as HTMLElement;
      on(el, "click", async () => {
        const itemId = parseInt(el.dataset.addTrack!);
        const item = items.find((i) => i.id === itemId);
        if (!item) return;
        const newTracks = [...item.trackNumbers.filter((t) => t !== ""), ""];
        await parcelItemService.updateItem(itemId, {
          trackNumbers: newTracks,
          tracksCompletedAt: undefined,
        });
        renderParcelDetailView();
      });
    });

    // Save track numbers on blur
    listRoot.querySelectorAll(".track-input").forEach((input) => {
      const el = input as HTMLInputElement;
      const itemId = parseInt(el.dataset.item!);
      const idx = parseInt(el.dataset.idx!);
      on(el, "blur", async () => {
        const item = items.find((i) => i.id === itemId);
        if (!item) return;
        const newTracks = [...item.trackNumbers];
        newTracks[idx] = el.value.trim();
        // Save only non-empty tracks; reset tracksCompletedAt when track numbers change
        await parcelItemService.updateItem(itemId, {
          trackNumbers: newTracks.filter((t) => t !== ""),
          tracksCompletedAt: undefined,
        });
        renderParcelDetailView();
      });
    });

    // Toggle item payment (shipped/received)
    listRoot.querySelectorAll("[data-toggle-payment]").forEach((btn) => {
      const el = btn as HTMLElement;
      on(el, "click", async () => {
        const itemId = parseInt(el.dataset.togglePayment!);
        const item = items.find((i) => i.id === itemId);
        if (!item) return;
        const newPaid = !paymentState.itemPaid.get(itemId);
        await toggleItemPayment(parcel.id, itemId, item.customerId);
        renderParcelDetailView();
      });
    });
  }

  // Batch form - Stage 1: open batch form modal
  document.getElementById("openBatchForm")?.addEventListener("click", () => {
    openBatchStage1(parcel.id);
  });

  // Payment checkboxes in received summary
  document.querySelectorAll(".item-paid-all").forEach((checkbox) => {
    const el = checkbox as HTMLInputElement;
    const customerId = parseInt(el.dataset.customer!);
    const customerItems = items.filter((i) => i.customerId === customerId);
    const allPaid = customerItems.every((i) => paymentState.itemPaid.get(i.id));

    on(el, "change", async () => {
      const newPaid = el.checked;
      for (const item of customerItems) {
        await toggleItemPayment(parcel.id, item.id, customerId);
      }
      renderParcelDetailView();
    });
  });

  document.querySelectorAll(".shipping-paid").forEach((checkbox) => {
    const el = checkbox as HTMLInputElement;
    const customerId = parseInt(el.dataset.customer!);

    on(el, "change", async () => {
      await toggleShippingPayment(parcel.id, customerId);
      renderParcelDetailView();
    });
  });
}

// ============================================
// Helper Functions
// ============================================

async function openReceiveForm(parcel: Parcel): Promise<void> {
  const items = await parcelItemRepository.findByParcelId(parcel.id);
  const customers = await customerRepository.findAll();
  const customerMap = new Map(customers.map((c) => [c.id, c]));

  // Build track -> (itemId, idx) map for quick lookup
  const trackMap = new Map<string, { itemId: number; idx: number; weightInputId: string }>();
  items.forEach((item) => {
    item.trackNumbers.forEach((track, idx) => {
      if (track)
        trackMap.set(track, { itemId: item.id, idx, weightInputId: `weight_${item.id}_${idx}` });
    });
  });

  drawer(
    "Получение посылки",
    `
    <form id="receiveForm">
      <div class="field"><label>Общий вес посылки (г) *</label><input name="totalWeightG" type="number" step="1" required autofocus placeholder="Вес коробки + товаров"></div>
      <div class="field"><label>Стоимость доставки (BYN) *</label><input name="shippingCostBYN" type="number" step="0.01" required value="${parcel.shippingCostBYN || ""}"></div>
      <div class="field">
        <button type="button" class="btn-secondary" id="scanBtn">${I.scan || "📷"} Сканировать трек</button>
        <span id="scanStatus" class="text-xs text-slate-500 ml-2"></span>
      </div>
      <div class="field">
        <video id="scanPreview" style="width: 100%; max-width: 100%; background: #000; border-radius: 8px; display: none;" muted playsinline></video>
      </div>
      <h3>Веса товаров</h3>
      ${items
        .map(
          (item) => `
        <div class="field">
          <label>${esc(item.name)} (${item.quantity} ${item.unitLabel})</label>
          <div class="flex items-center gap-2 mb-2">
            <input type="checkbox" name="lost_${item.id}" id="lost_${item.id}" ${item.status === "lost" ? "checked" : ""}>
            <label for="lost_${item.id}" class="text-sm">Потерян</label>
          </div>
          ${Array.from(
            { length: item.quantity },
            (_, idx) => `
            <div class="flex gap-2 items-center mb-1">
              <span class="text-xs text-slate-500 w-16">Трек ${idx + 1}</span>
              <input name="weight_${item.id}_${idx}" type="number" step="1" placeholder="Вес (г)" value="${item.weightsG[idx] || ""}" id="weight_${item.id}_${idx}" class="item-weight-input">
            </div>
          `,
          ).join("")}
        </div>
      `,
        )
        .join("")}
      <div class="actions"><button type="submit">Получить посылку</button></div>
    </form>
  `,
  );

  // Scanner logic using ZXing (works in Safari, Chrome, Firefox)
  const scanBtn = document.getElementById("scanBtn") as HTMLButtonElement;
  const scanStatus = document.getElementById("scanStatus") as HTMLSpanElement;
  const scanPreview = document.getElementById("scanPreview") as HTMLVideoElement;
  let codeReader: BrowserMultiFormatReader | null = null;
  let scannerControls: IScannerControls | null = null;
  let isScanning = false;

  async function initScanner(): Promise<boolean> {
    try {
      // Configure ZXing reader with hints for better performance
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.DATA_MATRIX,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      codeReader = new BrowserMultiFormatReader(hints);
      return true;
    } catch {
      scanStatus.textContent = "Ошибка инициализации сканера";
      return false;
    }
  }

  async function startScan(): Promise<void> {
    if (isScanning) return;
    if (!codeReader && !(await initScanner())) return;

    isScanning = true;
    scanBtn.textContent = "Остановить сканирование";
    scanStatus.textContent = "Наведите камеру на штрихкод...";
    scanPreview.style.display = "block";

    let controls: IScannerControls;
    try {
      // Use ZXing's built-in camera handling with our video preview element
      controls = await codeReader!.decodeFromConstraints(
        {
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        scanPreview, // Pass our video element for preview
        (result, error, callbackControls) => {
          if (!isScanning) return;

          if (result) {
            // Stop from the callback: it has the controls even if
            // decodeFromConstraints() hasn't resolved yet on the first frame.
            const code = result.getText().trim();
            stopScan(callbackControls);
            handleScannedCode(code);
            return;
          }
          // Ignore NotFoundException errors (they're normal when no barcode is visible)
          if (error && error.name !== "NotFoundException") {
            console.warn("ZXing scan error:", error);
          }
        }
      );
    } catch {
      stopScan();
      scanStatus.textContent = "Не удалось получить доступ к камеру";
      return;
    }

    if (isScanning) {
      scannerControls = controls;
    } else {
      // Scanning was stopped while we were waiting for the camera
      controls.stop();
    }
  }

  function stopScan(activeControls?: IScannerControls): void {
    const controls = activeControls ?? scannerControls;
    isScanning = false;
    scannerControls = null;
    controls?.stop();

    scanPreview.style.display = "none";
    scanPreview.srcObject = null;
    scanBtn.textContent = `${I.scan || "📷"} Сканировать трек`;
    scanStatus.textContent = "";
    scanStatus.style.color = "";
  }

  function handleScannedCode(code: string): void {
    const match = trackMap.get(code);
    if (match) {
      const input = document.getElementById(match.weightInputId) as HTMLInputElement | null;
      if (input) {
        input.focus();
        input.select();
        scanStatus.textContent = `✓ Найден: ${code} → фокус на весе`;
        scanStatus.style.color = "green";
      }
    } else {
      scanStatus.textContent = `✗ Трек не найден в посылке: ${code}`;
      scanStatus.style.color = "red";
    }
    setTimeout(() => {
      scanStatus.textContent = "";
      scanStatus.style.color = "";
    }, 3000);
  }

  scanBtn?.addEventListener("click", () => {
    if (isScanning) stopScan();
    else startScan();
  });

  const form = document.getElementById("receiveForm") as HTMLFormElement;
  if (form) {
    // Auto-calculate box weight from total weight - item weights
    const totalWeightInput = form.querySelector('[name="totalWeightG"]') as HTMLInputElement;
    const boxWeightInput = form.querySelector('[name="boxWeightG"]') as HTMLInputElement;
    const itemWeightInputs = form.querySelectorAll(
      ".item-weight-input",
    ) as NodeListOf<HTMLInputElement>;

    function updateBoxWeight(): void {
      const totalWeight = parseInt(totalWeightInput.value) || 0;
      let itemsWeight = 0;
      itemWeightInputs.forEach((input) => {
        itemsWeight += parseInt(input.value) || 0;
      });
      const boxWeight = Math.max(0, totalWeight - itemsWeight);
      boxWeightInput.value = boxWeight.toString();
    }

    totalWeightInput?.addEventListener("input", updateBoxWeight);
    itemWeightInputs.forEach((input) => {
      input.addEventListener("input", updateBoxWeight);
    });

    on(form, "submit", async (e) => {
      e.preventDefault();
      stopScan(); // cleanup camera
      const formData = new FormData(form);
      const totalWeightG = parseInt(formData.get("totalWeightG")?.toString() || "0");
      const shippingCostBYN = parseFloat(formData.get("shippingCostBYN")?.toString() || "0");

      // Update weights for each item and calculate items total
      let itemsTotalWeight = 0;
      for (const item of items) {
        const isLost = formData.get(`lost_${item.id}`) === "on";
        if (isLost) {
          await parcelItemService.updateItem(item.id, { status: "lost" });
          continue;
        }
        const weights: number[] = [];
        for (let idx = 0; idx < item.quantity; idx++) {
          const weight = parseInt(formData.get(`weight_${item.id}_${idx}`)?.toString() || "0");
          weights.push(weight);
          itemsTotalWeight += weight;
        }
        await parcelItemService.setWeights(item.id, weights);
      }

      // Box weight = total weight - items weight
      const boxWeightG = Math.max(0, totalWeightG - itemsTotalWeight);

      await parcelService.receiveParcel(parcel.id, boxWeightG, shippingCostBYN);
      closeDrawer();
      renderParcelDetailView();
      toastState.add({ message: "Посылка получена", type: "success" });
    });
  }
}

async function openParcelEditForm(parcel: Parcel): Promise<void> {
  const items = await parcelItemRepository.findByParcelId(parcel.id);
  const itemsTotalWeight = items.reduce(
    (sum, item) => sum + item.weightsG.reduce((a, b) => a + b, 0),
    0,
  );
  const totalWeight = (parcel.boxWeightG || 0) + itemsTotalWeight;

  drawer(
    "Редактировать посылку",
    `
    <form id="parcelForm">
      <div class="field"><label>Название посылки</label><input name="name" value="${esc(parcel.name || "")}" placeholder="Например: Посылка из PDD #5"></div>
      <div class="field"><label>Общий вес посылки (г)</label><input name="totalWeightG" type="number" step="1" value="${totalWeight}" placeholder="Вес коробки + товаров"></div>
      <div class="field"><label>Стоимость доставки (BYN)</label><input name="shippingCostBYN" type="number" step="0.01" value="${parcel.shippingCostBYN || ""}" placeholder="Стоимость доставки карго"></div>
      <div class="actions"><button type="submit">Сохранить</button></div>
    </form>
  `,
  );

  const form = document.getElementById("parcelForm") as HTMLFormElement;
  if (form) {
    on(form, "submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const name = formData.get("name")?.toString().trim() || null;
      const totalWeightG = parseInt(formData.get("totalWeightG")?.toString() || "0");
      const shippingCostBYN = formData.get("shippingCostBYN")?.toString();

      // Box weight = total weight - items weight
      const boxWeightG = Math.max(0, totalWeightG - itemsTotalWeight);

      await parcelRepository.save(
        parcel.update({
          name,
          boxWeightG,
          shippingCostBYN: shippingCostBYN ? parseFloat(shippingCostBYN) : null,
        }),
      );
      closeDrawer();
      renderParcelDetailView();
      toastState.add({ message: "Посылка сохранена", type: "success" });
    });
  }
}

function openItemForm(itemId: number | null, parcelId: number): void {
  if (itemId) {
    parcelItemRepository.findById(itemId).then((item) => {
      if (item) renderItemForm(item, parcelId, false);
    });
  } else {
    renderItemForm(null, parcelId, true);
  }
}

function renderItemForm(item: ParcelItem | null, parcelId: number, isNew: boolean): void {
  customerRepository.findAll().then((customers) => {
    const customerOptions = customers
      .map(
        (c) =>
          `<option value="${c.id}" ${c.id === item?.customerId ? "selected" : ""}>${esc(c.name)}${c.isSelf ? " (я)" : ""}</option>`,
      )
      .join("");

    drawer(
      isNew ? "Новый товар" : "Редактировать товар",
      `
      <form id="itemForm" novalidate class="grid grid-cols-2 gap-3">
        <div class="field col-span-2"><label>Название *</label><input name="name" required autocomplete="off" autofocus value="${esc(item?.name || "")}"></div>
        <div class="field col-span-2"><label>Заказчик *</label><select name="customer_id" required>${customerOptions}</select></div>
        <div class="field"><label>Цена в юанях (CNY) *</label><input name="priceCNY" type="number" step="0.01" required value="${item?.priceCNY || ""}"></div>
        <div class="field"><label>Цена в рублях (BYN) *</label><input name="priceBYN" type="number" step="0.01" required value="${item?.priceBYN || ""}"></div>
        <div class="field"><label>Количество *</label><input name="quantity" type="number" step="1" min="1" required value="${item?.quantity || 1}"></div>
        <div class="field"><label>Единица</label><select name="unit"><option value="pcs" ${item?.unit === "pcs" ? "selected" : ""}>шт</option><option value="packs" ${item?.unit === "packs" ? "selected" : ""}>упак</option></select></div>
        <div class="col-span-2"><button type="submit" class="btn-primary w-full">${isNew ? "Добавить" : "Сохранить"}</button></div>
      </form>
    `,
    );

    const form = document.getElementById("itemForm") as HTMLFormElement;
    if (form) {
      on(form, "submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const data = {
          parcelId,
          name: formData.get("name")?.toString().trim() || "",
          customerId: parseInt(formData.get("customer_id")?.toString() || "0"),
          priceCNY: parseFloat(formData.get("priceCNY")?.toString() || "0"),
          priceBYN: parseFloat(formData.get("priceBYN")?.toString() || "0"),
          quantity: parseInt(formData.get("quantity")?.toString() || "1"),
          unit: (formData.get("unit")?.toString() as "pcs" | "packs") || "pcs",
        };

        if (isNew) {
          const newItem = ParcelItem.create(data);
          await parcelItemRepository.save(newItem);
        } else if (item) {
          const { parcelId: _, ...updateData } = data;
          const updated = item.update(updateData);
          await parcelItemRepository.save(updated);
        }
        closeDrawer();
        renderParcelDetailView();
        toastState.add({ message: "Товар сохранён", type: "success" });
      });
    }
  });
}

async function moveItem(itemId: number): Promise<void> {
  const item = await parcelItemRepository.findById(itemId);
  if (!item) return;

  const parcels = await parcelRepository.findAll();
  const otherDrafts = parcels.filter((p) => p.id !== item.parcelId && p.status === "draft");

  if (otherDrafts.length === 0) {
    toastState.add({ message: "Нет других черновиков для перемещения", type: "warn" });
    return;
  }

  const options = otherDrafts
    .map((p) => `<option value="${p.id}">Посылка №${p.id} (${p.formattedDate})</option>`)
    .join("");

  drawer(
    "Переместить товар",
    `
    <form id="moveForm">
      <div class="field"><label>Выберите посылку</label><select name="targetParcel">${options}</select></div>
      <div class="actions"><button type="submit">Переместить</button></div>
    </form>
  `,
  );

  const form = document.getElementById("moveForm") as HTMLFormElement;
  if (form) {
    on(form, "submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const targetId = parseInt(formData.get("targetParcel")?.toString() || "0");
      if (targetId) {
        await parcelItemRepository.save(item.update({ parcelId: targetId }));
        closeDrawer();
        renderParcelDetailView();
        toastState.add({ message: "Товар перемещён", type: "success" });
      }
    });
  }
}

async function deleteItem(itemId: number): Promise<void> {
  confirmDrawer(
    "Удалить товар",
    "Товар будет удалён. Это действие нельзя отменить.",
    "Удалить",
    async () => {
      await parcelItemRepository.delete(itemId);
      renderParcelDetailView();
      toastState.add({ message: "Товар удалён", type: "success" });
    },
  );
}

// ============================================
// Batch Flow (Two-Stage)
// ============================================

async function openBatchStage1(parcelId: number): Promise<void> {
  const customers = await customerRepository.findAll();
  const customerOptions = customers
    .map((c) => `<option value="${c.id}">${esc(c.name)}${c.isSelf ? " (я)" : ""}</option>`)
    .join("");

  drawer(
    "Новая партия — Шаг 1: Суммы заказа",
    `
    <form id="batchStage1Form" novalidate>
      <div class="field"><label>Цена заказа в юанях (CNY) *</label><input name="totalCNY" type="number" step="0.01" required autofocus placeholder="Например, 1000"></div>
      <div class="field"><label>Цена заказа в рублях (BYN) *</label><input name="totalBYN" type="number" step="0.01" required placeholder="Например, 130"></div>
      <div class="actions"><button type="submit" class="btn-primary w-full">${I.arrowRight} Далее: добавить товары</button></div>
    </form>
  `,
  );

  const form = document.getElementById("batchStage1Form") as HTMLFormElement;
  if (form) {
    on(form, "submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const totalCNY = parseFloat(formData.get("totalCNY")?.toString() || "0");
      const totalBYN = parseFloat(formData.get("totalBYN")?.toString() || "0");
      if (totalCNY <= 0 || totalBYN <= 0) {
        toastState.add({ message: "Введите корректные цены", type: "error" });
        return;
      }
      closeDrawer();
      openBatchStage2(parcelId, totalCNY, totalBYN);
    });
  }
}

async function openBatchStage2(
  parcelId: number,
  totalCNY: number,
  totalBYN: number,
): Promise<void> {
  const rate = totalBYN / totalCNY;
  const customers = await customerRepository.findAll();
  const customerOptions = customers
    .map((c) => `<option value="${c.id}">${esc(c.name)}${c.isSelf ? " (я)" : ""}</option>`)
    .join("");

  let batchItems: Array<{
    name: string;
    priceCNY: number;
    priceBYN: number;
    quantity: number;
    unit: "pcs" | "packs";
    customerId: number;
  }> = [];

  function renderStage2(): string {
    const itemsHtml = batchItems
      .map(
        (item, idx) => `
      <div class="item" data-idx="${idx}">
        <div class="flex items-center justify-between gap-3 py-2">
          <div class="flex-1 min-w-0">
            <b class="truncate">${esc(item.name)}</b>
            <div class="text-xs text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap truncate">
              <span>${item.priceCNY} CNY (${money(item.priceBYN)} BYN) × ${item.quantity} ${item.unit === "pcs" ? "шт" : "упак"}</span>
              <span>${esc(customers.find((c) => c.id === item.customerId)?.name || "")}</span>
            </div>
          </div>
          <button type="button" class="btn-icon btn-danger" data-remove="${idx}" aria-label="Удалить">${I.trash}</button>
        </div>
      </div>
    `,
      )
      .join("");

    const currentCNY = batchItems.reduce((sum, i) => sum + i.priceCNY * i.quantity, 0);
    const currentBYN = batchItems.reduce((sum, i) => sum + i.priceBYN * i.quantity, 0);

    return `
      <form id="batchStage2Form" novalidate>
        <div class="mb-3 p-3 bg-slate-50 rounded-xl">
          <div class="text-sm"><b>Курс:</b> 1 CNY = ${rate.toFixed(4)} BYN</div>
          <div class="text-sm"><b>Цель:</b> ${totalCNY} CNY / ${totalBYN} BYN</div>
          <div class="text-sm"><b>Добавлено:</b> ${currentCNY} CNY / ${currentBYN} BYN</div>
          <div class="text-sm ${currentCNY > totalCNY || currentBYN > totalBYN ? "text-red-600" : ""}">
            <b>Остаток:</b> ${Math.max(0, totalCNY - currentCNY)} CNY / ${Math.max(0, totalBYN - currentBYN)} BYN
          </div>
        </div>
        
        <div id="batchItemsList">${itemsHtml || '<div class="empty">Товаров пока нет</div>'}</div>
        
        <section class="section mt-3">
          <header class="section-title">Добавить товар</header>
          <div class="field col-span-2"><label>Название *</label><input name="name" required autocomplete="off" autofocus></div>
          <div class="field"><label>Заказчик *</label><select name="customer_id" required>${customerOptions}</select></div>
          <div class="field"><label>Цена в юанях (CNY) *</label><input name="priceCNY" type="number" step="0.01" required></div>
          <div class="field"><label>Количество *</label><input name="quantity" type="number" step="1" min="1" required value="1"></div>
          <div class="field"><label>Единица</label><select name="unit"><option value="pcs">шт</option><option value="packs">упак</option></select></div>
          <div class="col-span-2"><button type="button" class="btn-secondary w-full" id="addBatchItemBtn">${I.plus} Добавить в партию</button></div>
        </section>
        
        ${
          batchItems.length > 0
            ? `
        <div class="actions" style="margin-top:12px">
          <button type="submit" class="btn-primary w-full">${I.check} Сохранить партию (${batchItems.length} товаров)</button>
        </div>
        `
            : ""
        }
      </form>
    `;
  }

  drawer("Новая партия — Шаг 2: Товары", renderStage2());

  // Bind events using event delegation
  const handleEvents = () => {
    // Add batch item
    document.getElementById("addBatchItemBtn")?.addEventListener("click", async () => {
      const nameInput = document.querySelector('[name="name"]') as HTMLInputElement;
      const customerSelect = document.querySelector('[name="customer_id"]') as HTMLSelectElement;
      const priceCNYInput = document.querySelector('[name="priceCNY"]') as HTMLInputElement;
      const quantityInput = document.querySelector('[name="quantity"]') as HTMLInputElement;
      const unitSelect = document.querySelector('[name="unit"]') as HTMLSelectElement;

      const name = nameInput?.value.trim();
      const customerId = parseInt(customerSelect?.value || "0");
      const priceCNY = parseFloat(priceCNYInput?.value || "0");
      const quantity = parseInt(quantityInput?.value || "1");
      const unit = (unitSelect?.value as "pcs" | "packs") || "pcs";

      if (!name || !customerId || priceCNY <= 0) {
        toastState.add({ message: "Заполните все обязательные поля", type: "error" });
        return;
      }

      const priceBYN = Math.round(priceCNY * rate * 100) / 100;

      batchItems.push({ name, priceCNY, priceBYN, quantity, unit, customerId });

      // Clear form
      if (nameInput) nameInput.value = "";
      if (priceCNYInput) priceCNYInput.value = "";
      if (quantityInput) quantityInput.value = "1";

      // Re-render
      const drawerContent = document.querySelector(".drawer-content");
      if (drawerContent) drawerContent.innerHTML = renderStage2();
      handleEvents();
    });

    // Remove batch item
    document.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt((btn as HTMLElement).dataset.remove!);
        batchItems.splice(idx, 1);
        const drawerContent = document.querySelector(".drawer-content");
        if (drawerContent) drawerContent.innerHTML = renderStage2();
        handleEvents();
      });
    });

    // Submit batch
    const form = document.getElementById("batchStage2Form") as HTMLFormElement;
    if (form) {
      on(form, "submit", async (e) => {
        e.preventDefault();
        if (batchItems.length === 0) {
          toastState.add({ message: "Добавьте хотя бы один товар в партию", type: "error" });
          return;
        }

        const { addItemsToParcel } = await import("@/features/shared/services");
        await addItemsToParcel(parcelId, batchItems);
        closeDrawer();
        renderParcelDetailView();
        toastState.add({
          message: `Партия сохранена (${batchItems.length} товаров)`,
          type: "success",
        });
      });
    }
  };

  handleEvents();
}

// Auto-render when route becomes active
router.subscribe((route, params) => {
  if (route === "parcel") {
    const parcelId = parseInt(params.parcelId || "0");
    if (parcelId) {
      uiState.setCurrentParcelId(parcelId);
    }
    renderParcelDetailView();
  }
});
