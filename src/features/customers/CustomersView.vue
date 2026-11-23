<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { useRenderRefresh } from "@/app/useRenderRefresh";
import type { VueViewProps } from "@/app/mountVueView";
import { router, toastState } from "@/core/state";
import { money, t } from "@/core/utils";
import { ITEM_BARE_FORMS, PARCEL_FORMS } from "@/features/parcels/ui/ParcelPresentation";
import { getCustomerStatements } from "@/features/statements/service";
import type { CustomerStatement } from "@/features/statements/service";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import CustomerForm from "./ui/CustomerForm.vue";
import { SELF_SUFFIX } from "./ui/CustomerPresentation";
import CustomerMark from "./ui/CustomerMark.vue";

const props = defineProps<VueViewProps>();
const statements = shallowRef<CustomerStatement[]>([]);
const formTarget = shallowRef<number | "new" | null>(null);

const formOpen = computed({
  get: () => formTarget.value !== null,
  set: (open: boolean) => {
    if (!open) formTarget.value = null;
  },
});
const formCustomer = computed(
  () => statements.value.find((statement) => statement.customer.id === formTarget.value)?.customer,
);

const refresh = useRenderRefresh(props, async (signal) => {
  const facts = await getCustomerStatements();
  if (!signal.aborted) statements.value = facts;
});

function openCustomer(id: number): void {
  router.navigate("customer", { customerId: String(id) });
}

function onSaved(): void {
  formTarget.value = null;
  refresh();
  toastState.add({ message: "Заказчик сохранён", type: "success" });
}

function balanceAmount(statement: CustomerStatement): string {
  const { balance } = statement;
  return balance.remaining > 0
    ? `долг ${money(balance.remaining)}`
    : `оплачено ${money(balance.paid)}`;
}
</script>

<template>
  <div class="page page-customers">
    <header class="page-head">
      <div class="page-head__row">
        <h1>Заказчики</h1>
      </div>
      <p class="page-head__note">Товары, посылки и остатки по каждому человеку</p>
    </header>

    <ul v-if="statements.length" class="customer-index">
      <li v-for="statement in statements" :key="statement.customer.id">
        <div class="customer-line">
          <div class="customer-row">
            <CustomerMark :customer="statement.customer" variant="list" />
            <div class="customer-row__body">
              <span class="customer-row__name">
                {{ statement.customer.name }}
                <span v-if="statement.customer.isSelf" class="customer-row__self">{{
                  SELF_SUFFIX
                }}</span>
              </span>
              <span class="customer-row__meta">
                {{ t(ITEM_BARE_FORMS, statement.items.length) }} ·
                {{ t(PARCEL_FORMS, statement.parcelCount) }}
              </span>
              <span
                class="customer-row__balance"
                :class="statement.balance.remaining > 0 ? 'is-debt' : 'is-paid'"
                >{{ balanceAmount(statement) }}</span
              >
            </div>
          </div>
          <div class="customer-actions">
            <button
              type="button"
              class="btn-icon btn-primary"
              :data-open-customer="statement.customer.id"
              :aria-label="`Открыть карточку ${statement.customer.name}`"
              @click="openCustomer(statement.customer.id)"
            >
              <AppIcon name="arrowRight" />
            </button>
            <button
              type="button"
              class="btn-icon btn-secondary customer-edit"
              :data-edit-customer="statement.customer.id"
              :aria-label="`Редактировать заказчика ${statement.customer.name}`"
              @click="formTarget = statement.customer.id"
            >
              <AppIcon name="pencil" />
            </button>
          </div>
        </div>
      </li>
    </ul>
    <div v-else class="empty">Нет заказчиков. Нажмите «Добавить заказчика», чтобы начать.</div>

    <div class="form-actions form-actions--final">
      <button type="button" class="btn-primary w-full" id="addCustomer" @click="formTarget = 'new'">
        <AppIcon name="plus" /> Добавить заказчика
      </button>
    </div>

    <CustomerForm
      v-model:open="formOpen"
      :customer="formCustomer"
      :is-new="formTarget === 'new'"
      @saved="onSaved"
    />
  </div>
</template>

<style src="./customers.css"></style>
