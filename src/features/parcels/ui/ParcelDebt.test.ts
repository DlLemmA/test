import { describe, expect, it } from "vitest";
import { parcelDebtClass, parcelDebtLabel } from "./ParcelDebt";

describe("parcel debt tag", () => {
  it("shows another customer's debt", () => {
    const facts = { remaining: 2.6, isSelf: false, deliveryInvoiced: true };
    expect(parcelDebtLabel(facts)).toBe("Долг 2.60 BYN");
    expect(parcelDebtClass(facts)).toBe("is-debt");
  });

  it("shows the self customer's remaining amount", () => {
    const facts = { remaining: 1.3, isSelf: true, deliveryInvoiced: true };
    expect(parcelDebtLabel(facts)).toBe("Остаток 1.30 BYN");
  });

  it("does not call covered goods paid before delivery is known", () => {
    const facts = { remaining: 0, isSelf: false, deliveryInvoiced: false };
    expect(parcelDebtLabel(facts)).toBe("без доставки");
    expect(parcelDebtClass(facts)).toBe("is-pending");
  });

  it("shows paid once delivery is invoiced", () => {
    const facts = { remaining: 0, isSelf: false, deliveryInvoiced: true };
    expect(parcelDebtLabel(facts)).toBe("Оплачено");
    expect(parcelDebtClass(facts)).toBe("is-paid");
  });
});
