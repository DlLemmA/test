// ============================================
// Cross-feature use cases — orchestration only.
// Wiring lives in ./wiring; single-feature operations live on their services.
// Statement facts live in features/statements.
// ============================================

import {
  type BatchItemInput,
  type BatchTotals,
  type CreatedParcelBatch,
  type ParcelItem,
  reconcileBatch,
} from "@/features/parcels/domain";
import { customerService, parcelCommands, paymentService } from "./wiring";

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

/** Create a new parcel with its whole batch and self payments in one write. */
export async function createParcelBatch(
  items: BatchItemInput[],
  totals: BatchTotals,
): Promise<CreatedParcelBatch> {
  const finalItems = reconcileBatch(items, totals).items;
  const selfCustomerId = (await customerService.getSelfCustomer())?.id;
  const payments = paymentService.planBatchPayments(
    finalItems.map((item, index) => ({ index: index + 1, customerId: item.customerId })),
    selfCustomerId,
  );
  return parcelCommands.createParcelWithItems(finalItems, payments);
}
