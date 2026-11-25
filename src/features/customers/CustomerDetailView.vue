<script setup lang="ts">
import { computed, nextTick, onMounted, onScopeDispose, shallowRef, useTemplateRef } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { emptyCustomerBalance } from "@/features/balances/domain";
import { toastState } from "@/core/state";
import { money, t } from "@/core/utils";
import { getCustomerStatement } from "@/features/statements/service";
import type { CustomerParcelStatement, CustomerStatement } from "@/features/statements/service";
import { ITEM_FORMS, PARCEL_IN_FORMS, parcelDate } from "@/features/parcels/ui/ParcelPresentation";
import type { ParcelItem } from "@/features/parcels/domain";
import { nextStepLabel } from "@/features/parcels/ui/ParcelNextStatus";
import { parcelDebtClass, parcelDebtLabel } from "@/features/parcels/ui/ParcelDebt";
import { paymentService } from "@/features/shared/wiring";
import { broughtWeight, customerLabel } from "./ui/CustomerPresentation";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import ScreenState from "@/features/shared/ui/ScreenState.vue";
import CustomerMark from "./ui/CustomerMark.vue";

const route = useRoute();
const router = useRouter();
const statement = shallowRef<CustomerStatement | null>(null);
const phase = shallowRef<"loading" | "ready" | "error">("loading");
const missing = shallowRef(false);
const actionError = shallowRef("");
const retryAction = shallowRef<(() => void) | null>(null);
const actionErrorEl = useTemplateRef<HTMLDivElement>("actionErrorEl");
const totalBroughtWeight = computed(() =>
  statement.value ? broughtWeight(statement.value.items) : null,
);

const loadScope = new AbortController();
onScopeDispose(() => loadScope.abort());

async function load(): Promise<void> {
  const customerId = Number(route.params.customerId);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    void router.push({ name: "people" });
    return;
  }
  phase.value = "loading";
  try {
    const facts = await getCustomerStatement(customerId);
    if (loadScope.signal.aborted) return;
    missing.value = !facts;
    statement.value = facts;
    phase.value = "ready";
  } catch (error) {
    if (!loadScope.signal.aborted) phase.value = "error";
    console.error(error);
  }
}
onMounted(load);

function refresh(): void {
  void load();
}

function share(entry: CustomerParcelStatement, customerId: number) {
  return entry.balance.byCustomer.get(customerId) ?? emptyCustomerBalance();
}

function deliveryShare(item: ParcelItem, entry: CustomerParcelStatement): number {
  return entry.balance.deliveryByItem.get(item.id) ?? 0;
}

function itemWeightG(item: ParcelItem): number {
  return item.weightsG.reduce((sum, weight) => sum + weight, 0);
}

function itemsWeightG(entry: CustomerParcelStatement): number {
  return entry.items.reduce((sum, item) => sum + itemWeightG(item), 0);
}

function paidFlags(entry: CustomerParcelStatement): boolean[] {
  return entry.items.map((item) => entry.settlement.paidItems.has(item.id));
}

function goodsPaid(entry: CustomerParcelStatement): boolean {
  const flags = paidFlags(entry);
  return flags.length > 0 && flags.every(Boolean);
}

function goodsIndeterminate(entry: CustomerParcelStatement): boolean {
  return !goodsPaid(entry) && paidFlags(entry).some(Boolean);
}

function deliveryPayable(entry: CustomerParcelStatement, customerId: number): boolean {
  return entry.settlement.deliveryInvoiced && share(entry, customerId).delivery.owed > 0;
}

function debtFacts(entry: CustomerParcelStatement, customer: CustomerStatement["customer"]) {
  return {
    remaining: share(entry, customer.id).remaining,
    isSelf: customer.isSelf,
    deliveryInvoiced: entry.settlement.deliveryInvoiced,
  };
}

function fail(message: string, retry?: () => void): void {
  actionError.value = message;
  retryAction.value = retry ?? null;
  void nextTick(() => actionErrorEl.value?.focus());
}

function retryFailed(): void {
  actionError.value = "";
  retryAction.value?.();
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
    fail("Не удалось изменить оплату товара", () => void load());
    console.error(error);
  }
}

async function toggleGoods(event: Event, entry: CustomerParcelStatement) {
  const input = event.target as HTMLInputElement;
  const checked = input.checked;
  const current = statement.value;
  if (!current || current.customer.isSelf) return;
  try {
    await paymentService.setParcelPayment(
      entry.parcel.id,
      current.customer.id,
      entry.items.map((item) => item.id),
      checked,
      false,
    );
    toastState.add({
      message: checked ? "Товары оплачены" : "Оплата товаров снята",
      type: "success",
    });
    refresh();
  } catch (error) {
    input.checked = !checked;
    fail("Не удалось изменить оплату товаров", () => void load());
    console.error(error);
  }
}

