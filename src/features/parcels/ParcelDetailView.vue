<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onScopeDispose,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import type { ParcelItemStatus } from "@/core/dbSchema";
import { toastState, uiState } from "@/core/state";
import { kg, byn, t } from "@/core/utils";
import {
  getParcelStatement,
  type ParcelStatement,
  withPaymentState,
} from "@/features/statements/service";
import { effectivePaid } from "@/features/settlement/domain";
import { parcelCommands, paymentService } from "@/features/shared/wiring";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import ConfirmDrawer from "@/features/shared/ui/ConfirmDrawer.vue";
import ScreenState from "@/features/shared/ui/ScreenState.vue";
import { parcelReadiness, type Parcel, type PaymentState } from "./domain";
import { nextStepLabel } from "./ui/ParcelNextStatus";
import { ITEM_FORMS, parcelDate } from "./ui/ParcelPresentation";
import { finishBlockMessage, finishHint, shipBlockMessage } from "./ui/ReadinessCopy";
import { openReceiveFlow } from "./ReceiveFlow";
import { exportParcel, parcelExportState } from "./ui/exportParcel";
import ParcelComment from "./ui/ParcelComment.vue";
import ParcelItems from "./ui/ParcelItems.vue";
import ParcelTimeline from "./ui/ParcelTimeline.vue";
import ParcelTrackCopy from "./ui/ParcelTrackCopy.vue";
import ParcelItemWizard from "./ui/ParcelItemWizard.vue";
import ParcelShipForm from "./ui/ParcelShipForm.vue";
import ParcelEditForm from "./ui/ParcelEditForm.vue";
import ParcelMoveForm from "./ui/ParcelMoveForm.vue";

type ItemFormStep = "main" | "tracks" | "weights";

const route = useRoute();
const router = useRouter();

const statement = shallowRef<ParcelStatement | null>(null);
const phase = shallowRef<"loading" | "ready" | "error">("loading");
/** Refetch keeps the rendered statement; only the thin top bar shows progress. */
const refreshing = shallowRef(false);
let quietLoads = 0;
/** Row-level failures stay next to the action; toasts are for confirmations. */
const actionError = shallowRef("");
const retryAction = shallowRef<(() => void) | null>(null);
const actionErrorEl = useTemplateRef<HTMLDivElement>("actionErrorEl");
/** A pending payment change, kept until the server round trip confirms it. */
const pendingPayment = shallowRef<PaymentState | null>(null);

const shipOpen = ref(false);
const editOpen = ref(false);
const moveOpen = ref(false);
const moveItemId = ref<number | null>(null);
const wizardOpen = ref(false);
const wizardItemId = ref<number | null>(null);
const wizardStep = ref<ItemFormStep>("main");
const deleteTarget = ref<number | null>(null);

function fail(message: string, retry?: () => void): void {
  actionError.value = message;
  retryAction.value = retry ?? null;
  // The message is rendered next to the action; move focus there so keyboard
  // and screen-reader users land on the error instead of hunting for it.
  void nextTick(() => actionErrorEl.value?.focus());
}

function retryFailed(): void {
  actionError.value = "";
  retryAction.value?.();
}

const loadScope = new AbortController();
onScopeDispose(() => loadScope.abort());

async function load(options: { showLoading?: boolean } = {}): Promise<void> {
  const parcelId = Number(route.params.parcelId);
  if (!Number.isInteger(parcelId) || parcelId <= 0) {
    void router.push({ name: "parcels" });
    return;
  }
  uiState.setCurrentParcelId(parcelId);
  const showLoading = options.showLoading !== false;
  if (showLoading) phase.value = "loading";
  else {
    quietLoads += 1;
    refreshing.value = true;
  }
  try {
    const result = await getParcelStatement(parcelId);
    if (loadScope.signal.aborted) return;
    if (!result) {
      uiState.setCurrentParcelId(null);
      void router.push({ name: "parcels" });
      return;
    }
    statement.value = result;
    phase.value = "ready";
  } catch (error) {
    if (!loadScope.signal.aborted) phase.value = "error";
    console.error(error);
  } finally {
    if (!showLoading) quietLoads = Math.max(0, quietLoads - 1);
    if (quietLoads === 0) refreshing.value = false;
  }
}
onMounted(load);

