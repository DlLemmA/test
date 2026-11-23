// ============================================
// Demo Data Seeding (Dexie version)
// ============================================
//
// Главная посылка — данные из накладной от 10.11.2026:
// 26 кг, доставка 405,38 BYN. Веса в накладной указаны в кг,
// здесь они переведены в граммы. Остальные посылки, заказчики
// и трек-номера придуманы, чтобы показать все статусы и расчёты.

import { db } from "./database";
import {
  CNY_TO_BYN,
  ITEM_STATUSES,
  PARCEL_STATUSES,
  SELF_CUSTOMER_NAME,
  UNITS,
  numberArray,
  replaceAll,
  stringArray,
  type CustomerRow,
  type ParcelRow,
  type ParcelItemRow,
  type PaymentRow,
  type ParcelStatus,
  type ParcelItemStatus,
  type Unit,
} from "./dbSchema";

type CustomerKey =
  | "marina"
  | "ksusha"
  | "milana"
  | "artem"
  | "katya"
  | "nastya"
  | "ivan"
  | "babushka"
  | "natasha"
  | "nazar";

type SeedItemStatus = ParcelItemStatus;

interface SeedItem {
  name: string;
  priceBYN: number;
  weightKg: number;
  customer: CustomerKey;
  qty?: number;
  unit?: Unit;
  tracks?: string[];
  noWeight?: boolean;
  paid?: boolean;
  status?: SeedItemStatus;
}

interface SeedParcel {
  name: string;
  status: ParcelStatus;
  createdAt: string;
  shippedAt?: string;
  receivedAt?: string;
  boxWeightG?: number;
  shippingCostBYN?: number;
  items: SeedItem[];
  shippingPaid?: Partial<Record<CustomerKey, boolean>>;
  allPaid?: boolean;
}

const CUSTOMERS: Record<CustomerKey, string> = {
  marina: "Марина",
  ksusha: "Ксюша",
  milana: "Милана",
  artem: "Артем",
  katya: "Катя",
  nastya: "Настя",
  ivan: "Иван",
  babushka: "Бабушка Света",
  natasha: "Наташа",
  nazar: "Назар",
};

// Курс живёт в схеме БД; демо-данные используют то же значение, что и приложение.
const priceCNY = (byn: number) => Math.round(byn / CNY_TO_BYN);

const it = (
  name: string,
  priceBYN: number,
  weightKg: number,
  customer: CustomerKey,
  extra: Partial<SeedItem> = {},
): SeedItem => ({ name, priceBYN, weightKg, customer, ...extra });

const PACK = { unit: "packs" as const };
const PAIR = { unit: "pairs" as const };
const tr = (value: string) =>
  value
    .split(";")
    .map((t) => t.trim())
    .filter(Boolean);

// Треки генерируются детерминированно, чтобы демо-data выглядела одинаково
// после каждой перезагрузки и не содержала реальных номеров.
const TRACK_PREFIXES = ["YT", "JT", "77", "465", "984", "791"];
let trackCounter = 0;

function nextTracks(count: number): string[] {
  return Array.from({ length: count }, () => {
    trackCounter += 1;
    const prefix = TRACK_PREFIXES[trackCounter % TRACK_PREFIXES.length]!;
    const digits = String(1000000000000 + ((trackCounter * 7919) % 9000000000000));
    return `${prefix}${digits}`;
  });
}

function splitWeight(weightKg: number, count: number): number[] {
  const totalG = Math.round(weightKg * 1000);
  const base = Math.floor(totalG / count);
  return Array.from({ length: count }, (_, idx) =>
    idx === count - 1 ? totalG - base * (count - 1) : base,
  );
}

// ============================================
// Посылка от 10.11.2026 — реальные позиции из накладной
// ============================================

