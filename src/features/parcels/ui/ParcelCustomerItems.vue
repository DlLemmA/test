<script setup lang="ts">
import { computed } from "vue";
import { byn, t } from "@/core/utils";
import type { Customer } from "@/features/customers/domain";
import type { SettlementFacts } from "@/features/settlement/domain";
import AppDropdownMenu from "@/features/shared/ui/AppDropdownMenu.vue";
import AppDropdownMenuItem from "@/features/shared/ui/AppDropdownMenuItem.vue";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import type { Parcel } from "../domain";
import { itemRowFacts } from "./ItemRowFacts";
import { copyTrack } from "./copyTrack";
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
  toggleTracksComplete: [itemId: number];
  toggleLost: [itemId: number];
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

function hasTracks(row: ItemRowView): boolean {
  return row.item.trackNumbers.some((track) => track.trim().length > 0);
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
          · без доставки {{ byn(row.item.totalPriceBYN) }}
        </span>
      </div>
      <div v-if="facts(row).showTracks" class="item-row__tracks">
        <template v-for="(track, idx) in row.item.trackNumbers" :key="idx">
          <button
            v-if="track.trim()"
            type="button"
            class="track-value-row"
            :aria-label="`Скопировать трек-номер ${track}`"
            @click="copyTrack(track)"
          >
            <span class="track-index" aria-hidden="true">{{ idx + 1 }}</span>
            <span class="track-code">{{ track }}</span>
            <span v-if="facts(row).showTrackWeights" class="track-weight">
              {{
                (row.item.weightsG[idx] || 0) > 0 ? `${row.item.weightsG[idx]} г` : "вес не задан"
              }}
            </span>
          </button>
          <span v-else class="track-value-row">
            <span class="track-index" aria-hidden="true">{{ idx + 1 }}</span>
            <span class="track-code">—</span>
          </span>
        </template>
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
      <div class="item-flags">
        <label
          class="pay-summary item-flag item-pay-summary"
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
            {{ byn(row.item.totalPriceBYN + (props.deliveryByItem.get(row.item.id) || 0)) }}
          </span>
        </label>
        <label
          v-if="facts(row).showTracksComplete"
          class="pay-summary item-flag item-flag--tracks"
          :class="{ 'is-locked': !hasTracks(row) && !row.item.tracksCompleted }"
        >
          <input
            type="checkbox"
            class="pay-summary__input"
            :name="`tracksComplete-${row.item.id}`"
            :data-toggle-tracks="row.item.id"
            :checked="row.item.tracksCompleted"
            :disabled="!hasTracks(row) && !row.item.tracksCompleted"
            :title="hasTracks(row) ? '' : 'Добавьте трек, чтобы отметить заполненными'"
            @change="emit('toggleTracksComplete', row.item.id)"
          />
          <span class="pay-summary__body">
            <span class="pay-summary__label">Треки заполнены</span>
          </span>
        </label>
        <label
          v-if="facts(row).showLost"
          class="pay-summary item-flag item-flag--lost"
          :class="{ 'is-lost': row.item.status === 'lost' }"
        >
          <input
            type="checkbox"
            class="pay-summary__input"
            :name="`itemLost-${row.item.id}`"
            :data-toggle-lost="row.item.id"
            :checked="row.item.status === 'lost'"
            @change="emit('toggleLost', row.item.id)"
          />
          <span class="pay-summary__body">
            <span class="pay-summary__label">Потерян</span>
          </span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.item-entry {
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 6px 10px;
  padding: 11px 0 10px;
}
.item-entry .parcel-entry__head {
  align-items: center;
  gap: 8px;
}
.item-entry .parcel-entry__head b {
  flex: 1;
  min-width: 0;
  overflow: visible;
  font-size: 14px;
  line-height: 1.35;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: anywhere;
}
.item-entry .parcel-entry__head .parcel-entry__actions {
  flex: none;
  margin-inline-start: auto;
}
.item-entry .parcel-entry__state {
  font-size: 10px;
}
.item-entry .parcel-entry__state.state-bad {
  color: var(--color-danger);
}
.item-entry .parcel-entry__hint {
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.5;
  white-space: normal;
  overflow-wrap: anywhere;
}
.item-entry__owner {
  color: var(--color-ink-soft);
  font-weight: 600;
}
.item-entry__owner.is-self {
  color: var(--color-accent-strong);
}
.item-entry__sep {
  margin-inline: 3px;
  color: var(--color-muted);
}
.item-entry__price.is-paid {
  color: var(--color-positive);
}
.item-pay-summary.pay-summary {
  min-block-size: 0;
  padding: 0;
  border-bottom: 0;
  gap: 8px;
  grid-template-columns: 16px auto auto;
  justify-self: start;
}
.item-pay-summary .pay-summary__label,
.item-pay-summary .pay-summary__amount {
  font-size: 12px;
}
.item-pay-summary.is-locked {
  cursor: default;
  color: var(--color-muted);
}
.item-entry__without-delivery {
  color: var(--color-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.item-entry__weight {
  margin-top: 6px;
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.item-row__tracks {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px 6px;
  margin-top: 7px;
}
.item-entry__no-tracks {
  color: var(--color-muted);
  font-size: 11px;
}
.item-entry.is-missing-tracks .item-entry__no-tracks {
  color: var(--color-warning);
}
.track-value-row {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  min-block-size: 22px;
  padding: 2px 7px;
  border: 1px solid var(--color-line);
  border-radius: 6px;
  background: var(--color-paper);
  font-variant-numeric: tabular-nums;
}
.track-value-row + .track-value-row {
  padding-inline-start: 7px;
  border-inline-start: 1px solid var(--color-line);
}
button.track-value-row {
  min-block-size: 44px;
  align-items: center;
  color: inherit;
  font: inherit;
  text-align: left;
}
button.track-value-row:active {
  border-color: var(--color-accent);
  background: var(--color-accent-wash);
}
.track-index {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: 10px;
}
.track-code {
  color: var(--color-ink);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.track-weight {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.item-row__tracks .text-btn {
  min-block-size: 22px;
  padding: 1px 4px;
  color: var(--color-muted);
  font-size: 10px;
}
.item-entry .parcel-entry__actions > .btn-icon {
  width: 30px;
  height: 30px;
  border-color: var(--color-line);
  border-radius: 8px;
  background: transparent;
  color: var(--color-muted);
}
/* AppIcon injects the SVG, so deep is required to keep its 14px size. */
.item-entry .parcel-entry__actions > .btn-icon :deep(svg) {
  width: 14px;
  height: 14px;
}
.item-entry .parcel-entry__actions > .btn-icon:hover {
  border-color: var(--color-accent-line);
  background: var(--color-accent-wash);
  color: var(--color-accent-strong);
}
.item-flags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 0;
  margin-top: 6px;
}
.item-flag.pay-summary {
  display: inline-grid;
  grid-template-columns: 16px auto;
  justify-self: auto;
  gap: 6px;
  min-block-size: 44px;
  padding: 4px 0;
  border-bottom: 0;
}
/* Facts sit in one wrapping ledger line; hairlines separate the cells. */
.item-flags > .pay-summary {
  padding-inline: 10px;
  border-inline-start: 1px solid var(--color-line);
}
.item-flags > .pay-summary:first-child {
  padding-inline-start: 0;
  border-inline-start: 0;
}
.item-flags .item-pay-summary.pay-summary {
  grid-template-columns: 16px auto auto;
}
.item-flag .pay-summary__label {
  color: var(--color-ink-soft);
  font-size: 11px;
  font-weight: 500;
}
.item-flag.is-locked {
  color: var(--color-muted);
  cursor: default;
}
.item-flags .item-flag:has(input:checked) {
  color: var(--color-ink-soft);
}
.item-flags .item-flag--lost:has(input:checked) {
  color: var(--color-negative);
}

@media (pointer: coarse) {
  .item-entry .parcel-entry__actions button,
  .item-entry .parcel-entry__actions summary {
    min-block-size: 44px;
  }
  .item-entry .parcel-entry__actions > .btn-icon {
    min-inline-size: 44px;
  }
}
@media (max-width: 480px) {
  .item-entry {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 360px) {
  .item-entry {
    grid-template-columns: minmax(0, 1fr);
  }
}
@container ledger (max-width: 430px) {
  .item-entry {
    grid-template-columns: minmax(0, 1fr);
  }
  .item-row__tracks {
    gap: 4px 10px;
  }
}
</style>
