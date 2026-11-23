import { customerRepository } from "@/features/customers/infrastructure";
import type { Customer } from "@/features/customers/domain";
import { customerLabel } from "@/features/customers/ui/CustomerPresentation";
import { parcelRepository } from "./infrastructure";
import { reconcileBatch, type BatchItemInput, type Parcel } from "./domain";
import { parcelStatusInfo } from "./ui/ParcelStatusInfo";
import { selectHtml } from "./ui/Select";
import { unitsSelectHtml } from "./ui/UnitsSelect";
import { mountCustomerCombo, type CustomerComboHandle } from "./customerCombo/CustomerCombo";
import { createListenerScope } from "@/core/listeners";
import type { ListenerScope } from "@/core/listeners";
import { router, toastState } from "@/core/state";
import type { RouteParams } from "@/core/state";
import type { ViewHandle } from "@/app/ViewHandle";
import { I, esc, money, t } from "@/core/utils";
import { formatDateNumeric, ITEM_BARE_FORMS, UNIT_HINT, unitLabel } from "./ui/ParcelPresentation";

// ============================================
// Parcel Add View — two-step batch form
// ============================================

type BatchItem = BatchItemInput;

type BatchState = {
  step: 1 | 2 | 3;
  parcels: Parcel[];
  customers: Customer[];
  selectedParcelId: number;
  expectedItemsCount: number | null;
  totalCNY: number;
  totalBYN: number;
  items: BatchItem[];
  selectedCustomerId: number | null;
  csvMode: "plain" | "ui";
  csvText: string;
  csvFileName: string;
  csvUiDraft: ItemUiDraft;
};

type Field = HTMLInputElement | HTMLSelectElement;

function fromSelect(value: string): BatchItem["unit"] {
  return value === "packs" || value === "pairs" ? value : "pcs";
}

function cny(v: number): string {
  return `${v.toFixed(2)} CNY`;
}

type ItemRow = { name: string; priceCNY: number; quantity: number; unit: BatchItem["unit"] };
type ItemUiDraft = {
  name: string;
  priceCNY: string;
  quantity: string;
  unit: BatchItem["unit"];
};

function parseUnit(raw: string | undefined): BatchItem["unit"] | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase().replace(/\.$/, "");
  if (["шт", "штука", "штуки", "pcs", "pc"].includes(value)) return "pcs";
  if (["уп", "упак", "упаковка", "упаковки", "pack", "packs"].includes(value)) return "packs";
  if (["пар", "пара", "пары", "pair", "pairs"].includes(value)) return "pairs";
  return undefined;
}

function parseNumber(raw: string): number {
  let value = raw.replace(/[^\d.,-]/g, "");
  if (value.includes(",") && value.includes(".")) {
    value = value.replace(/,/g, "");
  } else {
    value = value.replace(",", ".");
  }
  return Number(value);
}

// Формат строки: «Название количество единица цена», например «Носки 1 шт 22,35»
function parseItems(text: string): { rows: ItemRow[]; error?: string } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { rows: [], error: "Вставьте строки" };

  const rows: ItemRow[] = [];
  for (const [index, line] of lines.entries()) {
    const tokens = line.split(/\s+/);
    const number = index + 1;
    const error = (message: string) => ({ rows: [], error: `Строка ${number}: ${message}` });

    if (tokens.length < 4) {
      return error("нужно «название количество единица цена»");
    }

    const name = tokens.slice(0, -3).join(" ").replace(/[,;]$/, "").trim();
    const quantity = parseNumber(tokens[tokens.length - 3]!);
    const unit = parseUnit(tokens[tokens.length - 2]);
    const priceCNY = parseNumber(tokens[tokens.length - 1]!);

    if (!name) return error("нет названия");
    if (!Number.isInteger(quantity) || quantity < 1) {
      return error("неверное количество");
    }
    if (!unit) return error(`укажите единицу (${UNIT_HINT})`);
    if (!Number.isFinite(priceCNY) || priceCNY <= 0) {
      return error("неверная цена CNY");
    }

    rows.push({ name, priceCNY, quantity, unit });
  }

  return { rows };
}

