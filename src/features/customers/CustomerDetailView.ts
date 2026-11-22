// ============================================
// Customer Detail View Component
// Shows all items + payments for a specific customer across all parcels
// ============================================

import { customerRepository } from "./infrastructure";
import {
  parcelRepository,
  parcelItemRepository,
  paymentRepository,
} from "@/features/parcels/infrastructure";
import {
  ParcelItem,
  Parcel,
  Payment,
  calculateCustomerBalance,
  paymentStateFromPayments,
} from "@/features/parcels/domain";
import { Customer } from "@/features/customers/domain";
import { drawer, confirmDrawer, closeDrawer } from "@/core/drawer";
import { on } from "@/core/listeners";
import { router, uiState, toastState } from "@/core/state";
import { I, esc, money } from "@/core/utils";
import { customerService } from "@/features/shared/services";

export async function renderCustomerDetailView(customerId: number): Promise<void> {
  const root = document.getElementById("customerDetailView");
  if (!root) return;

  // Fetch all data
  const [customer, parcels, allItems, allPayments, selfCustomer] = await Promise.all([
    customerRepository.findById(customerId),
    parcelRepository.findAll(),
    parcelItemRepository.findAll(),
    paymentRepository.findAll(),
    customerService.getSelfCustomer(),
  ]);

  if (!customer) {
    root.innerHTML = `<div class="empty">Заказчик не найден</div>`;
    return;
  }

  // Filter items for this customer
  const customerItems = allItems.filter((item) => item.customerId === customerId);

  // Group items by parcel
  const itemsByParcel = new Map<number, ParcelItem[]>();
  for (const item of customerItems) {
    if (!itemsByParcel.has(item.parcelId)) {
      itemsByParcel.set(item.parcelId, []);
    }
    itemsByParcel.get(item.parcelId)!.push(item);
  }

  // Filter payments for this customer
  const customerPayments = allPayments.filter((p) => p.customerId === customerId);
  const paymentState = paymentStateFromPayments(customerPayments as Payment[]);

  // Calculate overall balance across all parcels
  let totalOwed = 0;
  let totalPaid = 0;
  const selfCustomerId = selfCustomer?.id;

  for (const [parcelId, items] of itemsByParcel) {
    const parcel = parcels.find((p) => p.id === parcelId);
    if (!parcel) continue;
    const balances = calculateCustomerBalance(
      items,
      [customer as any],
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

  const remaining = totalOwed - totalPaid;
  const isSelf = customer.isSelf;

  // Build items HTML grouped by parcel
  const statusLabels: Record<string, string> = {
    draft: "Черновик",
    shipped: "Отправлена",
    received: "Получена",
    done: "Готово",
  };

  const itemsHtml = Array.from(itemsByParcel.entries())
    .map(([parcelId, items]) => {
      const parcel = parcels.find((p) => p.id === parcelId);
      if (!parcel) return "";

      const balances = calculateCustomerBalance(
        items,
        [customer as any],
        parcel,
        paymentState,
        selfCustomerId,
      );
      const balance = balances.get(customerId) || { owed: 0, paid: 0, remaining: 0 };

      const itemsList = items
        .map((item) => {
          const itemPayment = customerPayments.find(
            (p) => p.type === "item" && p.itemId === item.id,
          );
          const isItemPaid = !!itemPayment?.paid;
          const paidAt = itemPayment?.paidAt ? formatDate(itemPayment.paidAt) : "";

          return `
          <div class="item flex items-center justify-between gap-3 p-2 bg-slate-50 rounded-xl" data-toggle-item="${item.id}">
            <div class="flex-1 flex items-center gap-2 min-w-0">
              <div class="font-medium truncate">${esc(item.name)}</div>
              <span class="pill pill-${item.statusClass}">${esc(item.statusLabel)}</span>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <b class="tabular-nums ${isItemPaid ? "text-emerald-700" : "text-slate-900"}">${money(item.totalPriceBYN)}</b>
              <button type="button" class="btn-primary btn-sm" data-toggle-payment="${item.id}" data-parcel="${parcel.id}" ${isItemPaid ? "disabled" : ""}>
                ${isItemPaid ? `${I.check} Оплачено` : `${I.creditcard} Оплатить`}
              </button>
            </div>
          </div>
        `;
        })
        .join("");

      // Shipping payment for this parcel
      const shippingPayment = customerPayments.find(
        (p) => p.type === "shipping" && p.parcelId === parcelId,
      );
      const isShippingPaid = !!shippingPayment?.paid;
      const shippingPaidAt = shippingPayment?.paidAt ? formatDate(shippingPayment.paidAt) : "";

      const showShipping =
        (parcel.status === "received" || parcel.status === "done") && parcel.shippingCostBYN;
      const itemTotal = items.reduce((s, i) => s + i.totalPriceBYN, 0);
      const shippingShare = showShipping ? balance.owed - itemTotal : 0;
      const itemsCount = items.length;
      const paidCount = items.filter((i) => {
        const p = customerPayments.find((pp) => pp.type === "item" && pp.itemId === i.id);
        return p?.paid;
      }).length;

      return `
        <section class="section mb-4">
          <header class="section-title with-action">
            <div class="flex items-center gap-2 flex-wrap">
              <div class="font-bold">${esc(parcel.name || `Посылка #${parcel.id}`)}</div>
              <span class="pill pill-${parcel.status === "draft" ? "warn" : parcel.status === "shipped" ? "info" : "good"}">${esc(statusLabels[parcel.status] || parcel.status)}</span>
              ${parcel.shippedAt ? `<span class="text-xs text-slate-500">отправлена ${formatDate(parcel.shippedAt)}</span>` : ""}
              ${parcel.receivedAt ? `<span class="text-xs text-slate-500">получена ${formatDate(parcel.receivedAt)}</span>` : ""}
            </div>
            <div class="text-right">
              <div class="text-sm font-medium">${money(balance.owed)}</div>
              ${balance.remaining > 0 ? `<button type="button" class="btn-primary btn-sm mt-1" data-pay-parcel="${parcel.id}" data-customer="${customerId}">${I.creditcard} Оплатить посылку</button>` : `<span class="text-xs text-emerald-600 mt-1 inline-block">${I.check} Всё оплачено</span>`}
            </div>
          </header>

          <div class="metrics-bar mb-3 px-2">
            <div class="metric-item"><b>${money(itemTotal)}</b><span>Товары (${itemsCount})</span></div>
            ${showShipping ? `<div class="metric-divider"></div><div class="metric-item"><b>${money(shippingShare)}</b><span>Доставка</span></div>` : ""}
            <div class="metric-divider"></div>
            <div class="metric-item"><b>${money(balance.owed)}</b><span>Итого</span></div>
            <div class="metric-divider"></div>
            <div class="metric-item"><b>${money(balance.paid)}</b><span>Оплачено (${paidCount}/${itemsCount})</span></div>
            <div class="metric-divider"></div>
            <div class="metric-item ${balance.remaining > 0 ? "debt" : "paid"}"><b>${money(balance.remaining)}</b><span>${balance.remaining > 0 ? "Остаток" : "Готово"}</span></div>
          </div>

          <div class="space-y-2">${itemsList}</div>
          
          ${
            showShipping
              ? `
            <div class="item flex items-center justify-between gap-3 p-2 bg-slate-50 rounded-xl border-t pt-2 mt-2">
              <div class="flex-1 flex items-center gap-2">
                <div class="font-medium">Доставка</div>
                <span class="pill pill-default">Доставка</span>
              </div>
              <div class="flex items-center gap-3 shrink-0">
                <b class="tabular-nums ${isShippingPaid ? "text-emerald-700" : "text-slate-900"}">${money(shippingShare)}</b>
                <button type="button" class="btn-primary btn-sm" data-toggle-shipping="${parcel.id}" ${isShippingPaid ? "disabled" : ""}>
                  ${isShippingPaid ? `${I.check} Оплачено` : `${I.creditcard} Оплатить`}
                </button>
              </div>
            </div>
          `
              : ""
          }
        </section>
      `;
    })
    .join("");

  // Summary card
  root.innerHTML = `
    <section class="section">
      <header class="section-title with-action">
        <div class="flex items-center gap-2">
          ${I.user} ${esc(customer.name)}${isSelf ? ` <span class="pill pill-good text-xs ml-2">Я</span>` : ""}
        </div>
        <button type="button" class="btn-icon btn-secondary" id="back-to-customers" aria-label="Назад">${I.chevronLeft}</button>
      </header>
      <p class="text-sm text-slate-500 mt-1 mb-3">${customerItems.length} товар${customerItems.length === 1 ? "" : customerItems.length < 5 ? "а" : "ов"} в ${itemsByParcel.size} посылк${itemsByParcel.size === 1 ? "е" : itemsByParcel.size < 5 ? "ах" : "ах"}</p>
      
      <div class="metrics-bar mb-4 px-2">
        <div class="metric-item"><b>${money(totalPaid)}</b><span>${isSelf ? "Потрачено" : "Оплачено"}</span></div>
        <div class="metric-divider"></div>
        <div class="metric-item ${remaining > 0 ? "debt" : "paid"}"><b>${money(Math.abs(remaining))}</b><span>${remaining > 0 ? (isSelf ? "Остаток" : "Долг") : "Всё оплачено"}</span></div>
      </div>
      ${isSelf ? `<div class="text-xs opacity-75 mt-2 text-center">"Я" — считаем потрачено (все посылки, все товары)</div>` : ""}
      
      ${
        itemsByParcel.size > 0
          ? itemsHtml
          : `
        <div class="empty text-center py-8">
          ${I.inbox}<br>
          <span class="text-slate-500">Товаров пока нет</span>
        </div>
      `
      }
    </section>
  `;

  bindActions(customer, customerItems, parcels, customerPayments);
}

function bindActions(
  customer: Customer,
  customerItems: ParcelItem[],
  parcels: Parcel[],
  customerPayments: Payment[],
): void {
  // Back button
  const backBtn = document.getElementById("back-to-customers");
  if (backBtn) {
    on(backBtn, "click", () => {
      router.navigate("people");
    });
  }

  // Toggle item payment
  document.querySelectorAll<HTMLElement>("[data-toggle-payment]").forEach((btn) => {
    on(btn, "click", async () => {
      const itemId = parseInt(btn.dataset.togglePayment!);
      const parcelId = parseInt(btn.dataset.parcel!);
      const item = customerItems.find((i) => i.id === itemId);
      if (!item) return;

      const existing = customerPayments.find((p) => p.type === "item" && p.itemId === itemId);
      const newPaid = !existing?.paid;

      try {
        const { paymentServiceInstance } = await import("@/features/shared/services");
        await paymentServiceInstance.setItemPaid(parcelId, itemId, customer.id, newPaid);
        toastState.add({
          message: newPaid ? "Товар отмечен как оплаченный" : "Оплата товара снята",
          type: "success",
        });
        renderCustomerDetailView(customer.id);
      } catch (err) {
        toastState.add({ message: err instanceof Error ? err.message : "Ошибка", type: "error" });
      }
    });
  });

  // Toggle shipping payment
  document.querySelectorAll<HTMLElement>("[data-toggle-shipping]").forEach((btn) => {
    on(btn, "click", async () => {
      const parcelId = parseInt(btn.dataset.toggleShipping!);
      const parcel = parcels.find((p) => p.id === parcelId);
      if (!parcel) return;

      const shippingPayment = customerPayments.find(
        (p) => p.type === "shipping" && p.parcelId === parcelId,
      );
      const newPaid = !shippingPayment?.paid;

      try {
        const { paymentServiceInstance } = await import("@/features/shared/services");
        await paymentServiceInstance.setShippingPaid(parcelId, customer.id, newPaid);
        toastState.add({
          message: newPaid ? "Доставка оплачена" : "Оплата доставки снята",
          type: "success",
        });
        renderCustomerDetailView(customer.id);
      } catch (err) {
        toastState.add({ message: err instanceof Error ? err.message : "Ошибка", type: "error" });
      }
    });
  });

  // Pay parcel (all items + shipping)
  document.querySelectorAll<HTMLElement>("[data-pay-parcel]").forEach((btn) => {
    on(btn, "click", async () => {
      const parcelId = parseInt(btn.dataset.payParcel!);
      const customerId = parseInt(btn.dataset.customer!);
      const parcel = parcels.find((p) => p.id === parcelId);
      if (!parcel) return;

      try {
        const { paymentServiceInstance } = await import("@/features/shared/services");

        // Get all items in this parcel for this customer
        const parcelItems = customerItems.filter((i) => i.parcelId === parcelId);

        // Pay all unpaid items
        for (const item of parcelItems) {
          const itemPayment = customerPayments.find(
            (p) => p.type === "item" && p.itemId === item.id,
          );
          if (!itemPayment?.paid) {
            await paymentServiceInstance.setItemPaid(parcelId, item.id, customerId, true);
          }
        }

        // Pay shipping if not paid
        const shippingPayment = customerPayments.find(
          (p) => p.type === "shipping" && p.parcelId === parcelId,
        );
        if (!shippingPayment?.paid && parcel.shippingCostBYN) {
          await paymentServiceInstance.setShippingPaid(parcelId, customerId, true);
        }

        toastState.add({ message: "Посылка оплачена", type: "success" });
        renderCustomerDetailView(customer.id);
      } catch (err) {
        toastState.add({ message: err instanceof Error ? err.message : "Ошибка", type: "error" });
      }
    });
  });
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// Named export for static access
export const CustomerDetailView = {
  render: renderCustomerDetailView,
};
