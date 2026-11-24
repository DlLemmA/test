<script setup lang="ts">
import { computed, nextTick, onMounted, onScopeDispose, ref, useTemplateRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import { customerRepository } from "@/features/customers/infrastructure";
import type { Customer } from "@/features/customers/domain";
import { customerLabel } from "@/features/customers/ui/CustomerPresentation";
import { toastState } from "@/core/state";
import { money, t } from "@/core/utils";
import { reconcileBatch, type BatchItemInput, type Parcel } from "./domain";
import { parcelRepository } from "./infrastructure";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import WizardSteps from "@/features/shared/ui/WizardSteps.vue";
import type { WizardStep } from "@/features/shared/ui/wizardSteps";
import CustomerCombo from "./ui/CustomerCombo.vue";
import { fromSelect, parseItems, type ItemRow, type ItemUiDraft } from "./ui/batchImport";
import { formatDateNumeric, ITEM_BARE_FORMS, unitLabel } from "./ui/ParcelPresentation";
import { parcelStatusInfo } from "./ui/ParcelStatusInfo";

const route = useRoute();
const router = useRouter();

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const STEP_LABELS = ["Суммы заказа", "Товары", "Проверка"] as const;
const STEP_IDS = ["sums", "items", "review"] as const;

const step = ref(1);
const loaded = ref(false);
const drafts = ref<Parcel[]>([]);
/** 0 — create a new parcel; otherwise append the batch to this draft.
 * Defaults to the newest draft; new parcel is an explicit option. */
const selectedParcelId = ref(0);
const customers = ref<Customer[]>([]);
const expectedRaw = ref("");
const cnyRaw = ref("");
const bynRaw = ref("");
const expectedCount = ref<number | null>(null);
const totalCNY = ref(0);
const totalBYN = ref(0);
const items = ref<BatchItemInput[]>([]);
const selectedCustomerId = ref<number | null>(null);
const csvMode = ref<"plain" | "ui">("plain");
const csvText = ref("");
const csvFileName = ref("");
const csvUiDraft = ref<ItemUiDraft>({ name: "", priceCNY: "", quantity: "1", unit: "pcs" });
const saving = ref(false);

const root = useTemplateRef<HTMLElement>("root");
const stage1Form = useTemplateRef<HTMLFormElement>("stage1Form");
const uiForm = useTemplateRef<HTMLFormElement>("uiForm");
const cnyInput = useTemplateRef<HTMLInputElement>("cnyInput");
const bynInput = useTemplateRef<HTMLInputElement>("bynInput");
const expectedInput = useTemplateRef<HTMLInputElement>("expectedInput");
const csvTextArea = useTemplateRef<HTMLTextAreaElement>("csvTextArea");
const uiNameInput = useTemplateRef<HTMLInputElement>("uiNameInput");
const uiPriceInput = useTemplateRef<HTMLInputElement>("uiPriceInput");
const uiQtyInput = useTemplateRef<HTMLInputElement>("uiQtyInput");
const csvFileInput = useTemplateRef<HTMLInputElement>("csvFileInput");
const combo = useTemplateRef<InstanceType<typeof CustomerCombo>>("combo");

let initialized = false;

const rate = computed(() => (totalCNY.value > 0 ? totalBYN.value / totalCNY.value : 0));
const currentCNY = computed(() => items.value.reduce((sum, item) => sum + item.priceCNY, 0));
const currentBYN = computed(() => items.value.reduce((sum, item) => sum + item.priceBYN, 0));
const remaining = computed(() => Math.max(0, totalCNY.value - currentCNY.value));
const progress = computed(() =>
  Math.min(100, Math.round((currentCNY.value / (totalCNY.value || 1)) * 100)),
);
const steps = computed<WizardStep[]>(() =>
  STEP_LABELS.map((label, index) => {
    const number = index + 1;
    return {
      id: STEP_IDS[index]!,
      label,
      disabled: number > step.value,
      title: number > step.value ? "Сначала заполните предыдущий шаг" : undefined,
      backValue: number < step.value ? number : undefined,
    };
  }),
);

const review = computed(
  () => reconcileBatch(items.value, { totalCNY: totalCNY.value, totalBYN: totalBYN.value }).review,
);
const countMismatch = computed(
  () => expectedCount.value !== null && expectedCount.value !== items.value.length,
);
const overPaid = computed(() => review.value.kind === "overpayment");
const hasDiff = computed(() => review.value.kind !== "balanced");
const cny = (value: number): string => `${value.toFixed(2)} CNY`;
// Vue coerces v-model on type="number" to a number; validation works with text.
const text = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);
const diffLabel = computed(() =>
  review.value.distributed
    ? "Комиссия (распределится по товарам)"
    : overPaid.value
      ? "Добавлено сверх оплаты"
      : hasDiff.value
        ? "Разница не распределена"
        : "Не учтено",
);
const diffValue = computed(() =>
  hasDiff.value
    ? `${cny(review.value.absCNY)} · ${money(review.value.absBYN)}`
    : `${cny(0)} · ${money(0)}`,
);
const notice = computed(() => {
  const r = review.value;
  if (r.distributed) {
    return `Похоже на комиссию сервиса оплаты: ${cny(r.absCNY)} (${r.commissionPercent.toFixed(1)}% от суммы товаров) = ${money(r.absBYN)}. При сохранении она будет добавлена к ценам товаров пропорционально их стоимости — каждый заказчик заплатит свою долю, а не только вы.`;
  }
  if (overPaid.value) {
    return `Сумма товаров превышает оплату на ${cny(r.absCNY)} (${money(r.absBYN)}). Проверьте цены товаров.`;
  }
  if (hasDiff.value) {
    return `Разница ${cny(r.absCNY)} · ${money(r.absBYN)} не будет добавлена к ценам товаров: проверьте суммы в обеих валютах.`;
  }
  return "Вся сумма распределена по товарам. Неучтённых BYN нет.";
});

