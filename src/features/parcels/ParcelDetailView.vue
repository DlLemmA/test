<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref, shallowRef, useTemplateRef, watch } from "vue";
import { useEventListener, useSupported } from "@vueuse/core";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { toastState, uiState } from "@/core/state";
import { kg, money } from "@/core/utils";
import { getParcelStatement, type ParcelStatement } from "@/features/statements/service";
import { parcelCommands, paymentService } from "@/features/shared/wiring";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import ConfirmDrawer from "@/features/shared/ui/ConfirmDrawer.vue";
import { itemsWithoutTracks, parcelReadiness, type Parcel } from "./domain";
import { nextStepLabel } from "./ui/ParcelNextStatus";
import { parcelStatusInfo } from "./ui/ParcelStatusInfo";
import { parcelDate } from "./ui/ParcelPresentation";
import { finishBlockMessage, finishHint, shipBlockMessage } from "./ui/ReadinessCopy";
import { buildItemGroups, itemSearchCountText } from "./ui/ItemGroups";
import { openReceiveFlow } from "./ReceiveFlow";
import { exportParcel } from "./ui/exportParcel";
import ParcelItemGroups from "./ui/ParcelItemGroups.vue";
import ParcelItemWizard from "./ui/ParcelItemWizard.vue";
import ParcelShipForm from "./ui/ParcelShipForm.vue";
import ParcelEditForm from "./ui/ParcelEditForm.vue";
import ParcelMoveForm from "./ui/ParcelMoveForm.vue";

type ItemFormStep = "main" | "tracks" | "weights";

const route = useRoute();
const router = useRouter();

const statement = shallowRef<ParcelStatement | null>(null);
const loadedParcelId = ref(0);
const searchQuery = ref("");
const missingTracksOnly = ref(false);
const openGroups = ref<Set<number>>(new Set());
const commentDraft = ref<string | null>(null);
const commentFocused = ref(false);
const countText = ref("");

const shipOpen = ref(false);
const editOpen = ref(false);
const moveOpen = ref(false);
const moveItemId = ref<number | null>(null);
const wizardOpen = ref(false);
const wizardItemId = ref<number | null>(null);
const wizardStep = ref<ItemFormStep>("main");
const deleteTarget = ref<number | null>(null);

const commentArea = useTemplateRef<HTMLTextAreaElement>("commentArea");
const commentBlock = useTemplateRef<HTMLDivElement>("commentBlock");
let countTimer: ReturnType<typeof setTimeout> | null = null;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Ошибка";
}

function defaultItemStep(status: Parcel["status"]): ItemFormStep {
  if (status === "draft" || status === "shipped") return "tracks";
  if (status === "received") return "weights";
  return "main";
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
  const result = await getParcelStatement(parcelId);
  if (loadScope.signal.aborted) return;
  if (!result) {
    uiState.setCurrentParcelId(null);
    void router.push({ name: "parcels" });
    return;
  }
  if (loadedParcelId.value !== result.parcel.id) {
    loadedParcelId.value = result.parcel.id;
    searchQuery.value = "";
    missingTracksOnly.value = false;
    openGroups.value = new Set();
  }
  statement.value = result;
}
onMounted(load);

function refresh(): void {
  void load();
}

const parcel = computed(() => statement.value?.parcel ?? null);
const items = computed(() => statement.value?.items ?? []);
const customers = computed(() => statement.value?.customers ?? []);
const balances = computed(() => statement.value?.balance.byCustomer ?? new Map());
const deliveryByItem = computed(() => statement.value?.balance.deliveryByItem ?? new Map());
const settlement = computed(() => statement.value?.settlement ?? null);

