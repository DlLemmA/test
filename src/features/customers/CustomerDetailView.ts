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
import { ParcelItem, Parcel, Payment, paymentStateFromPayments } from "@/features/parcels/domain";
import {
  customerBalances,
  deliveryEnabled,
  emptyCustomerBalance,
} from "@/features/balances/domain";
import { nextStepLabel } from "@/features/parcels/ui/ParcelNextStatus";
import { parcelStatusInfo } from "@/features/parcels/ui/ParcelStatusInfo";
import { Customer } from "@/features/customers/domain";
import { on } from "@/core/listeners";
import { router, toastState } from "@/core/state";
import { I, esc, money } from "@/core/utils";
import {
  customerService,
  paymentServiceInstance as paymentService,
} from "@/features/shared/services";
import { customerMark } from "./ui/CustomerMark";

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

  // Balances must be calculated with ALL items of a parcel: the shipping share
  // is proportional to the customer's weight within the whole parcel.
  // Payments are scoped to a parcel too, otherwise shipping flags from
  // different parcels overwrite each other in the payment state.
  const parcelContext = (parcelId: number) => {
    const parcel = parcels.find((p) => p.id === parcelId);
    const parcelItems = allItems.filter((i) => i.parcelId === parcelId);
    const parcelPayments = customerPayments.filter((p) => p.parcelId === parcelId);
    return {
      parcel,
      parcelItems,
      paymentState: paymentStateFromPayments(parcelPayments),
    };
  };

  // Calculate overall balance across all parcels
  let totalOwed = 0;
  let totalPaid = 0;
  const selfCustomerId = selfCustomer?.id;

  for (const parcelId of itemsByParcel.keys()) {
    const { parcel, parcelItems, paymentState } = parcelContext(parcelId);
    if (!parcel) continue;
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

  const remaining = totalOwed - totalPaid;
  const isSelf = customer.isSelf;
  const balanceLabel = remaining > 0 ? (isSelf ? "Остаток" : "Долг") : "Всё оплачено";

  // Build items HTML grouped by parcel
  const itemsHtml = Array.from(itemsByParcel.entries())
    .map(([parcelId, items]) => {
      const { parcel, parcelItems, paymentState } = parcelContext(parcelId);
      if (!parcel) return "";

      const calculation = customerBalances({
        parcel,
        items: parcelItems,
        paymentState,
        selfCustomerId,
      });
      const balance = calculation.byCustomer.get(customerId) || emptyCustomerBalance();

      const itemsList = items
        .map((item) => {
          const itemPayment = customerPayments.find(
            (p) => p.type === "item" && p.itemId === item.id,
          );
          const isItemPaid = isSelf || !!itemPayment?.paid;
          const deliveryShare = calculation.deliveryByItem.get(item.id) || 0;
          const priceWithDelivery = item.totalPriceBYN + deliveryShare;

          return `
          <label class="item-check">
            <input type="checkbox" data-toggle-payment="${item.id}" data-parcel="${parcel.id}"
              ${isItemPaid ? "checked" : ""} ${isSelf ? "disabled" : ""}>
            <span class="item-check__name" title="${esc(item.name)}">${esc(item.name)}</span>
            <span class="item-check__prices">
              <span class="item-check__price">${money(priceWithDelivery)}</span>
              ${deliveryShare > 0 ? `<span class="item-check__without-delivery">без доставки ${money(item.totalPriceBYN)}</span>` : ""}
            </span>
          </label>
        `;
        })
        .join("");

      const paidItems = items.filter((item) =>
        isSelf
          ? true
          : customerPayments.some((p) => p.type === "item" && p.itemId === item.id && p.paid),
      );
      const allItemsPaid = items.length > 0 && paidItems.length === items.length;

      // Shipping payment for this parcel
      const shippingPayment = customerPayments.find(
        (p) => p.type === "shipping" && p.parcelId === parcelId,
      );
      const isShippingPaid = isSelf || !!shippingPayment?.paid;

      const showShipping = deliveryEnabled(parcel);
      const shippingShare = balance.delivery.owed;
      const parcelPaid = allItemsPaid && (!showShipping || isShippingPaid);
      const parcelLabel = parcel.name || `Посылка #${parcel.id}`;
      const date = parcelDate(parcel.shippedAt);
      const dateTitle = parcel.shippedAt ? `отправлена ${date.title}` : "не отправлена";
      const status = parcelStatusInfo(parcel.status);

      return `
        <section class="section customer-statement">
          <div class="parcel-entry parcel-line" data-status="${parcel.status}">
            <div class="parcel-entry__date" title="${dateTitle}">
              <b>${date.day}</b>
              <span>${date.month}</span>
            </div>
            <div class="parcel-entry__body min-w-0">
              <div class="parcel-entry__head">
                <b title="${esc(parcelLabel)}">${esc(parcelLabel)}</b>
                <span class="parcel-entry__state state-${status.class}">${esc(status.label)}</span>
              </div>
              <div class="parcel-entry__hint">${nextStepLabel(parcel.status)}</div>
            </div>
            <button type="button" class="btn-icon btn-primary" data-open-parcel="${parcel.id}"
              aria-label="Открыть посылку ${esc(parcelLabel)}">${I.arrowRight}</button>
          </div>

          <label class="parcel-check">
            <input type="checkbox" data-toggle-parcel="${parcel.id}"
              ${parcelPaid ? "checked" : ""} ${isSelf ? "disabled" : ""}>
            <span>Посылка оплачена</span>
          </label>

          <div class="customer-items">${itemsList}</div>

          ${
            showShipping
              ? `
            <label class="item-check">
              <input type="checkbox" data-toggle-shipping="${parcel.id}"
                ${isShippingPaid ? "checked" : ""} ${isSelf ? "disabled" : ""}>
              <span class="item-check__name" title="Доставка уже включена в цену товаров — здесь отмечается её оплата">Доставка (включена в цены)</span>
              <span class="item-check__price">${money(shippingShare)}</span>
            </label>
          `
              : ""
          }
        </section>
      `;
    })
    .join("");

  root.innerHTML = `
    <div class="page page-customer-detail">
      <div class="detail-topbar">
        <button type="button" class="text-btn" id="backToCustomers">${I.chevronLeft} Все заказчики</button>
      </div>

      <section class="detail-hero${isSelf ? " is-self" : ""}">
        ${customerMark(customer, "avatar")}
        <div class="detail-hero__body min-w-0">
          <div class="detail-hero__title-row"><h1>${esc(customer.name)}</h1></div>
          <p class="detail-hero__next">${isSelf ? "Мой профиль" : "Заказчик"}</p>
          <p class="detail-hero__facts">${customerItems.length} товар${customerItems.length === 1 ? "" : customerItems.length < 5 ? "а" : "ов"} в ${itemsByParcel.size} посылк${itemsByParcel.size === 1 ? "е" : "ах"}</p>
        </div>
      </section>

      <div class="check-list customer-summary">
        <div class="check-row"><span>Оплачено</span><b>${money(totalPaid)}</b></div>
        <div class="check-row check-row--total ${remaining > 0 ? "is-debt" : "is-paid"}">
          <span>${balanceLabel}</span><b>${money(Math.abs(remaining))}</b>
        </div>
      </div>
      ${isSelf ? '<p class="customer-note">«Я» — считаем потрачено по всем посылкам</p>' : ""}

      ${itemsByParcel.size > 0 ? itemsHtml : '<div class="empty">Товаров пока нет</div>'}
    </div>
  `;

  bindActions(root, customer, customerItems, parcels, customerPayments);
}