function appendImportedRows(
  state: BatchState,
  rows: ItemRow[],
  customerId: number,
  rate: number,
): void {
  state.selectedCustomerId = customerId;
  for (const row of rows) {
    state.items.push({
      ...row,
      priceBYN: Math.round(row.priceCNY * rate * 100) / 100,
      customerId,
    });
  }
}

function setFieldError(field: Field, invalid: boolean, message: string): boolean {
  field.setCustomValidity(invalid ? message : "");
  field.setAttribute("aria-invalid", String(invalid));
  return !invalid;
}

function clearErrorsOnInput(form: HTMLFormElement, scope: ListenerScope): void {
  form.querySelectorAll<Field>("input, select").forEach((field) => {
    scope.on(field, "input", () => {
      field.setCustomValidity("");
      field.removeAttribute("aria-invalid");
    });
    scope.on(field, "change", () => {
      field.setCustomValidity("");
      field.removeAttribute("aria-invalid");
    });
  });
}

function stepNav(active: 1 | 2 | 3): string {
  const step = (n: 1 | 2 | 3, label: string): string => {
    if (n === active)
      return `<span class="wizard-step is-active" aria-current="step"><i>${n}</i> ${label}</span>`;
    if (n < active)
      return `<button type="button" class="wizard-step is-done" data-step-back="${n}"><i>${n}</i> ${label}</button>`;
    return `<span class="wizard-step"><i>${n}</i> ${label}</span>`;
  };

  return `
    <nav class="wizard-steps" aria-label="Этапы">
      ${step(1, "Суммы заказа")}
      ${step(2, "Товары")}
      ${step(3, "Проверка")}
    </nav>
  `;
}

function renderStep1(
  root: HTMLElement,
  state: BatchState,
  render: (focus?: string) => void,
  scope: ListenerScope,
): void {
  const parcelOptions = state.parcels.map((p) => ({
    value: p.id,
    label: `Посылка №${p.id} · ${parcelStatusInfo(p.status).label} · ${formatDateNumeric(p.createdAt)}`,
    selected: p.id === state.selectedParcelId,
  }));

  root.innerHTML = `
    <div class="page page-batch">
      <header class="page-head">
        <h1>Новая партия</h1>
        <p class="page-head__note">Суммы заказа → товары → проверка</p>
      </header>

      ${stepNav(1)}

      <form id="stage1Form" novalidate aria-label="Суммы заказа">
        <div class="field">
          <label for="addParcelSelect">Добавить в посылку</label>
          <span class="small muted block mb-1">Только черновики · отправленную посылку можно изменить в её карточке</span>
          ${selectHtml({ id: "addParcelSelect", name: "parcelId", options: parcelOptions })}
        </div>
        <div class="field">
          <label for="expectedItemsCount">Ожидаемое количество товаров</label>
          <span id="expectedItemsHint" class="small muted block mb-1">Сверим с количеством добавленных товаров на шаге проверки</span>
          <input id="expectedItemsCount" name="expectedItemsCount" type="number" inputmode="numeric" min="1" step="1"
            aria-describedby="expectedItemsHint" enterkeyhint="next" value="${state.expectedItemsCount ?? ""}" placeholder="Например, 12">
        </div>
        <div class="field">
          <label for="sumCNY">Сумма заказа, CNY *</label>
          <input id="sumCNY" name="totalCNY" type="number" inputmode="decimal" min="0.01" step="0.01" required
            data-autofocus enterkeyhint="next" value="${state.totalCNY || ""}" placeholder="Например, 1000">
        </div>
        <div class="field">
          <label for="sumBYN">Сумма заказа, BYN *</label>
          <input id="sumBYN" name="totalBYN" type="number" inputmode="decimal" min="0.01" step="0.01" required
            enterkeyhint="done" value="${state.totalBYN || ""}" placeholder="Например, 130">
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary w-full">${I.arrowRight} Далее: товары</button>
        </div>
      </form>
    </div>
  `;

  const form = document.getElementById("stage1Form") as HTMLFormElement;
  const parcelSelect = document.getElementById("addParcelSelect") as HTMLSelectElement;
  const expected = document.getElementById("expectedItemsCount") as HTMLInputElement;
  const cny = document.getElementById("sumCNY") as HTMLInputElement;
  const byn = document.getElementById("sumBYN") as HTMLInputElement;

  scope.on(parcelSelect, "change", () => {
    state.selectedParcelId = Number(parcelSelect.value) || 0;
  });
  clearErrorsOnInput(form, scope);

  scope.on(form, "submit", (e) => {
    e.preventDefault();
    const expectedValue = expected.value.trim() === "" ? null : Number(expected.value);
    const cnyValue = Number(cny.value);
    const bynValue = Number(byn.value);
    const expectedValid = setFieldError(
      expected,
      expectedValue !== null && (!Number.isInteger(expectedValue) || expectedValue < 1),
      "Укажите количество товаров целым числом от 1",
    );
    const cnyValid = setFieldError(
      cny,
      cny.value.trim() === "" || !Number.isFinite(cnyValue) || cnyValue <= 0,
      "Укажите сумму заказа в CNY",
    );
    const bynValid = setFieldError(
      byn,
      byn.value.trim() === "" || !Number.isFinite(bynValue) || bynValue <= 0,
      "Укажите сумму заказа в BYN",
    );

    if (!expectedValid || !cnyValid || !bynValid) {
      form.reportValidity();
      (!expectedValid ? expected : !cnyValid ? cny : byn).focus();
      return;
    }

    state.expectedItemsCount = expectedValue;
    state.totalCNY = cnyValue;
    state.totalBYN = bynValue;
    state.step = 2;
    render("[data-autofocus]");
  });
}

