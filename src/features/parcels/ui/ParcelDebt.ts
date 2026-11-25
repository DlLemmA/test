import { money } from "@/core/utils";

// One label for every parcel debt tag. A parcel with unknown delivery is not
// "paid" yet, even when all its goods are covered.
export interface ParcelDebtFacts {
  remaining: number;
  isSelf: boolean;
  deliveryInvoiced: boolean;
}

export type ParcelDebtTone = "is-debt" | "is-paid" | "is-pending";

export function parcelDebtLabel(facts: ParcelDebtFacts): string {
  if (facts.remaining > 0) {
    return facts.isSelf ? `Остаток ${money(facts.remaining)}` : `Долг ${money(facts.remaining)}`;
  }
  return facts.deliveryInvoiced ? "Оплачено" : "без доставки";
}

export function parcelDebtClass(facts: ParcelDebtFacts): ParcelDebtTone {
  if (facts.remaining > 0) return "is-debt";
  return facts.deliveryInvoiced ? "is-paid" : "is-pending";
}
