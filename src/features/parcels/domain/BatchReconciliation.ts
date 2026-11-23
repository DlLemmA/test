export interface BatchItemInput {
  name: string;
  priceCNY: number;
  priceBYN: number;
  quantity: number;
  unit: "pcs" | "packs" | "pairs";
  customerId: number;
}

export interface BatchTotals {
  totalCNY: number;
  totalBYN: number;
}

export type BatchDifferenceKind = "balanced" | "commission" | "overpayment" | "unallocated";

export interface BatchReviewFacts {
  itemCNY: number;
  itemBYN: number;
  paidCNY: number;
  paidBYN: number;
  diffCNY: number;
  diffBYN: number;
  absCNY: number;
  absBYN: number;
  commissionPercent: number;
  kind: BatchDifferenceKind;
  distributed: boolean;
}

export interface BatchReconciliation {
  items: BatchItemInput[];
  review: BatchReviewFacts;
}

const EPSILON = 0.005;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * A shortfall in both currencies is a payment-service commission; spread it
 * over the items in proportion to their prices. An excess or a mismatch
 * between currencies is left untouched — both the review screen and the save
 * path use this result, so they cannot disagree about what will happen.
 */
function distributeCommission(items: BatchItemInput[], totals: BatchTotals): BatchItemInput[] {
  const itemCNY = items.reduce((sum, item) => sum + item.priceCNY, 0);
  const factor = totals.totalCNY / itemCNY;
  const adjusted = items.map((item) => ({
    ...item,
    priceCNY: round2(item.priceCNY * factor),
    priceBYN: round2(item.priceBYN * factor),
  }));

  // Absorb rounding residue into the last item so the sums match the totals.
  const last = adjusted[adjusted.length - 1];
  if (last) {
    const restCNY = adjusted.reduce((sum, item) => sum + item.priceCNY, 0);
    const restBYN = adjusted.reduce((sum, item) => sum + item.priceBYN, 0);
    last.priceCNY = round2(last.priceCNY + (totals.totalCNY - restCNY));
    last.priceBYN = round2(last.priceBYN + (totals.totalBYN - restBYN));
  }

  return adjusted;
}

export function reconcileBatch(items: BatchItemInput[], totals: BatchTotals): BatchReconciliation {
  const itemCNY = items.reduce((sum, item) => sum + item.priceCNY, 0);
  const itemBYN = items.reduce((sum, item) => sum + item.priceBYN, 0);
  const diffCNY = totals.totalCNY - itemCNY;
  const diffBYN = totals.totalBYN - itemBYN;
  const absCNY = Math.abs(diffCNY);
  const absBYN = Math.abs(diffBYN);

  const commission = itemCNY > 0 && diffCNY > EPSILON && diffBYN > EPSILON;
  const overpayment = diffCNY < -EPSILON;
  const balanced = absCNY <= EPSILON && absBYN <= EPSILON;
  const kind: BatchDifferenceKind = commission
    ? "commission"
    : overpayment
      ? "overpayment"
      : balanced
        ? "balanced"
        : "unallocated";

  return {
    items: commission ? distributeCommission(items, totals) : items,
    review: {
      itemCNY,
      itemBYN,
      paidCNY: totals.totalCNY,
      paidBYN: totals.totalBYN,
      diffCNY,
      diffBYN,
      absCNY,
      absBYN,
      commissionPercent: itemCNY > 0 ? (absCNY / itemCNY) * 100 : 0,
      kind,
      distributed: commission,
    },
  };
}