const loadScope = new AbortController();
onScopeDispose(() => loadScope.abort());

async function load(): Promise<void> {
  const [foundParcels, foundCustomers] = await Promise.all([
    parcelRepository.findAll(),
    customerRepository.findAll(),
  ]);
  if (loadScope.signal.aborted) return;

  drafts.value = foundParcels.filter((parcel) => parcel.status === "draft");
  const latestDraftId = drafts.value[0]?.id ?? 0;
  if (!initialized) {
    const preset = Number(route.params.parcelId);
    selectedParcelId.value =
      drafts.value.find((parcel) => parcel.id === preset)?.id ?? latestDraftId;
    selectedCustomerId.value = foundCustomers[0]?.id ?? null;
    initialized = true;
  } else if (
    selectedParcelId.value !== 0 &&
    !drafts.value.some((parcel) => parcel.id === selectedParcelId.value)
  ) {
    selectedParcelId.value = latestDraftId;
  }
  customers.value = foundCustomers;
  loaded.value = true;
}
onMounted(load);

function focusNext(selector: string): void {
  void nextTick(() => root.value?.querySelector<HTMLElement>(selector)?.focus());
}

function navigateStep(id: string): void {
  const next = STEP_IDS.indexOf(id as (typeof STEP_IDS)[number]) + 1;
  if (next <= 0 || next >= step.value) return;
  step.value = next;
  focusNext("[data-autofocus]");
}

function setFieldError(field: Field | null, invalid: boolean, message: string): boolean {
  if (!field) return !invalid;
  field.setCustomValidity(invalid ? message : "");
  field.setAttribute("aria-invalid", String(invalid));
  return !invalid;
}

function clearFieldError(event: Event): void {
  const field = event.target as Field | null;
  if (!field || typeof field.setCustomValidity !== "function") return;
  field.setCustomValidity("");
  field.removeAttribute("aria-invalid");
}

function submitStep1(): void {
  const expectedValue = text(expectedRaw.value).trim() === "" ? null : Number(expectedRaw.value);
  const cnyValue = Number(cnyRaw.value);
  const bynValue = Number(bynRaw.value);
  const expectedValid = setFieldError(
    expectedInput.value,
    expectedValue !== null && (!Number.isInteger(expectedValue) || expectedValue < 1),
    "Укажите количество товаров целым числом от 1",
  );
  const cnyValid = setFieldError(
    cnyInput.value,
    text(cnyRaw.value).trim() === "" || !Number.isFinite(cnyValue) || cnyValue <= 0,
    "Укажите сумму заказа в CNY",
  );
  const bynValid = setFieldError(
    bynInput.value,
    text(bynRaw.value).trim() === "" || !Number.isFinite(bynValue) || bynValue <= 0,
    "Укажите сумму заказа в BYN",
  );
  if (!expectedValid || !cnyValid || !bynValid) {
    stage1Form.value?.reportValidity();
    (!expectedValid ? expectedInput.value : !cnyValid ? cnyInput.value : bynInput.value)?.focus();
    return;
  }

  expectedCount.value = expectedValue;
  totalCNY.value = cnyValue;
  totalBYN.value = bynValue;
  step.value = 2;
  focusNext("[data-autofocus]");
}

