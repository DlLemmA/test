<script setup lang="ts">
import { money, t } from "@/core/utils";
import type { SettlementFacts } from "@/features/settlement/domain";
import AppDropdownMenu from "@/features/shared/ui/AppDropdownMenu.vue";
import AppDropdownMenuItem from "@/features/shared/ui/AppDropdownMenuItem.vue";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import { itemTrackState, type Parcel } from "../domain";
import { ITEM_FORMS, TRACK_FORMS, unitLabel } from "./ParcelPresentation";
import { parcelItemStatusInfo } from "./ParcelStatusInfo";
import { itemTrackBadge } from "./ReadinessCopy";
import type { ItemRowView } from "./ItemGroups";

const props = defineProps<{
  rows: ItemRowView[];
  customerId: number;
  groupLabel: string;
  isSelf: boolean;
  parcel: Parcel;
  deliveryByItem: Map<number, number>;
  settlement: SettlementFacts;
}>();

const emit = defineEmits<{
  editItem: [itemId: number, customerId: number];
  moveItem: [itemId: number, customerId: number];
  deleteItem: [itemId: number, customerId: number];
  addTrack: [itemId: number, customerId: number];
  toggleItemPayment: [itemId: number];
}>();

function badge(row: ItemRowView): { label: string; class: string; title: string } {
  const status = parcelItemStatusInfo(row.item.status);
  if (props.parcel.status === "draft" && row.item.status !== "lost") {
    return itemTrackBadge(itemTrackState(row.item));
  }
  return { label: status.label, class: status.class, title: "" };
}

function showWeights(): boolean {
  return props.parcel.status === "received" || props.parcel.status === "done";
}

function itemPaid(itemId: number): boolean {
  return props.settlement.paidItems.has(itemId);
}

/** Payment lives with the price; self items are paid by policy, not by a button. */
function canTogglePayment(): boolean {
  return !props.isSelf && ["shipped", "received", "done"].includes(props.parcel.status);
}
</script>

<template>
  <div
    v-for="row in props.rows"
    :key="row.item.id"
    class="item parcel-entry item-entry"
    :class="{ 'is-missing-tracks': row.needsTracks }"
    :data-status="row.item.status"
    :data-search="row.searchText"
    :data-needs-tracks="String(row.needsTracks)"
  >
    <div class="item-entry__index" aria-hidden="true">
      <b>{{ String(row.position + 1).padStart(2, "0") }}</b>
      <span>поз.</span>
    </div>
    <div class="parcel-entry__body min-w-0">
      <div class="parcel-entry__head">
        <b :title="row.item.name">{{ row.item.name }}</b>
        <span
          class="parcel-entry__state"
          :class="`state-${badge(row).class}`"
          :title="badge(row).title"
        >
          {{ badge(row).label }}
        </span>
      </div>
      <div class="parcel-entry__hint">
        {{ props.groupLabel }} · {{ row.item.quantity }} {{ unitLabel(row.item.unit)
        }}{{
          row.item.trackNumbers.length ? ` · ${t(TRACK_FORMS, row.item.trackNumbers.length)}` : ""
        }}
        <span
          v-if="(props.deliveryByItem.get(row.item.id) || 0) > 0"
          class="item-entry__without-delivery"
        >
          · без доставки {{ money(row.item.totalPriceBYN) }}
        </span>
      </div>
      <div class="item-row__tracks">
        <div v-for="(track, idx) in row.item.trackNumbers" :key="idx" class="track-value-row">
          <span class="track-index" aria-hidden="true">{{ idx + 1 }}</span>
          <span class="track-code">{{ track || "—" }}</span>
          <span v-if="showWeights()" class="track-weight">
            {{ (row.item.weightsG[idx] || 0) > 0 ? `${row.item.weightsG[idx]} г` : "вес не задан" }}
          </span>
        </div>
        <div
          v-if="row.item.trackNumbers.length === 0 && props.parcel.status === 'draft'"
          class="item-entry__no-tracks"
        >
          Треков пока нет
        </div>
      </div>
      <div v-if="props.parcel.status === 'draft'" class="item-entry__track-controls">
        <button
          type="button"
          class="text-btn"
          :data-add-track="row.item.id"
          @click="emit('addTrack', row.item.id, props.customerId)"
        >
          <AppIcon name="plus" /> Добавить трек
        </button>
      </div>
    </div>
    <div class="item-entry__side">
      <span class="item-entry__pay">
        <span class="item-entry__price" :class="{ 'is-paid': itemPaid(row.item.id) }">
          {{ money(row.item.totalPriceBYN + (props.deliveryByItem.get(row.item.id) || 0)) }}
        </span>
        <label
          v-if="canTogglePayment()"
          class="pay-check"
          :class="{ 'is-paid': itemPaid(row.item.id) }"
        >
          <input
            type="checkbox"
            class="pay-check__input"
            :name="`itemPaid-${row.item.id}`"
            :data-toggle-payment="row.item.id"
            :checked="itemPaid(row.item.id)"
            @change="emit('toggleItemPayment', row.item.id)"
          />
          <span class="pay-check__label">
            {{ itemPaid(row.item.id) ? "Оплачено" : "Оплатить" }}
          </span>
        </label>
        <span v-else-if="itemPaid(row.item.id)" class="pay-check is-paid">
          <span class="pay-check__box" aria-hidden="true" />
          <span class="pay-check__label">Оплачено</span>
        </span>
      </span>
      <div class="parcel-entry__actions">
        <button
          v-if="props.parcel.status !== 'done'"
          type="button"
          class="btn-icon btn-primary"
          :data-edit="row.item.id"
          @click="emit('editItem', row.item.id, props.customerId)"
        >
          <span class="sr-only">Изменить товар «{{ row.item.name }}»</span>
          <AppIcon name="pencil" />
        </button>
        <AppDropdownMenu
          v-if="props.parcel.status === 'draft'"
          :label="`Действия с товаром «${row.item.name}»`"
          :title="`Действия с товаром «${row.item.name}»`"
        >
          <AppDropdownMenuItem
            :data-move="row.item.id"
            :aria-label="`Переместить товар «${row.item.name}»`"
            @select="emit('moveItem', row.item.id, props.customerId)"
          >
            <AppIcon name="arrowRight" /> Переместить
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            class="is-danger"
            :data-delete="row.item.id"
            :aria-label="`Удалить товар «${row.item.name}»`"
            @select="emit('deleteItem', row.item.id, props.customerId)"
          >
            <AppIcon name="trash" /> Удалить
          </AppDropdownMenuItem>
        </AppDropdownMenu>
      </div>
    </div>
  </div>
</template>
