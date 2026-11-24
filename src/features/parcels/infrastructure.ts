import { isTestSession } from "@/core/auth";
import {
  appendCachedRows,
  applyCachedBatch,
  getSnapshot,
  insertCachedRow,
  removeCachedRow,
  removeCachedRows,
  upsertCachedRow,
} from "@/core/cache";
import {
  fromCloudParcel,
  fromCloudParcelItem,
  fromCloudPayment,
  toCloudParcel,
  toCloudParcelItem,
  toCloudPayment,
  type CachedParcelItemRow,
  type CachedParcelRow,
  type CachedPaymentRow,
} from "@/core/rowMappers";
import { getSupabaseClient } from "@/core/supabase";
import type { Database, Json } from "@/core/supabase.types";
import { requireData, throwWriteError } from "@/core/writeHelpers";
import {
  Parcel,
  ParcelItem,
  Payment,
  type CreatedParcelBatch,
  type ParcelRepository,
  type ParcelItemRepository,
  type ParcelWriteStore,
  type PaymentRepository,
  type PlannedPayment,
} from "./domain";

type CloudParcelRow = Database["public"]["Tables"]["parcels"]["Row"];
type CloudParcelItemRow = Database["public"]["Tables"]["parcel_items"]["Row"];
type CloudPaymentRow = Database["public"]["Tables"]["payments"]["Row"];

// ============================================
// Supabase adapters. Reads use the in-memory snapshot; writes go straight to
// Postgres and patch the snapshot with the rows returned by PostgREST. The dev
// e2e session writes to the snapshot only, so fixtures never hit the network.
// ============================================

function cachedParcel(id: number) {
  return getSnapshot().parcels.find((row) => row.id === id);
}

function cachedItem(id: number) {
  return getSnapshot().parcelItems.find((row) => row.id === id);
}

function cachedPayment(id: number) {
  return getSnapshot().payments.find((row) => row.id === id);
}

// ---- Read adapters ----

export class SupabaseParcelRepository implements ParcelRepository {
  async findAll(): Promise<Parcel[]> {
    // Newest first: createdAt descending, then id descending.
    return (
      [...getSnapshot().parcels]
        // oxlint-disable-next-line unicorn/no-array-sort
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id)
        .map(Parcel.fromPersistence)
    );
  }

  async findById(id: number): Promise<Parcel | null> {
    const row = cachedParcel(id);
    return row ? Parcel.fromPersistence(row) : null;
  }
}

export class SupabaseParcelItemRepository implements ParcelItemRepository {
  async findByParcelId(parcelId: number): Promise<ParcelItem[]> {
    return getSnapshot()
      .parcelItems.filter((row) => row.parcelId === parcelId)
      .map(ParcelItem.fromPersistence);
  }

  async findAll(): Promise<ParcelItem[]> {
    return getSnapshot().parcelItems.map(ParcelItem.fromPersistence);
  }

  async findById(id: number): Promise<ParcelItem | null> {
    const row = cachedItem(id);
    return row ? ParcelItem.fromPersistence(row) : null;
  }
}

export class SupabasePaymentRepository implements PaymentRepository {
  async findAll(): Promise<Payment[]> {
    return getSnapshot().payments.map(Payment.fromPersistence);
  }

  async findByParcelId(parcelId: number): Promise<Payment[]> {
    return getSnapshot()
      .payments.filter((row) => row.parcelId === parcelId)
      .map(Payment.fromPersistence);
  }

  async findByParcelAndCustomer(parcelId: number, customerId: number): Promise<Payment[]> {
    return getSnapshot()
      .payments.filter((row) => row.parcelId === parcelId && row.customerId === customerId)
      .map(Payment.fromPersistence);
  }

  async findByCustomer(customerId: number): Promise<Payment[]> {
    return getSnapshot()
      .payments.filter((row) => row.customerId === customerId)
      .map(Payment.fromPersistence);
  }

