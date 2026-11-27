<script setup lang="ts">
import { computed, onScopeDispose, shallowRef, watch } from "vue";
import { emptyCustomerBalance, type CustomerBalance } from "@/features/balances/domain";
import type { Customer } from "@/features/customers/domain";
import type { SettlementFacts } from "@/features/settlement/domain";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import {
  itemsWithMissingWeights,
  itemsWithUnconfirmedTracks,
  type Parcel,
  type ParcelItem,
} from "../domain";
import { buildItemGroups, itemSearchCountText, type MissingFilter } from "./ItemGroups";
import ParcelCustomer from "./ParcelCustomer.vue";
import ParcelCustomerItems from "./ParcelCustomerItems.vue";

type ItemFormStep = "main" | "tracks" | "weights";

const props = defineProps<{
  items: ParcelItem[];
  customers: Customer[];
  parcel: Parcel;
  balances: Map<number, CustomerBalance>;
  deliveryByItem: Map<number, number>;
  settlement: SettlementFacts;
}>();

const emit = defineEmits<{
  addItem: [];
  editItem: [itemId: number, step: ItemFormStep];
  moveItem: [itemId: number];
  deleteItem: [itemId: number];
  toggleGoods: [customerId: number, checked: boolean];
  toggleShipping: [customerId: number];
  toggleItemPayment: [itemId: number];
  toggleTracksComplete: [itemId: number];
  toggleLost: [itemId: number];
}>();

const searchQuery = shallowRef("");
const unconfirmedOnly = shallowRef(false);
const unweightedOnly = shallowRef(false);
const closedFolds = shallowRef<ReadonlySet<number>>(new Set());
const countText = shallowRef("");
let countTimer: ReturnType<typeof setTimeout> | null = null;

const unconfirmedItems = computed(() =>
  props.parcel.status === "draft" ? itemsWithUnconfirmedTracks(props.items).length : 0,
);
const unweightedItems = computed(() =>
  props.parcel.status === "received" ? itemsWithMissingWeights(props.items).length : 0,
);
const activeFilter = computed<MissingFilter>(() =>
  unconfirmedOnly.value ? "tracks" : unweightedOnly.value ? "weights" : null,
);

const itemGroups = computed(() =>
  buildItemGroups(
    props.items,
    props.customers,
    props.parcel.status,
    searchQuery.value,
    activeFilter.value,
  ),
);
const searching = computed(
  () => itemGroups.value.result.queryLength > 0 || activeFilter.value !== null,
);
const noResults = computed(() => searching.value && itemGroups.value.result.visible === 0);
const showUnconfirmedFilter = computed(
  () => props.parcel.status === "draft" && (unconfirmedItems.value > 0 || unconfirmedOnly.value),
);
const showUnweightedFilter = computed(
  () => props.parcel.status === "received" && (unweightedItems.value > 0 || unweightedOnly.value),
);

watch(
  () => props.parcel.id,
  () => {
    searchQuery.value = "";
    unconfirmedOnly.value = false;
    unweightedOnly.value = false;
    closedFolds.value = new Set();
  },
);

function toggleFold(customerId: number, open: boolean): void {
  const closed = !open;
  if (closed === closedFolds.value.has(customerId)) return;
  const next = new Set(closedFolds.value);
  if (closed) next.add(customerId);
  else next.delete(customerId);
  closedFolds.value = next;
}

watch([searching, itemGroups], ([active, groups]) => {
  if (!active) return;
  const next = new Set(closedFolds.value);
  let changed = false;
  for (const group of groups.groups) {
    if (group.visibleRows.length > 0 && next.delete(group.customerId)) changed = true;
  }
  if (changed) closedFolds.value = next;
});

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

onScopeDispose(() => {
  if (countTimer) clearTimeout(countTimer);
});

function clearSearch(): void {
  searchQuery.value = "";
  unconfirmedOnly.value = false;
  unweightedOnly.value = false;
}

function defaultItemStep(status: Parcel["status"]): ItemFormStep {
  if (status === "draft" || status === "shipped") return "tracks";
  if (status === "received") return "weights";
  return "main";
}

function openEdit(itemId: number, step = defaultItemStep(props.parcel.status)): void {
  emit("editItem", itemId, step);
}

function openMove(itemId: number): void {
  emit("moveItem", itemId);
}

function openDelete(itemId: number): void {
  emit("deleteItem", itemId);
}
</script>

