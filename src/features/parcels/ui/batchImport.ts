// Parsing for the batch import screen. One place for the accepted vocabulary
// and number formats, so the wizard and any future importer read the same text.

import { UNIT_HINT } from "./ParcelPresentation";
import type { BatchItemInput } from "../domain";

export type ItemRow = Pick<BatchItemInput, "name" | "priceCNY" | "quantity" | "unit">;

export type ItemUiDraft = {
  name: string;
  priceCNY: string;
  quantity: string;
  unit: BatchItemInput["unit"];
};

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
export function parseItems(text: string): { rows: ItemRow[]; error?: string } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { rows: [], error: "Вставьте строки" };

  const rows: ItemRow[] = [];
  for (const [index, line] of lines.entries()) {
    const tokens = line.split(/\s+/);
    const number = index + 1;
    const error = (message: string) => ({ rows: [], error: `Строка ${number}: ${message}` });

    if (tokens.length < 4) {
      return error("нужно «название количество единица цена»");
    }

    const name = tokens.slice(0, -3).join(" ").replace(/[,;]$/, "").trim();
    const quantity = parseNumber(tokens[tokens.length - 3]!);
    const unit = parseUnit(tokens[tokens.length - 2]);
    const priceCNY = parseNumber(tokens[tokens.length - 1]!);

    if (!name) return error("нет названия");
    if (!Number.isInteger(quantity) || quantity < 1) {
      return error("неверное количество");
    }
    if (!unit) return error(`укажите единицу (${UNIT_HINT})`);
    if (!Number.isFinite(priceCNY) || priceCNY <= 0) {
      return error("неверная цена CNY");
    }

    rows.push({ name, priceCNY, quantity, unit });
  }

  return { rows };
}
