import { describe, expect, it } from "vitest";
import { Customer } from "@/features/customers/domain";
import { Parcel } from "@/features/parcels/domain/Parcel";
import { ParcelItem } from "@/features/parcels/domain/ParcelItem";
import { Payment } from "@/features/parcels/domain/Payment";
import { formatDateNumeric } from "@/features/parcels/ui/ParcelPresentation";
import { buildParcelStatement, type StatementData } from "../domain/Statement";
import { autoColumnWidths, buildParcelExportRows, type ExportRow } from "./ParcelExportRows";

const CREATED_AT = "2026-11-23T00:00:00.000Z";
const SHIPPED_AT = "2026-11-20T00:00:00.000Z";
const RECEIVED_AT = "2026-11-21T00:00:00.000Z";

function statementData(comment?: string): StatementData {
  return {
    customers: [
      Customer.fromPersistence({ id: 1, name: "Я", isSelf: true }),
      Customer.fromPersistence({ id: 2, name: "Катя", isSelf: false }),
    ],
    parcels: [
      Parcel.fromPersistence({
        id: 1,
        status: "received",
        boxWeightG: 1000,
        shippingCostBYN: 30,
        shippedAt: SHIPPED_AT,
        receivedAt: RECEIVED_AT,
        comment,
        createdAt: CREATED_AT,
      }),
    ],
    items: [
      ParcelItem.fromPersistence({
        id: 10,
        parcelId: 1,
        name: "Товар Я",
        priceCNY: 100,
        priceBYN: 100,
        quantity: 1,
        unit: "pcs",
        customerId: 1,
        trackNumbers: JSON.stringify(["T-1"]),
        weightsG: JSON.stringify([300]),
        status: "received",
        createdAt: CREATED_AT,
      }),
      ParcelItem.fromPersistence({
        id: 11,
        parcelId: 1,
        name: "Товар Кати",
        priceCNY: 100,
        priceBYN: 100,
        quantity: 1,
        unit: "pcs",
        customerId: 2,
        trackNumbers: JSON.stringify(["T-2"]),
        weightsG: JSON.stringify([700]),
        status: "received",
        createdAt: CREATED_AT,
      }),
    ],
    payments: [
      Payment.fromPersistence({
        id: 1,
        parcelId: 1,
        customerId: 2,
        itemId: 11,
        type: "item",
        paid: true,
        createdAt: CREATED_AT,
      }),
      Payment.fromPersistence({
        id: 2,
        parcelId: 1,
        customerId: 2,
        type: "shipping",
        paid: false,
        createdAt: CREATED_AT,
      }),
    ],
  };
}

function rowStarting(rows: ExportRow[], label: string): ExportRow {
  const row = rows.find((candidate) => candidate[0] === label);
  if (!row) throw new Error(` Row ${label} not found`);
  return row;
}

function firstRow(rows: ExportRow[], name: string): ExportRow {
  const row = rows.find((candidate) => candidate[0] === name);
  if (!row) throw new Error(`Row ${name} not found`);
  return row;
}

function numberAt(row: ExportRow, index: number): number {
  const value = row[index];
  if (typeof value !== "number") throw new Error(`Expected a number at ${index}`);
  return value;
}

describe("Excel export rows", () => {
  it("uses the statement's weighted shares in numeric money columns", () => {
    const statement = buildParcelStatement(statementData(), 1)!;
    const rows = buildParcelExportRows(statement);
    const self = firstRow(rows, "Я");
    const katya = firstRow(rows, "Катя");

    expect(numberAt(rowStarting(rows, "Стоимость доставки, BYN"), 1)).toBe(30);
    expect(numberAt(rowStarting(rows, "Вес посылки, кг"), 1)).toBe(1);

    expect(numberAt(self, 1)).toBe(1);
    expect(numberAt(self, 2)).toBe(100);
    expect(numberAt(self, 3)).toBeCloseTo(9);
    expect(numberAt(self, 4)).toBeCloseTo(109);
    expect(numberAt(self, 5)).toBeCloseTo(109);
    expect(numberAt(self, 6)).toBe(0);

    expect(numberAt(katya, 3)).toBeCloseTo(21);
    expect(numberAt(katya, 4)).toBeCloseTo(121);
    expect(numberAt(katya, 5)).toBe(100);
    expect(numberAt(katya, 6)).toBeCloseTo(21);
    expect(numberAt(katya, 3)).not.toBeCloseTo(numberAt(katya, 4) * 0.3);

    for (const row of [self, katya]) {
      expect(numberAt(row, 2) + numberAt(row, 3)).toBeCloseTo(numberAt(row, 4));
      expect(numberAt(row, 4) - numberAt(row, 5)).toBeCloseTo(numberAt(row, 6));
      expect(row.slice(2).every((cell) => typeof cell === "number")).toBe(true);
    }
    expect(numberAt(self, 3) + numberAt(katya, 3)).toBeCloseTo(30);
  });

  it("renders dates and labels with the same presentation rules as the screen", () => {
    const rows = buildParcelExportRows(buildParcelStatement(statementData(), 1)!);

    expect(rowStarting(rows, "Дата создания")[1]).toBe(formatDateNumeric(CREATED_AT));
    expect(rowStarting(rows, "Дата отправки")[1]).toBe(formatDateNumeric(SHIPPED_AT));
    expect(rowStarting(rows, "Дата получения")[1]).toBe(formatDateNumeric(RECEIVED_AT));
    expect(String(rowStarting(rows, "Дата отправки")[1])).not.toContain("T");
    expect(rowStarting(rows, "Статус")[1]).toBe("Получена");

    const itemsHeader = rows.findIndex((row) => row[0] === "Заказчик" && row[1] === "Товар");
    const firstItem = rows[itemsHeader + 1]!;
    expect(numberAt(firstItem, 3)).toBe(100);
    expect(firstItem[5]).toBe("шт");
    expect(firstItem[6]).toBe("T-1");
    expect(firstItem[8]).toBe("Получен");
  });

  it("sizes every column from its content with a sane cap", () => {
    const comment = "Очень длинный комментарий ".repeat(8);
    const rows = buildParcelExportRows(buildParcelStatement(statementData(comment), 1)!);
    const widths = autoColumnWidths(rows);
    const widestRow = Math.max(...rows.map((row) => row.length));

    expect(widths).toHaveLength(widestRow);
    expect(widths.every((width) => width.wch >= 10 && width.wch <= 60)).toBe(true);
    expect(widths[1]!.wch).toBe(60);
    expect(widths[2]!.wch).toBeGreaterThanOrEqual("Сумма товаров, BYN".length);
    expect(widths[6]!.wch).toBeGreaterThanOrEqual("Трек-номера".length);
    expect(autoColumnWidths([["a"], ["abcdefghijkl"]])[0]!.wch).toBe(14);
  });
});