function batchAddHtml(state: BatchState): string {
  const modeBody =
    state.csvMode === "plain"
      ? `
        <div class="batch-add__group">
          <p class="batch-add__label">Строки или файл</p>
          <p class="small muted">Формат строки: название, количество, единица (${UNIT_HINT}), цена CNY. Например: «Носки 1 шт 22,35».</p>
          <div class="csv-file-row">
            <input id="csvFile" class="sr-only" type="file" accept=".txt,text/plain" tabindex="-1" aria-label="Файл со строками">
            <button type="button" class="btn-secondary" id="chooseCsvFile">${I.sheet} Выбрать файл</button>
            <span class="small muted" id="csvFileName" aria-live="polite">${state.csvFileName ? esc(state.csvFileName) : "Файл не выбран"}</span>
          </div>
          <label for="csvText">Вставьте строки</label>
          <textarea id="csvText" rows="5" data-autofocus placeholder="Носки 1 шт 22,35&#10;Кроссовки беговые 2 уп 45.50">${esc(state.csvText)}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary w-full" id="addBatchBtn">${I.plus} Добавить партию</button>
        </div>
      `
      : `
        <div class="batch-add__group">
          <p class="batch-add__label">По полям</p>
          <p class="small muted">Заполните поля — товар сразу попадёт в партию.</p>
          <form id="csvUiForm" class="csv-ui-form" novalidate>
            <div class="field">
              <label for="csvUiName">Название *</label>
              <input id="csvUiName" data-csv-ui-name data-autofocus type="text" required autocomplete="off" enterkeyhint="next"
                placeholder="Например, Носки спортивные" value="${esc(state.csvUiDraft.name)}">
            </div>
            <div class="field">
              <label for="csvUiPrice">Цена, CNY *</label>
              <input id="csvUiPrice" type="number" inputmode="decimal" min="0.01" step="0.01" required enterkeyhint="next"
                placeholder="Например, 25.50" value="${esc(state.csvUiDraft.priceCNY)}">
            </div>
            <div class="batch-grid">
              <div class="field">
                <label for="csvUiQty">Количество *</label>
                <input id="csvUiQty" type="number" inputmode="numeric" min="1" step="1" required enterkeyhint="next"
                  value="${esc(state.csvUiDraft.quantity)}">
              </div>
              <div class="field">
                <label for="csvUiUnit">Единица</label>
                ${unitsSelectHtml({
                  id: "csvUiUnit",
                  current: state.csvUiDraft.unit,
                  attrs: { enterkeyhint: "done" },
                })}
              </div>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn-secondary w-full">${I.plus} Добавить в партию</button>
            </div>
          </form>
        </div>
      `;

  return `
    <div class="batch-add">
      <div class="batch-add__modes" role="group" aria-label="Режим добавления товаров">
        <button type="button" class="batch-add__mode" data-batch-mode="plain"
          aria-pressed="${state.csvMode === "plain"}">Строки</button>
        <button type="button" class="batch-add__mode" data-batch-mode="ui"
          aria-pressed="${state.csvMode === "ui"}">UI</button>
      </div>

      ${modeBody}
    </div>
  `;
}