function refresh(): void {
  // Keep an already rendered statement on screen: swapping in the loading
  // skeleton unmounts the detail subtree and collapses the scroller to 0.
  void load({ showLoading: phase.value !== "ready" });
}

/** Mirror one checkbox change into every fact derived from the statement. */
function previewPayment(
  customerId: number,
  itemIds: number[],
  paid: boolean,
  shipping: boolean,
): void {
  const current = statement.value;
  if (!current) return;
  const state: PaymentState = {
    itemPaid: new Map(Array.from(current.settlement.paidItems, (id) => [id, true])),
    shippingPaid: new Map(Array.from(current.settlement.paidDelivery, (id) => [id, true])),
  };
  const selfId = current.customers.find((customer) => customer.isSelf)?.id;
  const effective = effectivePaid(customerId, selfId, paid);
  for (const itemId of itemIds) state.itemPaid.set(itemId, effective);
  if (shipping) state.shippingPaid.set(customerId, effective);
  pendingPayment.value = state;
}

function clearPending(): void {
  pendingPayment.value = null;
}

const viewStatement = computed(() =>
  statement.value && pendingPayment.value
    ? withPaymentState(statement.value, pendingPayment.value)
    : statement.value,
);
const parcel = computed(() => viewStatement.value?.parcel ?? null);
const items = computed(() => viewStatement.value?.items ?? []);
const customers = computed(() => viewStatement.value?.customers ?? []);
const balances = computed(() => viewStatement.value?.balance.byCustomer ?? new Map());
const deliveryByItem = computed(() => viewStatement.value?.balance.deliveryByItem ?? new Map());
const settlement = computed(() => viewStatement.value?.settlement ?? null);

const exportBusy = computed(
  () => parcelExportState.parcelId === parcel.value?.id && parcelExportState.phase !== "idle",
);
const exportLabel = computed(() => {
  if (parcelExportState.parcelId !== parcel.value?.id) return "Экспорт в Excel";
  switch (parcelExportState.phase) {
    case "preparing":
      return "Готовим Excel…";
    case "sharing":
      return "Отправляем файл…";
    case "downloading":
      return "Скачиваем…";
    default:
      return "Экспорт в Excel";
  }
});
const exportError = computed(() =>
  parcelExportState.parcelId === parcel.value?.id ? parcelExportState.error : "",
);
const exportErrorEl = useTemplateRef<HTMLParagraphElement>("exportErrorEl");
watch(exportError, (message) => {
  if (message) void nextTick(() => exportErrorEl.value?.focus());
});

/** Finishing is a logistics step: unpaid lines stay as debt, but stay visible. */
const unpaidItemsHint = computed(() => {
  const paid = settlement.value?.paidItems;
  if (!paid) return null;
  const count = items.value.filter((item) => !paid.has(item.id)).length;
  if (count === 0) return null;
  return `Не оплачено: ${t(ITEM_FORMS, count)}. Долг останется после завершения`;
});

