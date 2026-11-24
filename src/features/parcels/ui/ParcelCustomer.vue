<script setup lang="ts">
import { money, t } from "@/core/utils";
import type { CustomerBalance } from "@/features/balances/domain";
import type { SettlementFacts } from "@/features/settlement/domain";
import { canPayDelivery } from "@/features/settlement/domain";
import CustomerMark from "@/features/customers/ui/CustomerMark.vue";
import { ITEM_FORMS } from "./ParcelPresentation";
import type { ItemGroupView } from "./ItemGroups";
import type { Parcel } from "../domain";

const props = defineProps<{
  group: ItemGroupView;
  parcel: Parcel;
  balance: CustomerBalance;
  settlement: SettlementFacts;
  open: boolean;
}>();

const emit = defineEmits<{
  toggleGroup: [customerId: number, open: boolean];
  toggleGoods: [customerId: number, checked: boolean];
  toggleShipping: [customerId: number];
}>();

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

function hasDelivery(): boolean {
  return props.settlement.deliveryInvoiced && props.balance.delivery.owed > 0;
}

function canPayShipping(group: ItemGroupView): boolean {
  return canPayDelivery(props.parcel, group.customer?.isSelf || false, props.balance.delivery.owed);
}
</script>

<template>
  <details
    class="item-group"
    data-item-group
    :data-customer="props.group.customerId"
    :open="props.open"
    @toggle="
      emit('toggleGroup', props.group.customerId, ($event.target as HTMLDetailsElement).open)
    "
  >
    <summary class="parcel-entry item-group__head settle-entry" :data-status="props.parcel.status">
      <CustomerMark :customer="props.group.customer" variant="box" />
      <div class="parcel-entry__body min-w-0">
        <div class="parcel-entry__head">
          <b :title="props.group.name">
            {{ props.group.label }}<span class="item-group__chevron" aria-hidden="true">›</span>
          </b>
          <span
            class="parcel-entry__state"
            :class="props.balance.remaining > 0 ? 'state-warn' : 'state-good'"
          >
            {{
              props.balance.remaining > 0
                ? `${props.group.customer?.isSelf ? "Остаток" : "Долг"} ${money(props.balance.remaining)}`
                : "Оплачено"
            }}
          </span>
        </div>
        <div class="parcel-entry__hint">
          {{ t(ITEM_FORMS, props.group.rows.length) }} ·
          {{ groupWeight(props.group) > 0 ? `${groupWeight(props.group)} г` : "вес —" }} · товары
          {{ money(groupTotal(props.group))
          }}{{ hasDelivery() ? ` · доставка ${money(props.balance.delivery.owed)}` : "" }} ·
          <span class="settle-entry__total">итого {{ money(props.balance.owed) }}</span>
        </div>
        <div class="settle-entry__checks" @click.stop>
          <label
            class="payment-bullet"
            :class="{
              'is-paid': goodsPaid(props.group),
              'is-locked': !canToggleGoods(props.group),
            }"
          >
            <input
              :indeterminate="partiallyPaid(props.group)"
              type="checkbox"
              class="item-paid-all"
              :data-customer="props.group.customerId"
              :checked="goodsPaid(props.group)"
              :disabled="!canToggleGoods(props.group)"
              @change="
                emit(
                  'toggleGoods',
                  props.group.customerId,
                  ($event.target as HTMLInputElement).checked,
                )
              "
            />
            <span>Товары: {{ goodsPaid(props.group) ? "оплачено" : "не оплачено" }}</span>
          </label>
          <label
            v-if="hasDelivery()"
            class="payment-bullet"
            :class="{
              'is-paid': props.settlement.paidDelivery.has(props.group.customerId),
              'is-locked': !canPayShipping(props.group),
            }"
          >
            <input
              type="checkbox"
              class="shipping-paid"
              :data-customer="props.group.customerId"
              :checked="props.settlement.paidDelivery.has(props.group.customerId)"
              :disabled="!canPayShipping(props.group)"
              @change="emit('toggleShipping', props.group.customerId)"
            />
            <span
              >Доставка:
              {{
                props.settlement.paidDelivery.has(props.group.customerId)
                  ? "оплачено"
                  : "не оплачено"
              }}</span
            >
          </label>
          <span v-else class="payment-bullet is-locked">Доставка: —</span>
        </div>
      </div>
    </summary>

    <div class="item-group__items"><slot /></div>
  </details>
</template>