const invoiceFromNovember: SeedParcel = {
  name: "Посылка от 10.11.2026",
  status: "done",
  createdAt: "2026-11-05T10:00:00.000Z",
  shippedAt: "2026-11-10T09:00:00.000Z",
  receivedAt: "2026-11-20T12:00:00.000Z",
  boxWeightG: 26000,
  shippingCostBYN: 405.38,
  shippingPaid: { ksusha: true, katya: true },
  items: [
    // Марина (я)
    it("Плед бело-розовый", 9.6, 0.36, "marina"),
    it("Картина по номерам 40×50", 16.08, 0.993, "marina"),
    it("Патчи для глаз", 3.63, 0.178, "marina", PACK),
    it("Крабик в форме звездочки", 2.16, 0.056, "marina"),
    it("Французский гребень", 3.63, 0.043, "marina"),
    it("Косметичка для зарядки телефона", 1.37, 0.035, "marina"),
    it("Ковер 120×160 полукруглый", 53.13, 2.9, "marina"),
    it("Чехол для ключей машины разноцветный", 5.01, 0.043, "marina"),
    it("Конструктор «Цветы в вазе» (аналог Lego)", 29.47, 0.918, "marina"),
    it("Французская шпилька", 2.52, 0.052, "marina"),
    it("Тапки домашние белые с розовым котом", 6.2, 0.28, "marina", PAIR),
    it("Пяльца для вышивания деревянные", 12.64, 0.561, "marina"),
    it("Цепочка-ремень со звездами", 1.72, 0.034, "marina"),
    it("Кулон в виде часов", 6.61, 0.032, "marina"),
    it("Набор карточек «Винкс»", 15.97, 0.306, "marina", PACK),
    it("Повязка на голову белая в горошек с розовой пуговицей", 2.22, 0.083, "marina"),
    it("Чехол для телефона с пуантами", 5.0, 0.029, "marina"),
    it("Чехол для телефона розовый с лошадями", 1.74, 0.032, "marina"),
    it("Браслет с часами (бижутерия)", 4.08, 0.04, "marina"),
    it("Балетки серебристые женские", 7.16, 0.396, "marina"),
    it("Штаны серые спортивные женские", 17.72, 0.612, "marina"),
    it("Худи серое с капюшоном женское", 29.08, 0.711, "marina"),
    it("Майка белая с принтом", 11.42, 0.296, "marina", { qty: 2 }),
    it("Зонтик складной маленький", 3.97, 0.232, "marina"),

    // Ксюша — товары оплачены, доставка оплачена
    it("Часы наручные (бижутерия)", 4.04, 0.055, "ksusha", { paid: true }),
    it("Майка поло бело-коричневая", 9.02, 0.191, "ksusha", { paid: true }),
    it("Серьги-кольца (бижутерия)", 1.56, 0.028, "ksusha", { ...PAIR, paid: true }),
    it("Зонтик складной маленький", 3.97, 0.207, "ksusha", { qty: 2, paid: true }),
    it("Серьги-гвоздики коричневые (бижутерия)", 1.09, 0.022, "ksusha", { ...PAIR, paid: true }),
    it("Серьги-гвоздики в форме сердечек (бижутерия)", 1.35, 0.024, "ksusha", {
      ...PAIR,
      paid: true,
    }),
    it("Лонгслив светло-желтый с надписью", 14.08, 0.251, "ksusha", { paid: true }),
    it("Брелок для ключей машины", 4.9, 0.022, "ksusha", { paid: true }),
    it("Чехол для ключей машины серый", 8.01, 0.045, "ksusha", { paid: true }),
    it("Чехол для ключей машины беж", 4.46, 0.045, "ksusha", { paid: true }),
    it("Подставка для номера телефона в машину", 1.79, 0.051, "ksusha", { paid: true }),
    it("Майка с принтом белая", 14.7, 0.203, "ksusha", { paid: true }),
    it("Подставка для телефона в виде лапки кота", 2.43, 0.097, "ksusha", { paid: true }),
    it("Рубашка розовая в полоску", 18.9, 0.238, "ksusha", { paid: true }),
    it("Складная расческа", 1.16, 0.068, "ksusha", { paid: true }),
    it("Подставка под спонж для макияжа", 1.46, 0.049, "ksusha", { paid: true }),
    it("Чехол-сумочка для телефона", 2.25, 0.083, "ksusha", { paid: true }),
    it("Укороченная кофта-кардиган", 10.28, 0.36, "ksusha", { paid: true }),
    it("Сумка замшевая коричневая на цепочках", 10.6, 0.364, "ksusha", { paid: true }),

    // Милана — пока ничего не оплачено
    it("Сумка черная женская", 4.59, 0.329, "milana"),
    it("Меховые наушники женские белые", 8.95, 0.099, "milana"),
    it("Шарфик женский", 5.26, 0.226, "milana"),
    it("Ремень женский черный с бляшкой-котом", 2.29, 0.084, "milana"),
    it("Фигурка-сюрприз", 3.76, 0.098, "milana"),
    it("Ветровка красная женская", 16.06, 0.397, "milana"),
    it("Белая кофта женская на пуговицах в черный горошек", 15.06, 0.36, "milana"),

    // Артем + Катя — общая позиция разделена между ними
    it("Пижама розовая теплая женская", 11.33, 0.428, "katya"),
    it("Чехол на телефон серый матовый", 15.7, 0.119, "artem", { paid: true }),
    it("Куртка мужская бежевая с капюшоном", 31.9, 1.2, "artem", { paid: true }),
    it("Костюм белый домашний женский", 21.57, 0.317, "katya"),
    it("Чехол на планшет", 10.92, 0.395, "artem"),
    it("Кофта белая на флисе с замком у горла", 17.9, 0.412, "katya"),
    it("Сумка черная с золотой фурнитурой", 22.67, 0.754, "katya"),
    it("Шоппер из искусственной кожи", 20.61, 0.574, "katya"),
    it("Лонгслив серый женский", 10.05, 0.216, "artem"),
    it("Халат женский розовый", 13.72, 0.542, "katya"),
    it("Коричневая майка поло мужская", 8.68, 0.233, "artem", { paid: true }),
    it("Черная кофта мужская с замком у горла", 21.94, 0.683, "artem"),
    it("Конструктор «Шлем пилота Формулы» (аналог Lego)", 40.39, 0.845, "artem", { paid: true }),
    it("Держатель для телефона с вакуумной присоской", 5.33, 0.1115, "artem", { qty: 2 }),
    it("Кафф (бижутерия)", 2.02, 0.015, "katya"),

    // Настя
    it("Держатель для телефона с вакуумной присоской", 5.33, 0.1115, "nastya"),
    it("Серьги в форме звездочек", 2.09, 0.028, "nastya", PAIR),
    it("Подвеска серебряная (бижутерия)", 5.04, 0.046, "nastya"),
    it("Кафф (бижутерия)", 2.02, 0.015, "nastya", { qty: 2 }),
    it("Юбка белая", 30.9, 0.3, "nastya"),
    it("Пиджак черный женский", 22.9, 0.488, "nastya"),
    it("Рубашка джинсовая женская", 34.37, 0.355, "nastya"),
    it("Худи белое с принтом женское", 48.48, 1.09, "nastya", { qty: 2 }),
    it("Сумка черная маленькая женская", 10.7, 0.234, "nastya"),
    it("Сережки серебряные с подвесками (бижутерия)", 10.05, 0.074, "nastya", PAIR),
    it("Чехол для телефона с зеркалом", 13.96, 0.069, "nastya"),
    it("Топ женский с открытой спиной", 16.07, 0.09, "nastya"),
    it("Рубашка в клетку женская", 33.51, 0.288, "nastya"),
    it("Куртка-косуха женская черная", 41.22, 0.66, "nastya"),
  ],
};

