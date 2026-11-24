<script setup lang="ts">
import { computed } from "vue";
import { kg, money, t } from "@/core/utils";
import { emptyCustomerBalance, type CustomerBalance } from "@/features/balances/domain";
import type { SettlementFacts } from "@/features/settlement/domain";
import { canPayDelivery } from "@/features/settlement/domain";
import { itemTrackState, type Parcel } from "../domain";
import { ITEM_FORMS, TRACK_FORMS, unitLabel } from "./ParcelPresentation";
import { parcelItemStatusInfo } from "./ParcelStatusInfo";
import { itemTrackBadge } from "./ReadinessCopy";
import CustomerMark from "@/features/customers/ui/CustomerMark.vue";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import type { ItemGroupView, ItemRowView } from "./ItemGroups";

const props = defineProps<{
  groups: ItemGroupView[];
  searching: boolean;
  parcel: Parcel;
  balances: Map<number, CustomerBalance>;
  deliveryByItem: Map<number, number>;
  settlement: SettlementFacts;
  openCustomerGroups: ReadonlySet<number>;
}>();

const emit = defineEmits<{
  toggleGroup: [customerId: number];
  closeGroup: [customerId: number];
  toggleGoods: [customerId: number, checked: boolean];
  toggleShipping: [customerId: number];
  editItem: [itemId: number, customerId: number];
  moveItem: [itemId: number, customerId: number];
  deleteItem: [itemId: number, customerId: number];
  addTrack: [itemId: number, customerId: number];
  toggleItemPayment: [itemId: number];
}>();

const vIndeterminate = {
  mounted(el: HTMLInputElement, binding: { value: boolean }) {
    el.indeterminate = binding.value;
  },
  updated(el: HTMLInputElement, binding: { value: boolean }) {
    el.indeterminate = binding.value;
  },
};

function groupBalance(customerId: number): CustomerBalance {
  return props.balances.get(customerId) ?? emptyCustomerBalance();
}

function groupWeight(group: ItemGroupView): number {
  return group.rows.reduce((sum, row) => sum + row.item.weightsG.reduce((a, b) => a + b, 0), 0);
}

function groupTotal(group: ItemGroupView): number {
  return group.rows.reduce((sum, row) => sum + row.item.totalPriceBYN, 0);
}

function goodsPaid(group: ItemGroupView): boolean {
  return group.rows.every((row) => props.settlement.paidItems.has(row.item.id));
}

function partiallyPaid(group: ItemGroupView): boolean {
  return !goodsPaid(group) && group.rows.some((row) => props.settlement.paidItems.has(row.item.id));
}

function canToggleGoods(group: ItemGroupView): boolean {
  return !group.customer?.isSelf && props.parcel.status !== "draft";
}

function canPayShipping(group: ItemGroupView): boolean {
  return canPayDelivery(props.parcel, group.customer?.isSelf || false);
}

function isGroupOpen(group: ItemGroupView): boolean {
  return props.openCustomerGroups.has(group.customerId);
}

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
</script>