const date = computed(() => (parcel.value ? parcelDate(parcel.value) : null));
const status = computed(() => (parcel.value ? parcelStatusInfo(parcel.value.status) : null));
const trackNumbers = computed(() =>
  items.value.flatMap((item) => item.trackNumbers.map((track) => track.trim()).filter(Boolean)),
);
const missingTracks = computed(() =>
  parcel.value?.status === "draft" ? itemsWithoutTracks(items.value) : 0,
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
  const remaining = Array.from(balances.value.values()).reduce((sum, b) => sum + b.remaining, 0);
  return [
    { label: "Позиций", value: String(items.value.length) },
    { label: "Вес", value: boxWeight.value > 0 ? `${kg(boxWeight.value)} кг` : "—" },
    { label: "Товары", value: money(goodsTotal) },
    { label: "Доставка", value: delivery > 0 ? money(delivery) : "—" },
    { label: "Итого", value: money(goodsTotal + delivery), strong: true },
    {
      label: "Курс",
      value: tariffPerKg.value > 0 ? `${tariffPerKg.value.toFixed(2)} BYN/кг` : "—",
    },
    { label: "Остаток", value: money(remaining), warn: remaining > 0 },
  ];
});

const itemGroups = computed(() =>
  parcel.value
    ? buildItemGroups(
        items.value,
        customers.value,
        parcel.value.status,
        searchQuery.value,
        missingTracksOnly.value,
      )
    : { groups: [], result: { visible: 0, total: 0, queryLength: 0, missingOnly: false } },
);
const searching = computed(
  () => itemGroups.value.result.queryLength > 0 || missingTracksOnly.value,
);

watch(
  [searching, itemGroups],
  ([active, groups]) => {
    if (!active) return;
    const next = new Set(openGroups.value);
    let changed = false;
    for (const group of groups.groups) {
      if (group.visibleRows.length > 0 && !next.has(group.customerId)) {
        next.add(group.customerId);
        changed = true;
      }
    }
    if (changed) openGroups.value = next;
  },
  { immediate: true },
);
const noResults = computed(() => searching.value && itemGroups.value.result.visible === 0);
const showMissingFilter = computed(
  () => parcel.value?.status === "draft" && (missingTracks.value > 0 || missingTracksOnly.value),
);

watch(
  () => itemGroups.value.result,
  (result) => {
    if (countTimer) clearTimeout(countTimer);
    countTimer = setTimeout(() => {
      countText.value = itemSearchCountText(result);
    }, 180);
  },
  { immediate: true },
);

const commentValue = computed(() => commentDraft.value ?? parcel.value?.comment ?? "");
const commentRows = computed(() =>
  commentFocused.value ? Math.min(16, Math.max(2, commentValue.value.split("\n").length)) : 1,
);

function resizeComment(): void {
  const area = commentArea.value;
  if (!area) return;
  area.style.height = "auto";
  area.style.height = `${area.scrollHeight}px`;
}

function expandComment(): void {
  if (commentFocused.value) return;
  commentFocused.value = true;
  void resizeComment();
}

function collapseComment(): void {
  commentFocused.value = false;
  if (commentArea.value) commentArea.value.style.height = "";
}

function blurComment(): void {
  collapseComment();
  const next = (commentDraft.value ?? commentArea.value?.value ?? "").trim();
  commentDraft.value = null;
  if (!parcel.value || next === (parcel.value.comment ?? "")) return;
  void parcelCommands
    .updateParcel(parcel.value.id, { comment: next || null })
    .then(() => toastState.add({ message: "Заметка сохранена", type: "success" }))
    .catch((err) => {
      toastState.add({ message: "Не удалось сохранить заметку", type: "error" });
      console.error(err);
    });
}

function clearSearch(): void {
  searchQuery.value = "";
  missingTracksOnly.value = false;
}

async function copyTracks(button: HTMLElement, source: HTMLElement): Promise<void> {
  const text = source instanceof HTMLTextAreaElement ? source.value : source.innerText.trim();
  if (!text) {
    toastState.add({ message: "В посылке нет трек-номеров", type: "warn" });
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toastState.add({ message: "Трек-номера скопированы", type: "success" });
  } catch {
    toastState.add({ message: "Не удалось скопировать трек-номера", type: "error" });
  }
}

function onCopyCommand(event: Event): void {
  const commandEvent = event as Event & { command?: string; source?: HTMLElement };
  if (commandEvent.command !== "--copy-tracks") return;
  const source = commandEvent.target as HTMLElement | null;
  if (source) void copyTracks(commandEvent.source as HTMLElement, source);
}

function onCopyFallback(event: MouseEvent): void {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
    'button[command="--copy-tracks"]',
  );
  if (!button) return;
  const source = document.getElementById(button.getAttribute("commandfor") || "");
  if (source) void copyTracks(button, source);
}

