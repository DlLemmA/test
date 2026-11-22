// ============================================
// Demo Data Seeding (Dexie version)
// ============================================

import { db } from "./database";
import { Customer } from "@/features/customers/domain";
import { Parcel, ParcelItem, Payment } from "@/features/parcels/domain";

const now = new Date();
const daysAgo = (n: number) => new Date(Date.now() - 86400000 * n).toISOString();

export async function seedDemo(force = false): Promise<void> {
  if (!force) {
    // Check if demo data already exists
    const existingCustomers = await db.customers.count();
    if (existingCustomers > 0) {
      console.log("Demo data already exists, skipping seed (use force=true to override)");
      return;
    }
  } else {
    // Clear existing data
    await db.customers.clear();
    await db.parcels.clear();
    await db.parcelItems.clear();
  }

  console.log("Seeding demo data...");

  // Create demo customers (from real Excel data)
  const marina = await db.customers.add(
    Customer.create({ name: "Кузнецова Марина Алексеевна", isSelf: true }).toPersistence() as any,
  );
  const ivan = await db.customers.add(
    Customer.create({ name: "Иван", isSelf: false }).toPersistence() as any,
  );

  // ============================================
  // Parcel 4: DONE (всё получено, всё оплачено)
  // Real data from Excel Sheet 3 - third batch (items 25-35)
  // ============================================
  const parcel4 = await db.parcels.add(Parcel.create().toPersistence() as any);

  const rate4 = 0.125;
  const demoItems4 = [
    {
      name: "Часы женские серебристые с бордовым циферблатом (бижутерия)",
      priceCNY: 60,
      priceBYN: 7.78,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["777454366640852"],
      weightsG: [92],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Штаны пижамные мужские",
      priceCNY: 59,
      priceBYN: 7.64,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["79150334766945"],
      weightsG: [257],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Платье женское чёрное",
      priceCNY: 67,
      priceBYN: 8.75,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["YT0717187280383"],
      weightsG: [190],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Рубашка женская с коротким рукавом в клетку",
      priceCNY: 71,
      priceBYN: 9.2,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["777454610950445"],
      weightsG: [153],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Часы женские с чёрным ремешком (бижутерия)",
      priceCNY: 35,
      priceBYN: 4.55,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["JT5537064500213"],
      weightsG: [30],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Тренч женский темно-серый",
      priceCNY: 201,
      priceBYN: 26.08,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["79150512381882"],
      weightsG: [670],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Сапоги-трубы женские чёрные",
      priceCNY: 113,
      priceBYN: 14.72,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["777454959271217"],
      weightsG: [917],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Сумка чёрная женская",
      priceCNY: 99,
      priceBYN: 12.92,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["777454597380539"],
      weightsG: [420],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Сапоги замшевые коричневые женские",
      priceCNY: 101,
      priceBYN: 13.15,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["465772770140686"],
      weightsG: [557],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Карты игральные",
      priceCNY: 16,
      priceBYN: 2.04,
      quantity: 1,
      unit: "packs" as const,
      customerId: marina,
      trackNumbers: ["JT5537063239986"],
      weightsG: [76],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Стеганая бежевая куртка женская",
      priceCNY: 87,
      priceBYN: 11.27,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["JT5536907290110"],
      weightsG: [530],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
  ];

  for (const item of demoItems4) {
    const pi = ParcelItem.create({ ...item, parcelId: parcel4 });
    await db.parcelItems.add(pi.toPersistence() as any);
  }

  // Calculate shipping cost from real data
  const shippingCost4 = 1.29 + 3.62 + 2.67 + 2.15 + 0.42 + 9.43 + 12.91 + 5.91 + 7.84 + 1.07 + 7.46;

  await db.parcels.update(parcel4, {
    status: "done",
    shippedAt: daysAgo(20),
    receivedAt: daysAgo(10),
    boxWeightG: 600,
    shippingCostBYN: Math.round(shippingCost4 * 100) / 100,
    completedAt: daysAgo(10),
  });

  // Add payments for parcel 4 (all paid)
  const payment1 = Payment.create({
    parcelId: parcel4,
    customerId: marina,
    itemId: 1,
    type: "item",
    paid: true,
  });
  await db.payments.add(payment1.toPersistence() as any);
  const payment2 = Payment.create({
    parcelId: parcel4,
    customerId: marina,
    itemId: 2,
    type: "item",
    paid: true,
  });
  await db.payments.add(payment2.toPersistence() as any);
  const payment3 = Payment.create({
    parcelId: parcel4,
    customerId: marina,
    itemId: 3,
    type: "item",
    paid: true,
  });
  await db.payments.add(payment3.toPersistence() as any);
  const payment4 = Payment.create({
    parcelId: parcel4,
    customerId: marina,
    itemId: 4,
    type: "item",
    paid: true,
  });
  await db.payments.add(payment4.toPersistence() as any);
  const payment5 = Payment.create({
    parcelId: parcel4,
    customerId: marina,
    itemId: 5,
    type: "item",
    paid: true,
  });
  await db.payments.add(payment5.toPersistence() as any);
  const payment6 = Payment.create({
    parcelId: parcel4,
    customerId: marina,
    itemId: 6,
    type: "item",
    paid: true,
  });
  await db.payments.add(payment6.toPersistence() as any);
  const payment7 = Payment.create({
    parcelId: parcel4,
    customerId: marina,
    itemId: 7,
    type: "item",
    paid: true,
  });
  await db.payments.add(payment7.toPersistence() as any);
  const payment8 = Payment.create({
    parcelId: parcel4,
    customerId: marina,
    itemId: 8,
    type: "item",
    paid: true,
  });
  await db.payments.add(payment8.toPersistence() as any);
  const payment9 = Payment.create({
    parcelId: parcel4,
    customerId: marina,
    itemId: 9,
    type: "item",
    paid: true,
  });
  await db.payments.add(payment9.toPersistence() as any);
  const payment10 = Payment.create({
    parcelId: parcel4,
    customerId: marina,
    itemId: 10,
    type: "item",
    paid: true,
  });
  await db.payments.add(payment10.toPersistence() as any);
  const payment11 = Payment.create({
    parcelId: parcel4,
    customerId: marina,
    itemId: 11,
    type: "item",
    paid: true,
  });
  await db.payments.add(payment11.toPersistence() as any);
  const shippingPayment = Payment.create({
    parcelId: parcel4,
    customerId: marina,
    type: "shipping",
    paid: true,
  });
  await db.payments.add(shippingPayment.toPersistence() as any);

  // ============================================
  // Parcel 3: RECEIVED (треки готовы, веса добавлены, посылка получена)
  // Real data from Excel Sheet 3 - second batch (items 13-24)
  // ============================================
  const parcel3 = await db.parcels.add(Parcel.create().toPersistence() as any);

  const rate3 = 0.128;
  const demoItems3 = [
    {
      name: "Носки спортивные короткие",
      priceCNY: 67,
      priceBYN: 8.65,
      quantity: 1,
      unit: "packs" as const,
      customerId: marina,
      trackNumbers: ["YT7650185051885"],
      weightsG: [146],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Набор для вышивки крестиком",
      priceCNY: 124,
      priceBYN: 16.15,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["JT3181117867215"],
      weightsG: [230],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Майка спортивная с принтом",
      priceCNY: 138,
      priceBYN: 17.94,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["YT7650281918673"],
      weightsG: [157],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Жилетка дутая чёрная мужская",
      priceCNY: 299,
      priceBYN: 38.9,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["435401469436847"],
      weightsG: [530],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Жилетка дутая бирюзовая женская",
      priceCNY: 386,
      priceBYN: 50.14,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["YT0717617919407"],
      weightsG: [654],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Керамическая ваза-сапог рождественская",
      priceCNY: 168,
      priceBYN: 21.85,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["465771767233139"],
      weightsG: [1170],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Органайзер для рукоделия",
      priceCNY: 67,
      priceBYN: 8.69,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["777454632343747"],
      weightsG: [411],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Джинсы свободные с широким ремнем",
      priceCNY: 246,
      priceBYN: 32.0,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["465757801342228"],
      weightsG: [692],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Тени для век",
      priceCNY: 120,
      priceBYN: 15.59,
      quantity: 3,
      unit: "packs" as const,
      customerId: marina,
      trackNumbers: ["9840251135681", "JT5537161885374", "9840284641222"],
      weightsG: [180, 180, 180],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Худи мужское",
      priceCNY: 315,
      priceBYN: 40.94,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["465772348923442"],
      weightsG: [845],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Штаны пижамные женские",
      priceCNY: 48,
      priceBYN: 6.12,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["79150316818643"],
      weightsG: [271],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Кроссовки женские коричневые",
      priceCNY: 155,
      priceBYN: 20.15,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["79150343879974"],
      weightsG: [545],
      status: "received" as const,
      tracksCompletedAt: now.toISOString(),
    },
  ];

  for (const item of demoItems3) {
    const pi = ParcelItem.create({ ...item, parcelId: parcel3 });
    await db.parcelItems.add(pi.toPersistence() as any);
  }

  // Calculate shipping cost from real data
  // Sum of shipping costs for these items
  const shippingCost3 =
    2.05 + 3.24 + 2.21 + 7.46 + 9.2 + 16.47 + 5.78 + 9.74 + 7.6 + 11.89 + 3.81 + 7.67;

  await db.parcels.update(parcel3, {
    status: "received",
    shippedAt: daysAgo(10),
    receivedAt: daysAgo(2),
    boxWeightG: 800,
    shippingCostBYN: Math.round(shippingCost3 * 100) / 100,
    completedAt: daysAgo(2),
  });

  // ============================================
  // Parcel 2: SHIPPED (треки заполнены, готово к получению)
  // Real data from Excel Sheet 3 - first batch (items 1-12)
  // ============================================
  const parcel2 = await db.parcels.add(Parcel.create().toPersistence() as any);

  const rate2 = 0.13;
  const demoItems2 = [
    {
      name: "Брелок для телефона",
      priceCNY: 12,
      priceBYN: 1.61,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["JT3180976189484"],
      weightsG: [],
      status: "shipped" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Набор носков спортивных (жёлтый+оранжевый+зелёный)",
      priceCNY: 49,
      priceBYN: 6.42,
      quantity: 1,
      unit: "packs" as const,
      customerId: marina,
      trackNumbers: ["465772297744181"],
      weightsG: [],
      status: "shipped" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Набор носков спортивных (розовый+малиновый+белый)",
      priceCNY: 49,
      priceBYN: 6.42,
      quantity: 1,
      unit: "packs" as const,
      customerId: marina,
      trackNumbers: ["465772297744181"],
      weightsG: [],
      status: "shipped" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Наклейки для декора",
      priceCNY: 13,
      priceBYN: 1.7,
      quantity: 1,
      unit: "packs" as const,
      customerId: marina,
      trackNumbers: ["JT5536800643600"],
      weightsG: [],
      status: "shipped" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Игрушка антистресс",
      priceCNY: 19,
      priceBYN: 2.47,
      quantity: 2,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["JT5536759488193"],
      weightsG: [],
      status: "shipped" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Маска для волос 750 г",
      priceCNY: 114,
      priceBYN: 14.78,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["YT0717196957616"],
      weightsG: [],
      status: "shipped" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Брелок для ключей",
      priceCNY: 17,
      priceBYN: 2.22,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["YT0717330210322"],
      weightsG: [],
      status: "shipped" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Футляр для очков для плавания",
      priceCNY: 54,
      priceBYN: 6.97,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["79150182794002"],
      weightsG: [],
      status: "shipped" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Водосгон с ручкой для зеркал",
      priceCNY: 13,
      priceBYN: 1.7,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["9840258102554"],
      weightsG: [],
      status: "shipped" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Серебристые серьги кольца",
      priceCNY: 13,
      priceBYN: 1.67,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["777454632770782"],
      weightsG: [],
      status: "shipped" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Женский голубой кардиган с запахом",
      priceCNY: 113,
      priceBYN: 14.67,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["465771465144070"],
      weightsG: [],
      status: "shipped" as const,
      tracksCompletedAt: now.toISOString(),
    },
    {
      name: "Лонгслив спортивный фиолетово-салатовый",
      priceCNY: 185,
      priceBYN: 24.06,
      quantity: 1,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: ["YT7650364463007"],
      weightsG: [],
      status: "shipped" as const,
      tracksCompletedAt: now.toISOString(),
    },
  ];

  for (const item of demoItems2) {
    const pi = ParcelItem.create({ ...item, parcelId: parcel2 });
    await db.parcelItems.add(pi.toPersistence() as any);
  }

  await db.parcels.update(parcel2, {
    status: "shipped",
    shippedAt: daysAgo(5),
  });

  // ============================================
  // Parcel 1: DRAFT (без треков, черновик)
  // ============================================
  const parcel1 = await db.parcels.add(Parcel.create().toPersistence() as any);

  const rate1 = 0.132;
  const demoItems1 = [
    {
      name: "Носки (партия 1)",
      priceCNY: 40,
      priceBYN: Math.round(40 * rate1 * 100) / 100,
      quantity: 3,
      unit: "pcs" as const,
      customerId: marina,
      trackNumbers: [],
      weightsG: [],
      status: "ordered" as const,
    },
    {
      name: "Шапка",
      priceCNY: 150,
      priceBYN: Math.round(150 * rate1 * 100) / 100,
      quantity: 1,
      unit: "pcs" as const,
      customerId: ivan,
      trackNumbers: [],
      weightsG: [],
      status: "ordered" as const,
    },
  ];

  for (const item of demoItems1) {
    const pi = ParcelItem.create({ ...item, parcelId: parcel1 });
    await db.parcelItems.add(pi.toPersistence() as any);
  }

  console.log("Demo data seeded successfully");
}
