import { isTestSession } from "@/core/auth";
import { getSnapshot, insertCachedRow, removeCachedRow, upsertCachedRow } from "@/core/cache";
import { fromCloudCustomer, toCloudCustomer, type CachedCustomerRow } from "@/core/rowMappers";
import { getSupabaseClient } from "@/core/supabase";
import { requireData, throwWriteError } from "@/core/writeHelpers";
import { Customer, type CustomerRepository, type CustomerWriteStore } from "./domain";

// ============================================
// Supabase adapters. Reads use the in-memory snapshot; writes go straight to
// Postgres and patch the snapshot with the row returned by PostgREST. The dev
// e2e session writes to the snapshot only, so fixtures never hit the network.
// ============================================

function cachedCustomer(id: number) {
  return getSnapshot().customers.find((row) => row.id === id);
}

export class SupabaseCustomerRepository implements CustomerRepository {
  async findAll(): Promise<Customer[]> {
    return (
      [...getSnapshot().customers]
        // oxlint-disable-next-line unicorn/no-array-sort
        .sort((a, b) => a.id - b.id)
        .map(Customer.fromPersistence)
    );
  }

  async findById(id: number): Promise<Customer | null> {
    const row = cachedCustomer(id);
    return row ? Customer.fromPersistence(row) : null;
  }
}

export class SupabaseCustomerWriteStore implements CustomerWriteStore {
  async save(customer: Customer): Promise<Customer> {
    const persistence = customer.toPersistence();

    if (isTestSession()) {
      const local = insertCachedRow<CachedCustomerRow>("customers", {
        ...persistence,
        ...(customer.id > 0 ? { id: customer.id } : {}),
      });
      return Customer.fromPersistence(local);
    }

    const supabase = getSupabaseClient();
    const payload = toCloudCustomer(persistence);

    if (customer.id === 0) {
      const { data, error } = await supabase.from("customers").insert(payload).select().single();
      if (error) await throwWriteError(error);
      const saved = fromCloudCustomer(requireData(data));
      upsertCachedRow("customers", saved);
      return Customer.fromPersistence(saved);
    }

    const current = cachedCustomer(customer.id);
    const { data, error } = await supabase
      .from("customers")
      .update(payload)
      .eq("id", customer.id)
      .eq("updated_at", current?.updatedAt ?? "")
      .select()
      .single();
    if (error) await throwWriteError(error);
    const saved = fromCloudCustomer(requireData(data));
    upsertCachedRow("customers", saved);
    return Customer.fromPersistence(saved);
  }

  async delete(id: number): Promise<void> {
    if (isTestSession()) {
      removeCachedRow("customers", id);
      return;
    }
    const { error } = await getSupabaseClient().from("customers").delete().eq("id", id);
    if (error) await throwWriteError(error);
    removeCachedRow("customers", id);
  }
}

export const customerRepository = new SupabaseCustomerRepository();
export const customerWriteStore = new SupabaseCustomerWriteStore();