function bindBatchAdd(
  root: HTMLElement,
  state: BatchState,
  rate: number,
  render: (focus?: string) => void,
  combo: CustomerComboHandle,
  scope: ListenerScope,
): void {
  root.querySelectorAll<HTMLButtonElement>("[data-batch-mode]").forEach((button) => {
    scope.on(button, "click", () => {
      const mode = button.dataset.batchMode === "ui" ? "ui" : "plain";
      if (state.csvMode === mode) return;
      state.csvMode = mode;
      render(mode === "ui" ? "[data-csv-ui-name]" : "#csvText");
    });
  });

  // The combobox owns its customers and current selection; the batch only reads the result.
  const syncCustomer = (): Customer | null => {
    const snapshot = combo.snapshot();
    state.customers = snapshot.customers;
    state.selectedCustomerId = snapshot.selectedCustomerId;
    return combo.selectedCustomer();
  };
  const currentCustomerId = (): number =>
    combo.selectedCustomer()?.id ?? state.selectedCustomerId ?? 0;
  const checkCustomer = async (): Promise<boolean> => {
    let selected = syncCustomer();
    if (!selected) {
      if (!(await combo.commit())) {
        toastState.add({ message: "Укажите заказчика для партии", type: "error" });
        combo.focus();
        return false;
      }
      selected = syncCustomer();
    }
    return selected !== null;
  };

  if (state.csvMode === "plain") {
    const csvText = document.getElementById("csvText") as HTMLTextAreaElement;
    const csvFile = document.getElementById("csvFile") as HTMLInputElement;
    const fileName = document.getElementById("csvFileName") as HTMLElement;

    scope.on(csvText, "input", () => {
      state.csvText = csvText.value;
      csvText.setCustomValidity("");
      csvText.removeAttribute("aria-invalid");
    });

    scope.on(document.getElementById("chooseCsvFile"), "click", () => {
      csvFile.click();
    });

    scope.on(csvFile, "change", async () => {
      const file = csvFile.files?.[0];
      if (!file) return;
      try {
        state.csvText = await file.text();
        state.csvFileName = file.name;
        csvText.value = state.csvText;
        csvText.setCustomValidity("");
        csvText.removeAttribute("aria-invalid");
        fileName.textContent = file.name;
        toastState.add({ message: `Файл выбран: ${file.name}`, type: "success" });
      } catch {
        toastState.add({ message: "Не удалось прочитать файл", type: "error" });
      }
    });

    scope.on(document.getElementById("addBatchBtn"), "click", async () => {
      if (!(await checkCustomer())) return;
      if (!state.csvText.trim()) {
        toastState.add({ message: "Вставьте строки или выберите файл", type: "error" });
        csvText.focus();
        return;
      }
      const parsed = parseItems(state.csvText);
      if (parsed.error) {
        csvText.setCustomValidity(parsed.error);
        csvText.setAttribute("aria-invalid", "true");
        csvText.reportValidity();
        csvText.focus();
        toastState.add({ message: parsed.error, type: "error" });
        return;
      }
      appendImportedRows(state, parsed.rows, currentCustomerId(), rate);
      state.csvText = "";
      state.csvFileName = "";
      toastState.add({ message: `Добавлено в партию: ${parsed.rows.length}`, type: "success" });
      render("[data-autofocus]");
    });
  } else {
    const uiForm = document.getElementById("csvUiForm") as HTMLFormElement;
    const uiName = document.getElementById("csvUiName") as HTMLInputElement;
    const uiPrice = document.getElementById("csvUiPrice") as HTMLInputElement;
    const uiQty = document.getElementById("csvUiQty") as HTMLInputElement;
    const uiUnit = document.getElementById("csvUiUnit") as HTMLSelectElement;

    clearErrorsOnInput(uiForm, scope);
    scope.on(uiName, "input", () => {
      state.csvUiDraft.name = uiName.value;
    });
    scope.on(uiPrice, "input", () => {
      state.csvUiDraft.priceCNY = uiPrice.value;
    });
    scope.on(uiQty, "input", () => {
      state.csvUiDraft.quantity = uiQty.value;
    });
    scope.on(uiUnit, "change", () => {
      state.csvUiDraft.unit = fromSelect(uiUnit.value);
    });

    scope.on(uiForm, "submit", async (e) => {
      e.preventDefault();
      if (!(await checkCustomer())) return;
      const price = Number(uiPrice.value);
      const qty = Number(uiQty.value);
      const nameValid = setFieldError(
        uiName,
        uiName.value.trim() === "",
        "Укажите название товара",
      );
      const priceValid = setFieldError(
        uiPrice,
        uiPrice.value.trim() === "" || !Number.isFinite(price) || price <= 0,
        "Укажите цену в CNY",
      );
      const qtyValid = setFieldError(
        uiQty,
        uiQty.value.trim() === "" || !Number.isInteger(qty) || qty < 1,
        "Укажите количество от 1",
      );

      if (!nameValid || !priceValid || !qtyValid) {
        uiForm.reportValidity();
        (!nameValid ? uiName : !priceValid ? uiPrice : uiQty).focus();
        return;
      }

      const unit = fromSelect(uiUnit.value);
      appendImportedRows(
        state,
        [{ name: uiName.value.trim(), priceCNY: price, quantity: qty, unit }],
        currentCustomerId(),
        rate,
      );
      state.csvUiDraft = { name: "", priceCNY: "", quantity: "1", unit };
      toastState.add({ message: "Добавлено в партию: 1", type: "success" });
      render("[data-csv-ui-name]");
    });
  }
}

