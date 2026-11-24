// ============================================
// Settlement policy — the single owner of "is it paid" and "is delivery
// charged" facts. Writes, balance calculation and views all read these facts,
// so a checkbox can never disagree with the amount it represents.
// ============================================

import type { Parcel } from "@/features/parcels/domain/Parcel";
import type { ParcelItem } from "@/features/parcels/domain/ParcelItem";
import type { PaymentState } from "@/features/parcels/domain/Payment";

/** The self customer is always effectively paid, whatever was requested. */
export function effectivePaid(
  customerId: number,
  selfCustomerId: number | undefined,
  requested: boolean,
): boolean {
  return customerId === selfCustomerId || requested;
}

/** Both the parcel weight and the invoice amount are known. */
export function shippingInfoComplete(parcel: Parcel): boolean {
  return (parcel.boxWeightG ?? 0) > 0 && (parcel.shippingCostBYN ?? 0) > 0;
}

/** Delivery is charged only once a received/done parcel has complete shipping info. */
export function deliveryInvoiced(parcel: Parcel): boolean {
  return (parcel.status === "received" || parcel.status === "done") && shippingInfoComplete(parcel);
}

/** Delivery payment may be changed only for a real customer with a non-zero invoiced share. */
export function canPayDelivery(parcel: Parcel, isSelf: boolean, deliveryOwed: number): boolean {
  return !isSelf && deliveryInvoiced(parcel) && deliveryOwed > 0;
}

export interface SettlementFacts {
  /** Whether this parcel's delivery is included in the amounts. */
  deliveryInvoiced: boolean;
  /** Item ids that are effectively paid (self rule included). */
  paidItems: ReadonlySet<number>;
  /** Customer ids whose delivery is effectively paid (self rule included). */
  paidDelivery: ReadonlySet<number>;
}

/** Ready-to-render payment facts for one parcel, derived from the policy. */
export function settlementFacts(input: {
  parcel: Parcel;
  items: ParcelItem[];
  paymentState: PaymentState;
  selfCustomerId?: number;
}): SettlementFacts {
  const { parcel, items, paymentState, selfCustomerId } = input;

  const paidItems = new Set<number>();
  for (const item of items) {
    if (
      effectivePaid(item.customerId, selfCustomerId, paymentState.itemPaid.get(item.id) ?? false)
    ) {
      paidItems.add(item.id);
    }
  }

  const customerIds = new Set([
    ...items.map((item) => item.customerId),
    ...paymentState.shippingPaid.keys(),
  ]);
  const paidDelivery = new Set<number>();
  for (const customerId of customerIds) {
    if (
      effectivePaid(customerId, selfCustomerId, paymentState.shippingPaid.get(customerId) ?? false)
    ) {
      paidDelivery.add(customerId);
    }
  }

  return { deliveryInvoiced: deliveryInvoiced(parcel), paidItems, paidDelivery };
}
