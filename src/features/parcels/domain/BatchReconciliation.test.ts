import { describe, expect, it } from "vitest";
import { reconcileBatch, type BatchItemInput } from "./BatchReconciliation";

function item(priceCNY: number, priceBYN: number): BatchItemInput {
  return {
    name: "Товар",
    priceCNY,
    priceBYN,
    quantity: 1,
    unit: "pcs",
    customerId: 1,
  };
}

const sum = (items: BatchItemInput[], field: "priceCNY" | "priceBYN") =>
  items.reduce((total, i) => total + i[field], 0);

describe("reconcileBatch", () => {
  it("spreads a commission in both currencies and keeps the entered totals", () => {
    const result = reconcileBatch([item(60, 8), item(40, 5)], {
      totalCNY: 105,
      totalBYN: 13.65,
    });

    expect(result.review.kind).toBe("commission");
    expect(result.review.distributed).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(sum(result.items, "priceCNY")).toBeCloseTo(105);
    expect(sum(result.items, "priceBYN")).toBeCloseTo(13.65);
    expect(result.items[1]!.priceCNY).toBeGreaterThan(40);
  });

  it("leaves an overpayment untouched", () => {
    const items = [item(100, 13)];
    const result = reconcileBatch(items, { totalCNY: 90, totalBYN: 11.7 });

    expect(result.review.kind).toBe("overpayment");
    expect(result.review.distributed).toBe(false);
    expect(result.items).toBe(items);
  });

  it("does not distribute when only CNY has a surplus", () => {
    const items = [item(100, 13)];
    const result = reconcileBatch(items, { totalCNY: 105, totalBYN: 12 });

    expect(result.review.kind).toBe("unallocated");
    expect(result.review.absCNY).toBeCloseTo(5);
    expect(result.review.absBYN).toBeCloseTo(1);
    expect(result.review.distributed).toBe(false);
    expect(result.items).toBe(items);
  });

  it("does not distribute when BYN has a surplus but CNY does not", () => {
    const items = [item(100, 13)];
    const result = reconcileBatch(items, { totalCNY: 100, totalBYN: 13.65 });

    expect(result.review.kind).toBe("unallocated");
    expect(result.review.distributed).toBe(false);
    expect(result.items).toBe(items);
  });

  it("reports a balanced batch without changing prices", () => {
    const items = [item(100, 13)];
    const result = reconcileBatch(items, { totalCNY: 100, totalBYN: 13 });

    expect(result.review.kind).toBe("balanced");
    expect(result.review.absCNY).toBe(0);
    expect(result.review.absBYN).toBe(0);
    expect(result.review.distributed).toBe(false);
    expect(result.items).toBe(items);
  });

  it("never scales an empty batch", () => {
    const result = reconcileBatch([], { totalCNY: 100, totalBYN: 13 });

    expect(result.review.kind).toBe("unallocated");
    expect(result.review.commissionPercent).toBe(0);
    expect(result.items).toEqual([]);
  });
});
