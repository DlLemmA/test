// ============================================
// Customers View Component
// Shows all customers with debts; click a customer to see their items & payments
// ============================================

import { customerRepository } from "./infrastructure";
import { customerService } from "@/features/shared/services";
import { drawer, confirmDrawer, closeDrawer } from "@/core/drawer";
import { on } from "@/core/listeners";
import { router, uiState, toastState } from "@/core/state";
import { I, esc, money } from "@/core/utils";
import {
  parcelRepository,
  parcelItemRepository,
  paymentRepository,
} from "@/features/parcels/infrastructure";
import {
  Parcel,
  ParcelItem,
  calculateCustomerBalance,
  paymentStateFromPayments,
} from "@/features/parcels/domain";
import { Customer } from "@/features/customers/domain";

export async function renderCustomersView(): Promise<void> {
  const root = document.getElementById("peopleView");
  if (!root) return;

  const customers = await customerRepository.findAll();
  const parcels = await parcelRepository.findAll();
  const allItems = await parcelItemRepository.findAll();
  const allPayments = await paymentRepository.findAll();

  // Pre-calculate balances for all customers
  const balances = await Promise.all(
    customers.map((c) => calculateCustomerTotalBalance(c.id, parcels, allItems, allPayments)),
  );

  root.innerHTML = `
    <section class="section">
      <header class="section-title with-action">
        <h2>Заказчики</h2>
        <button class="btn-icon btn-secondary" id="addCustomer" aria-label="Добавить заказчика">${I.plus}</button>
      </header>
      ${
        customers.length
          ? customers
              .map((c, idx) => {
                const balance = balances[idx]!;
                const itemCount = allItems.filter((i) => i.customerId === c.id).length;
                return `
          <div class="item flex items-center justify-between gap-3 cursor-pointer" data-open-customer="${c.id}">
            <div class="flex-1 min-w-0">
              <div class="font-bold text-slate-900 truncate">${esc(c.name)}${c.isSelf ? ` <span class="pill pill-good text-xs ml-2">Я</span>` : ""}</div>
              <div class="text-xs text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap truncate">
                <span>товары: ${itemCount}</span>
                <span>посылки: ${balance.parcelCount}</span>
              </div>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <b class="tabular-nums ${balance.remaining > 0 ? "text-rose-600 font-bold" : "text-emerald-600 font-bold"}">
                ${balance.remaining > 0 ? `долг ${money(balance.remaining)}` : `оплачено ${money(balance.paid)}`}
              </b>
              <button class="btn-icon btn-secondary" data-open-customer="${c.id}" aria-label="Подробнее">${I.chevronRight}</button>
            </div>
          </div>
        `;
              })
              .join("")
          : '<div class="empty">Нет заказчиков</div>'
      }
    </section>
  `;

  bindActions();
}

async function calculateCustomerTotalBalance(
  customerId: number,
  parcels: Parcel[],
  items: ParcelItem[],
  payments: Array<{
    id: number;
    parcelId: number;
    customerId: number;
    itemId?: number;
    type: "item" | "shipping";
    paid: boolean;
    paidAt?: string;
    createdAt: string;
  }>,
): Promise<{ owed: number; paid: number; remaining: number; parcelCount: number }> {
  const customerItems = items.filter((i) => i.customerId === customerId);
  const customerPayments = payments.filter((p) => p.customerId === customerId);
  const paymentState = paymentStateFromPayments(customerPayments as any);
  const selfCustomer = await customerService.getSelfCustomer();
  const selfCustomerId = selfCustomer?.id;

  const parcelsWithItems = new Set<number>();
  let totalOwed = 0;
  let totalPaid = 0;

  for (const parcel of parcels) {
    const parcelItems = customerItems.filter((i) => i.parcelId === parcel.id);
    if (parcelItems.length === 0) continue;
    parcelsWithItems.add(parcel.id);

    const balances = calculateCustomerBalance(
      parcelItems,
      [{ id: customerId, name: "", isSelf: false }] as any,
      parcel,
      paymentState,
      selfCustomerId,
    );
    const balance = balances.get(customerId);
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

function bindActions(): void {
  const addBtn = document.getElementById("addCustomer");
  if (addBtn) {
    on(addBtn, "click", () => openCustomerForm());
  }

  document.querySelectorAll<HTMLElement>("[data-open-customer]").forEach((btn) => {
    on(btn, "click", () => {
      const id = parseInt(btn.dataset.openCustomer!);
      router.navigate("customer", { customerId: String(id) });
    });
  });

  document.querySelectorAll("[data-edit-customer]").forEach((btn) => {
    const b = btn as HTMLElement;
    on(b, "click", () => openCustomerForm(parseInt(b.dataset.editCustomer!)));
  });

  document.querySelectorAll("[data-del-customer]").forEach((btn) => {
    const b = btn as HTMLElement;
    on(b, "click", async () => {
      const id = parseInt(b.dataset.delCustomer!);
      await deleteCustomer(id);
    });
  });
}

function openCustomerForm(id?: number): void {
  if (id) {
    customerRepository.findById(id).then((c) => {
      if (c) renderCustomerForm(c, false);
    });
  } else {
    renderCustomerForm(null, true);
  }
}

function renderCustomerForm(
  customer: { id: number; name: string; isSelf: boolean } | null,
  isNew: boolean,
): void {
  drawer(
    isNew ? "Новый заказчик" : "Редактировать заказчика",
    `
    <form id="customerForm" novalidate>
      <div class="field"><label>Имя *</label><input name="name" required autocomplete="name" autofocus value="${esc(customer?.name || "")}" placeholder="Иван"></div>
      <div class="field"><label><input name="is_self" type="checkbox" ${customer?.isSelf ? "checked" : ""}> Это я</label></div>
      <div class="actions"><button type="submit">${isNew ? "Добавить" : "Сохранить"}</button></div>
    </form>
  `,
  );

  const form = document.getElementById("customerForm") as HTMLFormElement;
  if (form) {
    on(form, "submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const name = formData.get("name")?.toString().trim() || "";
      const isSelf = formData.get("is_self") === "on";

      if (!name) return;

      try {
        if (isNew) {
          await customerService.validateUniqueName(name);
          await customerRepository.save(
            (await import("@/features/customers/domain.js")).Customer.create({ name, isSelf }),
          );
        } else if (customer) {
          await customerService.validateUniqueName(name, customer.id);
          const updated = (await import("@/features/customers/domain.js")).Customer.fromPersistence(
            {
              id: customer.id,
              name,
              isSelf,
            },
          );
          await customerRepository.save(updated);
        }
        closeDrawer();
        renderCustomersView();
        toastState.add({ message: "Заказчик сохранён", type: "success" });
      } catch (err) {
        toastState.add({ message: err instanceof Error ? err.message : "Ошибка", type: "error" });
      }
    });
  }
}

async function deleteCustomer(id: number): Promise<void> {
  confirmDrawer("Удалить заказчика", "Заказчик будет удалён.", "Удалить", async () => {
    await customerRepository.delete(id);
    renderCustomersView();
    toastState.add({ message: "Заказчик удалён", type: "success" });
  });
}

// Auto-render when route becomes active
router.subscribe((route) => {
  if (route === "people") renderCustomersView();
});
