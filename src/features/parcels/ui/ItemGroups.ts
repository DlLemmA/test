// ============================================
// Item groups: pure presentation facts shared by the detail screen.
// The Vue view owns the markup; this module owns grouping, search matching
// and the user-facing count copy.
// ============================================

import { t } from "@/core/utils";
import type { Customer } from "@/features/customers/domain";
import { customerLabel } from "@/features/customers/ui/CustomerPresentation";
import {
  itemsWithMissingWeights,
  itemsWithUnconfirmedTracks,
  type Parcel,
  type ParcelItem,
} from "../domain";
import { parcelItemStatusInfo } from "./ParcelStatusInfo";
import { FOUND_FORMS, ITEM_BARE_FORMS } from "./ParcelPresentation";

/** Which "missing facts" pill is active; null means only the text query applies. */
export type MissingFilter = "tracks" | "weights" | null;

export type ItemGroupsSearchResult = {
  visible: number;
  total: number;
  queryLength: number;
  filter: MissingFilter;
};

export interface ItemRowView {
  item: ParcelItem;
  position: number;
  searchText: string;
  /** Draft item whose "Треки заполнены" checkbox is still unchecked. */
  needsTrackConfirmation: boolean;
  /** Received tracked item whose weights do not allow finishing yet. */
  needsWeight: boolean;
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
  filter: MissingFilter = null,
): ItemGroupsView {
  const tokens = query.trim().toLocaleLowerCase("ru-RU").split(/\s+/).filter(Boolean);
  const searching = tokens.length > 0 || filter !== null;
  const unconfirmedIds = new Set(itemsWithUnconfirmedTracks(items).map((item) => item.id));
  const missingWeightIds = new Set(itemsWithMissingWeights(items).map((item) => item.id));
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
        needsTrackConfirmation: parcelStatus === "draft" && unconfirmedIds.has(item.id),
        needsWeight: parcelStatus === "received" && missingWeightIds.has(item.id),
      };
    });
    const visibleRows = rows.filter((row) => {
      if (!tokens.every((token) => row.searchText.includes(token))) return false;
      if (filter === "tracks") return row.needsTrackConfirmation;
      if (filter === "weights") return row.needsWeight;
      return true;
    });
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
    result: { visible, total: items.length, queryLength: tokens.length, filter },
  };
}

export function itemSearchCountText(result: ItemGroupsSearchResult): string {
  const { visible, total, queryLength, filter } = result;
  if (queryLength === 0 && filter === null) return "";
  if (queryLength === 0) {
    const missing = filter === "weights" ? "веса" : "треков";
    return `${t(ITEM_BARE_FORMS, visible)} без ${missing} из ${total}`;
  }
  return `${t(FOUND_FORMS, visible)} ${visible} из ${total}`;
}