  async save(payment: Payment): Promise<Payment> {
    const persistence = payment.toPersistence();
    if (isTestSession()) {
      const local = insertCachedRow<CachedPaymentRow>("payments", {
        ...persistence,
        ...(payment.id > 0 ? { id: payment.id } : {}),
      });
      return Payment.fromPersistence(local);
    }

    const supabase = getSupabaseClient();
    const payload = toCloudPayment(persistence);

    if (payment.id === 0) {
      const { data, error } = await supabase.from("payments").insert(payload).select().single();
      if (error) await throwWriteError(error);
      const saved = fromCloudPayment(requireData(data));
      upsertCachedRow("payments", saved);
      return Payment.fromPersistence(saved);
    }

    const current = cachedPayment(payment.id);
    const { data, error } = await supabase
      .from("payments")
      .update(payload)
      .eq("id", payment.id)
      .eq("updated_at", current?.updatedAt ?? "")
      .select()
      .single();
    if (error) await throwWriteError(error);
    const saved = fromCloudPayment(requireData(data));
    upsertCachedRow("payments", saved);
    return Payment.fromPersistence(saved);
  }
}

// ---- Write adapter ----

export class SupabaseParcelWriteStore implements ParcelWriteStore {
  async saveParcel(parcel: Parcel): Promise<Parcel> {
    const persistence = parcel.toPersistence();
    if (isTestSession()) {
      const local = insertCachedRow<CachedParcelRow>("parcels", {
        ...persistence,
        ...(parcel.id > 0 ? { id: parcel.id } : {}),
      });
      return Parcel.fromPersistence(local);
    }

    const supabase = getSupabaseClient();
    const payload = toCloudParcel(persistence);

    if (parcel.id === 0) {
      const { data, error } = await supabase.from("parcels").insert(payload).select().single();
      if (error) await throwWriteError(error);
      const saved = fromCloudParcel(requireData(data));
      upsertCachedRow("parcels", saved);
      return Parcel.fromPersistence(saved);
    }

    const current = cachedParcel(parcel.id);
    const { data, error } = await supabase
      .from("parcels")
      .update(payload)
      .eq("id", parcel.id)
      .eq("updated_at", current?.updatedAt ?? "")
      .select()
      .single();
    if (error) await throwWriteError(error);
    const saved = fromCloudParcel(requireData(data));
    upsertCachedRow("parcels", saved);
    return Parcel.fromPersistence(saved);
  }

  async addItems(items: ParcelItem[]): Promise<ParcelItem[]> {
    if (items.length === 0) return [];

    if (isTestSession()) {
      return items.map((item) =>
        ParcelItem.fromPersistence(
          insertCachedRow<CachedParcelItemRow>("parcelItems", {
            ...item.toPersistence(),
            ...(item.id > 0 ? { id: item.id } : {}),
          }),
        ),
      );
    }

    const payload = items.map((item) => toCloudParcelItem(item.toPersistence()));
    const { data, error } = await getSupabaseClient().from("parcel_items").insert(payload).select();
    if (error) await throwWriteError(error);
    const saved = (data ?? []).map(fromCloudParcelItem);
    appendCachedRows("parcelItems", saved);
    return saved.map(ParcelItem.fromPersistence);
  }

