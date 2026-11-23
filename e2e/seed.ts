import type { Page } from "@playwright/test";

export type Table = {
  clear(): Promise<void>;
  add(row: Record<string, unknown>): Promise<unknown>;
  update(id: number, changes: Record<string, unknown>): Promise<unknown>;
  bulkAdd(rows: unknown[]): Promise<unknown>;
  toArray(): Promise<Array<Record<string, unknown>>>;
};

export type AppDb = {
  customers: Table;
  parcels: Table;
  parcelItems: Table;
  payments: Table;
};

const CREATED_AT = "2026-01-01T00:00:00.000Z";

/**
 * Replace the browser database with a small, deterministic fixture. Everything
 * the smoke tests need lives here: a draft, a shipped parcel, one self item
 * and one payable item for another customer.
 */
export async function seedSmokeData(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(async (createdAt) => {
    const db = (window as unknown as { appDb: AppDb }).appDb;
    await Promise.all([
      db.customers.clear(),
      db.parcels.clear(),
      db.parcelItems.clear(),
      db.payments.clear(),
    ]);

    await db.customers.bulkAdd([
      { id: 1, name: "Я", isSelf: true },
      { id: 2, name: "Катя", isSelf: false },
    ]);
    await db.parcels.bulkAdd([
      { id: 1, status: "draft", createdAt },
      {
        id: 2,
        status: "received",
        createdAt,
        shippedAt: createdAt,
        completedAt: createdAt,
        boxWeightG: 100,
        shippingCostBYN: 10,
      },
    ]);
    await db.parcelItems.bulkAdd([
      {
        id: 10,
        parcelId: 2,
        name: "Товар Я",
        priceCNY: 10,
        priceBYN: 1.3,
        quantity: 1,
        unit: "pcs",
        customerId: 1,
        trackNumbers: JSON.stringify(["SELF-1"]),
        weightsG: JSON.stringify([100]),
        status: "shipped",
        tracksCompletedAt: createdAt,
        createdAt,
      },
      {
        id: 11,
        parcelId: 2,
        name: "Товар Кати",
        priceCNY: 20,
        priceBYN: 2.6,
        quantity: 1,
        unit: "pcs",
        customerId: 2,
        trackNumbers: JSON.stringify(["KAT-1"]),
        weightsG: JSON.stringify([200]),
        status: "shipped",
        tracksCompletedAt: createdAt,
        createdAt,
      },
    ]);
    await db.payments.bulkAdd([
      {
        parcelId: 2,
        customerId: 2,
        itemId: 11,
        type: "item",
        paid: false,
        createdAt,
      },
      { parcelId: 2, customerId: 2, type: "shipping", paid: false, createdAt },
    ]);
  }, CREATED_AT);
  await page.reload();
}
