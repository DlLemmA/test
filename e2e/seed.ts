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

type SnapshotBuilder = (base: SchemaSnapshot, schema: AppSchema) => SchemaSnapshot;

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
 * Replace the whole cache-backed fixture in one step, then reload so the app
 * mounts with test auth and the requested rows already in place. No Postgres,
 * auth flow or direct cache poking from specs is involved.
 */
async function seedSnapshot(page: Page, build: SnapshotBuilder): Promise<void> {
  await page.goto("/");
  const schema = await page.evaluate(() => {
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
    build(DEMO_SNAPSHOT(CREATED_AT, schema), schema),
  );
  await page.reload();
}

export async function seedSmokeData(page: Page): Promise<void> {
  await seedSnapshot(page, (base) => base);
}

export type ShipFixture = "untracked" | "unconfirmed" | "track-ready";

/** Add one draft item to parcel 1 with no tracks, unconfirmed tracks or confirmed tracks. */
export async function seedShipFixture(page: Page, fixture: ShipFixture): Promise<void> {
  const hasTrack = fixture !== "untracked";
  const confirmed = fixture === "track-ready";
  const name =
    fixture === "untracked"
      ? "Товар без треков"
      : fixture === "unconfirmed"
        ? "Товар с неподтверждёнными треками"
        : "Товар с треком";
  await seedSnapshot(page, (base, schema) => ({
    ...base,
    parcelItems: [
      ...base.parcelItems,
      {
        id: 12,
        parcelId: 1,
        name,
        priceCNY: 1,
        priceBYN: confirmed ? 0.5 : 0.1,
        quantity: 1,
        unit: schema.unit[0],
        customerId: 2,
        trackNumbers: JSON.stringify(hasTrack ? ["TRACK-1"] : []),
        weightsG: "[]",
        status: schema.itemStatus[0],
        ...(confirmed ? { tracksCompletedAt: CREATED_AT } : {}),
        createdAt: CREATED_AT,
      },
    ],
  }));
}

/** A paid item in the draft parcel: no delivery facts can exist yet. */
export async function seedPaidDraftFixture(page: Page): Promise<void> {
  await seedSnapshot(page, (base, schema) => ({
    ...base,
    parcelItems: [
      ...base.parcelItems,
      {
        id: 13,
        parcelId: 1,
        name: "Оплаченный товар в черновике",
        priceCNY: 10,
        priceBYN: 1.3,
        quantity: 1,
        unit: schema.unit[0],
        customerId: 2,
        trackNumbers: "[]",
        weightsG: "[]",
        status: schema.itemStatus[0],
        createdAt: CREATED_AT,
      },
    ],
    payments: [
      ...base.payments,
      {
        parcelId: 1,
        customerId: 2,
        itemId: 13,
        type: schema.paymentType[0],
        paid: true,
        createdAt: CREATED_AT,
      },
    ],
  }));
}

export type ReceiveFixture = {
  parcelId?: number;
  itemId?: number;
  track?: string;
  withShipping?: boolean;
};

/** Add a shipped parcel with one unweighed item, with or without shipping facts. */
export async function seedReceiveFixture(page: Page, options: ReceiveFixture = {}): Promise<void> {
  const { parcelId = 3, itemId = 30, track = "RCV-1", withShipping = true } = options;
  await seedSnapshot(page, (base, schema) => ({
    ...base,
    parcels: [
      ...base.parcels,
      {
        id: parcelId,
        status: schema.parcelStatus[1],
        createdAt: CREATED_AT,
        shippedAt: CREATED_AT,
        ...(withShipping ? { boxWeightG: 100, shippingCostBYN: 10 } : {}),
      },
    ],
    parcelItems: [
      ...base.parcelItems,
      {
        id: itemId,
        parcelId,
        name: "Товар на приёмку",
        priceCNY: 10,
        priceBYN: 1.3,
        quantity: 1,
        unit: schema.unit[0],
        customerId: 1,
        trackNumbers: JSON.stringify([track]),
        weightsG: "[]",
        status: schema.itemStatus[0],
        createdAt: CREATED_AT,
      },
    ],
  }));
}

/** Make the received demo parcel impossible to finish until it is reweighed. */
export async function seedUnweighedFixture(page: Page): Promise<void> {
  await seedSnapshot(page, (base) => ({
    ...base,
    parcelItems: base.parcelItems.map((row) => (row.id === 11 ? { ...row, weightsG: "[]" } : row)),
  }));
}

/** Start the comment flows from a known empty or pre-filled note. */
export async function seedParcelComment(page: Page, comment: string | null): Promise<void> {
  await seedSnapshot(page, (base) => ({
    ...base,
    parcels: base.parcels.map((row) => (row.id === 2 ? { ...row, comment } : row)),
  }));
}
