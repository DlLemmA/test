// Parsing for the batch import screen. One place for the accepted vocabulary
// and number formats, so the wizard, its preview and any future importer read
// the same text.

import { UNIT_HINT } from "./ParcelPresentation";
import type { BatchItemInput } from "../domain";

export type ItemRow = Pick<BatchItemInput, "name" | "priceCNY" | "quantity" | "unit">;

export type ItemUiDraft = {
  name: string;
  priceCNY: string;
  quantity: string;
  unit: BatchItemInput["unit"];
};

export interface ImportLine {
  number: number;
  raw: string;
  row?: ItemRow;
  error?: string;
}

export interface ImportPreview {
  lines: ImportLine[];
  /** Only complete, valid lines. The wizard must not append while error exists. */
  rows: ItemRow[];
  error?: string;
}

export function fromSelect(value: string): BatchItemInput["unit"] {
  return value === "packs" || value === "pairs" ? value : "pcs";
}

export function parseUnit(raw: string | undefined): BatchItemInput["unit"] | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase().replace(/\.$/, "");
  if (["шт", "штука", "штуки", "pcs", "pc"].includes(value)) return "pcs";
  if (["уп", "упак", "упаковка", "упаковки", "pack", "packs"].includes(value)) return "packs";
  if (["пар", "пара", "пары", "pair", "pairs"].includes(value)) return "pairs";
  return undefined;
}

function parseNumber(raw: string): number {
  let value = raw.replace(/[^\d.,-]/g, "");
  if (value.includes(",") && value.includes(".")) {
    value = value.replace(/,/g, "");
  } else {
    value = value.replace(",", ".");
  }
  return Number(value);
}

/** One line is «название количество единица цена», e.g. «Носки 1 шт 22,35». */
export function previewImport(text: string): ImportPreview {
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!rawLines.length) return { lines: [], rows: [], error: "Вставьте строки" };

  const lines: ImportLine[] = [];
  const rows: ItemRow[] = [];
  for (const [index, raw] of rawLines.entries()) {
    const number = index + 1;
    const tokens = raw.split(/\s+/);
    let error: string | undefined;

    if (tokens.length < 4) {
      error = "нужно «название количество единица цена»";
    } else {
      const name = tokens.slice(0, -3).join(" ").replace(/[,;]$/, "").trim();
      const quantity = parseNumber(tokens[tokens.length - 3]!);
      const unit = parseUnit(tokens[tokens.length - 2]);
      const priceCNY = parseNumber(tokens[tokens.length - 1]!);

      if (!name) error = "нет названия";
      else if (!Number.isInteger(quantity) || quantity < 1) error = "неверное количество";
      else if (!unit) error = `укажите единицу (${UNIT_HINT})`;
      else if (!Number.isFinite(priceCNY) || priceCNY <= 0) error = "неверная цена CNY";

      if (!error && unit) {
        const row = { name, priceCNY, quantity, unit };
        rows.push(row);
        lines.push({ number, raw, row });
        continue;
      }
    }

    lines.push({ number, raw, error });
  }

  const failed = lines.find((line) => line.error);
  return {
    lines,
    rows,
    error: failed ? `Строка ${failed.number}: ${failed.error}` : undefined,
  };
}

/** Kept for the append action: no rows are committed while any line is bad. */
export function parseItems(text: string): { rows: ItemRow[]; error?: string } {
  const preview = previewImport(text);
  return { rows: preview.error ? [] : preview.rows, error: preview.error };
}