async function toggleShipping(event: Event, entry: CustomerParcelStatement) {
  const input = event.target as HTMLInputElement;
  const checked = input.checked;
  const current = statement.value;
  if (!current || !deliveryPayable(entry, current.customer.id)) return;
  try {
    await paymentService.setShippingPaid(entry.parcel.id, current.customer.id, checked);
    toastState.add({
      message: checked ? "Доставка оплачена" : "Оплата доставки снята",
      type: "success",
    });
    refresh();
  } catch (error) {
    input.checked = !checked;
    fail("Не удалось изменить оплату доставки", () => void load());
    console.error(error);
  }
}
</script>

<template>
  <ScreenState v-if="phase === 'loading'" kind="loading" title="Загружаем заказчика…" />
  <ScreenState
    v-else-if="phase === 'error'"
    kind="error"
    message="Не удалось загрузить заказчика. Проверьте соединение и попробуйте ещё раз."
    action-label="Повторить"
    @action="refresh"
  />
  <ScreenState v-else-if="missing" kind="empty" title="Заказчик не найден" />
  <div v-else-if="statement" class="page page-customer-detail">
    <div class="detail-topbar">
      <RouterLink class="text-btn" id="backToCustomers" :to="{ name: 'people' }">
        <AppIcon name="chevronLeft" /> Все заказчики
      </RouterLink>
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
          <span v-if="totalBroughtWeight" class="detail-hero__weight">
            · привезено {{ totalBroughtWeight }}
          </span>
        </p>
      </div>
    </section>

    <div v-if="actionError" ref="actionErrorEl" class="inline-error" role="alert" tabindex="-1">
      <span>{{ actionError }}</span>
      <button v-if="retryAction" type="button" class="text-btn" @click="retryFailed">
        Повторить
      </button>
    </div>

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
              <b :title="entry.parcel.name || `Посылка №${entry.parcel.id}`">{{
                entry.parcel.name || `Посылка №${entry.parcel.id}`
              }}</b>
            </div>
            <div class="parcel-entry__hint customer-parcel-hint">
              <span class="customer-parcel-hint__text">{{
                nextStepLabel(entry.parcel.status)
              }}</span>
              <span
                class="parcel-debt"
                :class="parcelDebtClass(debtFacts(entry, statement.customer))"
                >{{ parcelDebtLabel(debtFacts(entry, statement.customer)) }}</span
              >
            </div>
          </div>
          <RouterLink
            class="btn-icon btn-primary"
            :data-open-parcel="entry.parcel.id"
            :aria-label="`Открыть посылку ${entry.parcel.name || `Посылка №${entry.parcel.id}`}`"
            :to="{ name: 'parcel', params: { parcelId: String(entry.parcel.id) } }"
          >
            <AppIcon name="arrowRight" />
          </RouterLink>
        </div>

        <label class="pay-summary">
          <input
            type="checkbox"
            class="pay-summary__input"
            :data-toggle-goods="entry.parcel.id"
            :checked="goodsPaid(entry)"
            :indeterminate="goodsIndeterminate(entry)"
            :disabled="statement.customer.isSelf"
            @change="toggleGoods($event, entry)"
          />
          <span class="pay-summary__body">
            <span class="pay-summary__label">Товары оплачены</span>
            <span class="pay-summary__note">без доставки</span>
          </span>
          <span class="pay-summary__amount">{{
            money(share(entry, statement.customer.id).goods.owed)
          }}</span>
        </label>

        <label class="pay-summary pay-summary--delivery">
          <input
            type="checkbox"
            class="pay-summary__input"
            :data-toggle-shipping="entry.parcel.id"
            :checked="
              deliveryPayable(entry, statement.customer.id) &&
              entry.settlement.paidDelivery.has(statement.customer.id)
            "
            :disabled="statement.customer.isSelf || !deliveryPayable(entry, statement.customer.id)"
            @change="toggleShipping($event, entry)"
          />
          <span class="pay-summary__body">
            <span class="pay-summary__label">Доставка оплачена</span>
            <span class="pay-summary__note">
              {{
                statement.customer.isSelf
                  ? "учтено в общем остатке"
                  : deliveryPayable(entry, statement.customer.id)
                    ? "включена в цены товаров"
                    : "цена не задана"
              }}
            </span>
          </span>
          <span class="pay-summary__amount">{{
            deliveryPayable(entry, statement.customer.id)
              ? money(share(entry, statement.customer.id).delivery.owed)
              : "—"
          }}</span>
        </label>

        <details class="customer-items-fold">
          <summary class="customer-items-fold__summary">
            <AppIcon name="chevronRight" />
            <span>{{ t(ITEM_FORMS, entry.items.length) }}</span>
            <span class="customer-items-fold__meta">
              {{ itemsWeightG(entry) > 0 ? `${itemsWeightG(entry)} г` : "вес —" }} ·
              {{ money(share(entry, statement.customer.id).goods.owed) }}
            </span>
          </summary>
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
              <span class="item-check__title">
                <span class="item-check__name" :title="item.name">{{ item.name }}</span>
                <span v-if="itemWeightG(item) > 0" class="item-check__weight">
                  {{ itemWeightG(item) }} г
                </span>
              </span>
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
        </details>
      </section>
    </template>
    <div v-else class="empty">Посылок пока нет</div>
  </div>
</template>
