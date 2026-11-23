import { I, esc, kg, money, t } from "@/core/utils";
import type { Customer } from "@/features/customers/domain";
import { customerLabel } from "@/features/customers/ui/CustomerPresentation";
import { customerMark } from "@/features/customers/ui/CustomerMark";
import { itemTrackState, type Parcel, type ParcelItem } from "../domain";
import { emptyCustomerBalance, type CustomerBalance } from "@/features/balances/domain";
import { canPayDelivery, type SettlementFacts } from "@/features/settlement/domain";
import { parcelItemStatusInfo } from "./ParcelStatusInfo";
import { itemTrackBadge } from "./ReadinessCopy";
import {
  FOUND_FORMS,
  ITEM_BARE_FORMS,
  ITEM_FORMS,
  TRACK_FORMS,
  unitLabel,
} from "./ParcelPresentation";

export type ItemGroupsSearchResult = {
  visible: number;
  total: number;
  queryLength: number;
  missingOnly: boolean;
};

function renderCustomerGroup(
  customer: Customer | undefined,
  customerItems: ParcelItem[],
  parcel: Parcel,
  balance: CustomerBalance,
  settlement: SettlementFacts,
): string {
  const customerId = customer?.id ?? 0;
  const isSelf = customer?.isSelf || false;
  const name = customer?.name || "Без заказчика";
  const label = customerLabel({ name, isSelf });
  const weight = customerItems.reduce(
    (sum, item) => sum + item.weightsG.reduce((a, b) => a + b, 0),
    0,
  );
  const itemTotal = customerItems.reduce((sum, item) => sum + item.totalPriceBYN, 0);
  const shippingShare = balance.delivery.owed;
  const goodsPaid = customerItems.every((i) => settlement.paidItems.has(i.id));
  const deliveryPaid = settlement.paidDelivery.has(customerId);
  const canToggleGoods = !isSelf && parcel.status !== "draft";
  const canPayShipping = canPayDelivery(parcel, isSelf);

  return `
    <summary class="parcel-entry item-group__head settle-entry" data-status="${parcel.status}">
      ${customerMark(customer, "box")}
      <div class="parcel-entry__body min-w-0">
        <div class="parcel-entry__head">
          <b title="${esc(name)}">${esc(label)}<span class="item-group__chevron" aria-hidden="true">›</span></b>
          <span class="parcel-entry__state ${balance.remaining > 0 ? "state-warn" : "state-good"}">
            ${balance.remaining > 0 ? `Остаток ${money(balance.remaining)}` : "Оплачено"}
          </span>
        </div>
        <div class="parcel-entry__hint">
          ${t(ITEM_FORMS, customerItems.length)} · ${weight > 0 ? `${kg(weight)} кг` : "вес —"} · товары ${money(itemTotal)} · доставка ${money(shippingShare)} · <span class="settle-entry__total">итого ${money(balance.owed)}</span>
        </div>
        <div class="settle-entry__checks">
          <label class="payment-bullet ${goodsPaid ? "is-paid" : ""} ${canToggleGoods ? "" : "is-locked"}">
            <input type="checkbox" class="item-paid-all" data-customer="${customerId}" ${goodsPaid ? "checked" : ""} ${canToggleGoods ? "" : "disabled"}>
            <span>Товары: ${goodsPaid ? "оплачено" : "не оплачено"}</span>
          </label>
          ${
            settlement.deliveryInvoiced
              ? `<label class="payment-bullet ${deliveryPaid ? "is-paid" : ""} ${canPayShipping ? "" : "is-locked"}">
                  <input type="checkbox" class="shipping-paid" data-customer="${customerId}" ${deliveryPaid ? "checked" : ""} ${canPayShipping ? "" : "disabled"}>
                  <span>Доставка: ${deliveryPaid ? "оплачено" : "не оплачено"}</span>
                </label>`
              : '<span class="payment-bullet is-locked">Доставка: —</span>'
          }
        </div>
      </div>
    </summary>
  `;
}

