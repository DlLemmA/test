import type { Customer } from "@/features/customers/domain";
import type { Parcel } from "./Parcel";
import type { ParcelItem } from "./ParcelItem";
import type { PaymentState } from "./Payment";

export function calculateCustomerBalance(
  items: ParcelItem[],
  customers: Customer[],
  parcel: Parcel,
  paymentState: PaymentState,
  selfCustomerId?: number, // if provided, this customer's items are auto-paid
): Map<number, { owed: number; paid: number; remaining: number }> {
  const result = new Map<number, { owed: number; paid: number; remaining: number }>();

  // Group items by customer
  const itemsByCustomer = new Map<number, ParcelItem[]>();
  for (const item of items) {
    if (!itemsByCustomer.has(item.customerId)) {
      itemsByCustomer.set(item.customerId, []);
    }
    itemsByCustomer.get(item.customerId)!.push(item);
  }

  // Calculate shipping share per customer (proportional to weight)
  let totalWeight = 0;
  const weightByCustomer = new Map<number, number>();

  if (
    (parcel.status === "received" || parcel.status === "done") &&
    parcel.boxWeightG &&
    parcel.shippingCostBYN
  ) {
    for (const item of items) {
      if (item.weightsG.length > 0) {
        const itemWeight = item.weightsG.reduce((a, b) => a + b, 0);
        weightByCustomer.set(
          item.customerId,
          (weightByCustomer.get(item.customerId) || 0) + itemWeight,
        );
        totalWeight += itemWeight;
      }
    }
  }

  const shippingShareByCustomer = new Map<number, number>();
  if (totalWeight > 0 && parcel.shippingCostBYN) {
    for (const [customerId, weight] of weightByCustomer) {
      shippingShareByCustomer.set(customerId, (weight / totalWeight) * parcel.shippingCostBYN);
    }
  }

  for (const [customerId, customerItems] of itemsByCustomer) {
    let owed = 0;
    let paid = 0;

    const isSelf = customerId === selfCustomerId;

    for (const item of customerItems) {
      owed += item.totalPriceBYN;
      // Auto-paid for self customer, otherwise check payment state
      if (isSelf || paymentState.itemPaid.get(item.id)) {
        paid += item.totalPriceBYN;
      }
    }

    const shippingShare = shippingShareByCustomer.get(customerId) || 0;
    owed += shippingShare;
    // Auto-paid shipping for self customer
    if (isSelf || paymentState.shippingPaid.get(customerId)) {
      paid += shippingShare;
    }

    result.set(customerId, {
      owed,
      paid,
      remaining: owed - paid,
    });
  }

  return result;
}

/**
 * Shipping allocated to one item, proportional to its weight.
 * Only enabled once the parcel is received/done and the invoice exists.
 */
export function itemShippingShare(
  item: ParcelItem,
  parcelItems: ParcelItem[],
  parcel: Parcel,
): number {
  if ((parcel.status !== "received" && parcel.status !== "done") || !parcel.shippingCostBYN) {
    return 0;
  }

  const weightOf = (i: ParcelItem) => i.weightsG.reduce((sum, w) => sum + w, 0);
  const totalWeight = parcelItems.reduce((sum, i) => sum + weightOf(i), 0);
  if (totalWeight <= 0) return 0;

  return (weightOf(item) / totalWeight) * parcel.shippingCostBYN;
}
