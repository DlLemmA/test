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

type AppSchema = {
  parcelStatus: readonly ["draft", "shipped", "received", "done"];
  itemStatus: readonly ["ordered", "shipped", "received", "lost"];
  paymentType: readonly ["item", "shipping"];
  unit: readonly ["pcs", "packs", "pairs"];
  replaceAll(snapshot: {
    customers: Array<Record<string, unknown>>;
    parcels: Array<Record<string, unknown>>;
    parcelItems: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
  }): Promise<void>;
};

const CREATED_AT = "2026-01-01T00:00:00.000Z";

/**
 * Replace the browser database with a small, deterministic fixture. Everything
 * the smoke tests need lives here: a draft, a shipped parcel, one self item
 * and one payable item for another customer. The shared schema seam performs
 * the replacement in one transaction, so no test ever observes half a fixture.
 */
export async function seedSmokeData(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(async (createdAt) => {
    const { appSchema } = window as unknown as { appSchema: AppSchema };
    const { parcelStatus, itemStatus, paymentType, unit } = appSchema;
    await appSchema.replaceAll({
      customers: [
        { id: 1, name: "Я", isSelf: true },
        { id: 2, name: "Катя", isSelf: false },
      ],
      parcels: [
        { id: 1, status: parcelStatus[0], createdAt },
        {
          id: 2,
          status: parcelStatus[2],
          createdAt,
          shippedAt: createdAt,
          completedAt: createdAt,
          boxWeightG: 100,
          shippingCostBYN: 10,
        },
      ],
      parcelItems: [
        {
          id: 10,
          parcelId: 2,
          name: "Товар Я",
          priceCNY: 10,
          priceBYN: 1.3,
          quantity: 1,
          unit: unit[0],
          customerId: 1,
          trackNumbers: JSON.stringify(["SELF-1"]),
          weightsG: JSON.stringify([100]),
          status: itemStatus[1],
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
          unit: unit[0],
          customerId: 2,
          trackNumbers: JSON.stringify(["KAT-1"]),
          weightsG: JSON.stringify([200]),
          status: itemStatus[1],
          tracksCompletedAt: createdAt,
          createdAt,
        },
      ],
      payments: [
        {
          parcelId: 2,
          customerId: 2,
          itemId: 11,
          type: paymentType[0],
          paid: false,
          createdAt,
        },
        { parcelId: 2, customerId: 2, type: paymentType[1], paid: false, createdAt },
      ],
    });
  }, CREATED_AT);
  await page.reload();
}
