<script setup lang="ts">
import { computed, onMounted, onScopeDispose, shallowRef } from "vue";
import { RouterLink } from "vue-router";
import { toastState } from "@/core/state";
import { markCustomerTransition } from "@/app/viewTransitions";
import { byn, t } from "@/core/utils";
import { ITEM_BARE_FORMS, PARCEL_FORMS } from "@/features/parcels/ui/ParcelPresentation";
import { getCustomerStatements } from "@/features/statements/service";
import type { CustomerStatement } from "@/features/statements/service";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import ScreenState from "@/features/shared/ui/ScreenState.vue";
import CustomerForm from "./ui/CustomerForm.vue";
import { broughtWeight, SELF_SUFFIX } from "./ui/CustomerPresentation";
import CustomerMark from "./ui/CustomerMark.vue";
import { filterCustomerStatements } from "./ui/customerListFilter";

const statements = shallowRef<CustomerStatement[]>([]);
const formTarget = shallowRef<number | "new" | null>(null);
const phase = shallowRef<"loading" | "ready" | "error">("loading");
const query = shallowRef("");

const visible = computed(() => filterCustomerStatements(statements.value, query.value));
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
  return balance.remaining > 0 ? `долг ${byn(balance.remaining)}` : `оплачено ${byn(balance.paid)}`;
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

    <ScreenState
      v-if="phase === 'loading'"
      kind="loading"
      skeleton="list"
      title="Загружаем заказчиков…"
    />
    <ScreenState
      v-else-if="phase === 'error'"
      kind="error"
      message="Не удалось загрузить заказчиков. Проверьте соединение и попробуйте ещё раз."
      action-label="Повторить"
      @action="refresh"
    />
    <search v-else class="customer-filters">
      <label class="visually-hidden" for="customerSearch">Найти заказчика</label>
      <input
        id="customerSearch"
        v-model="query"
        class="customer-filters__search"
        type="search"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="none"
        spellcheck="false"
        enterkeyhint="search"
        placeholder="Имя заказчика"
      />
    </search>
    <ul v-if="visible.length" class="customer-index">
      <li v-for="statement in visible" :key="statement.customer.id">
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
      v-else-if="query.trim()"
      kind="empty"
      title="Ничего не найдено"
      message="Попробуйте другое имя заказчика."
      action-label="Сбросить поиск"
      @action="query = ''"
    />
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

<style scoped>
/* Only the directory stacks its heading in a row; the page head itself is shared. */
.page-head__row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
/* Search stays under the masthead */
.customer-filters {
  display: block;
  position: sticky;
  top: 0;
  z-index: 5;
  margin: 8px -1rem 0;
  padding: 8px 1rem 10px;
  background: var(--color-canvas);
  border-bottom: 1px solid var(--color-line);
}
.customer-filters__search {
  inline-size: 100%;
  min-block-size: 48px;
  padding: 10px 12px;
  border: 1px solid var(--color-line-strong);
  border-radius: 10px;
  background: var(--color-paper);
  color: var(--color-ink);
  font-size: 16px;
}

/* Customer directory — quiet rows, no stat tiles */
.page-customers {
  padding: 4px 0 0;
}
.customer-index {
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--color-line-strong);
  list-style: none;
}
.customer-index li + li {
  border-top: 1px solid var(--color-line);
}
.customer-line {
  display: flex;
  align-items: center;
  gap: 6px;
}
.customer-row {
  display: grid;
  flex: 1;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  min-width: 0;
  padding: 10px 2px;
}
.customer-row__body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.customer-row__name {
  overflow: hidden;
  color: var(--color-ink);
  font-size: 15px;
  font-weight: 700;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.customer-row__self {
  color: var(--color-muted);
  font-weight: 600;
}
.customer-row__meta {
  color: var(--color-muted);
  font-size: 12px;
}
.customer-row__balance {
  margin-top: 1px;
  color: var(--color-ink);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.customer-row__balance.is-debt {
  color: var(--color-negative);
}
.customer-row__balance.is-paid {
  color: var(--color-positive);
}
.customer-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}
.customer-actions > .btn-icon {
  width: 44px;
  height: 44px;
  padding: 0;
  border-color: var(--color-accent-line);
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
}
.customer-actions > .btn-secondary {
  border-color: var(--color-line);
  background: transparent;
  color: var(--color-ink-soft);
}
@media (pointer: coarse) {
  .customer-row {
    padding-block: 12px;
  }
}
</style>