// ============================================
// Остальные посылки — придуманные данные для демо
// ============================================

const shippedInNovember: SeedParcel = {
  name: "Посылка от 18.11.2026",
  status: "shipped",
  createdAt: "2026-11-14T10:00:00.000Z",
  shippedAt: "2026-11-18T09:00:00.000Z",
  items: [
    it("Набор наклеек для ноутбука", 2.8, 0.045, "ksusha", PACK),
    it("Чехол для телефона с блёстками", 4.35, 0.038, "nastya"),
    it("Носки детские, 3 пары", 6.1, 0.162, "milana", PACK),
    it("Брелок мягкий «Мишка»", 1.95, 0.041, "katya"),
    it("Лента для волос атласная", 2.4, 0.019, "ksusha"),
    it("Кружка керамическая с ручкой", 12.7, 0.48, "ivan"),
    it("Футболка мужская с принтом", 13.8, 0.21, "artem"),
    it("Закладки для книг, набор", 1.6, 0.012, "marina", PACK),
    it("Зубная щётка складная", 3.2, 0.026, "marina"),
    it("Набор для вышивки «Кот»", 18.4, 0.34, "marina"),
    it("Сумка-шоппер ч/б", 9.75, 0.19, "ksusha"),
  ],
};

const receivedInOctober: SeedParcel = {
  name: "Посылка от 28.10.2026",
  status: "received",
  createdAt: "2026-10-24T10:00:00.000Z",
  shippedAt: "2026-10-28T09:00:00.000Z",
  receivedAt: "2026-11-04T12:00:00.000Z",
  boxWeightG: 7200,
  shippingCostBYN: 112.2,
  items: [
    it("Куртка детская демисезонная", 28.5, 1.15, "milana"),
    it("Шапка вязаная серая", 7.8, 0.12, "ivan"),
    it("Варежки детские", 4.2, 0.065, "milana", PACK),
    it("Комплект постельного белья", 34.9, 1.4, "marina"),
    it("Полотенца для рук, 2 шт", 15.6, 0.62, "marina", PACK),
    it("Сумка через плечо", 11.3, 0.34, "ksusha", { paid: true }),
    it("Ремень мужской", 9.9, 0.14, "artem"),
    it("Игрушка мягкая «Зайка»", 8.1, 0.28, "katya"),
  ],
};

