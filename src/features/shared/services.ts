// ============================================
// Cross-feature use cases — orchestration only.
// Wiring lives in ./wiring; single-feature operations live on their services.
// Statement facts live in features/statements.
// ============================================

import {
  type BatchItemInput,
  type BatchTotals,
  type ParcelItem,
  reconcileBatch,
} from "@/features/parcels/domain";
import { parcelCommands, paymentService } from "./wiring";

/** Reconcile a batch, add it to a draft parcel and record self payments. */
export async function addItemsToParcel(
  parcelId: number,
  items: BatchItemInput[],
  totals?: BatchTotals,
): Promise<ParcelItem[]> {
  const finalItems = totals ? reconcileBatch(items, totals).items : items;
  const itemsWithParcelId = finalItems.map((item) => Object.assign({}, item, { parcelId }));
  const createdItems = await parcelCommands.commitBatch(parcelId, itemsWithParcelId);
  await paymentService.markSelfItemsPaid(parcelId, createdItems);
  return createdItems;
}