function syncCustomer(): Customer | null {
  const snapshot = combo.value?.snapshot();
  if (snapshot) {
    customers.value = snapshot.customers;
    selectedCustomerId.value = snapshot.selectedCustomerId;
  }
  return combo.value?.selectedCustomer() ?? null;
}

async function checkCustomer(): Promise<boolean> {
  let selected = syncCustomer();
  if (!selected) {
    if (!(await combo.value?.commit())) {
      toastState.add({ message: "Укажите заказчика для партии", type: "error" });
      combo.value?.focus();
      return false;
    }
    selected = syncCustomer();
  }
  return selected !== null;
}

function appendRows(rows: ItemRow[]): void {
  syncCustomer();
  const customerId = combo.value?.selectedCustomer()?.id ?? selectedCustomerId.value ?? 0;
  for (const row of rows) {
    items.value.push({
      ...row,
      priceBYN: Math.round(row.priceCNY * rate.value * 100) / 100,
      customerId,
    });
  }
}

async function onCsvFileChange(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    csvText.value = await file.text();
    csvFileName.value = file.name;
    clearFieldError({ target: csvTextArea.value } as unknown as Event);
    toastState.add({ message: `Файл выбран: ${file.name}`, type: "success" });
  } catch {
    toastState.add({ message: "Не удалось прочитать файл", type: "error" });
  }
}

async function addPlainBatch(): Promise<void> {
  if (!(await checkCustomer())) return;
  if (!csvText.value.trim()) {
    toastState.add({ message: "Вставьте строки или выберите файл", type: "error" });
    csvTextArea.value?.focus();
    return;
  }
  const parsed = parseItems(csvText.value);
  if (parsed.error) {
    setFieldError(csvTextArea.value, true, parsed.error);
    csvTextArea.value?.reportValidity();
    csvTextArea.value?.focus();
    toastState.add({ message: parsed.error, type: "error" });
    return;
  }
  appendRows(parsed.rows);
  csvText.value = "";
  csvFileName.value = "";
  toastState.add({ message: `Добавлено в партию: ${parsed.rows.length}`, type: "success" });
  focusNext("[data-autofocus]");
}

async function submitUiItem(): Promise<void> {
  if (!(await checkCustomer())) return;
  const price = Number(csvUiDraft.value.priceCNY);
  const qty = Number(csvUiDraft.value.quantity);
  const nameValid = setFieldError(
    uiNameInput.value,
    csvUiDraft.value.name.trim() === "",
    "Укажите название товара",
  );
  const priceValid = setFieldError(
    uiPriceInput.value,
    text(csvUiDraft.value.priceCNY).trim() === "" || !Number.isFinite(price) || price <= 0,
    "Укажите цену в CNY",
  );
  const qtyValid = setFieldError(
    uiQtyInput.value,
    text(csvUiDraft.value.quantity).trim() === "" || !Number.isInteger(qty) || qty < 1,
    "Укажите количество от 1",
  );
  if (!nameValid || !priceValid || !qtyValid) {
    uiForm.value?.reportValidity();
    (!nameValid ? uiNameInput.value : !priceValid ? uiPriceInput.value : uiQtyInput.value)?.focus();
    return;
  }

  const unit = fromSelect(csvUiDraft.value.unit);
  appendRows([{ name: csvUiDraft.value.name.trim(), priceCNY: price, quantity: qty, unit }]);
  csvUiDraft.value = { name: "", priceCNY: "", quantity: "1", unit };
  toastState.add({ message: "Добавлено в партию: 1", type: "success" });
  focusNext("[data-csv-ui-name]");
}

