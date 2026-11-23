// ============================================
// Customer Detail View Component
// Shows all items + payments for a specific customer across all parcels
// ============================================

import { deliveryEnabled, emptyCustomerBalance } from "@/features/balances/domain";
import { getCustomerStatement, type CustomerStatement } from "@/features/statements/service";
import { nextStepLabel } from "@/features/parcels/ui/ParcelNextStatus";
import { parcelStatusInfo } from "@/features/parcels/ui/ParcelStatusInfo";
import { createListenerScope } from "@/core/listeners";
import type { ListenerScope } from "@/core/listeners";
import { router, toastState } from "@/core/state";
import type { RouteParams } from "@/core/state";
import type { ViewHandle } from "@/app/ViewHandle";
import { I, esc, money, t } from "@/core/utils";
import { ITEM_FORMS, PARCEL_IN_FORMS, parcelDate } from "@/features/parcels/ui/ParcelPresentation";
import { paymentService } from "@/features/shared/wiring";
import { customerLabel } from "./ui/CustomerPresentation";
import { customerMark } from "./ui/CustomerMark";

export function mountCustomerDetailView(host: HTMLElement): ViewHandle {
  const scope = createListenerScope();

  async function render(params: RouteParams): Promise<void> {
    if (scope.signal.aborted) return;
    const customerId = Number(params.customerId);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      router.navigate("people");
      return;
    }

    const statement = await getCustomerStatement(customerId);
    if (!statement) {
      host.innerHTML = `<div class="empty">Заказчик не найден</div>`;
      return;
    }

    const { customer, items: customerItems, parcels: parcelStatements, balance } = statement;
    const totalPaid = balance.paid;
    const remaining = balance.remaining;
    const isSelf = customer.isSelf;
    const balanceLabel = remaining > 0 ? (isSelf ? "Остаток" : "Долг") : "Всё оплачено";

    // Build items HTML grouped by parcel
    const itemsHtml = parcelStatements
      .map(({ parcel, items, balance: calculation, paymentState }) => {
        const customerBalance = calculation.byCustomer.get(customerId) || emptyCustomerBalance();

        const itemsList = items
          .map((item) => {
            const isItemPaid = isSelf || !!paymentState.itemPaid.get(item.id);
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

        const paidItems = items.filter((item) => isSelf || !!paymentState.itemPaid.get(item.id));
        const allItemsPaid = items.length > 0 && paidItems.length === items.length;

        const isShippingPaid = isSelf || !!paymentState.shippingPaid.get(customerId);

        const showShipping = deliveryEnabled(parcel);
        const shippingShare = customerBalance.delivery.owed;
        const parcelPaid = allItemsPaid && (!showShipping || isShippingPaid);
        const parcelLabel = parcel.name || `Посылка #${parcel.id}`;
        const date = parcelDate(parcel);
        const status = parcelStatusInfo(parcel.status);

        return `
        <section class="section customer-statement">
          <div class="parcel-entry parcel-line" data-status="${parcel.status}">
            <div class="parcel-entry__date" title="${date.title}">
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

    host.innerHTML = `
    <div class="page page-customer-detail">
      <div class="detail-topbar">
        <button type="button" class="text-btn" id="backToCustomers">${I.chevronLeft} Все заказчики</button>
      </div>

      <section class="detail-hero${isSelf ? " is-self" : ""}">
        ${customerMark(customer, "avatar")}
        <div class="detail-hero__body min-w-0">
          <div class="detail-hero__title-row"><h1>${esc(customerLabel(customer))}</h1></div>
          <p class="detail-hero__next">${isSelf ? "Мой профиль" : "Заказчик"}</p>
          <p class="detail-hero__facts">${t(ITEM_FORMS, customerItems.length)} в ${t(PARCEL_IN_FORMS, parcelStatements.length)}</p>
        </div>
      </section>

      <div class="check-list customer-summary">
        <div class="check-row"><span>Оплачено</span><b>${money(totalPaid)}</b></div>
        <div class="check-row check-row--total ${remaining > 0 ? "is-debt" : "is-paid"}">
          <span>${balanceLabel}</span><b>${money(Math.abs(remaining))}</b>
        </div>
      </div>
      ${isSelf ? '<p class="customer-note">«Я» — считаем потрачено по всем посылкам</p>' : ""}

      ${parcelStatements.length > 0 ? itemsHtml : '<div class="empty">Товаров пока нет</div>'}
    </div>
  `;

    bindActions(host, scope, statement, () => void render(params));
  }

  return { render, dispose: () => scope.dispose() };
}

function bindActions(
  root: HTMLElement,
  scope: ListenerScope,
  statement: CustomerStatement,
  refresh: () => void,
): void {
  const { customer, items: customerItems, parcels } = statement;
  // Back button
  scope.on(root.querySelector("#backToCustomers"), "click", () => {
    router.navigate("people");
  });

  // Toggle one item payment
  root.querySelectorAll<HTMLInputElement>("[data-toggle-payment]").forEach((input) => {
    scope.on(input, "change", async () => {
      const itemId = parseInt(input.dataset.togglePayment!);
      const parcelId = parseInt(input.dataset.parcel!);

      try {
        await paymentService.setItemPaid(parcelId, itemId, customer.id, input.checked);
        toastState.add({
          message: input.checked ? "Товар отмечен как оплаченный" : "Оплата товара снята",
          type: "success",
        });
        refresh();
      } catch (err) {
        input.checked = !input.checked;
        toastState.add({ message: err instanceof Error ? err.message : "Ошибка", type: "error" });
      }
    });
  });

  // Toggle shipping payment
  root.querySelectorAll<HTMLInputElement>("[data-toggle-shipping]").forEach((input) => {
    scope.on(input, "change", async () => {
      const parcelId = parseInt(input.dataset.toggleShipping!);

      try {
        await paymentService.setShippingPaid(parcelId, customer.id, input.checked);
        toastState.add({
          message: input.checked ? "Доставка оплачена" : "Оплата доставки снята",
          type: "success",
        });
        refresh();
      } catch (err) {
        input.checked = !input.checked;
        toastState.add({ message: err instanceof Error ? err.message : "Ошибка", type: "error" });
      }
    });
  });

  // Toggle all payments for a parcel at once
  root.querySelectorAll<HTMLInputElement>("[data-toggle-parcel]").forEach((input) => {
    const parcelId = parseInt(input.dataset.toggleParcel!);
    const entry = parcels.find((candidate) => candidate.parcel.id === parcelId);
    if (!entry) return;
    const parcel = entry.parcel;

    const parcelItems = customerItems.filter((i) => i.parcelId === parcelId);
    const paidFlags = parcelItems.map(
      (i) => customer.isSelf || !!entry.paymentState.itemPaid.get(i.id),
    );
    const shippingInvoiced =
      (parcel.status === "received" || parcel.status === "done") && !!parcel.shippingCostBYN;
    const shippingPaid = customer.isSelf || !!entry.paymentState.shippingPaid.get(customer.id);
    const allPaid =
      parcelItems.length > 0 && paidFlags.every(Boolean) && (!shippingInvoiced || shippingPaid);
    input.indeterminate =
      !allPaid && (paidFlags.some(Boolean) || (shippingInvoiced && shippingPaid));

    scope.on(input, "change", async () => {
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
        refresh();
      } catch (err) {
        input.checked = !input.checked;
        toastState.add({ message: err instanceof Error ? err.message : "Ошибка", type: "error" });
      }
    });
  });

  // Open the parcel itself
  root.querySelectorAll<HTMLElement>("[data-open-parcel]").forEach((btn) => {
    scope.on(btn, "click", () => {
      router.navigate("parcel", { parcelId: btn.dataset.openParcel! });
    });
  });
}
