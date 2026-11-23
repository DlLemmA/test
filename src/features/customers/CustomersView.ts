// ============================================
// Customers View Component
// Shows all customers with debts; click a customer to see their items & payments
// ============================================

import { customerRepository } from "./infrastructure";
import { customerService } from "@/features/shared/wiring";
import { drawer, confirmDrawer, closeDrawer } from "@/core/drawer";
import { createListenerScope } from "@/core/listeners";
import { router, toastState } from "@/core/state";
import type { ListenerScope } from "@/core/listeners";
import type { ViewHandle } from "@/app/ViewHandle";
import { I, esc, money, t } from "@/core/utils";
import { SELF_SUFFIX } from "./ui/CustomerPresentation";
import { ITEM_BARE_FORMS, PARCEL_FORMS } from "@/features/parcels/ui/ParcelPresentation";
import {
  parcelRepository,
  parcelItemRepository,
  paymentRepository,
} from "@/features/parcels/infrastructure";
import { Parcel, ParcelItem, Payment, paymentStateFromPayments } from "@/features/parcels/domain";
import { customerBalances } from "@/features/balances/domain";
import { customerMark } from "./ui/CustomerMark";

export function mountCustomersView(host: HTMLElement): ViewHandle {
  const scope = createListenerScope();

  async function render(): Promise<void> {
    if (scope.signal.aborted) return;
    const customers = await customerRepository.findAll();
    const parcels = await parcelRepository.findAll();
    const allItems = await parcelItemRepository.findAll();
    const allPayments = await paymentRepository.findAll();

    // Pre-calculate balances for all customers
    const selfCustomerId = customers.find((c) => c.isSelf)?.id;
    const balances = customers.map((c) =>
      calculateCustomerTotalBalance(c.id, parcels, allItems, allPayments, selfCustomerId),
    );

    host.innerHTML = `
    <div class="page page-customers">
      <header class="page-head">
        <div class="page-head__row">
          <h1>Заказчики</h1>
        </div>
        <p class="page-head__note">Товары, посылки и остатки по каждому человеку</p>
      </header>


      ${
        customers.length
          ? `<ul class="customer-index">${customers
              .map((c, idx) => {
                const balance = balances[idx]!;
                const itemCount = allItems.filter((i) => i.customerId === c.id).length;
                const hasDebt = balance.remaining > 0;
                const amount = hasDebt
                  ? `долг ${money(balance.remaining)}`
                  : `оплачено ${money(balance.paid)}`;
                return `
          <li>
            <div class="customer-line">
              <div class="customer-row">
                ${customerMark(c, "list")}
                <div class="customer-row__body">
                  <span class="customer-row__name">${esc(c.name)}${c.isSelf ? ` <span class="customer-row__self">${esc(SELF_SUFFIX)}</span>` : ""}</span>
                  <span class="customer-row__meta">${t(ITEM_BARE_FORMS, itemCount)} · ${t(PARCEL_FORMS, balance.parcelCount)}</span>
                  <span class="customer-row__balance ${hasDebt ? "is-debt" : "is-paid"}">${amount}</span>
                </div>
              </div>
              <div class="customer-actions">
                <button type="button" class="btn-icon btn-primary" data-open-customer="${c.id}"
                  aria-label="Открыть карточку ${esc(c.name)}">${I.arrowRight}</button>
                <button type="button" class="btn-icon btn-secondary customer-edit" data-edit-customer="${c.id}"
                  aria-label="Редактировать заказчика ${esc(c.name)}">${I.pencil}</button>
              </div>
            </div>
          </li>
        `;
              })
              .join("")}</ul>`
          : '<div class="empty">Нет заказчиков. Нажмите «Добавить заказчика», чтобы начать.</div>'
      }

      <div class="form-actions form-actions--final">
        <button type="button" class="btn-primary w-full" id="addCustomer">${I.plus} Добавить заказчика</button>
      </div>
    </div>
  `;

    bindActions(host, scope, () => void render());
  }

  return { render, dispose: () => scope.dispose() };
}

function calculateCustomerTotalBalance(
  customerId: number,
  parcels: Parcel[],
  items: ParcelItem[],
  payments: Payment[],
  selfCustomerId?: number,
): { owed: number; paid: number; remaining: number; parcelCount: number } {
  const customerItems = items.filter((i) => i.customerId === customerId);
  const customerPayments = payments.filter((p) => p.customerId === customerId);
  const parcelsWithItems = new Set<number>();
  let totalOwed = 0;
  let totalPaid = 0;

  for (const parcel of parcels) {
    const customerParcelItems = customerItems.filter((i) => i.parcelId === parcel.id);
    if (customerParcelItems.length === 0) continue;
    parcelsWithItems.add(parcel.id);

    // Shipping share is a fraction of the whole parcel's weight, so pass all
    // its items — not only this customer's. Payment state is per parcel too,
    // otherwise shipping flags from other parcels overwrite each other.
    const parcelItems = items.filter((i) => i.parcelId === parcel.id);
    const parcelPayments = customerPayments.filter((p) => p.parcelId === parcel.id);
    const paymentState = paymentStateFromPayments(parcelPayments);
    const balance = customerBalances({
      parcel,
      items: parcelItems,
      paymentState,
      selfCustomerId,
    }).byCustomer.get(customerId);
    if (balance) {
      totalOwed += balance.owed;
      totalPaid += balance.paid;
    }
  }

  return {
    owed: totalOwed,
    paid: totalPaid,
    remaining: totalOwed - totalPaid,
    parcelCount: parcelsWithItems.size,
  };
}

