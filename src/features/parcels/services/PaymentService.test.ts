import { describe, expect, it } from "vitest";
import { Payment } from "../domain/Payment";
import type { PaymentRepository } from "../domain/ports";
import { PaymentService, type SelfCustomerIdProvider } from "./PaymentService";

class InMemoryPayments implements PaymentRepository {
  private stored = new Map<number, Payment>();
  private nextId = 1;

  async findAll(): Promise<Payment[]> {
    return [...this.stored.values()];
  }

  async findByParcelId(parcelId: number): Promise<Payment[]> {
    return this.filter((p) => p.parcelId === parcelId);
  }

  async findByParcelAndCustomer(parcelId: number, customerId: number): Promise<Payment[]> {
    return this.filter((p) => p.parcelId === parcelId && p.customerId === customerId);
  }

  async findByCustomer(customerId: number): Promise<Payment[]> {
    return this.filter((p) => p.customerId === customerId);
  }

  async save(payment: Payment): Promise<Payment> {
    const id = payment.id || this.nextId++;
    const saved = Payment.fromPersistence({ ...payment.toPersistence(), id });
    this.stored.set(id, saved);
    return saved;
  }

  async delete(id: number): Promise<void> {
    this.stored.delete(id);
  }

  private filter(predicate: (payment: Payment) => boolean): Payment[] {
    return [...this.stored.values()].filter(predicate);
  }
}

const noSelf: SelfCustomerIdProvider = async () => undefined;

const paidItemIds = (payments: Payment[]) =>
  payments.filter((p) => p.type === "item" && p.paid).map((p) => p.itemId);

describe("PaymentService", () => {
  it("creates a paid payment on first toggle and flips it on the next", async () => {
    const service = new PaymentService(new InMemoryPayments(), noSelf);

    const first = await service.toggleItemPayment(1, 10, 2);
    expect(first.paid).toBe(true);

    const second = await service.toggleItemPayment(1, 10, 2);
    expect(second.paid).toBe(false);
  });

  it("sets a whole parcel to the requested state instead of toggling each line", async () => {
    const repo = new InMemoryPayments();
    await repo.save(
      Payment.create({ parcelId: 1, customerId: 2, itemId: 10, type: "item", paid: true }),
    );
    await repo.save(
      Payment.create({ parcelId: 1, customerId: 2, itemId: 11, type: "item", paid: false }),
    );
    const service = new PaymentService(repo, noSelf);

    const changed = await service.setParcelPayment(1, 2, [10, 11], true, false);

    expect(changed).toHaveLength(1);
    expect(changed[0]!.itemId).toBe(11);
    expect(paidItemIds(await repo.findByParcelAndCustomer(1, 2))).toEqual([10, 11]);
  });

  it("marks a whole parcel unpaid in one call", async () => {
    const repo = new InMemoryPayments();
    await repo.save(
      Payment.create({ parcelId: 1, customerId: 2, itemId: 10, type: "item", paid: true }),
    );
    await repo.save(
      Payment.create({ parcelId: 1, customerId: 2, itemId: 11, type: "item", paid: true }),
    );
    const service = new PaymentService(repo, noSelf);

    await service.setParcelPayment(1, 2, [10, 11], false, false);

    expect(paidItemIds(await repo.findByParcelAndCustomer(1, 2))).toEqual([]);
  });

  it("never unpays the self customer, even when a caller asks to", async () => {
    const repo = new InMemoryPayments();
    const service = new PaymentService(repo, async () => 7);
    await service.markSelfItemsPaid(1, [
      { id: 10, customerId: 7 },
      { id: 11, customerId: 7 },
    ]);

    await service.setItemPaid(1, 10, 7, false);
    await service.setParcelPayment(1, 7, [10, 11], false, true);
    await service.toggleShippingPayment(1, 7);

    const payments = await repo.findByParcelAndCustomer(1, 7);
    expect(paidItemIds(payments)).toEqual([10, 11]);
    expect(payments.find((p) => p.type === "shipping")?.paid).toBe(true);
  });

  it("records only the self customer's new items as paid", async () => {
    const repo = new InMemoryPayments();
    const service = new PaymentService(repo, async () => 7);

    await service.markSelfItemsPaid(1, [
      { id: 10, customerId: 7 },
      { id: 11, customerId: 8 },
      { id: 12, customerId: 7 },
    ]);

    expect(paidItemIds(await repo.findByParcelAndCustomer(1, 7))).toEqual([10, 12]);
    expect(await repo.findByParcelAndCustomer(1, 8)).toEqual([]);
  });

  it("records nothing when there is no self customer yet", async () => {
    const repo = new InMemoryPayments();
    const service = new PaymentService(repo, noSelf);

    expect(await service.markSelfItemsPaid(1, [{ id: 10, customerId: 1 }])).toEqual([]);
    expect(await repo.findAll()).toEqual([]);
  });
});
