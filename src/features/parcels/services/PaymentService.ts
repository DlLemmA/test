import { effectivePaid } from "@/features/settlement/domain";
import { Payment } from "../domain/Payment";
import type { PaymentRepository, PlannedPayment } from "../domain/ports";

export type SelfCustomerIdProvider = () => Promise<number | undefined>;

/**
 * One seam for recording payments: lookup, paid-state transitions, batch
 * updates and the self-is-always-paid rule live here. Callers only describe
 * which lines should change; the module resolves the self customer itself, so
 * no caller can accidentally mark self as unpaid.
 */
export class PaymentService {
  constructor(
    private paymentRepo: PaymentRepository,
    private selfCustomerId: SelfCustomerIdProvider,
  ) {}

  async setItemPaid(
    parcelId: number,
    itemId: number,
    customerId: number,
    paid: boolean,
  ): Promise<Payment> {
    const selfCustomerId = await this.selfCustomerId();
    const payments = await this.paymentRepo.findByParcelAndCustomer(parcelId, customerId);
    const current = payments.find((p) => p.type === "item" && p.itemId === itemId);
    return this.saveItem(current, parcelId, itemId, customerId, paid, selfCustomerId);
  }

  async setShippingPaid(parcelId: number, customerId: number, paid: boolean): Promise<Payment> {
    const selfCustomerId = await this.selfCustomerId();
    const payments = await this.paymentRepo.findByParcelAndCustomer(parcelId, customerId);
    const current = payments.find((p) => p.type === "shipping");
    return this.saveShipping(current, parcelId, customerId, paid, selfCustomerId);
  }

  async toggleItemPayment(parcelId: number, itemId: number, customerId: number): Promise<Payment> {
    const selfCustomerId = await this.selfCustomerId();
    const payments = await this.paymentRepo.findByParcelAndCustomer(parcelId, customerId);
    const current = payments.find((p) => p.type === "item" && p.itemId === itemId);
    return this.saveItem(
      current,
      parcelId,
      itemId,
      customerId,
      !(current?.paid ?? false),
      selfCustomerId,
    );
  }

  async toggleShippingPayment(parcelId: number, customerId: number): Promise<Payment> {
    const selfCustomerId = await this.selfCustomerId();
    const payments = await this.paymentRepo.findByParcelAndCustomer(parcelId, customerId);
    const current = payments.find((p) => p.type === "shipping");
    return this.saveShipping(
      current,
      parcelId,
      customerId,
      !(current?.paid ?? false),
      selfCustomerId,
    );
  }

  /** Set a whole parcel to one paid state instead of toggling each line in turn. */
  async setParcelPayment(
    parcelId: number,
    customerId: number,
    itemIds: number[],
    paid: boolean,
    shipping: boolean,
  ): Promise<Payment[]> {
    const selfCustomerId = await this.selfCustomerId();
    const payments = await this.paymentRepo.findByParcelAndCustomer(parcelId, customerId);
    const effective = effectivePaid(customerId, selfCustomerId, paid);
    const itemPayment = (itemId: number) =>
      payments.find((p) => p.type === "item" && p.itemId === itemId);

    const pending = itemIds.filter((itemId) => (itemPayment(itemId)?.paid ?? false) !== effective);
    const changed = await Promise.all(
      pending.map((itemId) =>
        this.saveItem(itemPayment(itemId), parcelId, itemId, customerId, paid, selfCustomerId),
      ),
    );

    if (shipping) {
      const current = payments.find((p) => p.type === "shipping");
      if ((current?.paid ?? false) !== effective) {
        changed.push(await this.saveShipping(current, parcelId, customerId, paid, selfCustomerId));
      }
    }

    return changed;
  }

  /**
   * Plan the self customer's payments for a batch that does not exist yet.
   * itemIndex is 1-based so the RPC can resolve the generated item ids.
   */
  planBatchPayments(
    items: Array<{ index: number; customerId: number }>,
    selfCustomerId: number | undefined,
  ): PlannedPayment[] {
    if (selfCustomerId === undefined) return [];
    const now = new Date();
    const paidAt = now.toISOString().split("T")[0];
    const createdAt = now.toISOString();
    return items
      .filter((item) => effectivePaid(item.customerId, selfCustomerId, false))
      .map((item) => ({
        itemIndex: item.index,
        customerId: item.customerId,
        type: "item",
        paid: true,
        paidAt,
        createdAt,
      }));
  }

  /** Record the self customer's share of a new batch as paid in one call. */
  async markSelfItemsPaid(
    parcelId: number,
    items: Array<{ id: number; customerId: number }>,
  ): Promise<Payment[]> {
    const selfCustomerId = await this.selfCustomerId();
    if (selfCustomerId === undefined) return [];
    const itemIds = items.filter((item) => item.customerId === selfCustomerId).map((i) => i.id);
    return this.setParcelPayment(parcelId, selfCustomerId, itemIds, true, false);
  }

  private async saveItem(
    current: Payment | undefined,
    parcelId: number,
    itemId: number,
    customerId: number,
    paid: boolean,
    selfCustomerId: number | undefined,
  ): Promise<Payment> {
    const effective = effectivePaid(customerId, selfCustomerId, paid);
    if (current) {
      return current.paid === effective
        ? current
        : this.paymentRepo.save(current.update({ paid: effective }));
    }
    return this.paymentRepo.save(
      Payment.create({ parcelId, customerId, itemId, type: "item", paid: effective }),
    );
  }

  private async saveShipping(
    current: Payment | undefined,
    parcelId: number,
    customerId: number,
    paid: boolean,
    selfCustomerId: number | undefined,
  ): Promise<Payment> {
    const effective = effectivePaid(customerId, selfCustomerId, paid);
    if (current) {
      return current.paid === effective
        ? current
        : this.paymentRepo.save(current.update({ paid: effective }));
    }
    return this.paymentRepo.save(
      Payment.create({ parcelId, customerId, type: "shipping", paid: effective }),
    );
  }
}