function renderStep2(
  root: HTMLElement,
  state: BatchState,
  render: (focus?: string) => void,
  scope: ListenerScope,
  registerCombo: (combo: CustomerComboHandle) => void,
): void {
  const rate = state.totalBYN / state.totalCNY;
  const customerMap = new Map(state.customers.map((c) => [c.id, c]));
  const currentCNY = state.items.reduce((sum, item) => sum + item.priceCNY, 0);
  const currentBYN = state.items.reduce((sum, item) => sum + item.priceBYN, 0);
  const remaining = Math.max(0, state.totalCNY - currentCNY);
  const progress = Math.min(100, Math.round((currentCNY / state.totalCNY) * 100));

  const itemsHtml = state.items.length
    ? state.items
        .map((item, idx) => {
          const customer = customerMap.get(item.customerId);
          const customerName = customerLabel({
            name: customer?.name || "Без заказчика",
            isSelf: customer?.isSelf || false,
          });
          return `
            <div class="item batch-row">
              <div class="parcel-entry__body min-w-0">
                <div class="parcel-entry__head">
                  <b title="${esc(item.name)}">${esc(item.name)}</b>
                  <span class="item-entry__price">${money(item.priceBYN)}</span>
                </div>
                <div class="parcel-entry__hint">${item.quantity} ${unitLabel(item.unit)} · ${item.priceCNY.toFixed(2)} CNY · ${esc(customerName)}</div>
              </div>
              <button type="button" class="btn-icon btn-danger" data-remove="${idx}" aria-label="Удалить ${esc(item.name)}">${I.trash}</button>
            </div>
          `;
        })
        .join("")
    : '<div class="empty">Товаров пока нет. Добавьте первый ниже.</div>';

  root.innerHTML = `
    <div class="page page-batch">
      <header class="page-head">
        <h1>Товары партии</h1>
        <p class="page-head__note">Распределите сумму между товарами и заказчиками</p>
      </header>

      ${stepNav(2)}

      <div class="rate-strip" aria-label="Расчёт партии">
        <div><span>Курс</span><b>1 CNY = ${rate.toFixed(4)}</b></div>
        <div><span>Цель</span><b>${state.totalCNY.toFixed(2)} CNY</b></div>
        <div><span>Добавлено</span><b>${currentCNY.toFixed(2)} CNY</b></div>
        <div><span>Остаток</span><b>${remaining.toFixed(2)} CNY</b></div>
        <div class="rate-track" aria-hidden="true"><div class="rate-fill" style="width: ${progress}%"></div></div>
      </div>
      <p class="small muted">${money(currentBYN)} из ${money(state.totalBYN)}</p>

      <div id="batchItemsList" class="batch-items">${itemsHtml}</div>

      ${batchAddHtml(state)}

      <div class="form-actions form-actions--final">
        <button type="button" class="btn-primary w-full" id="checkStepBtn">${I.arrowRight} Далее: проверка</button>
      </div>
    </div>
  `;

  const comboHost = root.querySelector<HTMLElement>(".batch-add");
  if (!comboHost) return;
  const combo = mountCustomerCombo(comboHost, {
    customers: state.customers,
    selectedCustomerId: state.selectedCustomerId,
  });
  registerCombo(combo);
  bindBatchAdd(root, state, rate, render, combo, scope);

  root.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((button) => {
    scope.on(button, "click", () => {
      state.items.splice(Number(button.dataset.remove), 1);
      render("[data-autofocus]");
    });
  });

  scope.on(document.getElementById("checkStepBtn"), "click", () => {
    if (state.items.length === 0) {
      toastState.add({ message: "Добавьте хотя бы один товар в партию", type: "error" });
      root
        .querySelector<HTMLElement>(state.csvMode === "ui" ? "[data-csv-ui-name]" : "#csvText")
        ?.focus();
      return;
    }
    state.step = 3;
    render("[data-autofocus]");
  });
}

