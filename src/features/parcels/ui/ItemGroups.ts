import { I, esc, kg, money, t } from "@/core/utils";
import type { Customer } from "@/features/customers/domain";
import { customerMark } from "@/features/customers/ui/CustomerMark";
import { itemShippingShare, type Parcel, type ParcelItem, type PaymentState } from "../domain";
import { parcelItemStatusInfo } from "./ParcelStatusInfo";

const ITEMS_FORMS = "нет товаров | {count} товар | {count} товара | {count} товаров";
const TRACKS_FORMS = "треков | трек | трека | треков";

export type CustomerBalance = { owed: number; paid: number; remaining: number };

export type ItemGroupsSearchResult = {
  visible: number;
  total: number;
  queryLength: number;
  missingOnly: boolean;
};

export function filledTracks(item: ParcelItem): number {
  return item.trackNumbers.filter((track) => track.trim() !== "").length;
}

export function itemsWithoutTracks(items: ParcelItem[]): number {
  return items.filter((item) => filledTracks(item) === 0).length;
}

function renderCustomerGroup(
  customer: Customer | undefined,
  customerItems: ParcelItem[],
  parcel: Parcel,
  balance: CustomerBalance,
  paymentState: PaymentState,
): string {
  const customerId = customer?.id ?? 0;
  const isSelf = customer?.isSelf || false;
  const name = customer?.name || "Без заказчика";
  const weight = customerItems.reduce(
    (sum, item) => sum + item.weightsG.reduce((a, b) => a + b, 0),
    0,
  );
  const itemTotal = customerItems.reduce((sum, item) => sum + item.totalPriceBYN, 0);
  const shippingShare = balance.owed - itemTotal;
  const goodsPaid = isSelf || customerItems.every((i) => paymentState.itemPaid.get(i.id));
  const deliveryPaid = isSelf || paymentState.shippingPaid.get(customerId) || false;
  const canToggleGoods = !isSelf && parcel.status !== "draft";
  const canPayShipping = !isSelf && parcel.status === "done" && !!parcel.shippingCostBYN;

  return `
    <summary class="parcel-entry item-group__head settle-entry" data-status="${parcel.status}">
      ${customerMark(customer, "box")}
      <div class="parcel-entry__body min-w-0">
        <div class="parcel-entry__head">
          <b title="${esc(name)}">${esc(name)}${isSelf ? " (я)" : ""}<span class="item-group__chevron" aria-hidden="true">›</span></b>
          <span class="parcel-entry__state ${balance.remaining > 0 ? "state-warn" : "state-good"}">
            ${balance.remaining > 0 ? `Остаток ${money(balance.remaining)}` : "Оплачено"}
          </span>
        </div>
        <div class="parcel-entry__hint">
          ${t(ITEMS_FORMS, customerItems.length)} · ${weight > 0 ? `${kg(weight)} кг` : "вес —"} · товары ${money(itemTotal)} · доставка ${money(shippingShare)} · <span class="settle-entry__total">итого ${money(balance.owed)}</span>
        </div>
        <div class="settle-entry__checks">
          <label class="payment-bullet ${goodsPaid ? "is-paid" : ""} ${canToggleGoods ? "" : "is-locked"}">
            <input type="checkbox" class="item-paid-all" data-customer="${customerId}" ${goodsPaid ? "checked" : ""} ${canToggleGoods ? "" : "disabled"}>
            <span>Товары: ${goodsPaid ? "оплачено" : "не оплачено"}</span>
          </label>
          ${
            parcel.shippingCostBYN
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
  parcelItems: ParcelItem[],
  parcel: Parcel,
  customer: Customer | undefined,
  paymentState: PaymentState,
  position: number,
): string {
  const isDraft = parcel.status === "draft";
  const status = parcelItemStatusInfo(item.status);
  const filled = filledTracks(item);
  const needed = Math.max(item.quantity, item.trackNumbers.length);
  const noTracks = filled === 0;
  const tracksReady = filled >= needed;
  const trackBadge =
    isDraft && item.status !== "lost"
      ? `<span class="parcel-entry__state ${
          !tracksReady ? "state-warn" : item.tracksCompleted ? "state-good" : "state-info"
        }" title="${
          !tracksReady
            ? "Заполните трек-номера"
            : item.tracksCompleted
              ? "Треки готовы"
              : "Отметьте «Треки заполнены» в карточке товара"
        }">${
          noTracks
            ? "Нет треков"
            : item.tracksCompleted
              ? "Треки готовы"
              : `${filled}/${needed} ${t(TRACKS_FORMS, filled)}`
        }</span>`
      : `<span class="parcel-entry__state state-${status.class}">${esc(status.label)}</span>`;
  const isSelf = customer?.isSelf || false;
  const itemPaid = isSelf || paymentState?.itemPaid.get(item.id) || false;
  const deliveryShare = itemShippingShare(item, parcelItems, parcel);
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
    ? ` · ${item.trackNumbers.length} трек${item.trackNumbers.length === 1 ? "" : item.trackNumbers.length < 5 ? "а" : "ов"}`
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
          ${esc(customer?.name || "Без заказчика")}${customer?.isSelf ? " (я)" : ""} · ${item.quantity} ${item.unitLabel}${trackCountNote} · <span class="item-entry__price ${itemPaid ? "is-paid" : ""}">${money(item.totalPriceBYN + deliveryShare)}</span>${deliveryShare > 0 ? ` <span class="item-entry__without-delivery">без доставки ${money(item.totalPriceBYN)}</span>` : ""}
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
  paymentState: PaymentState,
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
  const zeroBalance: CustomerBalance = { owed: 0, paid: 0, remaining: 0 };
  return Array.from(groups.entries())
    .map(([customerId, groupItems]) => {
      return `
        <details class="item-group" data-item-group data-customer="${customerId}"${openCustomerGroups.has(customerId) ? " open" : ""}>
          ${renderCustomerGroup(
            customerMap.get(customerId),
            groupItems,
            parcel,
            balances.get(customerId) || zeroBalance,
            paymentState,
          )}
          <div class="item-group__items">
            ${groupItems
              .map((item) =>
                itemHtml(
                  item,
                  items,
                  parcel,
                  customerMap.get(item.customerId),
                  paymentState,
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
  if (queryLength === 0) return `${t(ITEMS_FORMS, visible)} без треков из ${total}`;
  return visible === 1 ? `Найден 1 из ${total}` : `Найдено ${visible} из ${total}`;
}