function switchMode(mode: "plain" | "ui"): void {
  if (csvMode.value === mode) return;
  csvMode.value = mode;
  focusNext(mode === "ui" ? "[data-csv-ui-name]" : "#csvText");
}

function removeItem(index: number): void {
  items.value.splice(index, 1);
}

function goToReview(): void {
  if (items.value.length === 0) {
    toastState.add({ message: "Добавьте хотя бы один товар в партию", type: "error" });
    focusNext(csvMode.value === "ui" ? "[data-csv-ui-name]" : "#csvText");
    return;
  }
  step.value = 3;
  focusNext("[data-autofocus]");
}

async function saveBatch(): Promise<void> {
  saving.value = true;
  try {
    const services = await import("@/features/shared/services");
    const totals = { totalCNY: totalCNY.value, totalBYN: totalBYN.value };
    if (selectedParcelId.value === 0) {
      await services.createParcelBatch(items.value, totals);
    } else {
      await services.addItemsToParcel(selectedParcelId.value, items.value, totals);
    }
    toastState.add({
      message: `Партия сохранена (${t(ITEM_BARE_FORMS, items.value.length)})`,
      type: "success",
    });
    void router.push({ name: "parcels" });
  } catch (error) {
    saving.value = false;
    toastState.add({ message: "Не удалось сохранить партию", type: "error" });
    console.error(error);
  }
}
</script>

