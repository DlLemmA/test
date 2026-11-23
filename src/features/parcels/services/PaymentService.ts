import { effectivePaid } from "@/features/settlement/domain";
import { Payment } from "../domain/Payment";
import type { PaymentRepository } from "../domain/ports";

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

  async getPaymentsForParcel(parcelId: number): Promise<Payment[]> {
    return this.paymentRepo.findByParcelId(parcelId);
  }

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
    const changed: Payment[] = [];

    for (const itemId of itemIds) {
      const current = payments.find((p) => p.type === "item" && p.itemId === itemId);
      if ((current?.paid ?? false) === effectivePaid(customerId, selfCustomerId, paid)) {
        continue;
      }
      changed.push(
        await this.saveItem(current, parcelId, itemId, customerId, paid, selfCustomerId),
      );
    }

    if (shipping) {
      const current = payments.find((p) => p.type === "shipping");
      if ((current?.paid ?? false) !== effectivePaid(customerId, selfCustomerId, paid)) {
        changed.push(await this.saveShipping(current, parcelId, customerId, paid, selfCustomerId));
      }
    }

    return changed;
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
