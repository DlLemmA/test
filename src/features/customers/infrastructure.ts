import { db } from "@/core/database";
import type { CustomerRepository } from "./domain";
import { Customer } from "./domain";

// ============================================
// Dexie Implementation
// ============================================

export class DexieCustomerRepository implements CustomerRepository {
  async findAll(): Promise<Customer[]> {
    const rows = await db.customers.orderBy("isSelf").reverse().toArray();
    rows.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return rows.map(Customer.fromPersistence);
  }

  async findById(id: number): Promise<Customer | null> {
    const row = await db.customers.get(id);
    return row ? Customer.fromPersistence(row) : null;
  }

  async save(customer: Customer): Promise<Customer> {
    if (customer.id === 0) {
      const id = await db.customers.add(customer.toPersistence());
      return Customer.fromPersistence({ ...customer.toPersistence(), id });
    } else {
      await db.customers.update(customer.id, customer.toPersistence());
      return customer;
    }
  }

  async delete(id: number): Promise<void> {
    await db.customers.delete(id);
  }
}

// ============================================
// Export singleton instance
// ============================================

export const customerRepository = new DexieCustomerRepository();
