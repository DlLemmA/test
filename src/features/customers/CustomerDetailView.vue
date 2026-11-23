<script setup lang="ts">
import { shallowRef } from "vue";
import { useRenderRefresh } from "@/app/useRenderRefresh";
import type { VueViewProps } from "@/app/mountVueView";
import { emptyCustomerBalance } from "@/features/balances/domain";
import { router, toastState } from "@/core/state";
import { money, t } from "@/core/utils";
import { getCustomerStatement } from "@/features/statements/service";
import type { CustomerParcelStatement, CustomerStatement } from "@/features/statements/service";
import { ITEM_FORMS, PARCEL_IN_FORMS, parcelDate } from "@/features/parcels/ui/ParcelPresentation";
import type { ParcelItem } from "@/features/parcels/domain";
import { nextStepLabel } from "@/features/parcels/ui/ParcelNextStatus";
import { parcelStatusInfo } from "@/features/parcels/ui/ParcelStatusInfo";
import { paymentService } from "@/features/shared/wiring";
import { customerLabel } from "./ui/CustomerPresentation";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import CustomerMark from "./ui/CustomerMark.vue";

const props = defineProps<VueViewProps>();
const statement = shallowRef<CustomerStatement | null>(null);
const missing = shallowRef(false);

const refresh = useRenderRefresh(props, async (signal) => {
  const customerId = Number(props.params.customerId);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    router.navigate("people");
    return;
  }
  const facts = await getCustomerStatement(customerId);
  if (signal.aborted) return;
  missing.value = !facts;
  statement.value = facts;
});

function share(entry: CustomerParcelStatement, customerId: number) {
  return entry.balance.byCustomer.get(customerId) ?? emptyCustomerBalance();
}

function deliveryShare(item: ParcelItem, entry: CustomerParcelStatement): number {
  return entry.balance.deliveryByItem.get(item.id) ?? 0;
}

function paidFlags(entry: CustomerParcelStatement): boolean[] {
  return entry.items.map((item) => entry.settlement.paidItems.has(item.id));
}

function parcelPaid(entry: CustomerParcelStatement, customerId: number): boolean {
  const flags = paidFlags(entry);
  const shippingPaid = entry.settlement.paidDelivery.has(customerId);
  return (
    flags.length > 0 && flags.every(Boolean) && (!entry.settlement.deliveryInvoiced || shippingPaid)
  );
}

