<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onScopeDispose,
  ref,
  shallowRef,
  useTemplateRef,
} from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import type { ParcelItemStatus } from "@/core/dbSchema";
import { toastState, uiState } from "@/core/state";
import { kg, money, t } from "@/core/utils";
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
import { exportParcel } from "./ui/exportParcel";
import ParcelComment from "./ui/ParcelComment.vue";
import ParcelItems from "./ui/ParcelItems.vue";
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

async function load(): Promise<void> {
  const parcelId = Number(route.params.parcelId);
  if (!Number.isInteger(parcelId) || parcelId <= 0) {
    void router.push({ name: "parcels" });
    return;
  }
  uiState.setCurrentParcelId(parcelId);
  phase.value = "loading";
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
  }
}
onMounted(load);

function refresh(): void {
  void load();
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
      value: money(remainingTotal),
      warn: remainingTotal > 0,
    },
    meta: [
      { label: "Позиций", value: String(items.value.length) },
      { label: "Вес коробки", value: boxWeight.value > 0 ? `${kg(boxWeight.value)} кг` : "—" },
      { label: "Товары", value: money(goodsTotal) },
      { label: "Доставка", value: delivery > 0 ? money(delivery) : "—" },
      {
        label: "Доставка / вес коробки",
        value: tariffPerKg.value > 0 ? `${tariffPerKg.value.toFixed(2)} BYN/кг` : "—",
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
    <ScreenState v-if="phase === 'loading'" kind="loading" title="Загружаем посылку…" />
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
          @click="exportParcel(parcel)"
        >
          <AppIcon name="sheet" /> Экспорт в Excel
        </button>
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