  async createParcelWithItems(
    parcel: Parcel,
    items: ParcelItem[],
    payments: PlannedPayment[],
  ): Promise<CreatedParcelBatch> {
    if (isTestSession()) {
      const savedParcel = insertCachedRow<CachedParcelRow>("parcels", parcel.toPersistence());
      const savedItems = items.map((item) =>
        ParcelItem.fromPersistence(
          insertCachedRow<CachedParcelItemRow>("parcelItems", {
            ...item.toPersistence(),
            parcelId: savedParcel.id,
          }),
        ),
      );
      const savedPayments = payments.map((payment) =>
        Payment.fromPersistence(
          insertCachedRow<CachedPaymentRow>("payments", {
            parcelId: savedParcel.id,
            customerId: payment.customerId,
            itemId: savedItems[payment.itemIndex - 1]?.id,
            type: payment.type,
            paid: payment.paid,
            paidAt: payment.paidAt,
            createdAt: payment.createdAt,
          }),
        ),
      );
      return {
        parcel: Parcel.fromPersistence(savedParcel),
        items: savedItems,
        payments: savedPayments,
      };
    }

    // The RPC reads camelCase persistence rows and returns complete snake_case
    // rows, so the cache gets server timestamps for later optimistic updates.
    const { data, error } = await getSupabaseClient().rpc("create_parcel_with_items", {
      p_parcel: parcel.toPersistence() as unknown as Json,
      p_items: items.map((item) => item.toPersistence() as unknown as Json),
      p_payments: payments as unknown as Json[],
    });
    if (error) await throwWriteError(error);
    const result = requireData(data) as unknown as {
      parcel: CloudParcelRow;
      items: CloudParcelItemRow[];
      payments: CloudPaymentRow[];
    };
    const cached = {
      parcel: fromCloudParcel(result.parcel),
      items: result.items.map(fromCloudParcelItem),
      payments: result.payments.map(fromCloudPayment),
    };
    applyCachedBatch(cached);
    return {
      parcel: Parcel.fromPersistence(cached.parcel),
      items: cached.items.map(ParcelItem.fromPersistence),
      payments: cached.payments.map(Payment.fromPersistence),
    };
  }

  async saveItem(item: ParcelItem): Promise<ParcelItem> {
    const persistence = item.toPersistence();
    if (isTestSession()) {
      const local = insertCachedRow<CachedParcelItemRow>("parcelItems", {
        ...persistence,
        ...(item.id > 0 ? { id: item.id } : {}),
      });
      return ParcelItem.fromPersistence(local);
    }

    const supabase = getSupabaseClient();
    const payload = toCloudParcelItem(persistence);

    if (item.id === 0) {
      const { data, error } = await supabase.from("parcel_items").insert(payload).select().single();
      if (error) await throwWriteError(error);
      const saved = fromCloudParcelItem(requireData(data));
      upsertCachedRow("parcelItems", saved);
      return ParcelItem.fromPersistence(saved);
    }

    const current = cachedItem(item.id);
    const { data, error } = await supabase
      .from("parcel_items")
      .update(payload)
      .eq("id", item.id)
      .eq("updated_at", current?.updatedAt ?? "")
      .select()
      .single();
    if (error) await throwWriteError(error);
    const saved = fromCloudParcelItem(requireData(data));
    upsertCachedRow("parcelItems", saved);
    return ParcelItem.fromPersistence(saved);
  }

  async deleteItem(id: number): Promise<void> {
    if (!isTestSession()) {
      const { error } = await getSupabaseClient().from("parcel_items").delete().eq("id", id);
      if (error) await throwWriteError(error);
    }
    removeCachedRow("parcelItems", id);
    removeCachedRows("payments", (row) => "itemId" in row && row.itemId === id);
  }

  async deleteParcel(id: number): Promise<void> {
    // Postgres cascades items and payments; one request replaces the old
    // three-table transaction.
    if (!isTestSession()) {
      const { error } = await getSupabaseClient().from("parcels").delete().eq("id", id);
      if (error) await throwWriteError(error);
    }
    removeCachedRow("parcels", id);
    removeCachedRows("parcelItems", (row) => "parcelId" in row && row.parcelId === id);
    removeCachedRows("payments", (row) => "parcelId" in row && row.parcelId === id);
  }
}

// ---- Singleton instances ----

export const parcelRepository = new SupabaseParcelRepository();
export const parcelItemRepository = new SupabaseParcelItemRepository();
export const paymentRepository = new SupabasePaymentRepository();
export const parcelWriteStore = new SupabaseParcelWriteStore();