<template>
  <div
    v-if="props.items.length > 0"
    class="item-search"
    role="search"
    aria-label="Поиск товаров в посылке"
  >
    <label class="sr-only" for="parcelItemSearch">Поиск товаров</label>
    <span class="item-search__field">
      <AppIcon name="search" />
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
    </span>
    <button
      v-if="showUnconfirmedFilter"
      type="button"
      id="missingTracksFilter"
      class="item-search__filter"
      :class="{ 'is-active': unconfirmedOnly }"
      :aria-pressed="unconfirmedOnly"
      :title="unconfirmedOnly ? 'Снять фильтр «Без треков»' : 'Показать товары без треков'"
      @click="unconfirmedOnly = !unconfirmedOnly"
    >
      Без треков <b>{{ unconfirmedItems }}</b
      ><span class="item-search__filter-x" aria-hidden="true">×</span>
    </button>
    <button
      v-if="showUnweightedFilter"
      type="button"
      id="missingWeightFilter"
      class="item-search__filter"
      :class="{ 'is-active': unweightedOnly }"
      :aria-pressed="unweightedOnly"
      :title="unweightedOnly ? 'Снять фильтр «Без веса»' : 'Показать товары без веса'"
      @click="unweightedOnly = !unweightedOnly"
    >
      Без веса <b>{{ unweightedItems }}</b
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
        v-if="props.parcel.status === 'draft'"
        type="button"
        class="text-btn"
        id="addItem"
        @click="emit('addItem')"
      >
        <AppIcon name="plus" /> Добавить
      </button>
    </header>
    <div id="parcelItemsList">
      <div v-if="props.items.length === 0" class="empty">
        Товаров пока нет. Добавьте позицию — треки можно заполнить позже.
      </div>
      <ParcelCustomer
        v-for="group in itemGroups.groups"
        :key="group.customerId"
        :group="group"
        :parcel="props.parcel"
        :balance="props.balances.get(group.customerId) ?? emptyCustomerBalance()"
        :settlement="props.settlement"
        :fold-open="!closedFolds.has(group.customerId)"
        @toggle-fold="toggleFold"
        @toggle-goods="(customerId, checked) => emit('toggleGoods', customerId, checked)"
        @toggle-shipping="emit('toggleShipping', $event)"
      >
        <ParcelCustomerItems
          :rows="group.visibleRows"
          :customer="group.customer"
          :customer-id="group.customerId"
          :is-self="group.customer?.isSelf ?? false"
          :parcel="props.parcel"
          :delivery-by-item="props.deliveryByItem"
          :settlement="props.settlement"
          @edit-item="(itemId) => openEdit(itemId)"
          @move-item="openMove"
          @delete-item="openDelete"
          @add-track="(itemId) => openEdit(itemId, 'tracks')"
          @toggle-item-payment="emit('toggleItemPayment', $event)"
          @toggle-tracks-complete="emit('toggleTracksComplete', $event)"
          @toggle-lost="emit('toggleLost', $event)"
        />
      </ParcelCustomer>
      <p
        v-if="props.items.length > 0"
        id="parcelItemNoResults"
        class="empty item-search__empty"
        :hidden="!noResults"
      >
        Ничего не найдено. Попробуйте другое название или сбросьте фильтр.
      </p>
    </div>
  </section>
</template>

<style scoped>
/* Only the goods section uses this heading; the .section chrome is shared. */
.section-title {
  margin: 0;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--color-line);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--color-ink);
}
.section-title.with-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-title h2 {
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
  text-wrap: balance;
}
/* Item search — the filter stays in the ledger, not a floating bar */
.item-search {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  padding-block: 8px 10px;
  border-bottom: 1px solid var(--color-line);
}
.item-search__field {
  position: relative;
  display: flex;
  flex: 1 1 220px;
  align-items: center;
  min-inline-size: 0;
}
.item-search__field > span {
  position: absolute;
  inset-inline-start: 12px;
  display: grid;
  place-items: center;
  color: var(--color-muted);
  pointer-events: none;
}
/* The SVG is injected by AppIcon via v-html, so it carries no scope attribute. */
.item-search__field :deep(.icon) {
  inline-size: 18px;
  block-size: 18px;
}
.item-search__input {
  flex: 1;
  min-inline-size: 0;
  min-block-size: 44px;
  padding-inline-start: 38px;
  font-size: 16px;
}
/* Native clear of type="search" lives inside the input, so it never steals
   flex width from the field on narrow screens. */
.item-search__input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
  inline-size: 24px;
  block-size: 24px;
  border-radius: 50%;
  background: var(--color-slate-100)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234a5261' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M18 6 6 18M6 6l12 12'/%3E%3C/svg%3E")
    center / 12px 12px no-repeat;
  cursor: pointer;
}
.item-search__filter {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  min-block-size: 40px;
  padding: 6px 10px;
  border: 1px solid var(--color-line-strong);
  border-radius: 999px;
  background: var(--color-paper);
  color: var(--color-ink-soft);
  font-size: 12px;
  white-space: nowrap;
}
.item-search__filter b {
  color: var(--color-warning);
  font-variant-numeric: tabular-nums;
}
.item-search__filter.is-active {
  border-color: var(--color-accent-strong);
  background: var(--color-accent-wash);
  color: var(--color-accent-strong);
}
.item-search__filter.is-active b {
  color: inherit;
}
.item-search__filter-x {
  display: none;
  place-items: center;
  inline-size: 16px;
  block-size: 16px;
  margin-inline-start: 1px;
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
}
.item-search__filter.is-active .item-search__filter-x {
  display: grid;
  background: var(--color-accent-strong);
  color: var(--color-paper);
}
.item-search__count {
  flex: 0 0 100%;
  padding-inline-start: 2px;
  color: var(--color-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.item-search__empty {
  padding-block: 14px 4px;
}
</style>