const nextDraft: SeedParcel = {
  name: "Следующая посылка",
  status: "draft",
  createdAt: "2026-11-22T10:00:00.000Z",
  items: [
    it("Набор контейнеров для еды", 12.4, 0.78, "marina"),
    it("Маска для сна", 3.6, 0.035, "nastya"),
    it("Наушники беспроводные", 17.8, 0.11, "artem"),
    it("Книга-раскраска", 6.5, 0.24, "milana", PACK),
  ],
};

// Ещё одна завершённая доставка из накладной: 25 кг, 351,87 BYN.
// Трек-номера и веса здесь реальные, поэтому они заданы явно.
const completedDelivery: SeedParcel = {
  name: "Посылка от 21.10.2026",
  status: "done",
  createdAt: "2026-10-16T10:00:00.000Z",
  shippedAt: "2026-10-21T09:00:00.000Z",
  receivedAt: "2026-11-01T12:00:00.000Z",
  boxWeightG: 25000,
  shippingCostBYN: 351.87,
  allPaid: true,
  items: [
    // Марина (я)
    it("Брелок для телефона", 1.61, 0.06, "marina", { tracks: tr("JT3180976189484") }),
    it("Набор носков спортивных (желтый+оранжевый+зеленый)", 6.42, 0.268, "marina", {
      ...PACK,
      tracks: tr("465772297744181"),
    }),
    it("Набор носков спортивных (розовый+малиновый+белый)", 6.42, 0, "marina", {
      ...PACK,
      tracks: tr("465772297744181"),
      noWeight: true,
    }),
    it("Наклейки для декора", 1.7, 0.014, "marina", {
      ...PACK,
      tracks: tr("JT5536800643600"),
    }),
    it("Игрушка антистресс", 2.47, 0.1, "marina", {
      qty: 2,
      tracks: tr("JT5536759488193"),
    }),
    it("Маска для волос 750 г", 14.78, 0.935, "marina", { tracks: tr("YT0717196957616") }),
    it("Брелок для ключей", 2.22, 0.017, "marina", { tracks: tr("YT0717330210322") }),
    it("Футляр для очков для плавания", 6.97, 0.136, "marina", {
      tracks: tr("79150182794002"),
    }),
    it("Водосгон с ручкой для зеркал", 1.7, 0.12, "marina", { tracks: tr("9840258102554") }),
    it("Серебристые серьги кольца", 1.67, 0.023, "marina", {
      ...PAIR,
      tracks: tr("777454632770782"),
    }),
    it("Женский голубой кардиган с запахом", 14.67, 0.387, "marina", {
      tracks: tr("465771465144070"),
    }),
    it("Лонгслив спортивный фиолетово-салатовый", 24.06, 0.136, "marina", {
      tracks: tr("YT7650364463007"),
    }),
    it("Носки спортивные короткие", 8.65, 0.146, "marina", {
      ...PACK,
      tracks: tr("YT7650185051885"),
    }),
    it("Набор для вышивки крестиком", 16.15, 0.23, "marina", { tracks: tr("JT3181117867215") }),
    it("Майка спортивная с принтом", 17.94, 0.157, "marina", { tracks: tr("YT7650281918673") }),
    it("Жилетка дутая черная мужская", 38.9, 0.53, "marina", { tracks: tr("435401469436847") }),
    it("Жилетка дутая бирюзовая женская", 50.14, 0.654, "marina", {
      tracks: tr("YT0717617919407"),
    }),
    it("Керамическая ваза-сапог рождественская", 21.85, 1.17, "marina", {
      tracks: tr("465771767233139"),
    }),

    // Бабушка Света
    it("Органайзер для рукоделия", 8.69, 0.411, "babushka", { tracks: tr("777454632343747") }),

    // Милана
    it("Джинсы свободные с широким ремнем", 32, 0.692, "milana", {
      tracks: tr("465757801342228"),
    }),
    it("Тени для век", 15.59, 0.54, "milana", {
      qty: 3,
      ...PACK,
      tracks: tr("9840251135681; JT5537161885374; 9840284641222"),
    }),
    it("Худи мужское", 40.94, 0.845, "milana", { tracks: tr("465772348923442") }),
    it("Штаны пижамные женские", 6.12, 0.271, "milana", { tracks: tr("79150316818643") }),
    it("Кроссовки женские коричневые", 20.15, 0.545, "milana", {
      ...PAIR,
      tracks: tr("79150343879974"),
    }),
    it("Часы женские серебристые с бордовым циферблатом (бижутерия)", 7.78, 0.092, "milana", {
      tracks: tr("777454366640852"),
    }),
    it("Штаны пижамные мужские", 7.64, 0.257, "milana", { tracks: tr("79150334766945") }),
    it("Платье женское черное", 8.75, 0.19, "milana", { tracks: tr("YT0717187280383") }),
    it("Рубашка женская с коротким рукавом в клетку", 9.2, 0.153, "milana", {
      tracks: tr("777454610950445"),
    }),
    it("Часы женские с черным ремешком (бижутерия)", 4.55, 0.03, "milana", {
      tracks: tr("JT5537064500213"),
    }),
    it("Тренч женский темно-серый", 26.08, 0.67, "milana", { tracks: tr("79150512381882") }),
    it("Сапоги-трубы женские черные", 14.72, 0.917, "milana", {
      ...PAIR,
      tracks: tr("777454959271217"),
    }),
    it("Сумка черная женская", 12.92, 0.42, "milana", { tracks: tr("777454597380539") }),
    it("Сапоги замшевые коричневые женские", 13.15, 0.557, "milana", {
      ...PAIR,
      tracks: tr("465772770140686"),
    }),
    it("Карты игральные", 2.04, 0.076, "milana", { ...PACK, tracks: tr("JT5537063239986") }),
    it("Стеганая бежевая куртка женская", 11.27, 0.53, "milana", {
      tracks: tr("JT5536907290110"),
    }),
    it("Кофта спортивная на замке женская", 13.02, 0.389, "milana", {
      tracks: tr("777454602399209"),
    }),
    it("Носки коричневые", 5.02, 0.148, "milana", { ...PACK, tracks: tr("777454471891807") }),
    it("Часы женские серебряные с коричневым циферблатом (бижутерия)", 7.9, 0.091, "milana", {
      tracks: tr("777454529210495"),
    }),
    it("Ремень черный женский", 2.72, 0.102, "milana", { tracks: tr("JT5536962072106") }),
    it("Майка бордовая женская", 13.75, 0.222, "milana", { tracks: tr("79150332917075") }),
    it("Браслет женский серебристый (бижутерия)", 7.7, 0.03, "milana", {
      tracks: tr("465772038328611"),
    }),
    it("Брелок-мягкая игрушка Патрик", 5.52, 0.05, "milana", { tracks: tr("79150523703444") }),
    it("Кожаная куртка бордовая женская", 26.78, 0.663, "milana", {
      tracks: tr("465772646132433"),
    }),
    it("Тапочки домашние в виде котиков черные", 6.35, 0.238, "milana", {
      tracks: tr("JT5536897394007"),
    }),
    it("Кошелек женский бордовый", 5.75, 0.056, "milana", { tracks: tr("777454601307242") }),
    it("Набор заколок красных", 1.33, 0, "milana", {
      ...PACK,
      tracks: tr("JT5537107192846"),
      noWeight: true,
    }),
    it("Сумка красная с брелком", 6.81, 0.267, "milana", { tracks: tr("JT5536908363434") }),
    it("Крабик для волос черный", 6.49, 0.117, "milana", { tracks: tr("JT5537090662616") }),
    it("Очки имиджевые бордовые", 3.55, 0.042, "milana", { tracks: tr("JT5537063189926") }),
    it("Кепка женская черная", 5.82, 0.11, "milana", { tracks: tr("465774002661292") }),
    it("Рубашка женская с принтом на плечах с коротким рукавом", 10.72, 0.202, "milana", {
      tracks: tr("79150636968953"),
    }),
    it("Сумка замшевая кремовая", 29.15, 0.616, "milana", { tracks: tr("YT0716853735213") }),

    // Ксюша
    it("Сумка бежевая с меховой оторочкой", 10.07, 0.309, "ksusha", {
      tracks: tr("465770998277445"),
    }),

    // Наташа
    it("Тапочки женские зимние, черные", 3.49, 0.23, "natasha", { tracks: tr("YT0717402372280") }),
    it("Набор кистей для макияжа", 2.45, 0.088, "natasha", {
      ...PACK,
      tracks: tr("465769268085234"),
    }),
    it("Корсет для осанки черный", 2.49, 0.055, "natasha", { tracks: tr("JT5536672247549") }),
    it("Шарф женский белый", 3.26, 0.185, "natasha", { tracks: tr("465771226502871") }),
    it("Этажерка на колесиках", 3.5, 0.525, "natasha", { tracks: tr("JT5536686866647") }),
    it("Пальто женское искусственный мех", 30.36, 0.974, "natasha", {
      tracks: tr("465770465728645"),
    }),
    it("Сумка-тоут женская коричневая", 7.96, 0.418, "natasha", { tracks: tr("YT0717237116066") }),
    it("Скатерть рождественская 200*150", 9.94, 0.418, "natasha", {
      tracks: tr("79150136403282"),
    }),
    it("Набор одноразовых зубных щеток", 8.69, 0.149, "natasha", {
      qty: 3,
      ...PACK,
      tracks: tr("465769649540912"),
    }),
    it("Адвент-календарь (набор елочных игрушек)", 11.65, 0.369, "natasha", {
      tracks: tr("773446862241086"),
    }),
    it("Полотенца одноразовые", 28.15, 2.829, "natasha", {
      qty: 2,
      ...PACK,
      tracks: tr("9823420000780; 9823420000781"),
    }),
    it("Пеньюар одноразовый", 7.78, 0.745, "natasha", {
      ...PACK,
      tracks: tr("YT7650048467075"),
    }),

    // Назар
    it("Картридж для принтера", 57.5, 0.123, "nazar", { qty: 2, tracks: tr("79150326970976") }),
    it("Набор красок для картриджа принтера", 14.63, 0.531, "nazar", {
      ...PACK,
      tracks: tr("777454438616102"),
    }),
  ],
};