function bindActions(root: HTMLElement, scope: ListenerScope, refresh: () => void): void {
  scope.on(root.querySelector("#addCustomer"), "click", () =>
    openCustomerForm(undefined, scope, refresh),
  );

  root.querySelectorAll<HTMLElement>("[data-open-customer]").forEach((btn) => {
    scope.on(btn, "click", () => {
      const id = parseInt(btn.dataset.openCustomer!);
      router.navigate("customer", { customerId: String(id) });
    });
  });

  root.querySelectorAll("[data-edit-customer]").forEach((btn) => {
    const b = btn as HTMLElement;
    scope.on(b, "click", () => openCustomerForm(parseInt(b.dataset.editCustomer!), scope, refresh));
  });

  root.querySelectorAll("[data-del-customer]").forEach((btn) => {
    const b = btn as HTMLElement;
    scope.on(b, "click", async () => {
      const id = parseInt(b.dataset.delCustomer!);
      await deleteCustomer(id, refresh);
    });
  });
}

function openCustomerForm(id: number | undefined, scope: ListenerScope, refresh: () => void): void {
  if (id) {
    customerRepository.findById(id).then((c) => {
      if (c) renderCustomerForm(c, false, scope, refresh);
    });
  } else {
    renderCustomerForm(null, true, scope, refresh);
  }
}

function renderCustomerForm(
  customer: { id: number; name: string; isSelf: boolean } | null,
  isNew: boolean,
  scope: ListenerScope,
  refresh: () => void,
): void {
  drawer(
    isNew ? "Новый заказчик" : "Редактировать заказчика",
    `
    <form id="customerForm" novalidate aria-label="${isNew ? "Новый заказчик" : "Редактировать заказчика"}">
      <div class="field">
        <label for="customerName">Имя *</label>
        <input id="customerName" name="name" type="text" required autocomplete="name" autofocus
          enterkeyhint="done" aria-describedby="customerNameError"
          value="${esc(customer?.name || "")}" placeholder="Иван">
        <span id="customerNameError" class="field-error" hidden></span>
      </div>
      <div class="field field-check">
        <input id="customerSelf" name="is_self" type="checkbox" ${customer?.isSelf ? "checked" : ""}>
        <label for="customerSelf">Это я</label>
      </div>
      <div class="form-actions"><button type="submit" class="btn-primary w-full">${isNew ? "Добавить" : "Сохранить"}</button></div>
    </form>
  `,
  );

  const form = document.getElementById("customerForm") as HTMLFormElement | null;
  if (!form) return;

  const nameInput = document.getElementById("customerName") as HTMLInputElement;
  const nameError = document.getElementById("customerNameError") as HTMLElement;

  const showNameError = (message: string): void => {
    nameInput.setCustomValidity(message);
    nameInput.setAttribute("aria-invalid", "true");
    nameError.textContent = message;
    nameError.hidden = false;
    nameInput.focus();
  };
  const clearNameError = (): void => {
    nameInput.setCustomValidity("");
    nameInput.removeAttribute("aria-invalid");
    nameError.textContent = "";
    nameError.hidden = true;
  };

  scope.on(nameInput, "input", clearNameError);
  scope.on(nameInput, "change", clearNameError);

  scope.on(form, "submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const name = formData.get("name")?.toString().trim() || "";
    const isSelf = formData.get("is_self") === "on";

    if (!name) {
      showNameError("Укажите имя заказчика");
      return;
    }

    try {
      if (isNew) {
        await customerService.validateUniqueName(name);
        await customerRepository.save(
          (await import("@/features/customers/domain.js")).Customer.create({ name, isSelf }),
        );
      } else if (customer) {
        await customerService.validateUniqueName(name, customer.id);
        const updated = (await import("@/features/customers/domain.js")).Customer.fromPersistence({
          id: customer.id,
          name,
          isSelf,
        });
        await customerRepository.save(updated);
      }
      closeDrawer();
      refresh();
      toastState.add({ message: "Заказчик сохранён", type: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Не удалось сохранить заказчика";
      showNameError(message);
    }
  });
}

async function deleteCustomer(id: number, refresh: () => void): Promise<void> {
  confirmDrawer("Удалить заказчика", "Заказчик будет удалён.", "Удалить", async () => {
    await customerRepository.delete(id);
    refresh();
    toastState.add({ message: "Заказчик удалён", type: "success" });
  });
}
