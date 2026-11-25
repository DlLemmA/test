import { describe, expect, it } from "vitest";
import { parseItems, previewImport } from "./batchImport";

describe("batch import preview", () => {
  it("numbers valid lines and keeps comma decimals", () => {
    const preview = previewImport("Носки 2 шт 12,5\r\nЧашка 1 уп 30");
    expect(preview.error).toBeUndefined();
    expect(preview.lines.map((line) => line.number)).toEqual([1, 2]);
    expect(preview.rows).toEqual([
      { name: "Носки", priceCNY: 12.5, quantity: 2, unit: "pcs" },
      { name: "Чашка", priceCNY: 30, quantity: 1, unit: "packs" },
    ]);
  });

  it("points to the exact bad line and blocks the whole append", () => {
    const preview = previewImport("Носки 2 шт 12,5\nПлохо 0 шт 5");
    expect(preview.lines[1]).toMatchObject({ number: 2, error: "неверное количество" });
    expect(preview.error).toBe("Строка 2: неверное количество");
    expect(parseItems("Носки 2 шт 12,5\nПлохо 0 шт 5").rows).toEqual([]);
  });
});
