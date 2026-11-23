import type { Parcel } from "@/features/parcels/domain/Parcel";
import type { ParcelItem } from "@/features/parcels/domain/ParcelItem";
import type { PaymentState } from "@/features/parcels/domain/Payment";
import { deliveryInvoiced, effectivePaid } from "@/features/settlement/domain";

export interface Amounts {
  owed: number;
  paid: number;
  remaining: number;
}

export interface CustomerBalance extends Amounts {
  goods: Amounts;
  delivery: Amounts;
}

export interface CustomerBalanceResult {
  byCustomer: Map<number, CustomerBalance>;
  deliveryByItem: Map<number, number>;
  totals: Amounts & { goods: Amounts; delivery: Amounts };
}

export interface CustomerBalanceInput {
  parcel: Parcel;
  items: ParcelItem[];
  paymentState: PaymentState;
  selfCustomerId?: number;
}

function emptyAmounts(): Amounts {
  return { owed: 0, paid: 0, remaining: 0 };
}

export function emptyCustomerBalance(): CustomerBalance {
  return { ...emptyAmounts(), goods: emptyAmounts(), delivery: emptyAmounts() };
}

/** Aggregate per-parcel customer balances into one statement total. */
export function sumCustomerBalances(balances: CustomerBalance[]): CustomerBalance {
  const total = emptyCustomerBalance();
  for (const balance of balances) {
    addAmounts(total, balance);
    addAmounts(total.goods, balance.goods);
    addAmounts(total.delivery, balance.delivery);
  }
  total.remaining = total.owed - total.paid;
  total.goods.remaining = total.goods.owed - total.goods.paid;
  total.delivery.remaining = total.delivery.owed - total.delivery.paid;
  return total;
}

function weightOf(item: ParcelItem): number {
  return item.weightsG.reduce((sum, weight) => sum + weight, 0);
}

function addAmounts(target: Amounts, source: Amounts): void {
  target.owed += source.owed;
  target.paid += source.paid;
  target.remaining += source.remaining;
}

function finishAmounts(amounts: Amounts): Amounts {
  return { ...amounts, remaining: amounts.owed - amounts.paid };
}

/**
 * The full balance calculation for one parcel: goods and delivery are kept
 * separate at both customer and item level, and self customer is auto-paid.
 */
export function customerBalances({
  parcel,
  items,
  paymentState,
  selfCustomerId,
}: CustomerBalanceInput): CustomerBalanceResult {
  const byCustomer = new Map<number, CustomerBalance>();
  const deliveryByItem = new Map<number, number>();
  const itemsByCustomer = new Map<number, ParcelItem[]>();

  for (const item of items) {
    const group = itemsByCustomer.get(item.customerId) || [];
    group.push(item);
    itemsByCustomer.set(item.customerId, group);
  }

  const enabled = deliveryInvoiced(parcel);
  const totalWeight = enabled ? items.reduce((sum, item) => sum + weightOf(item), 0) : 0;
  const shippingCost = parcel.shippingCostBYN || 0;

  const deliveryByCustomer = new Map<number, number>();
  if (totalWeight > 0) {
    for (const item of items) {
      deliveryByItem.set(item.id, (weightOf(item) / totalWeight) * shippingCost);
    }
    for (const [customerId, customerItems] of itemsByCustomer) {
      const share = customerItems.reduce(
        (sum, item) => sum + (deliveryByItem.get(item.id) || 0),
        0,
      );
      deliveryByCustomer.set(customerId, share);
    }
  }

  const totals = {
    ...emptyAmounts(),
    goods: emptyAmounts(),
    delivery: emptyAmounts(),
  };

  for (const [customerId, customerItems] of itemsByCustomer) {
    const goods = emptyAmounts();
    for (const item of customerItems) {
      goods.owed += item.totalPriceBYN;
      if (effectivePaid(customerId, selfCustomerId, paymentState.itemPaid.get(item.id) ?? false)) {
        goods.paid += item.totalPriceBYN;
      }
    }

    const delivery = emptyAmounts();
    delivery.owed = deliveryByCustomer.get(customerId) || 0;
    if (
      effectivePaid(customerId, selfCustomerId, paymentState.shippingPaid.get(customerId) ?? false)
    ) {
      delivery.paid = delivery.owed;
    }

    const goodsAmounts = finishAmounts(goods);
    const deliveryAmounts = finishAmounts(delivery);
    const balance: CustomerBalance = {
      owed: goodsAmounts.owed + deliveryAmounts.owed,
      paid: goodsAmounts.paid + deliveryAmounts.paid,
      remaining: goodsAmounts.remaining + deliveryAmounts.remaining,
      goods: goodsAmounts,
      delivery: deliveryAmounts,
    };

    byCustomer.set(customerId, balance);
    addAmounts(totals.goods, goodsAmounts);
    addAmounts(totals.delivery, deliveryAmounts);
  }

  addAmounts(totals, totals.goods);
  addAmounts(totals, totals.delivery);
  totals.remaining = totals.owed - totals.paid;

  return { byCustomer, deliveryByItem, totals };
}