function itemHtml(
  item: ParcelItem,
  deliveryByItem: Map<number, number>,
  parcel: Parcel,
  customer: Customer | undefined,
  settlement: SettlementFacts,
  position: number,
): string {
  const isDraft = parcel.status === "draft";
  const status = parcelItemStatusInfo(item.status);
  const track = itemTrackState(item);
  const noTracks = track.state === "none";
  const badge =
    isDraft && item.status !== "lost"
      ? itemTrackBadge(track)
      : { label: status.label, class: status.class, title: "" };
  const trackBadge = `<span class="parcel-entry__state state-${badge.class}" title="${badge.title}">${esc(badge.label)}</span>`;
  const isSelf = customer?.isSelf || false;
  const ownerName = customer?.name || "Без заказчика";
  const label = customerLabel({ name: ownerName, isSelf });
  const itemPaid = settlement.paidItems.has(item.id);
  const deliveryShare = deliveryByItem.get(item.id) || 0;
  const showWeights = parcel.status === "received" || parcel.status === "done";
  const trackLines =
    item.trackNumbers
      .map((track, idx) => {
        const weight = item.weightsG[idx] || 0;
        return `
          <div class="track-value-row">
            <span class="track-index" aria-hidden="true">${idx + 1}</span>
            <span class="track-code">${track ? esc(track) : "—"}</span>
            ${showWeights ? `<span class="track-weight">${weight > 0 ? `${weight} г` : "вес не задан"}</span>` : ""}
          </div>
        `;
      })
      .join("") || (isDraft ? '<div class="item-entry__no-tracks">Треков пока нет</div>' : "");

  const trackCountNote = item.trackNumbers.length
    ? ` · ${t(TRACK_FORMS, item.trackNumbers.length)}`
    : "";
  const trackControls = isDraft
    ? `<div class="item-entry__track-controls">
        <button type="button" class="text-btn" data-add-track="${item.id}">${I.plus} Добавить трек</button>
      </div>`
    : "";

  const canEdit = parcel.status !== "done";
  const itemEditBtn = canEdit
    ? `<button type="button" class="btn-icon btn-primary" data-edit="${item.id}"><span class="sr-only">Изменить товар «${esc(item.name)}»</span>${I.pencil}</button>`
    : "";
  const paymentBtn =
    parcel.status === "shipped" || parcel.status === "received" || parcel.status === "done"
      ? `<button type="button" class="${itemPaid ? "is-paid" : ""}" data-toggle-payment="${item.id}" ${itemPaid ? "disabled" : ""}
          aria-label="${itemPaid ? "Оплачено" : "Оплатить"} товар «${esc(item.name)}»">
          ${itemPaid ? I.check : I.creditcard} ${itemPaid ? "Оплачено" : "Оплатить"}
        </button>`
      : "";
  const itemMenu = canEdit
    ? `<details class="entry-menu">
        <summary title="Действия с товаром «${esc(item.name)}»"><span class="sr-only">Действия с товаром «${esc(item.name)}»</span><span aria-hidden="true">···</span></summary>
        <div class="entry-menu__list">
          ${paymentBtn}
          ${isDraft ? `<button type="button" data-move="${item.id}" aria-label="Переместить товар «${esc(item.name)}»">${I.arrowRight} Переместить</button>` : ""}
          <button type="button" class="is-danger" data-delete="${item.id}" aria-label="Удалить товар «${esc(item.name)}»">${I.trash} Удалить</button>
        </div>
      </details>`
    : "";

  const searchText = [
    item.name,
    customer?.name || "Без заказчика",
    customer?.isSelf ? "я" : "",
    status.label,
    ...item.trackNumbers,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("ru-RU");

  return `
    <div class="item parcel-entry item-entry${isDraft && noTracks ? " is-missing-tracks" : ""}"
      data-status="${item.status}" data-search="${esc(searchText)}" data-needs-tracks="${isDraft && noTracks}">
      <div class="item-entry__index" aria-hidden="true">
        <b>${String(position + 1).padStart(2, "0")}</b>
        <span>поз.</span>
      </div>
      <div class="parcel-entry__body min-w-0">
        <div class="parcel-entry__head">
          <b title="${esc(item.name)}">${esc(item.name)}</b>
          ${trackBadge}
        </div>
        <div class="parcel-entry__hint">
          ${esc(label)} · ${item.quantity} ${unitLabel(item.unit)}${trackCountNote} · <span class="item-entry__price ${itemPaid ? "is-paid" : ""}">${money(item.totalPriceBYN + deliveryShare)}</span>${deliveryShare > 0 ? ` <span class="item-entry__without-delivery">без доставки ${money(item.totalPriceBYN)}</span>` : ""}
        </div>
        <div class="item-row__tracks">${trackLines}</div>
        ${trackControls}
      </div>
      <div class="parcel-entry__actions">
        ${itemEditBtn}
        ${itemMenu}
      </div>
    </div>
  `;
}

export function renderItemGroups(
  items: ParcelItem[],
  parcel: Parcel,
  customers: Customer[],
  balances: Map<number, CustomerBalance>,
  deliveryByItem: Map<number, number>,
  settlement: SettlementFacts,
  openCustomerGroups: ReadonlySet<number>,
): string {
  if (items.length === 0) return '<div class="empty">Нет товаров</div>';

  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const groups = new Map<number, ParcelItem[]>();
  for (const item of items) {
    const groupItems = groups.get(item.customerId) || [];
    groupItems.push(item);
    groups.set(item.customerId, groupItems);
  }

  // Positions follow the rendered order, not the original array indices.
  let position = 0;
  const zeroBalance = emptyCustomerBalance();
  return Array.from(groups.entries())
    .map(([customerId, groupItems]) => {
      return `
        <details class="item-group" data-item-group data-customer="${customerId}"${openCustomerGroups.has(customerId) ? " open" : ""}>
          ${renderCustomerGroup(
            customerMap.get(customerId),
            groupItems,
            parcel,
            balances.get(customerId) || zeroBalance,
            settlement,
          )}
          <div class="item-group__items">
            ${groupItems
              .map((item) =>
                itemHtml(
                  item,
                  deliveryByItem,
                  parcel,
                  customerMap.get(item.customerId),
                  settlement,
                  position++,
                ),
              )
              .join("")}
          </div>
        </details>
      `;
    })
    .join("");
}

export function applyItemGroupsSearch(
  list: HTMLElement,
  query: string,
  missingOnly: boolean,
): ItemGroupsSearchResult {
  const tokens = query.trim().toLocaleLowerCase("ru-RU").split(/\s+/).filter(Boolean);
  const groups = Array.from(list.querySelectorAll<HTMLDetailsElement>("details[data-item-group]"));
  const rows = Array.from(list.querySelectorAll<HTMLElement>(".item-entry[data-search]"));
  let visible = 0;

  for (const group of groups) {
    let inGroup = 0;
    for (const row of group.querySelectorAll<HTMLElement>(".item-entry[data-search]")) {
      const haystack = (row.dataset.search || "").toLocaleLowerCase("ru-RU");
      const matches =
        tokens.every((token) => haystack.includes(token)) &&
        (!missingOnly || row.dataset.needsTracks === "true");
      row.hidden = !matches;
      if (matches) inGroup += 1;
    }
    // A customer stays visible when at least one of their items matches.
    group.hidden = (tokens.length > 0 || missingOnly) && inGroup === 0;
    if (inGroup > 0 && (tokens.length > 0 || missingOnly)) group.open = true;
    visible += inGroup;
  }

  return { visible, total: rows.length, queryLength: tokens.length, missingOnly };
}

export function itemSearchCountText(result: ItemGroupsSearchResult): string {
  const { visible, total, queryLength, missingOnly } = result;
  if (queryLength === 0 && !missingOnly) return "";
  if (queryLength === 0) return `${t(ITEM_BARE_FORMS, visible)} без треков из ${total}`;
  return `${t(FOUND_FORMS, visible)} ${visible} из ${total}`;
}