const hasCommandEvent = useSupported(() => "CommandEvent" in window);
const copyFallbackTarget = computed(() => (hasCommandEvent.value ? null : document));
useEventListener(document, "command", onCopyCommand, { capture: true });
useEventListener(copyFallbackTarget, "click", onCopyFallback);
onScopeDispose(() => {
  if (countTimer) clearTimeout(countTimer);
});

function openShip(): void {
  if (!parcel.value) return;
  const message = shipBlockMessage(parcelReadiness(parcel.value, items.value).ship);
  if (message) {
    toastState.add({ message, type: "error" });
    return;
  }
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
    toastState.add({ message: "Не удалось отметить получение", type: "error" });
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
    toastState.add({ message, type: "error" });
    return;
  }
  try {
    await parcelCommands.markAsDoneParcel(parcel.value.id);
    refresh();
    toastState.add({ message: "Посылка завершена", type: "success" });
  } catch (err) {
    toastState.add({ message: "Не удалось завершить посылку", type: "error" });
    console.error(err);
  }
}

function toggleGroup(customerId: number): void {
  const next = new Set(openGroups.value);
  if (next.has(customerId)) next.delete(customerId);
  else next.add(customerId);
  openGroups.value = next;
}

function closeGroup(customerId: number): void {
  const next = new Set(openGroups.value);
  next.delete(customerId);
  openGroups.value = next;
}

async function toggleGoods(customerId: number, checked: boolean): Promise<void> {
  if (!parcel.value) return;
  await paymentService.setParcelPayment(
    parcel.value.id,
    customerId,
    items.value.filter((item) => item.customerId === customerId).map((item) => item.id),
    checked,
    false,
  );
  refresh();
}

async function toggleShipping(customerId: number): Promise<void> {
  if (!settlement.value?.deliveryInvoiced || !parcel.value) return;
  await paymentService.toggleShippingPayment(parcel.value.id, customerId);
  refresh();
}

async function toggleItemPayment(itemId: number): Promise<void> {
  if (!parcel.value) return;
  const item = items.value.find((candidate) => candidate.id === itemId);
  if (!item) return;
  await paymentService.toggleItemPayment(parcel.value.id, itemId, item.customerId);
  refresh();
}

function openWizard(itemId: number | null, customerId: number, step: ItemFormStep): void {
  closeGroup(customerId);
  wizardItemId.value = itemId;
  wizardStep.value = step;
  wizardOpen.value = true;
}

function openMove(itemId: number, customerId: number): void {
  closeGroup(customerId);
  moveItemId.value = itemId;
  moveOpen.value = true;
}

function openDelete(itemId: number, customerId: number): void {
  closeGroup(customerId);
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
    toastState.add({ message: errorMessage(err), type: "error" });
  }
}
</script>

