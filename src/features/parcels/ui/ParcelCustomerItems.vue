<script setup lang="ts">
import { computed } from "vue";
import { money, t } from "@/core/utils";
import type { Customer } from "@/features/customers/domain";
import type { SettlementFacts } from "@/features/settlement/domain";
import AppDropdownMenu from "@/features/shared/ui/AppDropdownMenu.vue";
import AppDropdownMenuItem from "@/features/shared/ui/AppDropdownMenuItem.vue";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import type { Parcel } from "../domain";
import { itemRowFacts } from "./ItemRowFacts";
import { TRACK_FORMS, unitLabel } from "./ParcelPresentation";
import type { ItemRowView } from "./ItemGroups";

const props = defineProps<{
  rows: ItemRowView[];
  customer?: Customer;
  customerId: number;
  isSelf: boolean;
  parcel: Parcel;
  deliveryByItem: Map<number, number>;
  settlement: SettlementFacts;
}>();

const ownerLabel = computed(() =>
  props.customer?.isSelf ? "Вы" : (props.customer?.name ?? "Без заказчика"),
);
const ownerTitle = computed(() =>
  props.customer?.isSelf ? "Ваш товар" : `Товар: ${props.customer?.name ?? "без заказчика"}`,
);

const emit = defineEmits<{
  editItem: [itemId: number, customerId: number];
  moveItem: [itemId: number, customerId: number];
  deleteItem: [itemId: number, customerId: number];
  addTrack: [itemId: number, customerId: number];
  toggleItemPayment: [itemId: number];
}>();

function facts(row: ItemRowView) {
  return itemRowFacts(props.parcel.status, row.item, props.isSelf);
}

function badgeClass(row: ItemRowView): string {
  const badge = facts(row).badge;
  return badge ? `state-${badge.class}` : "";
}

function itemPaid(itemId: number): boolean {
  return props.settlement.paidItems.has(itemId);
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
    :data-self="String(props.isSelf)"
  >
    <div class="parcel-entry__body min-w-0">
      <div class="parcel-entry__head">
        <b :title="row.item.name">{{ row.item.name }}</b>
        <span v-if="facts(row).badge" class="parcel-entry__state" :class="badgeClass(row)">
          {{ facts(row).badge?.label }}
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
      <div class="parcel-entry__hint">
        <span class="item-entry__owner" :class="{ 'is-self': props.isSelf }" :title="ownerTitle">
          {{ ownerLabel }}
        </span>
        <span class="item-entry__sep" aria-hidden="true"> · </span>
        <span class="item-entry__hint-text">
          {{ row.item.quantity }} {{ unitLabel(row.item.unit)
          }}{{
            row.item.trackNumbers.length ? ` · ${t(TRACK_FORMS, row.item.trackNumbers.length)}` : ""
          }}
        </span>
        <span
          v-if="(props.deliveryByItem.get(row.item.id) || 0) > 0"
          class="item-entry__without-delivery"
        >
          · без доставки {{ money(row.item.totalPriceBYN) }}
        </span>
      </div>
      <div v-if="facts(row).showTracks" class="item-row__tracks">
        <div v-for="(track, idx) in row.item.trackNumbers" :key="idx" class="track-value-row">
          <span class="track-index" aria-hidden="true">{{ idx + 1 }}</span>
          <span class="track-code">{{ track || "—" }}</span>
          <span v-if="facts(row).showTrackWeights" class="track-weight">
            {{ (row.item.weightsG[idx] || 0) > 0 ? `${row.item.weightsG[idx]} г` : "вес не задан" }}
          </span>
        </div>
        <div
          v-if="row.item.trackNumbers.length === 0 && props.parcel.status === 'draft'"
          class="item-entry__no-tracks"
        >
          Треков пока нет
        </div>
        <button
          v-if="props.parcel.status === 'draft' || props.parcel.status === 'shipped'"
          type="button"
          class="text-btn"
          :data-add-track="row.item.id"
          @click="emit('addTrack', row.item.id, props.customerId)"
        >
          <AppIcon name="plus" /> Добавить трек
        </button>
      </div>
      <div v-if="facts(row).compactWeight" class="item-entry__weight">
        {{ facts(row).compactWeight }}
      </div>
    </div>
    <label
      class="pay-summary item-pay-summary"
      :class="{ 'is-paid': itemPaid(row.item.id), 'is-locked': !facts(row).canPay }"
    >
      <input
        type="checkbox"
        class="pay-summary__input"
        :name="`itemPaid-${row.item.id}`"
        :data-toggle-payment="row.item.id"
        :checked="itemPaid(row.item.id)"
        :disabled="!facts(row).canPay"
        @change="emit('toggleItemPayment', row.item.id)"
      />
      <span class="pay-summary__body">
        <span class="pay-summary__label">Оплачено</span>
      </span>
      <span
        class="pay-summary__amount item-entry__price"
        :class="{ 'is-paid': itemPaid(row.item.id) }"
      >
        {{ money(row.item.totalPriceBYN + (props.deliveryByItem.get(row.item.id) || 0)) }}
      </span>
    </label>
  </div>
</template>
