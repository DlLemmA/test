import { Customer, type CustomerRepository, type CustomerWriteStore } from "./domain";
import { db } from "@/core/database";

// ============================================
// Read adapter
// ============================================

export class DexieCustomerRepository implements CustomerRepository {
  async findAll(): Promise<Customer[]> {
    const rows = await db.customers.toArray();
    return rows.map(Customer.fromPersistence);
  }

  async findById(id: number): Promise<Customer | null> {
    const row = await db.customers.get(id);
    return row ? Customer.fromPersistence(row) : null;
  }
}

// ============================================
// Write adapter
// ============================================

export class DexieCustomerWriteStore implements CustomerWriteStore {
  async save(customer: Customer): Promise<Customer> {
    const data = customer.toPersistence();
    if (customer.id === 0) {
      const id = await db.customers.add(data as any);
      return Customer.fromPersistence({ ...data, id });
    }
    await db.customers.update(customer.id, data);
    return customer;
  }

  async delete(id: number): Promise<void> {
    await db.customers.delete(id);
  }
}

export const customerRepository = new DexieCustomerRepository();
export const customerWriteStore = new DexieCustomerWriteStore();
