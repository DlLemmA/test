import { Customer, CustomerRepository, CustomerWithItems } from "./domain";
import { db } from "@/core/database";

// ============================================
// Customer Repository Implementation
// ============================================

export class DexieCustomerRepository implements CustomerRepository {
  async findAll(): Promise<Customer[]> {
    const rows = await db.customers.toArray();
    return rows.map(Customer.fromPersistence);
  }

  async findAllWithItems(): Promise<CustomerWithItems[]> {
    const customers = await this.findAll();
    return customers.map((customer) => ({
      customer,
      items: [],
    }));
  }

  async findById(id: number): Promise<Customer | null> {
    const row = await db.customers.get(id);
    return row ? Customer.fromPersistence(row) : null;
  }

  async findByIdWithItems(id: number): Promise<CustomerWithItems | null> {
    const customer = await this.findById(id);
    if (!customer) return null;
    return { customer, items: [] };
  }

  async save(customer: Customer): Promise<Customer> {
    const data = customer.toPersistence();
    if (customer.id === 0) {
      const id = await db.customers.add(data as any);
      return Customer.fromPersistence({ ...data, id });
    } else {
      await db.customers.update(customer.id, data);
      return customer;
    }
  }

  async delete(id: number): Promise<void> {
    await db.customers.delete(id);
  }
}

export const customerRepository = new DexieCustomerRepository();
