// ============================================
// Item groups: pure presentation facts shared by the detail screen.
// The Vue view owns the markup; this module owns grouping, search matching
// and the user-facing count copy.
// ============================================

import { t } from "@/core/utils";
import type { Customer } from "@/features/customers/domain";
import { customerLabel } from "@/features/customers/ui/CustomerPresentation";
import type { Parcel, ParcelItem } from "../domain";
import { parcelItemStatusInfo } from "./ParcelStatusInfo";
import { FOUND_FORMS, ITEM_BARE_FORMS } from "./ParcelPresentation";

export type ItemGroupsSearchResult = {
  visible: number;
  total: number;
  queryLength: number;
  missingOnly: boolean;
};

export interface ItemRowView {
  item: ParcelItem;
  position: number;
  searchText: string;
  /** Draft item whose "Треки заполнены" checkbox is still unchecked. */
  needsTrackConfirmation: boolean;
}

export interface ItemGroupView {
  customerId: number;
  customer?: Customer;
  name: string;
  label: string;
  rows: ItemRowView[];
  visibleRows: ItemRowView[];
}

export interface ItemGroupsView {
  groups: ItemGroupView[];
  result: ItemGroupsSearchResult;
}

export function buildItemGroups(
  items: ParcelItem[],
  customers: Customer[],
  parcelStatus: Parcel["status"],
  query: string,
  missingOnly: boolean,
): ItemGroupsView {
  const tokens = query.trim().toLocaleLowerCase("ru-RU").split(/\s+/).filter(Boolean);
  const searching = tokens.length > 0 || missingOnly;
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const grouped = new Map<number, ParcelItem[]>();

  for (const item of items) {
    const groupItems = grouped.get(item.customerId) ?? [];
    groupItems.push(item);
    grouped.set(item.customerId, groupItems);
  }

  let position = 0;
  let visible = 0;
  const groups: ItemGroupView[] = [];

  for (const [customerId, groupItems] of grouped) {
    const customer = customerMap.get(customerId);
    const name = customer?.name || "Без заказчика";
    const rows = groupItems.map((item) => {
      const status = parcelItemStatusInfo(item.status);
      const searchText = [
        item.name,
        name,
        customer?.isSelf ? "я" : "",
        status.label,
        ...item.trackNumbers,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ru-RU");
      return {
        item,
        position: position++,
        searchText,
        needsTrackConfirmation: parcelStatus === "draft" && !item.tracksCompleted,
      };
    });
    const visibleRows = rows.filter(
      (row) =>
        tokens.every((token) => row.searchText.includes(token)) &&
        (!missingOnly || row.needsTrackConfirmation),
    );
    if (searching && visibleRows.length === 0) continue;
    visible += visibleRows.length;
    groups.push({
      customerId,
      customer,
      name,
      label: customerLabel({ name, isSelf: customer?.isSelf || false }),
      rows,
      visibleRows,
    });
  }

  return {
    groups,
    result: { visible, total: items.length, queryLength: tokens.length, missingOnly },
  };
}

export function itemSearchCountText(result: ItemGroupsSearchResult): string {
  const { visible, total, queryLength, missingOnly } = result;
  if (queryLength === 0 && !missingOnly) return "";
  if (queryLength === 0) return `${t(ITEM_BARE_FORMS, visible)} без треков из ${total}`;
  return `${t(FOUND_FORMS, visible)} ${visible} из ${total}`;
}
