import { describe, expect, it } from "vitest";
import { customerBalances } from "@/features/balances/domain";
import { Parcel } from "@/features/parcels/domain/Parcel";
import { ParcelItem } from "@/features/parcels/domain/ParcelItem";
import { createEmptyPaymentState } from "@/features/parcels/domain/Payment";
import {
  canPayDelivery,
  deliveryInvoiced,
  effectivePaid,
  settlementFacts,
  shippingInfoComplete,
} from "./SettlementPolicy";

const CREATED_AT = "2026-11-23T00:00:00.000Z";

function parcel(status: "draft" | "shipped" | "received" | "done", weight?: number, cost?: number) {
  return Parcel.fromPersistence({
    id: 1,
    status,
    boxWeightG: weight,
    shippingCostBYN: cost,
    createdAt: CREATED_AT,
  });
}

function item(id: number, customerId: number, priceBYN: number) {
  return ParcelItem.fromPersistence({
    id,
    parcelId: 1,
    name: `Товар ${id}`,
    priceCNY: priceBYN,
    priceBYN,
    quantity: 1,
    unit: "pcs",
    customerId,
    trackNumbers: "[]",
    weightsG: JSON.stringify([100]),
    status: "received",
    createdAt: CREATED_AT,
  });
}

describe("settlement policy", () => {
  it("owns the self rule for both reads and writes", () => {
    expect(effectivePaid(1, 1, false)).toBe(true);
    expect(effectivePaid(2, 1, false)).toBe(false);
    expect(effectivePaid(2, 1, true)).toBe(true);
    expect(effectivePaid(2, undefined, true)).toBe(true);
  });

  it("has one definition of invoiced delivery", () => {
    expect(shippingInfoComplete(parcel("shipped", 100, 10))).toBe(true);
    expect(deliveryInvoiced(parcel("shipped", 100, 10))).toBe(false);
    expect(deliveryInvoiced(parcel("draft", 100, 10))).toBe(false);
    expect(deliveryInvoiced(parcel("received", 100, 10))).toBe(true);
    expect(deliveryInvoiced(parcel("done", 100, 10))).toBe(true);
    expect(deliveryInvoiced(parcel("received", undefined, 10))).toBe(false);
    expect(deliveryInvoiced(parcel("received", 100, undefined))).toBe(false);
  });

  it("lets a real customer pay only a non-zero invoiced delivery share", () => {
    expect(canPayDelivery(parcel("received", 100, 10), false, 5)).toBe(true);
    expect(canPayDelivery(parcel("received", 100, 10), false, 0)).toBe(false);
    expect(canPayDelivery(parcel("received", undefined, 10), false, 5)).toBe(false);
    expect(canPayDelivery(parcel("received", 100, 10), true, 5)).toBe(false);
  });

  it("marks the self customer's items and delivery paid without payment rows", () => {
    const facts = settlementFacts({
      parcel: parcel("received", 100, 10),
      items: [item(10, 1, 3), item(11, 2, 5)],
      paymentState: createEmptyPaymentState(),
      selfCustomerId: 1,
    });

    expect(facts.deliveryInvoiced).toBe(true);
    expect(facts.paidItems.has(10)).toBe(true);
    expect(facts.paidItems.has(11)).toBe(false);
    expect(facts.paidDelivery.has(1)).toBe(true);
    expect(facts.paidDelivery.has(2)).toBe(false);
  });

  it("agrees with the balance on every paid amount", () => {
    const items = [item(10, 1, 3), item(11, 2, 5), item(12, 2, 7)];
    const paymentState = createEmptyPaymentState();
    paymentState.itemPaid.set(12, true);
    paymentState.shippingPaid.set(2, true);

    const input = { parcel: parcel("received", 100, 10), items, paymentState, selfCustomerId: 1 };
    const facts = settlementFacts(input);
    const balance = customerBalances(input);

    for (const customerId of [1, 2]) {
      const paidItems = items.filter(
        (candidate) => candidate.customerId === customerId && facts.paidItems.has(candidate.id),
      );
      const goodsPaid = paidItems.reduce((sum, candidate) => sum + candidate.priceBYN, 0);
      expect(balance.byCustomer.get(customerId)!.goods.paid).toBeCloseTo(goodsPaid);

      const delivery = balance.byCustomer.get(customerId)!.delivery;
      expect(delivery.paid).toBe(facts.paidDelivery.has(customerId) ? delivery.owed : 0);
    }
  });
});
