<script setup lang="ts">
import { money, t } from "@/core/utils";
import type { CustomerBalance } from "@/features/balances/domain";
import type { SettlementFacts } from "@/features/settlement/domain";
import { canPayDelivery } from "@/features/settlement/domain";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import CustomerMark from "@/features/customers/ui/CustomerMark.vue";
import { ITEM_FORMS } from "./ParcelPresentation";
import { parcelDebtClass, parcelDebtLabel } from "./ParcelDebt";
import type { ItemGroupView } from "./ItemGroups";
import type { Parcel } from "../domain";

const props = defineProps<{
  group: ItemGroupView;
  parcel: Parcel;
  balance: CustomerBalance;
  settlement: SettlementFacts;
  foldOpen: boolean;
}>();

const emit = defineEmits<{
  toggleFold: [customerId: number, open: boolean];
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

function debtFacts() {
  return {
    remaining: props.balance.remaining,
    isSelf: props.group.customer?.isSelf || false,
    deliveryInvoiced: props.settlement.deliveryInvoiced,
  };
}

function canPayShipping(group: ItemGroupView): boolean {
  return canPayDelivery(props.parcel, group.customer?.isSelf || false, props.balance.delivery.owed);
}

function onFoldClick(event: MouseEvent): void {
  event.preventDefault();
  emit("toggleFold", props.group.customerId, !props.foldOpen);
}

function onFoldToggle(event: Event): void {
  emit("toggleFold", props.group.customerId, (event.target as HTMLDetailsElement).open);
}
</script>

<template>
  <section class="item-group" data-item-group :data-customer="props.group.customerId">
    <div class="parcel-entry item-group__head settle-entry" :data-status="props.parcel.status">
      <CustomerMark :customer="props.group.customer" variant="box" />
      <div class="parcel-entry__body min-w-0">
        <div class="parcel-entry__head">
          <b :title="props.group.name">{{ props.group.label }}</b>
          <span class="parcel-debt" :class="parcelDebtClass(debtFacts())">
            {{ parcelDebtLabel(debtFacts()) }}
          </span>
        </div>
      </div>
      <div class="settle-entry__checks pay-summary-row">
        <label
          v-if="canToggleGoods(props.group)"
          class="pay-summary payment-bullet"
          :class="{ 'is-paid': goodsPaid(props.group) }"
        >
          <input
            :indeterminate="partiallyPaid(props.group)"
            type="checkbox"
            class="pay-summary__input item-paid-all"
            :data-customer="props.group.customerId"
            :checked="goodsPaid(props.group)"
            @change="
              emit(
                'toggleGoods',
                props.group.customerId,
                ($event.target as HTMLInputElement).checked,
              )
            "
          />
          <span class="pay-summary__body">
            <span class="pay-summary__label">Товары:</span>
            <span class="pay-summary__note">
              {{ goodsPaid(props.group) ? "оплачено" : "не оплачено" }} · без доставки
            </span>
          </span>
          <span class="pay-summary__amount">{{ money(groupTotal(props.group)) }}</span>
        </label>
        <span
          v-else
          class="pay-summary payment-bullet is-locked"
          :class="{ 'is-paid': goodsPaid(props.group) }"
        >
          <span class="pay-summary__placeholder" aria-hidden="true"></span>
          <span class="pay-summary__body">
            <span class="pay-summary__label">Товары:</span>
            <span class="pay-summary__note">
              {{ goodsPaid(props.group) ? "оплачено" : "не оплачено" }} · без доставки
            </span>
          </span>
          <span class="pay-summary__amount">{{ money(groupTotal(props.group)) }}</span>
        </span>
        <label
          v-if="hasDelivery() && canPayShipping(props.group)"
          class="pay-summary payment-bullet"
          :class="{ 'is-paid': props.settlement.paidDelivery.has(props.group.customerId) }"
        >
          <input
            type="checkbox"
            class="pay-summary__input shipping-paid"
            :data-customer="props.group.customerId"
            :checked="props.settlement.paidDelivery.has(props.group.customerId)"
            @change="emit('toggleShipping', props.group.customerId)"
          />
          <span class="pay-summary__body">
            <span class="pay-summary__label">Доставка:</span>
            <span class="pay-summary__note">
              {{
                props.settlement.paidDelivery.has(props.group.customerId)
                  ? "оплачено"
                  : "не оплачено"
              }}
              · включена в цены товаров
            </span>
          </span>
          <span class="pay-summary__amount">{{ money(props.balance.delivery.owed) }}</span>
        </label>
        <span
          v-else-if="hasDelivery()"
          class="pay-summary payment-bullet is-locked"
          :class="{ 'is-paid': props.settlement.paidDelivery.has(props.group.customerId) }"
        >
          <span class="pay-summary__placeholder" aria-hidden="true"></span>
          <span class="pay-summary__body">
            <span class="pay-summary__label">Доставка:</span>
            <span class="pay-summary__note">
              {{
                props.settlement.paidDelivery.has(props.group.customerId)
                  ? "оплачено"
                  : "не оплачено"
              }}
              · включена в цены товаров
            </span>
          </span>
          <span class="pay-summary__amount">{{ money(props.balance.delivery.owed) }}</span>
        </span>
        <span v-else class="pay-summary payment-bullet is-locked">
          <span class="pay-summary__placeholder" aria-hidden="true"></span>
          <span class="pay-summary__body">
            <span class="pay-summary__label">Доставка: —</span>
            <span class="pay-summary__note">цена не задана</span>
          </span>
          <span class="pay-summary__amount">—</span>
        </span>
      </div>
    </div>

    <details class="customer-items-fold" :open="props.foldOpen" @toggle="onFoldToggle">
      <summary class="customer-items-fold__summary" @click="onFoldClick">
        <AppIcon name="chevronRight" />
        <span>Товары · {{ t(ITEM_FORMS, props.group.visibleRows.length) }}</span>
        <span class="customer-items-fold__meta">
          {{ groupWeight(props.group) > 0 ? `${groupWeight(props.group)} г` : "вес —" }} ·
          {{ money(groupTotal(props.group)) }}
        </span>
      </summary>
      <div class="customer-items"><slot /></div>
    </details>
  </section>
</template>
