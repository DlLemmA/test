import { describe, expect, it } from "vitest";
import { t } from "@/core/utils";
import {
  FOUND_FORMS,
  formatDateNumeric,
  ITEM_BARE_FORMS,
  ITEM_FORMS,
  PARCEL_FORMS,
  PARCEL_IN_FORMS,
  parcelDate,
  TRACK_BARE_FORMS,
  TRACK_FORMS,
  UNIT_LABELS,
  UNIT_OPTIONS,
  unitLabel,
} from "./ParcelPresentation";

describe("parcel presentation", () => {
  it("uses one label per unit everywhere", () => {
    expect(unitLabel("pcs")).toBe("шт");
    expect(unitLabel("packs")).toBe("уп");
    expect(unitLabel("pairs")).toBe("пар");
    expect(UNIT_OPTIONS.map((option) => option.label)).toEqual(Object.values(UNIT_LABELS));
  });

  it("pluralizes all parcel nouns with four forms", () => {
    expect(t(PARCEL_FORMS, 0)).toBe("нет посылок");
    expect(t(PARCEL_FORMS, 1)).toBe("1 посылка");
    expect(t(ITEM_FORMS, 1)).toBe("1 товар");
    expect(t(ITEM_BARE_FORMS, 2)).toBe("2 товара");
    expect(t(ITEM_BARE_FORMS, 11)).toBe("11 товаров");
    expect(t(TRACK_FORMS, 1)).toBe("1 трек");
    expect(t(TRACK_FORMS, 5)).toBe("5 треков");
    expect(t(TRACK_BARE_FORMS, 1)).toBe("трек");
    expect(t(FOUND_FORMS, 1)).toBe("Найден");
    expect(t(FOUND_FORMS, 2)).toBe("Найдено");
    expect(t(PARCEL_IN_FORMS, 1)).toBe("1 посылке");
    expect(t(PARCEL_IN_FORMS, 11)).toBe("11 посылках");
  });

  it("renders one date badge from createdAt or shippedAt", () => {
    const draft = parcelDate({ createdAt: "2026-01-01T00:00:00.000Z" });
    expect(draft.day).toBe("01");
    expect(draft.month).toBe("янв");
    expect(draft.title).toBe("создана 01.01.2026");

    const shipped = parcelDate({
      createdAt: "2026-01-01T00:00:00.000Z",
      shippedAt: "2026-02-03T00:00:00.000Z",
    });
    expect(shipped.day).toBe("03");
    expect(shipped.month).toBe("февр");
    expect(shipped.title).toBe("отправлена 03.02.2026");
  });

  it("falls back cleanly for missing or invalid dates", () => {
    expect(parcelDate({ createdAt: "" })).toEqual({
      day: "—",
      month: "нет",
      title: "дата не задана",
    });
    expect(formatDateNumeric("2026-01-01T00:00:00.000Z")).toBe("01.01.2026");
    expect(formatDateNumeric("bogus")).toBe("");
  });
});