function renderStep3(root: HTMLElement, state: BatchState, scope: ListenerScope): void {
  const rate = state.totalCNY > 0 ? state.totalBYN / state.totalCNY : 0;
  const expectedCount = state.expectedItemsCount;
  const actualCount = state.items.length;
  const countMismatch = expectedCount !== null && expectedCount !== actualCount;
  const { review } = reconcileBatch(state.items, {
    totalCNY: state.totalCNY,
    totalBYN: state.totalBYN,
  });
  const overPaid = review.kind === "overpayment";
  const hasDiff = review.kind !== "balanced";

  const diffLabel = review.distributed
    ? "Комиссия (распределится по товарам)"
    : overPaid
      ? "Добавлено сверх оплаты"
      : hasDiff
        ? "Разница не распределена"
        : "Не учтено";
  const diffValue = hasDiff
    ? `${cny(review.absCNY)} · ${money(review.absBYN)}`
    : `${cny(0)} · ${money(0)}`;
  const notice = review.distributed
    ? `Похоже на комиссию сервиса оплаты: ${cny(review.absCNY)} (${review.commissionPercent.toFixed(1)}% от суммы товаров) = ${money(review.absBYN)}. При сохранении она будет добавлена к ценам товаров пропорционально их стоимости — каждый заказчик заплатит свою долю, а не только вы.`
    : overPaid
      ? `Сумма товаров превышает оплату на ${cny(review.absCNY)} (${money(review.absBYN)}). Проверьте цены товаров.`
      : hasDiff
        ? `Разница ${cny(review.absCNY)} · ${money(review.absBYN)} не будет добавлена к ценам товаров: проверьте суммы в обеих валютах.`
        : "Вся сумма распределена по товарам. Неучтённых BYN нет.";

  root.innerHTML = `
    <div class="page page-batch">
      <header class="page-head">
        <h1 id="checkTitle" tabindex="-1" data-autofocus>Проверка партии</h1>
        <p class="page-head__note">Последний шаг перед сохранением</p>
      </header>

      ${stepNav(3)}

      <div class="check-list">
        <div class="check-row"><span>Оплачено</span><b>${cny(state.totalCNY)} · ${money(state.totalBYN)}</b></div>
        <div class="check-row"><span>Курс</span><b>1 CNY = ${rate.toFixed(4)}</b></div>
        <div class="check-row"><span>Ожидалось товаров</span><b>${expectedCount ?? "—"}</b></div>
        <div class="check-row"><span>Товаров в партии</span><b>${actualCount}</b></div>
        <div class="check-row"><span>Сумма товаров</span><b>${cny(review.itemCNY)} · ${money(review.itemBYN)}</b></div>
        <div class="check-row check-row--total"><span>${diffLabel}</span><b>${diffValue}</b></div>
      </div>

      ${
        countMismatch
          ? `<p class="check-notice" id="itemsCountNotice">Внимание: ожидалось ${t(ITEM_BARE_FORMS, expectedCount)}, добавлено ${t(ITEM_BARE_FORMS, actualCount)}. Проверьте список товаров перед сохранением.</p>`
          : ""
      }
      <p class="check-notice ${hasDiff ? "" : "is-ok"}" id="checkNotice">${notice}</p>

      <div class="form-actions form-actions--final">
        <button type="button" class="btn-primary w-full" id="saveBatchBtn" aria-describedby="checkNotice${countMismatch ? " itemsCountNotice" : ""}">${I.check} Сохранить партию (${actualCount})</button>
      </div>
    </div>
  `;

  scope.on(document.getElementById("saveBatchBtn"), "click", async () => {
    const button = document.getElementById("saveBatchBtn") as HTMLButtonElement;
    button.disabled = true;
    try {
      const { addItemsToParcel } = await import("@/features/shared/services");
      await addItemsToParcel(state.selectedParcelId, state.items, {
        totalCNY: state.totalCNY,
        totalBYN: state.totalBYN,
      });
      toastState.add({
        message: `Партия сохранена (${t(ITEM_BARE_FORMS, state.items.length)})`,
        type: "success",
      });
      router.navigate("parcels");
    } catch (err) {
      button.disabled = false;
      toastState.add({ message: "Не удалось сохранить партию", type: "error" });
      console.error(err);
    }
  });
}