const date = computed(() => (parcel.value ? parcelDate(parcel.value) : null));
const trackNumbers = computed(() =>
  items.value.flatMap((item) => item.trackNumbers.map((track) => track.trim()).filter(Boolean)),
);
const boxWeight = computed(() => parcel.value?.boxWeightG || 0);
const tariffPerKg = computed(() => {
  const current = parcel.value;
  if (!current?.shippingCostBYN || !current.boxWeightG) return 0;
  return current.shippingCostBYN / (current.boxWeightG / 1000);
});
const calculation = computed(() => {
  const goodsTotal = items.value.reduce((sum, item) => sum + item.totalPriceBYN, 0);
  const delivery = parcel.value?.shippingCostBYN || 0;
  const remainingTotal = Array.from(balances.value.values()).reduce(
    (sum, balance) => sum + balance.remaining,
    0,
  );
  return {
    remaining: {
      label:
        remainingTotal > 0
          ? "Должны"
          : statement.value?.settlement.deliveryInvoiced
            ? "Оплачено"
            : "Доставка не учтена",
      value: byn(remainingTotal),
      warn: remainingTotal > 0,
    },
    meta: [
      { label: "Позиций", value: String(items.value.length) },
      { label: "Вес коробки", value: boxWeight.value > 0 ? `${kg(boxWeight.value)} кг` : "—" },
      { label: "Товары", value: byn(goodsTotal) },
      { label: "Доставка", value: delivery > 0 ? byn(delivery) : "—" },
      {
        label: "Доставка / вес коробки",
        value: tariffPerKg.value > 0 ? `${byn(tariffPerKg.value)}/кг` : "—",
      },
    ],
  };
});

function openShip(): void {
  if (!parcel.value) return;
  const message = shipBlockMessage(parcelReadiness(parcel.value, items.value).ship);
  if (message) {
    fail(message);
    return;
  }
  actionError.value = "";
  shipOpen.value = true;
}

async function receive(): Promise<void> {
  if (!parcel.value) return;
  try {
    const received = await parcelCommands.receiveParcel(
      parcel.value.id,
      parcel.value.boxWeightG || 0,
      parcel.value.shippingCostBYN || 0,
    );
    void openReceiveFlow(received, refresh);
    refresh();
  } catch (err) {
    fail("Не удалось отметить получение", () => void receive());
    console.error(err);
  }
}

function rescan(): void {
  if (parcel.value) void openReceiveFlow(parcel.value, refresh);
}

async function markDone(): Promise<void> {
  if (!parcel.value) return;
  const message = finishBlockMessage(
    parcelReadiness(parcel.value, items.value).finish,
    items.value,
  );
  if (message) {
    fail(message);
    return;
  }
  try {
    await parcelCommands.markAsDoneParcel(parcel.value.id);
    actionError.value = "";
    refresh();
    toastState.add({ message: "Посылка завершена", type: "success" });
  } catch (err) {
    fail("Не удалось завершить посылку", () => void markDone());
    console.error(err);
  }
}

async function toggleGoods(customerId: number, checked: boolean): Promise<void> {
  const current = parcel.value;
  if (!current) return;
  const itemIds = items.value
    .filter((item) => item.customerId === customerId)
    .map((item) => item.id);
  previewPayment(customerId, itemIds, checked, false);
  try {
    await paymentService.setParcelPayment(current.id, customerId, itemIds, checked, false);
    await load();
  } catch (err) {
    fail("Не удалось изменить оплату", () => void load());
    console.error(err);
  } finally {
    clearPending();
  }
}

async function toggleShipping(customerId: number): Promise<void> {
  const current = parcel.value;
  if (!settlement.value?.deliveryInvoiced || !current) return;
  if ((balances.value.get(customerId)?.delivery.owed ?? 0) <= 0) return;
  const next = !settlement.value.paidDelivery.has(customerId);
  previewPayment(customerId, [], next, true);
  try {
    await paymentService.toggleShippingPayment(current.id, customerId);
    await load();
  } catch (err) {
    fail("Не удалось изменить оплату доставки", () => void load());
    console.error(err);
  } finally {
    clearPending();
  }
}

