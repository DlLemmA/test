import { Payment } from "../domain/Payment";
import type { ParcelItemRepository, ParcelRepository, PaymentRepository } from "../domain/ports";

export class PaymentService {
  constructor(
    private paymentRepo: PaymentRepository,
    private parcelRepo: ParcelRepository,
    private itemRepo: ParcelItemRepository,
  ) {}

  async getPaymentsForParcel(parcelId: number): Promise<Payment[]> {
    return this.paymentRepo.findByParcelId(parcelId);
  }

  async toggleItemPayment(paymentId: number): Promise<Payment> {
    const payments = await this.paymentRepo.findByParcelId(0); // will need to fetch specific
    // Actually let's just save directly
    throw new Error("Not implemented - use repository directly");
  }

  async setItemPaid(
    parcelId: number,
    itemId: number,
    customerId: number,
    paid: boolean,
  ): Promise<Payment> {
    const existing = await this.paymentRepo.findByParcelAndCustomer(parcelId, customerId);
    const itemPayment = existing.find((p) => p.type === "item" && p.itemId === itemId);

    if (itemPayment) {
      const updated = itemPayment.update({ paid });
      return this.paymentRepo.save(updated);
    } else {
      const payment = Payment.create({ parcelId, customerId, itemId, type: "item", paid });
      return this.paymentRepo.save(payment);
    }
  }

  async setShippingPaid(parcelId: number, customerId: number, paid: boolean): Promise<Payment> {
    const existing = await this.paymentRepo.findByParcelAndCustomer(parcelId, customerId);
    const shippingPayment = existing.find((p) => p.type === "shipping");

    if (shippingPayment) {
      const updated = shippingPayment.update({ paid });
      return this.paymentRepo.save(updated);
    } else {
      const payment = Payment.create({ parcelId, customerId, type: "shipping", paid });
      return this.paymentRepo.save(payment);
    }
  }
}