<template>
  <div ref="root" class="page page-batch">
    <template v-if="loaded">
      <header class="page-head">
        <h1>
          {{ step === 1 ? "Новая партия" : step === 2 ? "Товары партии" : "Проверка партии" }}
        </h1>
        <p class="page-head__note">
          {{
            step === 1
              ? "Суммы заказа → товары → проверка"
              : step === 2
                ? "Распределите сумму между товарами и заказчиками"
                : "Последний шаг перед сохранением"
          }}
        </p>
      </header>

      <WizardSteps
        :steps="steps"
        :current="STEP_IDS[step - 1]!"
        label="Этапы"
        @navigate="navigateStep"
      />

      <form
        v-if="step === 1"
        id="stage1Form"
        ref="stage1Form"
        novalidate
        aria-label="Суммы заказа"
        @submit.prevent="submitStep1"
        @input="clearFieldError"
        @change="clearFieldError"
      >
        <div class="field">
          <label for="addParcelSelect">Добавить в посылку</label>
          <div class="picker">
            <select
              id="addParcelSelect"
              v-model.number="selectedParcelId"
              class="picker__control"
              name="parcelId"
            >
              <option :value="0">Новая посылка</option>
              <option v-for="parcel in drafts" :key="parcel.id" :value="parcel.id">
                Посылка №{{ parcel.id }} · {{ parcelStatusInfo(parcel.status).label }} ·
                {{ formatDateNumeric(parcel.createdAt) }}
              </option>
            </select>
            <span class="picker__caret" aria-hidden="true" />
          </div>
        </div>
        <div class="field">
          <label for="expectedItemsCount">Ожидаемое количество товаров</label>
          <span id="expectedItemsHint" class="small muted block mb-1">
            Сверим с количеством добавленных товаров на шаге проверки
          </span>
          <input
            id="expectedItemsCount"
            ref="expectedInput"
            v-model="expectedRaw"
            name="expectedItemsCount"
            type="number"
            inputmode="numeric"
            min="1"
            step="1"
            aria-describedby="expectedItemsHint"
            enterkeyhint="next"
            placeholder="Например, 12"
          />
        </div>
        <div class="field">
          <label for="sumCNY">Сумма заказа, CNY *</label>
          <input
            id="sumCNY"
            ref="cnyInput"
            v-model="cnyRaw"
            name="totalCNY"
            type="number"
            inputmode="decimal"
            min="0.01"
            step="0.01"
            required
            data-autofocus
            enterkeyhint="next"
            placeholder="Например, 1000"
          />
        </div>
        <div class="field">
          <label for="sumBYN">Сумма заказа, BYN *</label>
          <input
            id="sumBYN"
            ref="bynInput"
            v-model="bynRaw"
            name="totalBYN"
            type="number"
            inputmode="decimal"
            min="0.01"
            step="0.01"
            required
            enterkeyhint="done"
            placeholder="Например, 130"
          />
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary w-full">
            <AppIcon name="arrowRight" /> Далее: товары
          </button>
        </div>
      </form>

      <template v-else-if="step === 2">
        <div class="rate-strip" aria-label="Расчёт партии">
          <div><span>Курс</span><b>1 CNY = {{ rate.toFixed(4) }}</b></div>
          <div><span>Цель</span><b>{{ totalCNY.toFixed(2) }} CNY</b></div>
          <div><span>Добавлено</span><b>{{ currentCNY.toFixed(2) }} CNY</b></div>
          <div><span>Остаток</span><b>{{ remaining.toFixed(2) }} CNY</b></div>
          <div class="rate-track" aria-hidden="true">
            <div class="rate-fill" :style="{ width: `${progress}%` }" />
          </div>
        </div>
        <p class="small muted">{{ money(currentBYN) }} из {{ money(totalBYN) }}</p>

        <div id="batchItemsList" class="batch-items">
          <template v-if="items.length">
            <div v-for="(item, index) in items" :key="index" class="item batch-row">
              <div class="parcel-entry__body min-w-0">
                <div class="parcel-entry__head">
                  <b :title="item.name">{{ item.name }}</b>
                  <span class="item-entry__price">{{ money(item.priceBYN) }}</span>
                </div>
                <div class="parcel-entry__hint">
                  {{ item.quantity }} {{ unitLabel(item.unit) }} ·
                  {{ item.priceCNY.toFixed(2) }} CNY ·
                  {{
                    customerLabel({
                      name:
                        customers.find((c) => c.id === item.customerId)?.name || "Без заказчика",
                      isSelf: customers.find((c) => c.id === item.customerId)?.isSelf || false,
                    })
                  }}
                </div>
              </div>
              <button
                type="button"
                class="btn-icon btn-danger"
                :data-remove="index"
                :aria-label="`Удалить ${item.name}`"
                @click="removeItem(index)"
              >
                <AppIcon name="trash" />
              </button>
            </div>
          </template>
          <div v-else class="empty">Товаров пока нет. Добавьте первый ниже.</div>
        </div>

        <div class="batch-add">
          <CustomerCombo
            ref="combo"
            :customers="customers"
            :selected-customer-id="selectedCustomerId"
          />
          <div class="batch-add__modes" role="group" aria-label="Режим добавления товаров">
            <button
              type="button"
              class="batch-add__mode"
              data-batch-mode="plain"
              :aria-pressed="csvMode === 'plain'"
              @click="switchMode('plain')"
            >
              Строки
            </button>
            <button
              type="button"
              class="batch-add__mode"
              data-batch-mode="ui"
              :aria-pressed="csvMode === 'ui'"
              @click="switchMode('ui')"
            >
              UI
            </button>
          </div>

          <template v-if="csvMode === 'plain'">
            <div class="batch-add__group">
              <p class="batch-add__label">Строки или файл</p>
              <p class="small muted">
                Формат строки: название, количество, единица (шт/уп/пар), цена CNY. Например: «Носки
                1 шт 22,35».
              </p>
              <div class="csv-file-row">
                <input
                  id="csvFile"
                  ref="csvFileInput"
                  class="sr-only"
                  type="file"
                  accept=".txt,text/plain"
                  tabindex="-1"
                  aria-label="Файл со строками"
                  @change="onCsvFileChange"
                />
                <button
                  type="button"
                  class="btn-secondary"
                  id="chooseCsvFile"
                  @click="csvFileInput?.click()"
                >
                  <AppIcon name="sheet" /> Выбрать файл
                </button>
                <span id="csvFileName" class="small muted" aria-live="polite">
                  {{ csvFileName || "Файл не выбран" }}
                </span>
              </div>
              <label for="csvText">Вставьте строки</label>
              <textarea
                id="csvText"
                ref="csvTextArea"
                v-model="csvText"
                rows="5"
                data-autofocus
                placeholder="Носки 1 шт 22,35&#10;Кроссовки беговые 2 уп 45.50"
              />
            </div>
            <div class="form-actions">
              <button
                type="button"
                class="btn-secondary w-full"
                id="addBatchBtn"
                @click="addPlainBatch"
              >
                <AppIcon name="plus" /> Добавить партию
              </button>
            </div>
          </template>

          <template v-else>
            <div class="batch-add__group">
              <p class="batch-add__label">По полям</p>
              <p class="small muted">Заполните поля — товар сразу попадёт в партию.</p>
              <form
                id="csvUiForm"
                ref="uiForm"
                class="csv-ui-form"
                novalidate
                @submit.prevent="submitUiItem"
                @input="clearFieldError"
                @change="clearFieldError"
              >
                <div class="field">
                  <label for="csvUiName">Название *</label>
                  <input
                    id="csvUiName"
                    ref="uiNameInput"
                    v-model="csvUiDraft.name"
                    data-csv-ui-name
                    data-autofocus
                    type="text"
                    required
                    autocomplete="off"
                    enterkeyhint="next"
                    placeholder="Например, Носки спортивные"
                  />
                </div>
                <div class="field">
                  <label for="csvUiPrice">Цена, CNY *</label>
                  <input
                    id="csvUiPrice"
                    ref="uiPriceInput"
                    v-model="csvUiDraft.priceCNY"
                    type="number"
                    inputmode="decimal"
                    min="0.01"
                    step="0.01"
                    required
                    enterkeyhint="next"
                    placeholder="Например, 25.50"
                  />
                </div>
                <div class="batch-grid">
                  <div class="field">
                    <label for="csvUiQty">Количество *</label>
                    <input
                      id="csvUiQty"
                      ref="uiQtyInput"
                      v-model="csvUiDraft.quantity"
                      type="number"
                      inputmode="numeric"
                      min="1"
                      step="1"
                      required
                      enterkeyhint="next"
                    />
                  </div>
                  <div class="field">
                    <label for="csvUiUnit">Единица</label>
                    <div class="picker">
                      <select
                        id="csvUiUnit"
                        v-model="csvUiDraft.unit"
                        class="picker__control"
                        enterkeyhint="done"
                      >
                        <option value="pcs">шт</option>
                        <option value="packs">уп</option>
                        <option value="pairs">пар</option>
                      </select>
                      <span class="picker__caret" aria-hidden="true" />
                    </div>
                  </div>
                </div>
                <div class="form-actions">
                  <button type="submit" class="btn-secondary w-full">
                    <AppIcon name="plus" /> Добавить в партию
                  </button>
                </div>
              </form>
            </div>
          </template>
        </div>

        <div class="form-actions form-actions--final">
          <button type="button" class="btn-primary w-full" id="checkStepBtn" @click="goToReview">
            <AppIcon name="arrowRight" /> Далее: проверка
          </button>
        </div>
      </template>

      <template v-else>
        <h1 id="checkTitle" tabindex="-1" data-autofocus class="sr-only">Проверка партии</h1>
        <div class="check-list">
          <div class="check-row">
            <span>Оплачено</span><b>{{ cny(totalCNY) }} · {{ money(totalBYN) }}</b>
          </div>
          <div class="check-row"><span>Курс</span><b>1 CNY = {{ rate.toFixed(4) }}</b></div>
          <div class="check-row">
            <span>Ожидалось товаров</span><b>{{ expectedCount ?? "—" }}</b>
          </div>
          <div class="check-row"><span>Товаров в партии</span><b>{{ items.length }}</b></div>
          <div class="check-row">
            <span>Сумма товаров</span><b>{{ cny(review.itemCNY) }} · {{ money(review.itemBYN) }}</b>
          </div>
          <div class="check-row check-row--total">
            <span>{{ diffLabel }}</span><b>{{ diffValue }}</b>
          </div>
        </div>

        <p v-if="countMismatch" class="check-notice" id="itemsCountNotice">
          Внимание: ожидалось {{ t(ITEM_BARE_FORMS, expectedCount!) }}, добавлено
          {{ t(ITEM_BARE_FORMS, items.length) }}. Проверьте список товаров перед сохранением.
        </p>
        <p class="check-notice" :class="{ 'is-ok': !hasDiff }" id="checkNotice">{{ notice }}</p>

        <div class="form-actions form-actions--final">
          <button
            type="button"
            class="btn-primary w-full"
            id="saveBatchBtn"
            :disabled="saving"
            :aria-describedby="countMismatch ? 'checkNotice itemsCountNotice' : 'checkNotice'"
            @click="saveBatch"
          >
            <AppIcon name="check" /> Сохранить партию ({{ items.length }})
          </button>
        </div>
      </template>
    </template>
  </div>
</template>