<template>
  <div v-if="parcel && status && date && settlement" class="page page-parcel-detail">
    <div class="detail-topbar">
      <RouterLink class="text-btn" id="backToParcels" :to="{ name: 'parcels' }">
        <AppIcon name="chevronLeft" /> Все посылки
      </RouterLink>
      <div class="detail-topbar__actions">
        <button
          type="button"
          class="text-btn"
          id="copyParcelTracks"
          command="--copy-tracks"
          commandfor="parcelTracksSource"
        >
          <span class="sr-only">Скопировать трек-номера</span>
          <span aria-hidden="true"><AppIcon name="copy" /> Трек-номера</span>
        </button>
        <button type="button" class="text-btn" id="editParcel" @click="editOpen = true">
          <AppIcon name="pencil" /> Изменить
        </button>
      </div>
    </div>
    <textarea
      id="parcelTracksSource"
      class="sr-only"
      readonly
      tabindex="-1"
      aria-hidden="true"
      :value="trackNumbers.join('\n')"
    />

    <section class="detail-hero" :data-status="parcel.status">
      <div class="detail-hero__date" :title="date.title">
        <b>{{ date.day }}</b>
        <span>{{ date.month }}</span>
      </div>
      <div class="detail-hero__body min-w-0">
        <div class="detail-hero__title-row">
          <h1>{{ parcel.name || `Посылка №${parcel.id}` }}</h1>
          <span class="detail-state" :class="`state-${status.class}`">{{ status.label }}</span>
        </div>
        <p class="detail-hero__next">{{ nextStepLabel(parcel.status) }}</p>
      </div>
    </section>

    <div class="parcel-calc" aria-label="Расчёт по посылке">
      <span
        v-for="bullet in calculation"
        :key="bullet.label"
        class="parcel-calc__item"
        :class="{ 'is-total': bullet.strong, 'is-warn': bullet.warn }"
      >
        <span class="parcel-calc__label">{{ bullet.label }}</span>
        <b>{{ bullet.value }}</b>
      </span>
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
      </template>
      <button v-else type="button" class="text-btn" id="exportParcel" @click="exportParcel(parcel)">
        <AppIcon name="sheet" /> Экспорт в Excel
      </button>
    </div>

    <div id="parcelCommentBlock" class="parcel-comment" :class="{ 'is-expanded': commentFocused }">
      <textarea
        id="parcelCommentText"
        ref="commentArea"
        :value="commentValue"
        class="parcel-comment__text"
        :rows="commentRows"
        placeholder="Заметка о посылке…"
        aria-label="Заметка о посылке"
        @focus="expandComment"
        @click="expandComment"
        @input="
          commentDraft = ($event.target as HTMLTextAreaElement).value;
          resizeComment();
        "
        @keydown.esc="($event.target as HTMLTextAreaElement).blur()"
        @blur="blurComment"
      />
    </div>

    <div
      v-if="items.length > 0"
      class="item-search"
      role="search"
      aria-label="Поиск товаров в посылке"
    >
      <label class="sr-only" for="parcelItemSearch">Поиск товаров</label>
      <input
        id="parcelItemSearch"
        v-model="searchQuery"
        type="search"
        class="item-search__input"
        name="itemSearch"
        placeholder="Название, заказчик или трек"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="none"
        spellcheck="false"
        enterkeyhint="search"
        @keydown.esc.prevent="clearSearch"
      />
      <button
        v-if="showMissingFilter"
        type="button"
        id="missingTracksFilter"
        class="item-search__filter"
        :class="{ 'is-active': missingTracksOnly }"
        :aria-pressed="missingTracksOnly"
        :title="missingTracksOnly ? 'Снять фильтр «Без треков»' : 'Показать товары без треков'"
        @click="missingTracksOnly = !missingTracksOnly"
      >
        Без треков <b>{{ missingTracks }}</b
        ><span class="item-search__filter-x" aria-hidden="true">×</span>
      </button>
      <span
        id="parcelItemSearchCount"
        class="item-search__count"
        role="status"
        aria-live="polite"
        :hidden="countText.length === 0"
        >{{ countText }}</span
      >
    </div>

    <section class="section">
      <header class="section-title with-action">
        <h2>Товары</h2>
        <button
          v-if="parcel.status === 'draft'"
          type="button"
          class="text-btn"
          id="addItem"
          @click="openWizard(null, 0, 'main')"
        >
          <AppIcon name="plus" /> Добавить
        </button>
      </header>
      <div id="parcelItemsList">
        <ParcelItemGroups
          :groups="itemGroups.groups"
          :searching="searching"
          :parcel="parcel"
          :balances="balances"
          :delivery-by-item="deliveryByItem"
          :settlement="settlement"
          :open-customer-groups="openGroups"
          @toggle-group="toggleGroup"
          @close-group="closeGroup"
          @toggle-goods="toggleGoods"
          @toggle-shipping="toggleShipping"
          @edit-item="
            (itemId, customerId) =>
              openWizard(itemId, customerId, defaultItemStep(parcel?.status ?? 'draft'))
          "
          @move-item="(itemId, customerId) => openMove(itemId, customerId)"
          @delete-item="(itemId, customerId) => openDelete(itemId, customerId)"
          @add-track="(itemId, customerId) => openWizard(itemId, customerId, 'tracks')"
          @toggle-item-payment="toggleItemPayment"
        />
        <p
          v-if="items.length > 0"
          id="parcelItemNoResults"
          class="empty item-search__empty"
          :hidden="!noResults"
        >
          Ничего не найдено. Измените запрос.
        </p>
      </div>
    </section>

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
  </div>
</template>
