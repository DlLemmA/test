import { describe, expect, it } from "vitest";
import { Customer, type CustomerRepository, type CustomerWriteStore } from "./domain";
import { CustomerService } from "./domain";

class Store implements CustomerRepository, CustomerWriteStore {
  customers = new Map<number, Customer>();
  nextId = 1;

  async findAll(): Promise<Customer[]> {
    return [...this.customers.values()];
  }

  async findById(id: number): Promise<Customer | null> {
    return this.customers.get(id) ?? null;
  }

  async save(customer: Customer): Promise<Customer> {
    const id = customer.id || this.nextId++;
    const saved = Customer.fromPersistence({ ...customer.toPersistence(), id });
    this.customers.set(id, saved);
    return saved;
  }

  async delete(id: number): Promise<void> {
    this.customers.delete(id);
  }
}

function makeService() {
  const store = new Store();
  return { store, service: new CustomerService(store, store) };
}

describe("CustomerService write boundary", () => {
  it("validates input before saving", async () => {
    const { service, store } = makeService();
    await expect(service.createCustomer({ name: "", isSelf: false })).rejects.toThrow(
      "Имя обязательно",
    );
    expect(store.customers.size).toBe(0);
  });

  it("enforces unique names for both create and update", async () => {
    const { service } = makeService();
    await service.createCustomer({ name: "Катя", isSelf: false });

    await expect(service.createCustomer({ name: "Катя", isSelf: false })).rejects.toThrow(
      /уже существует/,
    );

    const second = await service.createCustomer({ name: "Игорь", isSelf: false });
    await expect(service.updateCustomer(second.id, { name: "Катя" })).rejects.toThrow(
      /уже существует/,
    );
  });

  it("rejects updates and deletes of unknown customers", async () => {
    const { service } = makeService();
    await expect(service.updateCustomer(999, { name: "Новое" })).rejects.toThrow(
      "Заказчик не найден",
    );
    await expect(service.deleteCustomer(999)).rejects.toThrow("Заказчик не найден");
  });
});