async function toggleItemPayment(itemId: number): Promise<void> {
  const current = parcel.value;
  if (!current) return;
  const item = items.value.find((candidate) => candidate.id === itemId);
  if (!item) return;
  const next = !settlement.value?.paidItems.has(itemId);
  previewPayment(item.customerId, [itemId], next ?? false, false);
  try {
    await paymentService.toggleItemPayment(current.id, itemId, item.customerId);
    await load();
  } catch (err) {
    fail("Не удалось изменить оплату товара", () => void load());
    console.error(err);
  } finally {
    clearPending();
  }
}

async function toggleTracksComplete(itemId: number): Promise<void> {
  const item = items.value.find((candidate) => candidate.id === itemId);
  if (!item) return;
  const next = !item.tracksCompleted;
  try {
    await parcelCommands.updateItem(itemId, {
      tracksCompletedAt: next ? new Date().toISOString() : undefined,
    });
    refresh();
    toastState.add({
      message: next ? `${item.name} · треки заполнены` : `${item.name} · отметка с треков снята`,
      type: next ? "success" : "info",
    });
  } catch (err) {
    fail("Не удалось изменить отметку о треках", () => void toggleTracksComplete(itemId));
    console.error(err);
  }
}

async function toggleLost(itemId: number): Promise<void> {
  const current = parcel.value;
  const item = items.value.find((candidate) => candidate.id === itemId);
  if (!current || !item) return;
  const lost = item.status !== "lost";
  const status: ParcelItemStatus = lost
    ? "lost"
    : current.status === "received"
      ? "received"
      : "shipped";
  try {
    await parcelCommands.updateItem(itemId, { status });
    refresh();
    toastState.add({
      message: `${item.name} — ${lost ? "потерян" : "не потерян"}`,
      type: lost ? "warn" : "info",
    });
  } catch (err) {
    fail("Не удалось изменить отметку о потере", () => void toggleLost(itemId));
    console.error(err);
  }
}

function openWizard(itemId: number | null, step: ItemFormStep): void {
  wizardItemId.value = itemId;
  wizardStep.value = step;
  wizardOpen.value = true;
}

function openMove(itemId: number): void {
  moveItemId.value = itemId;
  moveOpen.value = true;
}

function openDelete(itemId: number): void {
  deleteTarget.value = itemId;
}

async function confirmDelete(): Promise<void> {
  if (deleteTarget.value == null) return;
  const id = deleteTarget.value;
  deleteTarget.value = null;
  try {
    await parcelCommands.deleteItem(id);
    refresh();
    toastState.add({ message: "Товар удалён", type: "success" });
  } catch (err) {
    fail("Не удалось удалить товар", () => openDelete(id));
    console.error(err);
  }
}
</script>