function parcelIndeterminate(entry: CustomerParcelStatement, customerId: number): boolean {
  const flags = paidFlags(entry);
  const shippingPaid = entry.settlement.paidDelivery.has(customerId);
  return (
    !parcelPaid(entry, customerId) &&
    (flags.some(Boolean) || (entry.settlement.deliveryInvoiced && shippingPaid))
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ошибка";
}

async function togglePayment(event: Event, entry: CustomerParcelStatement, itemId: number) {
  const input = event.target as HTMLInputElement;
  const checked = input.checked;
  const current = statement.value;
  if (!current) return;
  try {
    await paymentService.setItemPaid(entry.parcel.id, itemId, current.customer.id, checked);
    toastState.add({
      message: checked ? "Товар отмечен как оплаченный" : "Оплата товара снята",
      type: "success",
    });
    refresh();
  } catch (error) {
    input.checked = !checked;
    toastState.add({ message: errorMessage(error), type: "error" });
  }
}

async function toggleShipping(event: Event, entry: CustomerParcelStatement) {
  const input = event.target as HTMLInputElement;
  const checked = input.checked;
  const current = statement.value;
  if (!current) return;
  try {
    await paymentService.setShippingPaid(entry.parcel.id, current.customer.id, checked);
    toastState.add({
      message: checked ? "Доставка оплачена" : "Оплата доставки снята",
      type: "success",
    });
    refresh();
  } catch (error) {
    input.checked = !checked;
    toastState.add({ message: errorMessage(error), type: "error" });
  }
}

async function toggleParcel(event: Event, entry: CustomerParcelStatement) {
  const input = event.target as HTMLInputElement;
  const checked = input.checked;
  const current = statement.value;
  if (!current) return;
  try {
    await paymentService.setParcelPayment(
      entry.parcel.id,
      current.customer.id,
      entry.items.map((item) => item.id),
      checked,
      entry.settlement.deliveryInvoiced,
    );
    toastState.add({
      message: checked ? "Посылка оплачена" : "Оплата посылки снята",
      type: "success",
    });
    refresh();
  } catch (error) {
    input.checked = !checked;
    toastState.add({ message: errorMessage(error), type: "error" });
  }
}
</script>

<template>
  <div v-if="missing" class="empty">Заказчик не найден</div>
  <div v-else-if="statement" class="page page-customer-detail">
    <div class="detail-topbar">
      <button
        type="button"
        class="text-btn"
        id="backToCustomers"
        @click="router.navigate('people')"
      >
        <AppIcon name="chevronLeft" /> Все заказчики
      </button>
    </div>

    <section class="detail-hero" :class="{ 'is-self': statement.customer.isSelf }">
      <CustomerMark :customer="statement.customer" variant="avatar" />
      <div class="detail-hero__body min-w-0">
        <div class="detail-hero__title-row"><h1>{{ customerLabel(statement.customer) }}</h1></div>
        <p class="detail-hero__next">
          {{ statement.customer.isSelf ? "Мой профиль" : "Заказчик" }}
        </p>
        <p class="detail-hero__facts">
          {{ t(ITEM_FORMS, statement.items.length) }} в
          {{ t(PARCEL_IN_FORMS, statement.parcels.length) }}
        </p>
      </div>
    </section>

    <div class="check-list customer-summary">
      <div class="check-row"><span>Оплачено</span><b>{{ money(statement.balance.paid) }}</b></div>
      <div
        class="check-row check-row--total"
        :class="statement.balance.remaining > 0 ? 'is-debt' : 'is-paid'"
      >
        <span>{{
          statement.balance.remaining > 0
            ? statement.customer.isSelf
              ? "Остаток"
              : "Долг"
            : "Всё оплачено"
        }}</span>
        <b>{{ money(Math.abs(statement.balance.remaining)) }}</b>
      </div>
    </div>
    <p v-if="statement.customer.isSelf" class="customer-note">
      «Я» — считаем потрачено по всем посылкам
    </p>

    <template v-if="statement.parcels.length">
      <section
        v-for="entry in statement.parcels"
        :key="entry.parcel.id"
        class="section customer-statement"
      >
        <div class="parcel-entry parcel-line" :data-status="entry.parcel.status">
          <div class="parcel-entry__date" :title="parcelDate(entry.parcel).title">
            <b>{{ parcelDate(entry.parcel).day }}</b>
            <span>{{ parcelDate(entry.parcel).month }}</span>
          </div>
          <div class="parcel-entry__body min-w-0">
            <div class="parcel-entry__head">
              <b :title="entry.parcel.name || `Посылка #${entry.parcel.id}`">{{
                entry.parcel.name || `Посылка #${entry.parcel.id}`
              }}</b>
              <span
                class="parcel-entry__state"
                :class="`state-${parcelStatusInfo(entry.parcel.status).class}`"
                >{{ parcelStatusInfo(entry.parcel.status).label }}</span
              >
            </div>
            <div class="parcel-entry__hint">{{ nextStepLabel(entry.parcel.status) }}</div>
          </div>
          <button
            type="button"
            class="btn-icon btn-primary"
            :data-open-parcel="entry.parcel.id"
            :aria-label="`Открыть посылку ${entry.parcel.name || `Посылка #${entry.parcel.id}`}`"
            @click="router.navigate('parcel', { parcelId: String(entry.parcel.id) })"
          >
            <AppIcon name="arrowRight" />
          </button>
        </div>

        <label class="parcel-check">
          <input
            type="checkbox"
            :data-toggle-parcel="entry.parcel.id"
            :checked="parcelPaid(entry, statement.customer.id)"
            :indeterminate="parcelIndeterminate(entry, statement.customer.id)"
            :disabled="statement.customer.isSelf"
            @change="toggleParcel($event, entry)"
          />
          <span>Посылка оплачена</span>
        </label>

        <div class="customer-items">
          <label v-for="item in entry.items" :key="item.id" class="item-check">
            <input
              type="checkbox"
              :data-toggle-payment="item.id"
              :data-parcel="entry.parcel.id"
              :checked="entry.settlement.paidItems.has(item.id)"
              :disabled="statement.customer.isSelf"
              @change="togglePayment($event, entry, item.id)"
            />
            <span class="item-check__name" :title="item.name">{{ item.name }}</span>
            <span class="item-check__prices">
              <span class="item-check__price">{{
                money(item.totalPriceBYN + deliveryShare(item, entry))
              }}</span>
              <span v-if="deliveryShare(item, entry) > 0" class="item-check__without-delivery">
                без доставки {{ money(item.totalPriceBYN) }}
              </span>
            </span>
          </label>
        </div>

        <label v-if="entry.settlement.deliveryInvoiced" class="item-check">
          <input
            type="checkbox"
            :data-toggle-shipping="entry.parcel.id"
            :checked="entry.settlement.paidDelivery.has(statement.customer.id)"
            :disabled="statement.customer.isSelf"
            @change="toggleShipping($event, entry)"
          />
          <span
            class="item-check__name"
            title="Доставка уже включена в цену товаров — здесь отмечается её оплата"
            >Доставка (включена в цены)</span
          >
          <span class="item-check__price">{{
            money(share(entry, statement.customer.id).delivery.owed)
          }}</span>
        </label>
      </section>
    </template>
    <div v-else class="empty">Товаров пока нет</div>
  </div>
</template>

<style src="./customerDetail.css"></style>
