import { describe, expect, it } from "vitest";
import { Customer } from "@/features/customers/domain";
import { Parcel } from "@/features/parcels/domain/Parcel";
import { ParcelItem } from "@/features/parcels/domain/ParcelItem";
import { Payment } from "@/features/parcels/domain/Payment";
import {
  buildCustomerStatement,
  buildCustomerStatements,
  buildParcelStatement,
  type StatementData,
} from "./Statement";

const CREATED_AT = "2026-11-23T00:00:00.000Z";

function statements(): StatementData {
  return {
    customers: [
      Customer.fromPersistence({ id: 1, name: "Я", isSelf: true }),
      Customer.fromPersistence({ id: 2, name: "Катя", isSelf: false }),
    ],
    parcels: [
      Parcel.fromPersistence({
        id: 1,
        status: "received",
        boxWeightG: 300,
        shippingCostBYN: 30,
        createdAt: CREATED_AT,
      }),
      Parcel.fromPersistence({
        id: 2,
        status: "received",
        boxWeightG: 100,
        shippingCostBYN: 10,
        createdAt: CREATED_AT,
      }),
    ],
    items: [
      ParcelItem.fromPersistence({
        id: 10,
        parcelId: 1,
        name: "Товар Я",
        priceCNY: 100,
        priceBYN: 100,
        quantity: 1,
        unit: "pcs",
        customerId: 1,
        trackNumbers: "[]",
        weightsG: JSON.stringify([100]),
        status: "received",
        createdAt: CREATED_AT,
      }),
      ParcelItem.fromPersistence({
        id: 11,
        parcelId: 1,
        name: "Товар Кати",
        priceCNY: 100,
        priceBYN: 100,
        quantity: 1,
        unit: "pcs",
        customerId: 2,
        trackNumbers: "[]",
        weightsG: JSON.stringify([200]),
        status: "received",
        createdAt: CREATED_AT,
      }),
      ParcelItem.fromPersistence({
        id: 12,
        parcelId: 2,
        name: "Вторая посылка",
        priceCNY: 50,
        priceBYN: 50,
        quantity: 1,
        unit: "pcs",
        customerId: 2,
        trackNumbers: "[]",
        weightsG: JSON.stringify([100]),
        status: "received",
        createdAt: CREATED_AT,
      }),
    ],
    payments: [
      Payment.fromPersistence({
        id: 1,
        parcelId: 1,
        customerId: 2,
        itemId: 11,
        type: "item",
        paid: true,
        createdAt: CREATED_AT,
      }),
      Payment.fromPersistence({
        id: 2,
        parcelId: 2,
        customerId: 2,
        type: "shipping",
        paid: true,
        createdAt: CREATED_AT,
      }),
    ],
  };
}

describe("statements", () => {
  it("gives a parcel screen and Excel the same weighted balance facts", () => {
    const statement = buildParcelStatement(statements(), 1)!;
    const katya = statement.balance.byCustomer.get(2)!;

    expect(katya.goods.owed).toBe(100);
    expect(katya.delivery.owed).toBeCloseTo(20);
    expect(katya.owed).toBeCloseTo(120);
    expect(statement.balance.totals.owed).toBeCloseTo(230);
    expect(statement.paymentState.itemPaid.get(11)).toBe(true);
    expect(buildParcelStatement(statements(), 999)).toBeNull();
  });

  it("gives a customer screen the same facts as every parcel card", () => {
    const data = statements();
    const parcel = buildParcelStatement(data, 1)!;
    const customer = buildCustomerStatement(data, 2)!;

    expect(customer.parcelCount).toBe(2);
    expect(customer.items.map((item) => item.id)).toEqual([11, 12]);
    expect(customer.parcels.map((entry) => entry.parcel.id)).toEqual([1, 2]);
    expect(customer.parcels[0]!.balance.byCustomer.get(2)!.owed).toBeCloseTo(
      parcel.balance.byCustomer.get(2)!.owed,
    );
    expect(customer.balance.goods.owed).toBe(150);
    expect(customer.balance.delivery.owed).toBeCloseTo(30);
    expect(customer.balance.owed).toBeCloseTo(180);
    expect(customer.balance.paid).toBeCloseTo(110);
    expect(customer.balance.remaining).toBeCloseTo(70);
  });

  it("keeps the self customer fully paid in the customer list too", () => {
    const customers = buildCustomerStatements(statements());
    expect(customers.map((entry) => entry.customer.id)).toEqual([1, 2]);
    expect(customers[0]!.balance.remaining).toBe(0);
    expect(customers[1]!.balance.remaining).toBeCloseTo(70);

    const data = statements();
    const parcelTotals = [1, 2].map((id) => buildParcelStatement(data, id)!.balance.totals.owed);
    const customerOwed = customers.reduce((sum, entry) => sum + entry.balance.owed, 0);
    expect(customerOwed).toBeCloseTo(parcelTotals[0]! + parcelTotals[1]!);
  });
});