<template>
  <div class="page page-parcel-detail">
    <div
      v-if="refreshing && phase === 'ready'"
      class="detail-refresh-bar"
      role="progressbar"
      aria-label="Обновление данных"
    />
    <ScreenState
      v-if="phase === 'loading'"
      kind="loading"
      skeleton="detail"
      title="Загружаем посылку…"
    />
    <ScreenState
      v-else-if="phase === 'error'"
      kind="error"
      message="Не удалось загрузить посылку. Проверьте соединение и попробуйте ещё раз."
      action-label="Повторить"
      @action="refresh"
    />
    <template v-else-if="parcel && date && settlement">
      <div class="detail-topbar">
        <RouterLink class="text-btn" id="backToParcels" :to="{ name: 'parcels' }">
          <AppIcon name="chevronLeft" /> Все посылки
        </RouterLink>
        <div class="detail-topbar__actions">
          <ParcelTrackCopy :track-numbers="trackNumbers" />
          <button type="button" class="text-btn" id="editParcel" @click="editOpen = true">
            <AppIcon name="pencil" /> Изменить
          </button>
        </div>
      </div>

      <section class="detail-hero" :data-status="parcel.status">
        <div class="detail-hero__date" :title="date.title">
          <b>{{ date.day }}</b>
          <span>{{ date.month }}</span>
        </div>
        <div class="detail-hero__body min-w-0">
          <div class="detail-hero__title-row">
            <h1>{{ parcel.name || `Посылка №${parcel.id}` }}</h1>
          </div>
          <p class="detail-hero__next">{{ nextStepLabel(parcel.status) }}</p>
        </div>
      </section>

      <ParcelTimeline :parcel="parcel" />

      <div v-if="actionError" ref="actionErrorEl" class="inline-error" role="alert" tabindex="-1">
        <span>{{ actionError }}</span>
        <button v-if="retryAction" type="button" class="text-btn" @click="retryFailed">
          Повторить
        </button>
      </div>

      <div class="parcel-calc" aria-label="Расчёт по посылке">
        <div class="parcel-calc__primary">
          <div
            class="parcel-calc__item parcel-calc__item--headline"
            :class="{ 'is-warn': calculation.remaining.warn }"
          >
            <span class="parcel-calc__label">{{ calculation.remaining.label }}</span>
            <b>{{ calculation.remaining.value }}</b>
          </div>
        </div>
        <dl class="parcel-calc__meta">
          <div v-for="bullet in calculation.meta" :key="bullet.label" class="parcel-calc__item">
            <dt class="parcel-calc__label">{{ bullet.label }}</dt>
            <dd><b>{{ bullet.value }}</b></dd>
          </div>
        </dl>
      </div>

      <div class="detail-action">
        <template v-if="parcel.status === 'draft'">
          <button type="button" class="btn-primary btn-action" id="shipParcel" @click="openShip">
            <AppIcon name="package" /> Отправить
          </button>
          <RouterLink
            class="text-btn"
            id="openBatchForm"
            :to="{ name: 'add', params: { parcelId: String(parcel.id) } }"
          >
            <AppIcon name="plus" /> Партия товаров
          </RouterLink>
        </template>
        <button
          v-else-if="parcel.status === 'shipped'"
          type="button"
          class="btn-primary btn-action"
          id="receiveParcel"
          @click="receive"
        >
          <AppIcon name="scan" /> Получить посылку
        </button>
        <template v-else-if="parcel.status === 'received'">
          <button type="button" class="btn-primary btn-action" id="markAsDone" @click="markDone">
            <AppIcon name="checkCircle" /> Завершить
          </button>
          <button type="button" class="text-btn" id="rescanParcel" @click="rescan">
            <AppIcon name="scan" /> Сканировать ещё
          </button>
          <p v-if="finishHint(parcelReadiness(parcel, items).finish)" class="detail-action__hint">
            {{ finishHint(parcelReadiness(parcel, items).finish) }}
          </p>
          <p v-if="unpaidItemsHint" class="detail-action__hint">{{ unpaidItemsHint }}</p>
        </template>
        <button
          v-else
          type="button"
          class="text-btn"
          id="exportParcel"
          :disabled="exportBusy"
          @click="exportParcel(parcel)"
        >
          <AppIcon name="sheet" /> {{ exportLabel }}
        </button>
        <p v-if="exportError" ref="exportErrorEl" class="field-error" role="alert" tabindex="-1">
          {{ exportError }}
        </p>
      </div>

      <ParcelComment :parcel-id="parcel.id" :comment="parcel.comment" />

      <ParcelItems
        :items="items"
        :customers="customers"
        :parcel="parcel"
        :balances="balances"
        :delivery-by-item="deliveryByItem"
        :settlement="settlement"
        @add-item="openWizard(null, 'main')"
        @edit-item="openWizard"
        @move-item="openMove"
        @delete-item="openDelete"
        @toggle-goods="(customerId, checked) => toggleGoods(customerId, checked)"
        @toggle-shipping="toggleShipping"
        @toggle-item-payment="toggleItemPayment"
        @toggle-tracks-complete="toggleTracksComplete"
        @toggle-lost="toggleLost"
      />

      <ParcelShipForm v-model:open="shipOpen" :parcel="parcel" @shipped="refresh" />
      <ParcelEditForm v-model:open="editOpen" :parcel="parcel" @saved="refresh" />
      <ParcelMoveForm v-model:open="moveOpen" :item-id="moveItemId" @moved="refresh" />
      <ParcelItemWizard
        v-model:open="wizardOpen"
        :item-id="wizardItemId"
        :parcel-id="parcel.id"
        :parcel-status="parcel.status"
        :initial-step="wizardStep"
        @saved="refresh"
      />
      <ConfirmDrawer
        :open="deleteTarget !== null"
        title="Удалить товар"
        message="Товар будет удалён. Это действие нельзя отменить."
        confirm-text="Удалить"
        @update:open="deleteTarget = null"
        @confirm="confirmDelete"
      />
    </template>
  </div>
