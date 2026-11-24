import type { Page } from "@playwright/test";

export type Table = {
  clear(): Promise<void>;
  get(id: number): Promise<Record<string, unknown> | undefined>;
  add(row: Record<string, unknown>): Promise<unknown>;
  update(id: number, changes: Record<string, unknown>): Promise<unknown>;
  bulkAdd(rows: unknown[]): Promise<unknown>;
  toArray(): Promise<Array<Record<string, unknown>>>;
};

export type AppCache = {
  customers: Table;
  parcels: Table;
  parcelItems: Table;
  payments: Table;
};

type SchemaSnapshot = {
  customers: Array<Record<string, unknown>>;
  parcels: Array<Record<string, unknown>>;
  parcelItems: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
};

type AppSchema = {
  parcelStatus: readonly ["draft", "shipped", "received", "done"];
  itemStatus: readonly ["ordered", "shipped", "received", "lost"];
  paymentType: readonly ["item", "shipping"];
  unit: readonly ["pcs", "packs", "pairs"];
  replaceAll(snapshot: SchemaSnapshot): Promise<void>;
};

const CREATED_AT = "2026-01-01T00:00:00.000Z";

const DEMO_SNAPSHOT = (createdAt: string, schema: AppSchema): SchemaSnapshot => ({
  customers: [
    { id: 1, name: "Я", isSelf: true },
    { id: 2, name: "Катя", isSelf: false },
  ],
  parcels: [
    { id: 1, status: schema.parcelStatus[0], createdAt },
    {
      id: 2,
      status: schema.parcelStatus[2],
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
      unit: schema.unit[0],
      customerId: 1,
      trackNumbers: JSON.stringify(["SELF-1"]),
      weightsG: JSON.stringify([100]),
      status: schema.itemStatus[1],
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
      unit: schema.unit[0],
      customerId: 2,
      trackNumbers: JSON.stringify(["KAT-1"]),
      weightsG: JSON.stringify([200]),
      status: schema.itemStatus[1],
      tracksCompletedAt: createdAt,
      createdAt,
    },
  ],
  payments: [
    {
      parcelId: 2,
      customerId: 2,
      itemId: 11,
      type: schema.paymentType[0],
      paid: false,
      createdAt,
    },
    { parcelId: 2, customerId: 2, type: schema.paymentType[1], paid: false, createdAt },
  ],
});

/**
 * Seed the in-memory cache, then reload so the app mounts with test auth and
 * the fixture already in place. No Postgres or real auth flow is involved.
 */
export async function seedSmokeData(page: Page): Promise<void> {
  await page.goto("/");
  const vocabulary = await page.evaluate(() => {
    const { appSchema } = window as unknown as { appSchema: AppSchema };
    return {
      parcelStatus: appSchema.parcelStatus,
      itemStatus: appSchema.itemStatus,
      paymentType: appSchema.paymentType,
      unit: appSchema.unit,
    };
  });

  await page.evaluate(
    async (snapshot) => {
      const { appAuth, appSchema } = window as unknown as {
        appAuth: { enterTestMode(): void };
        appSchema: AppSchema;
      };
      appAuth.enterTestMode();
      await appSchema.replaceAll(snapshot);
    },
    DEMO_SNAPSHOT(CREATED_AT, vocabulary),
  );
  await page.reload();
}
