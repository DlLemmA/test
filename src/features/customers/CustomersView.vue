<script setup lang="ts">
import { computed, onMounted, onScopeDispose, shallowRef } from "vue";
import { RouterLink } from "vue-router";
import { toastState } from "@/core/state";
import { markCustomerTransition } from "@/app/viewTransitions";
import { money, t } from "@/core/utils";
import { ITEM_BARE_FORMS, PARCEL_FORMS } from "@/features/parcels/ui/ParcelPresentation";
import { getCustomerStatements } from "@/features/statements/service";
import type { CustomerStatement } from "@/features/statements/service";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import ScreenState from "@/features/shared/ui/ScreenState.vue";
import CustomerForm from "./ui/CustomerForm.vue";
import { broughtWeight, SELF_SUFFIX } from "./ui/CustomerPresentation";
import CustomerMark from "./ui/CustomerMark.vue";

const statements = shallowRef<CustomerStatement[]>([]);
const formTarget = shallowRef<number | "new" | null>(null);
const phase = shallowRef<"loading" | "ready" | "error">("loading");

const formOpen = computed({
  get: () => formTarget.value !== null,
  set: (open: boolean) => {
    if (!open) formTarget.value = null;
  },
});
const formCustomer = computed(
  () => statements.value.find((statement) => statement.customer.id === formTarget.value)?.customer,
);

const loadScope = new AbortController();
onScopeDispose(() => loadScope.abort());

async function load(): Promise<void> {
  phase.value = "loading";
  try {
    const facts = await getCustomerStatements();
    if (!loadScope.signal.aborted) {
      statements.value = facts;
      phase.value = "ready";
    }
  } catch (error) {
    if (!loadScope.signal.aborted) phase.value = "error";
    console.error(error);
  }
}
onMounted(load);

function refresh(): void {
  void load();
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

function onOpen(event: MouseEvent, customerId: number): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  markCustomerTransition(customerId);
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

    <ScreenState v-if="phase === 'loading'" kind="loading" title="Загружаем заказчиков…" />
    <ScreenState
      v-else-if="phase === 'error'"
      kind="error"
      message="Не удалось загрузить заказчиков. Проверьте соединение и попробуйте ещё раз."
      action-label="Повторить"
      @action="refresh"
    />
    <ul v-else-if="statements.length" class="customer-index">
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
                <template v-if="broughtWeight(statement.items)">
                  · привезено {{ broughtWeight(statement.items) }}
                </template>
              </span>
              <span
                class="customer-row__balance"
                :class="statement.balance.remaining > 0 ? 'is-debt' : 'is-paid'"
                >{{ balanceAmount(statement) }}</span
              >
            </div>
          </div>
          <div class="customer-actions">
            <RouterLink
              class="btn-icon btn-primary"
              :data-open-customer="statement.customer.id"
              :aria-label="`Открыть карточку ${statement.customer.name}`"
              :to="{ name: 'customer', params: { customerId: String(statement.customer.id) } }"
              @click.capture="onOpen($event, statement.customer.id)"
            >
              <AppIcon name="arrowRight" />
            </RouterLink>
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
    <ScreenState
      v-else
      kind="empty"
      title="Заказчиков пока нет"
      message="Добавьте первого заказчика, чтобы вести по нему товары и расчёты."
      action-label="Добавить заказчика"
      @action="formTarget = 'new'"
    />

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
