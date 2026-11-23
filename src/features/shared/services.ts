// ============================================
// Cross-feature use cases — orchestration only.
// Wiring lives in ./wiring; single-feature operations live on their services.
// ============================================

import { customerBalances, type CustomerBalanceResult } from "@/features/balances/domain";
import {
  Parcel,
  ParcelItem,
  Payment,
  type PaymentState,
  type BatchItemInput,
  type BatchTotals,
  paymentStateFromPayments,
  reconcileBatch,
} from "@/features/parcels/domain";
import type { Customer } from "@/features/customers/domain";
import { customerService, parcelItemService, parcelService, paymentService } from "./wiring";

export interface ParcelCalculation {
  parcel: Parcel;
  items: ParcelItem[];
  customers: Customer[];
  balance: CustomerBalanceResult;
  paymentState: PaymentState;
  payments: Payment[];
}

/** Load a parcel together with every fact needed to render it or export it. */
export async function getParcelWithCalculation(
  parcelId: number,
): Promise<ParcelCalculation | null> {
  const result = await parcelService.getParcelWithItems(parcelId);
  if (!result) return null;

  const [customers, payments] = await Promise.all([
    customerService.findAll(),
    paymentService.getPaymentsForParcel(parcelId),
  ]);
  const paymentState = paymentStateFromPayments(payments);
  const balance = customerBalances({
    parcel: result.parcel,
    items: result.items,
    paymentState,
    selfCustomerId: customers.find((customer) => customer.isSelf)?.id,
  });

  return {
    parcel: result.parcel,
    items: result.items,
    customers,
    balance,
    paymentState,
    payments,
  };
}

/** Reconcile a batch, add it to a draft parcel and record self payments. */
export async function addItemsToParcel(
  parcelId: number,
  items: BatchItemInput[],
  totals?: BatchTotals,
): Promise<ParcelItem[]> {
  const finalItems = totals ? reconcileBatch(items, totals).items : items;
  const itemsWithParcelId = finalItems.map((item) => ({ ...item, parcelId }));
  const createdItems = await parcelItemService.addBatch(parcelId, itemsWithParcelId);
  await paymentService.markSelfItemsPaid(parcelId, createdItems);
  return createdItems;
}
