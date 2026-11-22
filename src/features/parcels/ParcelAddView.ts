import { parcelRepository, parcelItemRepository } from "./infrastructure";
import { on } from "@/core/listeners";
import { router, uiState, toastState } from "@/core/state";
import { I, esc, money } from "@/core/utils";
import type { Customer } from "@/features/customers/domain";

// ============================================
// Parcel Add View (страница добавления партии товаров)
// ============================================

// Stage 1: ввод общих сумм заказа
async function renderStage1(
  root: HTMLElement,
  parcels: any[],
  selectedParcelId: number,
): Promise<void> {
  root.innerHTML = `
    <section class="section">
      <header class="section-title with-action">
        <h2>Новая партия</h2>
      </header>
      <div class="field mb-3">
        <label>Добавить в посылку</label>
        <select name="parcelId" id="addParcelSelect">
          ${parcels
            .map(
              (p) => `
            <option value="${p.id}" ${p.id === selectedParcelId ? "selected" : ""}>
              Посылка №${p.id} · ${p.statusLabel} · ${p.formattedDate}
            </option>
          `,
            )
            .join("")}
        </select>
      </div>

      <form id="stage1Form" novalidate>
        <div class="field"><label>Общая сумма заказа в юанях (CNY) *</label><input name="totalCNY" type="number" step="0.01" required autofocus placeholder="Например, 1000"></div>
        <div class="field"><label>Общая сумма заказа в рублях (BYN) *</label><input name="totalBYN" type="number" step="0.01" required placeholder="Например, 130"></div>
        <div class="actions"><button type="submit" class="btn-primary w-full">${I.arrowRight} Далее: добавить товары</button></div>
      </form>
    </section>
  `;

  const select = document.getElementById("addParcelSelect") as HTMLSelectElement;
  select?.addEventListener("change", () => {
    selectedParcelId = parseInt(select.value) || 0;
    renderStage1(root, parcels, selectedParcelId);
  });

  const form = document.getElementById("stage1Form") as HTMLFormElement;
  if (form) {
    on(form, "submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const totalCNY = parseFloat(formData.get("totalCNY")?.toString() || "0");
      const totalBYN = parseFloat(formData.get("totalBYN")?.toString() || "0");
      if (totalCNY <= 0 || totalBYN <= 0) {
        toastState.add({ message: "Введите корректные суммы", type: "error" });
        return;
      }
      await renderStage2(root, parcels, selectedParcelId, totalCNY, totalBYN);
    });
  }
}

// Stage 2: добавление товаров в партию
async function renderStage2(
  root: HTMLElement,
  parcels: any[],
  parcelId: number,
  totalCNY: number,
  totalBYN: number,
): Promise<void> {
  const rate = totalBYN / totalCNY;
  const customers = await (
    await import("@/features/customers/infrastructure")
  ).customerRepository.findAll();
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

  function render(): string {
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
      <section class="section">
        <header class="section-title with-action">
          <h2>Новая партия — товары</h2>
          <button class="btn-icon btn-secondary" id="backToStage1" aria-label="Назад">${I.history}</button>
        </header>

        <div class="mb-3 p-3 bg-slate-50 rounded-xl">
          <div class="text-sm"><b>Курс:</b> 1 CNY = ${rate.toFixed(4)} BYN</div>
          <div class="text-sm"><b>Цель:</b> ${totalCNY} CNY / ${totalBYN} BYN</div>
          <div class="text-sm"><b>Добавлено:</b> ${currentCNY.toFixed(2)} CNY / ${currentBYN.toFixed(2)} BYN</div>
          <div class="text-sm ${currentCNY > totalCNY || currentBYN > totalBYN ? "text-red-600" : ""}">
            <b>Остаток:</b> ${Math.max(0, totalCNY - currentCNY).toFixed(2)} CNY / ${Math.max(0, totalBYN - currentBYN).toFixed(2)} BYN
          </div>
        </div>

        <div id="batchItemsList">${itemsHtml || '<div class="empty">Товаров пока нет</div>'}</div>

        <section class="section mt-3">
          <header class="section-title">Добавить товар</header>
          <form id="addBatchItemForm" novalidate class="grid grid-cols-2 gap-3">
            <div class="field col-span-2"><label>Название *</label><input name="name" required autocomplete="off" autofocus></div>
            <div class="field"><label>Заказчик *</label><select name="customer_id" required>${customerOptions}</select></div>
            <div class="field"><label>Цена в юанях (CNY) *</label><input name="priceCNY" type="number" step="0.01" required></div>
            <div class="field"><label>Количество *</label><input name="quantity" type="number" step="1" min="1" required value="1"></div>
            <div class="field"><label>Ед.</label><select name="unit"><option value="pcs">шт</option><option value="packs">упак</option></select></div>
            <div class="col-span-2"><button type="button" class="btn-secondary w-full" id="addBatchItemBtn">${I.plus} Добавить в партию</button></div>
          </form>
        </section>

        ${
          batchItems.length > 0
            ? `
        <div class="actions" style="margin-top:12px">
          <button type="button" class="btn-primary w-full" id="saveBatchBtn">${I.check} Сохранить партию (${batchItems.length} товаров)</button>
        </div>
        `
            : ""
        }
      </section>
    `;
  }

  function bindEvents(): void {
    document.getElementById("backToStage1")?.addEventListener("click", () => {
      renderStage1(root, parcels, parcelId);
    });

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

      if (nameInput) nameInput.value = "";
      if (priceCNYInput) priceCNYInput.value = "";
      if (quantityInput) quantityInput.value = "1";

      root.innerHTML = render();
      bindEvents();
    });

    document.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt((btn as HTMLElement).dataset.remove!);
        batchItems.splice(idx, 1);
        root.innerHTML = render();
        bindEvents();
      });
    });

    document.getElementById("saveBatchBtn")?.addEventListener("click", async () => {
      if (batchItems.length === 0) {
        toastState.add({ message: "Добавьте хотя бы один товар в партию", type: "error" });
        return;
      }

      const { addItemsToParcel } = await import("@/features/shared/services");
      await addItemsToParcel(parcelId, batchItems);
      toastState.add({
        message: `Партия сохранена (${batchItems.length} товаров)`,
        type: "success",
      });
      router.navigate("parcels");
    });
  }

  root.innerHTML = render();
  bindEvents();
}

// Entry point
export async function renderParcelAddView(): Promise<void> {
  const root = document.getElementById("parcelAddView");
  if (!root) return;

  const parcels = await parcelRepository.findAll();

  if (parcels.length === 0) {
    root.innerHTML = `
      <section class="section">
        <header class="section-title with-action">
          <h2>Добавить товар</h2>
        </header>
        <div class="empty">Нет посылок. Сначала создайте посылку.</div>
      </section>
    `;
    return;
  }

  const defaultParcel = parcels.find((p) => p.status === "draft") ?? parcels[0];
  if (!defaultParcel) return;
  let selectedParcelId = defaultParcel.id;

  await renderStage1(root, parcels, selectedParcelId);
}

// Auto-render when route becomes active
router.subscribe((route) => {
  if (route === "add") renderParcelAddView();
});
