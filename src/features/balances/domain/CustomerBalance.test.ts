import { describe, expect, it } from "vitest";
import { Parcel } from "@/features/parcels/domain/Parcel";
import { ParcelItem } from "@/features/parcels/domain/ParcelItem";
import { createEmptyPaymentState } from "@/features/parcels/domain/Payment";
import { customerBalances, emptyCustomerBalance, sumCustomerBalances } from "./CustomerBalance";

function parcel(status: "draft" | "received" = "received") {
  return Parcel.fromPersistence({
    id: 1,
    name: "Тестовая посылка",
    status,
    boxWeightG: 1000,
    shippingCostBYN: 30,
    createdAt: "2026-11-23T00:00:00.000Z",
  });
}

function item(id: number, customerId: number, priceBYN: number, weightsG: number[]) {
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
    weightsG: JSON.stringify(weightsG),
    status: "received",
    createdAt: "2026-11-23T00:00:00.000Z",
  });
}

describe("customerBalances", () => {
  it("splits goods and delivery per customer and keeps totals consistent", () => {
    const paymentState = createEmptyPaymentState();
    paymentState.itemPaid.set(1, true);
    paymentState.shippingPaid.set(2, true);

    const result = customerBalances({
      parcel: parcel(),
      items: [item(1, 1, 100, [300]), item(2, 2, 100, [700])],
      paymentState,
    });

    const first = result.byCustomer.get(1)!;
    expect(first.goods.owed).toBe(100);
    expect(first.goods.paid).toBe(100);
    expect(first.delivery.owed).toBeCloseTo(9);
    expect(first.delivery.paid).toBe(0);
    expect(first.owed).toBeCloseTo(109);
    expect(first.paid).toBe(100);
    expect(first.remaining).toBeCloseTo(9);

    const second = result.byCustomer.get(2)!;
    expect(second.goods.owed).toBe(100);
    expect(second.goods.paid).toBe(0);
    expect(second.delivery.owed).toBeCloseTo(21);
    expect(second.delivery.paid).toBeCloseTo(21);
    expect(second.owed).toBeCloseTo(121);
    expect(second.paid).toBeCloseTo(21);
    expect(second.remaining).toBeCloseTo(100);

    expect(result.deliveryByItem.get(1)).toBeCloseTo(9);
    expect(result.deliveryByItem.get(2)).toBeCloseTo(21);

    expect(result.totals.goods.owed).toBe(200);
    expect(result.totals.goods.paid).toBe(100);
    expect(result.totals.delivery.owed).toBeCloseTo(30);
    expect(result.totals.delivery.paid).toBeCloseTo(21);
    expect(result.totals.owed).toBeCloseTo(230);
    expect(result.totals.paid).toBeCloseTo(121);
    expect(result.totals.remaining).toBeCloseTo(109);
  });

  it("auto-pays both goods and delivery of the self customer", () => {
    const result = customerBalances({
      parcel: parcel(),
      items: [item(1, 1, 100, [300]), item(2, 2, 100, [700])],
      paymentState: createEmptyPaymentState(),
      selfCustomerId: 1,
    });

    const self = result.byCustomer.get(1)!;
    expect(self.goods.paid).toBe(100);
    expect(self.delivery.paid).toBeCloseTo(9);
    expect(self.remaining).toBe(0);

    expect(result.byCustomer.get(2)!.paid).toBe(0);
  });

  it("does not allocate delivery before a parcel is received", () => {
    const result = customerBalances({
      parcel: parcel("draft"),
      items: [item(1, 1, 100, [300]), item(2, 2, 100, [700])],
      paymentState: createEmptyPaymentState(),
    });

    expect(result.byCustomer.get(1)!.delivery.owed).toBe(0);
    expect(result.byCustomer.get(2)!.delivery.owed).toBe(0);
    expect(result.deliveryByItem.size).toBe(0);
    expect(result.totals.delivery.owed).toBe(0);
  });

  it("uses weight shares, not a flat 30% of the total", () => {
    const result = customerBalances({
      parcel: parcel(),
      items: [item(1, 1, 100, [300]), item(2, 2, 100, [700])],
      paymentState: createEmptyPaymentState(),
    });

    const first = result.byCustomer.get(1)!;
    expect(first.delivery.owed).toBeCloseTo(9);
    expect(first.delivery.owed).not.toBeCloseTo(first.owed * 0.3);
  });

  it("sums per-parcel balances without losing the goods/delivery split", () => {
    const first = customerBalances({
      parcel: parcel(),
      items: [item(1, 1, 100, [300]), item(2, 2, 100, [700])],
      paymentState: createEmptyPaymentState(),
    }).byCustomer.get(2)!;
    const second = customerBalances({
      parcel: Parcel.fromPersistence({
        id: 2,
        status: "received",
        boxWeightG: 100,
        shippingCostBYN: 10,
        createdAt: "2026-11-23T00:00:00.000Z",
      }),
      items: [item(3, 2, 50, [100])],
      paymentState: createEmptyPaymentState(),
    }).byCustomer.get(2)!;

    const total = sumCustomerBalances([first, second]);
    expect(total).not.toEqual(emptyCustomerBalance());
    expect(total.goods.owed).toBeCloseTo(first.goods.owed + second.goods.owed);
    expect(total.delivery.owed).toBeCloseTo(first.delivery.owed + second.delivery.owed);
    expect(total.owed).toBeCloseTo(total.goods.owed + total.delivery.owed);
    expect(total.remaining).toBeCloseTo(total.owed - total.paid);
  });
});
