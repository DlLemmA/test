// ============================================
// Parcel presentation: unit labels, dates and plural forms for parcel nouns.
// Pass four forms to t(): zero | one | few | many. `{count}` is optional.
// ============================================

export const PARCEL_FORMS = "нет посылок | {count} посылка | {count} посылки | {count} посылок";
export const ITEM_FORMS = "нет товаров | {count} товар | {count} товара | {count} товаров";
export const ITEM_BARE_FORMS = "товаров | {count} товар | {count} товара | {count} товаров";
export const TRACK_FORMS = "{count} треков | {count} трек | {count} трека | {count} треков";
export const TRACK_BARE_FORMS = "треков | трек | трека | треков";
export const FOUND_FORMS = "Найдено | Найден | Найдено | Найдено";
export const PARCEL_IN_FORMS =
  "{count} посылках | {count} посылке | {count} посылках | {count} посылках";

export type UnitValue = "pcs" | "packs" | "pairs";
export const UNIT_HINT = "шт/уп/пар";

export const UNIT_LABELS: Record<UnitValue, string> = {
  pcs: "шт",
  packs: "уп",
  pairs: "пар",
};

export const UNIT_OPTIONS: Array<{ value: UnitValue; label: string }> = [
  { value: "pcs", label: UNIT_LABELS.pcs },
  { value: "packs", label: UNIT_LABELS.packs },
  { value: "pairs", label: UNIT_LABELS.pairs },
];

export function unitLabel(unit: UnitValue): string {
  return UNIT_LABELS[unit];
}

export type DateBadge = { day: string; month: string; title: string };

function parseDate(iso?: string): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateNumeric(iso?: string): string {
  const date = parseDate(iso);
  return date
    ? date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";
}

/** One date badge for list, detail and customer screens. */
export function parcelDate(parcel: { shippedAt?: string; createdAt: string }): DateBadge {
  const date = parseDate(parcel.shippedAt ?? parcel.createdAt);
  if (!date) return { day: "—", month: "нет", title: "дата не задана" };
  return {
    day: date.toLocaleDateString("ru-RU", { day: "2-digit" }),
    month: date.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""),
    title: `${parcel.shippedAt ? "отправлена" : "создана"} ${date.toLocaleDateString("ru-RU")}`,
  };
}