<template>
  <div v-if="groups.length === 0 && !searching" class="empty">Нет товаров</div>
  <template v-else-if="groups.length > 0">
    <details
      v-for="group in groups"
      :key="group.customerId"
      class="item-group"
      data-item-group
      :data-customer="group.customerId"
      :open="isGroupOpen(group)"
      @toggle="emit('toggleGroup', group.customerId)"
    >
      <summary class="parcel-entry item-group__head settle-entry" :data-status="parcel.status">
        <CustomerMark :customer="group.customer" variant="box" />
        <div class="parcel-entry__body min-w-0">
          <div class="parcel-entry__head">
            <b :title="group.name">
              {{ group.label }}<span class="item-group__chevron" aria-hidden="true">›</span>
            </b>
            <span
              class="parcel-entry__state"
              :class="groupBalance(group.customerId).remaining > 0 ? 'state-warn' : 'state-good'"
            >
              {{
                groupBalance(group.customerId).remaining > 0
                  ? `Остаток ${money(groupBalance(group.customerId).remaining)}`
                  : "Оплачено"
              }}
            </span>
          </div>
          <div class="parcel-entry__hint">
            {{ t(ITEM_FORMS, group.rows.length) }} ·
            {{ groupWeight(group) > 0 ? `${kg(groupWeight(group))} кг` : "вес —" }} · товары
            {{ money(groupTotal(group)) }} · доставка
            {{ money(groupBalance(group.customerId).delivery.owed) }} ·
            <span class="settle-entry__total"
              >итого {{ money(groupBalance(group.customerId).owed) }}</span
            >
          </div>
          <div class="settle-entry__checks" @click.stop>
            <label
              class="payment-bullet"
              :class="{
                'is-paid': goodsPaid(group),
                'is-locked': !canToggleGoods(group),
              }"
            >
              <input
                v-indeterminate="partiallyPaid(group)"
                type="checkbox"
                class="item-paid-all"
                :data-customer="group.customerId"
                :checked="goodsPaid(group)"
                :disabled="!canToggleGoods(group)"
                @change="
                  emit('toggleGoods', group.customerId, ($event.target as HTMLInputElement).checked)
                "
              />
              <span>Товары: {{ goodsPaid(group) ? "оплачено" : "не оплачено" }}</span>
            </label>
            <label
              v-if="settlement.deliveryInvoiced"
              class="payment-bullet"
              :class="{
                'is-paid': settlement.paidDelivery.has(group.customerId),
                'is-locked': !canPayShipping(group),
              }"
            >
              <input
                type="checkbox"
                class="shipping-paid"
                :data-customer="group.customerId"
                :checked="settlement.paidDelivery.has(group.customerId)"
                :disabled="!canPayShipping(group)"
                @change="emit('toggleShipping', group.customerId)"
              />
              <span
                >Доставка:
                {{
                  settlement.paidDelivery.has(group.customerId) ? "оплачено" : "не оплачено"
                }}</span
              >
            </label>
            <span v-else class="payment-bullet is-locked">Доставка: —</span>
          </div>
        </div>
      </summary>

      <div class="item-group__items">
        <div
          v-for="row in group.visibleRows"
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
              {{ group.label }} · {{ row.item.quantity }} {{ unitLabel(row.item.unit)
              }}{{
                row.item.trackNumbers.length
                  ? ` · ${t(TRACK_FORMS, row.item.trackNumbers.length)}`
                  : ""
              }}
              ·
              <span class="item-entry__price" :class="{ 'is-paid': itemPaid(row.item.id) }">
                {{ money(row.item.totalPriceBYN + (deliveryByItem.get(row.item.id) || 0)) }}
              </span>
              <span
                v-if="(deliveryByItem.get(row.item.id) || 0) > 0"
                class="item-entry__without-delivery"
              >
                без доставки {{ money(row.item.totalPriceBYN) }}
              </span>
            </div>
            <div class="item-row__tracks">
              <div v-for="(track, idx) in row.item.trackNumbers" :key="idx" class="track-value-row">
                <span class="track-index" aria-hidden="true">{{ idx + 1 }}</span>
                <span class="track-code">{{ track || "—" }}</span>
                <span v-if="showWeights()" class="track-weight">
                  {{
                    (row.item.weightsG[idx] || 0) > 0
                      ? `${row.item.weightsG[idx]} г`
                      : "вес не задан"
                  }}
                </span>
              </div>
              <div
                v-if="row.item.trackNumbers.length === 0 && parcel.status === 'draft'"
                class="item-entry__no-tracks"
              >
                Треков пока нет
              </div>
            </div>
            <div v-if="parcel.status === 'draft'" class="item-entry__track-controls">
              <button
                type="button"
                class="text-btn"
                :data-add-track="row.item.id"
                @click="emit('addTrack', row.item.id, group.customerId)"
              >
                <AppIcon name="plus" /> Добавить трек
              </button>
            </div>
          </div>
          <div class="parcel-entry__actions">
            <button
              v-if="parcel.status !== 'done'"
              type="button"
              class="btn-icon btn-primary"
              :data-edit="row.item.id"
              @click="emit('editItem', row.item.id, group.customerId)"
            >
              <span class="sr-only">Изменить товар «{{ row.item.name }}»</span>
              <AppIcon name="pencil" />
            </button>
            <details v-if="parcel.status !== 'done'" class="entry-menu">
              <summary :title="`Действия с товаром «${row.item.name}»`">
                <span class="sr-only">Действия с товаром «{{ row.item.name }}»</span>
                <span aria-hidden="true">···</span>
              </summary>
              <div class="entry-menu__list">
                <button
                  v-if="['shipped', 'received', 'done'].includes(parcel.status)"
                  type="button"
                  :class="{ 'is-paid': itemPaid(row.item.id) }"
                  :data-toggle-payment="row.item.id"
                  :disabled="itemPaid(row.item.id)"
                  :aria-label="`${itemPaid(row.item.id) ? 'Оплачено' : 'Оплатить'} товар «${row.item.name}»`"
                  @click="emit('toggleItemPayment', row.item.id)"
                >
                  <AppIcon :name="itemPaid(row.item.id) ? 'check' : 'creditcard'" />
                  {{ itemPaid(row.item.id) ? "Оплачено" : "Оплатить" }}
                </button>
                <button
                  v-if="parcel.status === 'draft'"
                  type="button"
                  :data-move="row.item.id"
                  :aria-label="`Переместить товар «${row.item.name}»`"
                  @click="emit('moveItem', row.item.id, group.customerId)"
                >
                  <AppIcon name="arrowRight" /> Переместить
                </button>
                <button
                  v-if="parcel.status === 'draft'"
                  type="button"
                  class="is-danger"
                  :data-delete="row.item.id"
                  :aria-label="`Удалить товар «${row.item.name}»`"
                  @click="emit('deleteItem', row.item.id, group.customerId)"
                >
                  <AppIcon name="trash" /> Удалить
                </button>
              </div>
            </details>
          </div>
        </div>
      </div>
    </details>
  </template>
</template>
