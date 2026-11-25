<script setup lang="ts">
import { computed, onScopeDispose, shallowRef, watch } from "vue";
import { emptyCustomerBalance, type CustomerBalance } from "@/features/balances/domain";
import type { Customer } from "@/features/customers/domain";
import type { SettlementFacts } from "@/features/settlement/domain";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import { itemsWithoutTracks, type Parcel, type ParcelItem } from "../domain";
import { buildItemGroups, itemSearchCountText } from "./ItemGroups";
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
}>();

const searchQuery = shallowRef("");
const missingTracksOnly = shallowRef(false);
const closedFolds = shallowRef<ReadonlySet<number>>(new Set());
const countText = shallowRef("");
let countTimer: ReturnType<typeof setTimeout> | null = null;

const missingTracks = computed(() =>
  props.parcel.status === "draft" ? itemsWithoutTracks(props.items) : 0,
);

const itemGroups = computed(() =>
  buildItemGroups(
    props.items,
    props.customers,
    props.parcel.status,
    searchQuery.value,
    missingTracksOnly.value,
  ),
);
const searching = computed(
  () => itemGroups.value.result.queryLength > 0 || missingTracksOnly.value,
);
const noResults = computed(() => searching.value && itemGroups.value.result.visible === 0);
const showMissingFilter = computed(
  () => props.parcel.status === "draft" && (missingTracks.value > 0 || missingTracksOnly.value),
);

watch(
  () => props.parcel.id,
  () => {
    searchQuery.value = "";
    missingTracksOnly.value = false;
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
  missingTracksOnly.value = false;
}

function defaultItemStep(status: Parcel["status"]): ItemFormStep {
  if (status === "draft") return "tracks";
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