function bindActions(
  root: HTMLElement,
  customer: Customer,
  customerItems: ParcelItem[],
  parcels: Parcel[],
  customerPayments: Payment[],
): void {
  // Back button
  on(root.querySelector("#backToCustomers"), "click", () => {
    router.navigate("people");
  });

  // Toggle one item payment
  root.querySelectorAll<HTMLInputElement>("[data-toggle-payment]").forEach((input) => {
    on(input, "change", async () => {
      const itemId = parseInt(input.dataset.togglePayment!);
      const parcelId = parseInt(input.dataset.parcel!);

      try {
        await paymentService.setItemPaid(parcelId, itemId, customer.id, input.checked);
        toastState.add({
          message: input.checked ? "Товар отмечен как оплаченный" : "Оплата товара снята",
          type: "success",
        });
        renderCustomerDetailView(customer.id);
      } catch (err) {
        input.checked = !input.checked;
        toastState.add({ message: err instanceof Error ? err.message : "Ошибка", type: "error" });
      }
    });
  });

  // Toggle shipping payment
  root.querySelectorAll<HTMLInputElement>("[data-toggle-shipping]").forEach((input) => {
    on(input, "change", async () => {
      const parcelId = parseInt(input.dataset.toggleShipping!);

      try {
        await paymentService.setShippingPaid(parcelId, customer.id, input.checked);
        toastState.add({
          message: input.checked ? "Доставка оплачена" : "Оплата доставки снята",
          type: "success",
        });
        renderCustomerDetailView(customer.id);
      } catch (err) {
        input.checked = !input.checked;
        toastState.add({ message: err instanceof Error ? err.message : "Ошибка", type: "error" });
      }
    });
  });

  // Toggle all payments for a parcel at once
  root.querySelectorAll<HTMLInputElement>("[data-toggle-parcel]").forEach((input) => {
    const parcelId = parseInt(input.dataset.toggleParcel!);
    const parcel = parcels.find((p) => p.id === parcelId);
    if (!parcel) return;

    const parcelItems = customerItems.filter((i) => i.parcelId === parcelId);
    const paidFlags = parcelItems.map(
      (i) =>
        customer.isSelf ||
        customerPayments.some((p) => p.type === "item" && p.itemId === i.id && p.paid),
    );
    const shippingInvoiced =
      (parcel.status === "received" || parcel.status === "done") && !!parcel.shippingCostBYN;
    const shippingPaid =
      customer.isSelf ||
      customerPayments.some((p) => p.type === "shipping" && p.parcelId === parcelId && p.paid);
    const allPaid =
      parcelItems.length > 0 && paidFlags.every(Boolean) && (!shippingInvoiced || shippingPaid);
    input.indeterminate =
      !allPaid && (paidFlags.some(Boolean) || (shippingInvoiced && shippingPaid));

    on(input, "change", async () => {
      try {
        await paymentService.setParcelPayment(
          parcelId,
          customer.id,
          parcelItems.map((item) => item.id),
          input.checked,
          shippingInvoiced,
        );
        toastState.add({
          message: input.checked ? "Посылка оплачена" : "Оплата посылки снята",
          type: "success",
        });
        renderCustomerDetailView(customer.id);
      } catch (err) {
        input.checked = !input.checked;
        toastState.add({ message: err instanceof Error ? err.message : "Ошибка", type: "error" });
      }
    });
  });

  // Open the parcel itself
  root.querySelectorAll<HTMLElement>("[data-open-parcel]").forEach((btn) => {
    on(btn, "click", () => {
      router.navigate("parcel", { parcelId: btn.dataset.openParcel! });
    });
  });
}

function parcelDate(iso?: string): { day: string; month: string; title: string } {
  if (!iso) return { day: "—", month: "нет", title: "дата не задана" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: "—", month: "нет", title: iso };
  return {
    day: d.toLocaleDateString("ru-RU", { day: "2-digit" }),
    month: d.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""),
    title: d.toLocaleDateString("ru-RU"),
  };
}

// Named export for static access
export const CustomerDetailView = {
  render: renderCustomerDetailView,
};