</template>

<style scoped>
/* Parcel detail — a waybill on the desk, not a dashboard */
.page-parcel-detail {
  container: ledger / inline-size;
  gap: 4px;
  padding-top: 4px;
}
/* Refetch progress is an overlay: it must not add height or move the scroller. */
.detail-refresh-bar {
  position: fixed;
  z-index: 40;
  inset-block-start: 0;
  inset-inline: 0;
  block-size: 2px;
  overflow: hidden;
  background: var(--color-accent-line);
  pointer-events: none;
}
.detail-refresh-bar::after {
  content: "";
  position: absolute;
  inset-block: 0;
  inline-size: 35%;
  background: var(--color-accent);
  animation: detail-refresh-sweep 900ms ease-in-out infinite;
}
@keyframes detail-refresh-sweep {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(300%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .detail-refresh-bar::after {
    inline-size: 100%;
    animation: none;
    opacity: 0.5;
  }
}
.detail-topbar__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
/* The copy button is the root of a multi-root child component, so it carries
   no scope attribute; :deep keeps both topbar buttons on the same rhythm. */
.detail-topbar__actions :deep(.text-btn) {
  min-inline-size: 44px;
  justify-content: center;
}
.detail-hero__date {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding-inline-end: 12px;
  border-inline-end: 1px solid var(--color-line);
  line-height: 1;
}
.detail-hero__date b {
  color: var(--color-ink);
  font-family: var(--font-mono);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.06em;
}
.detail-hero__date span {
  margin-top: 3px;
  color: var(--color-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.detail-hero[data-status="draft"] .detail-hero__date b {
  color: var(--color-muted);
}
.detail-action {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-line);
}
.detail-action__hint {
  flex-basis: 100%;
  margin: -2px 0 0;
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.4;
}
.btn-action {
  min-block-size: 44px;
  padding-inline: 16px;
  border-radius: 10px;
  font-size: 14px;
}

/* Parcel calculation — one ledger rule under the stamp, not a second card */
.parcel-calc {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-line);
}
.parcel-calc__primary {
  display: flex;
  align-items: baseline;
}
.parcel-calc__item {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.parcel-calc__item--headline {
  display: inline-flex;
  flex-direction: row;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  white-space: nowrap;
}
.parcel-calc__item--headline b {
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.04em;
}
.parcel-calc__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px 16px;
  margin: 0;
}
.parcel-calc__meta dd {
  margin: 0;
}
.parcel-calc__label {
  color: var(--color-muted);
}
.parcel-calc__item b {
  color: var(--color-ink-soft);
  font-weight: 650;
}
.parcel-calc__item--headline.is-warn b {
  color: var(--color-warning);
}

/* These overrides must stay after the base rules: scoped selectors carry the
   same attribute specificity here, so source order preserves the reflow. */
@media (max-width: 360px) {
  .detail-hero__date b {
    font-size: 25px;
  }
}
@container ledger (max-width: 430px) {
  .detail-hero__date b {
    font-size: 25px;
  }
  .parcel-calc,
  .parcel-calc__meta {
    justify-content: flex-start;
  }
}
</style>