const seedParcels: SeedParcel[] = [
  invoiceFromNovember,
  shippedInNovember,
  receivedInOctober,
  nextDraft,
  completedDelivery,
];

// ============================================
// Seeding
// ============================================

export async function seedDemo(force = false): Promise<void> {
  if (!force) {
    const existingCustomers = await db.customers.count();
    if (existingCustomers > 0) {
      console.log("Demo data already exists, skipping seed (use force=true to override)");
      return;
    }
  }

  console.log("Seeding demo data...");
  trackCounter = 0;

  // Build the whole snapshot first: nothing is written until it is complete.
  const customerRows: CustomerRow[] = [];
  const parcelRows: ParcelRow[] = [];
  const itemRows: ParcelItemRow[] = [];
  const paymentRows: PaymentRow[] = [];
  let nextId = 1;

  const customerIds = {} as Record<CustomerKey, number>;
  for (const key of Object.keys(CUSTOMERS) as CustomerKey[]) {
    const id = nextId++;
    customerIds[key] = id;
    customerRows.push({
      id,
      name: CUSTOMERS[key],
      isSelf: CUSTOMERS[key] === SELF_CUSTOMER_NAME,
    });
  }
  const selfId = customerIds.marina;

  for (const config of seedParcels) {
    const parcelId = nextId++;
    parcelRows.push({
      id: parcelId,
      name: config.name,
      status: config.status,
      createdAt: config.createdAt,
      shippedAt: config.shippedAt,
      receivedAt: config.receivedAt,
      completedAt: config.shippedAt,
      boxWeightG: config.boxWeightG,
      shippingCostBYN: config.shippingCostBYN,
    });

    const defaultStatus: SeedItemStatus =
      config.status === PARCEL_STATUSES[0]
        ? ITEM_STATUSES[0]
        : config.status === PARCEL_STATUSES[1]
          ? ITEM_STATUSES[1]
          : ITEM_STATUSES[2];

    for (const item of config.items) {
      const qty = item.qty ?? 1;
      const tracks = config.status === PARCEL_STATUSES[0] ? [] : (item.tracks ?? nextTracks(qty));
      const weights =
        (config.status === PARCEL_STATUSES[2] || config.status === PARCEL_STATUSES[3]) &&
        !item.noWeight
          ? splitWeight(item.weightKg, tracks.length || qty)
          : [];
      const customerId = customerIds[item.customer];
      const itemId = nextId++;

      itemRows.push({
        id: itemId,
        parcelId,
        name: item.name,
        priceCNY: priceCNY(item.priceBYN),
        priceBYN: item.priceBYN,
        quantity: qty,
        unit: item.unit ?? UNITS[0],
        customerId,
        trackNumbers: stringArray.encode(tracks),
        weightsG: numberArray.encode(weights),
        status: item.status ?? defaultStatus,
        tracksCompletedAt: tracks.length ? (config.shippedAt ?? config.createdAt) : undefined,
        createdAt: config.createdAt,
      });

      if (customerId !== selfId) {
        paymentRows.push({
          id: nextId++,
          parcelId,
          customerId,
          itemId,
          type: "item",
          paid: config.allPaid || (item.paid ?? false),
          createdAt: config.createdAt,
        });
      }
    }

    if (config.shippingCostBYN) {
      for (const key of Object.keys(customerIds) as CustomerKey[]) {
        if (key === "marina") continue;
        paymentRows.push({
          id: nextId++,
          parcelId,
          customerId: customerIds[key],
          type: "shipping",
          paid: config.allPaid || (config.shippingPaid?.[key] ?? false),
          createdAt: config.createdAt,
        });
      }
    }
  }

  await replaceAll(db, {
    customers: customerRows,
    parcels: parcelRows,
    parcelItems: itemRows,
    payments: paymentRows,
  });

  console.log("Demo data seeded successfully");
}
