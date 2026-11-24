// ============================================
// The only place that knows the Supabase column names. Domain/storage row
// shapes live in dbSchema; everything above this layer uses camelCase rows.
// ============================================

import type {
  CustomerRow,
  ParcelItemRow,
  ParcelRow,
  PaymentRow,
  ParcelItemStatus,
  ParcelStatus,
  PaymentType,
  Unit,
} from "./dbSchema";
import type { Database } from "./supabase.types";

type TableName = keyof Database["public"]["Tables"];
type CloudRow<T extends TableName> = Database["public"]["Tables"][T]["Row"];
type CloudInsert<T extends TableName> = Database["public"]["Tables"][T]["Insert"];

type WithUpdatedAt<T> = T & { updatedAt: string };

export type CachedCustomerRow = WithUpdatedAt<CustomerRow & { id: number }>;
export type CachedParcelRow = WithUpdatedAt<ParcelRow & { id: number }>;
export type CachedParcelItemRow = WithUpdatedAt<ParcelItemRow & { id: number }>;
export type CachedPaymentRow = WithUpdatedAt<PaymentRow & { id: number }>;

export interface CachedSnapshot {
  customers: CachedCustomerRow[];
  parcels: CachedParcelRow[];
  parcelItems: CachedParcelItemRow[];
  payments: CachedPaymentRow[];
}

export type CachedTable = keyof CachedSnapshot;
export type CachedRow =
  | CachedCustomerRow
  | CachedParcelRow
  | CachedParcelItemRow
  | CachedPaymentRow;

function optionalNumber(value: number | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}

function requiredNumber(value: number | string): number {
  return Number(value);
}

function withId(row: { id?: number }): { id?: number } {
  return row.id && row.id > 0 ? { id: row.id } : {};
}

// ---- customers ----

export function fromCloudCustomer(row: CloudRow<"customers">): CachedCustomerRow {
  return {
    id: requiredNumber(row.id),
    name: row.name,
    isSelf: row.is_self,
    updatedAt: row.updated_at,
  };
}

export function toCloudCustomer(row: CustomerRow): CloudInsert<"customers"> {
  return {
    ...withId(row),
    name: row.name,
    is_self: row.isSelf,
  };
}

// ---- parcels ----

export function fromCloudParcel(row: CloudRow<"parcels">): CachedParcelRow {
  return {
    id: requiredNumber(row.id),
    name: row.name ?? undefined,
    status: row.status as ParcelStatus,
    comment: row.comment ?? undefined,
    boxWeightG: optionalNumber(row.box_weight_g),
    shippingCostBYN: optionalNumber(row.shipping_cost_byn),
    shippedAt: row.shipped_at ?? undefined,
    receivedAt: row.received_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toCloudParcel(row: ParcelRow): CloudInsert<"parcels"> {
  return {
    ...withId(row),
    name: row.name ?? null,
    status: row.status,
    comment: row.comment ?? null,
    box_weight_g: row.boxWeightG ?? null,
    shipping_cost_byn: row.shippingCostBYN ?? null,
    shipped_at: row.shippedAt ?? null,
    received_at: row.receivedAt ?? null,
    completed_at: row.completedAt ?? null,
    created_at: row.createdAt,
  };
}

// ---- parcel items ----

export function fromCloudParcelItem(row: CloudRow<"parcel_items">): CachedParcelItemRow {
  return {
    id: requiredNumber(row.id),
    parcelId: requiredNumber(row.parcel_id),
    name: row.name,
    priceCNY: requiredNumber(row.price_cny),
    priceBYN: requiredNumber(row.price_byn),
    quantity: requiredNumber(row.quantity),
    unit: row.unit as Unit,
    customerId: requiredNumber(row.customer_id),
    trackNumbers: row.track_numbers,
    weightsG: row.weights_g,
    status: row.status as ParcelItemStatus,
    tracksCompletedAt: row.tracks_completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toCloudParcelItem(row: ParcelItemRow): CloudInsert<"parcel_items"> {
  return {
    ...withId(row),
    parcel_id: row.parcelId,
    name: row.name,
    price_cny: row.priceCNY,
    price_byn: row.priceBYN,
    quantity: row.quantity,
    unit: row.unit,
    customer_id: row.customerId,
    track_numbers: row.trackNumbers,
    weights_g: row.weightsG,
    status: row.status,
    tracks_completed_at: row.tracksCompletedAt ?? null,
    created_at: row.createdAt,
  };
}

// ---- payments ----

export function fromCloudPayment(row: CloudRow<"payments">): CachedPaymentRow {
  return {
    id: requiredNumber(row.id),
    parcelId: requiredNumber(row.parcel_id),
    customerId: requiredNumber(row.customer_id),
    itemId: row.item_id === null ? undefined : requiredNumber(row.item_id),
    type: row.type as PaymentType,
    paid: row.paid,
    paidAt: row.paid_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toCloudPayment(row: PaymentRow): CloudInsert<"payments"> {
  return {
    ...withId(row),
    parcel_id: row.parcelId,
    customer_id: row.customerId,
    item_id: row.itemId ?? null,
    type: row.type,
    paid: row.paid,
    paid_at: row.paidAt ?? null,
    created_at: row.createdAt,
  };
}