export function mountParcelAddView(host: HTMLElement): ViewHandle {
  const scope = createListenerScope();
  let activeCombo: CustomerComboHandle | null = null;

  function registerCombo(combo: CustomerComboHandle): void {
    activeCombo?.dispose();
    activeCombo = combo;
  }

  async function render(params: RouteParams): Promise<void> {
    if (scope.signal.aborted) return;
    const [parcels, customers] = await Promise.all([
      parcelRepository.findAll(),
      customerRepository.findAll(),
    ]);
    if (scope.signal.aborted) return;

    const drafts = parcels.filter((p) => p.status === "draft");
    if (drafts.length === 0) {
      host.innerHTML = `
        <div class="page page-batch">
          <header class="page-head"><h1>Новая партия</h1></header>
          <div class="empty">Нет черновиков. Создайте посылку — если нужно что-то изменить в уже отправленной, используйте редактирование посылки.</div>
        </div>
      `;
      return;
    }

    const presetParcelId = Number(params.parcelId);
    const defaultParcel = drafts.find((p) => p.id === presetParcelId) ?? drafts[0];
    if (!defaultParcel) return;
    const state: BatchState = {
      step: 1,
      parcels: drafts,
      customers,
      selectedParcelId: defaultParcel.id,
      expectedItemsCount: null,
      totalCNY: 0,
      totalBYN: 0,
      items: [],
      selectedCustomerId: customers[0]?.id ?? null,
      csvMode: "plain",
      csvText: "",
      csvFileName: "",
      csvUiDraft: { name: "", priceCNY: "", quantity: "1", unit: "pcs" },
    };

    const renderStep = (focus?: string): void => {
      if (state.step === 1) renderStep1(host, state, renderStep, scope);
      else if (state.step === 2) renderStep2(host, state, renderStep, scope, registerCombo);
      else renderStep3(host, state, scope);

      host.querySelectorAll<HTMLButtonElement>("[data-step-back]").forEach((button) => {
        scope.on(button, "click", () => {
          state.step = Number(button.dataset.stepBack) as 1 | 2;
          renderStep("[data-autofocus]");
        });
      });

      if (focus) {
        requestAnimationFrame(() => {
          host.querySelector<HTMLElement>(focus)?.focus();
        });
      }
    };

    renderStep();
  }

  return {
    render,
    dispose: () => {
      activeCombo?.dispose();
      scope.dispose();
    },
  };
}
