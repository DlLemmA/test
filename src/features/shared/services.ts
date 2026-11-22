import { customerRepository } from "@/features/customers/infrastructure";
import {
  parcelRepository,
  parcelItemRepository,
  paymentRepository,
} from "@/features/parcels/infrastructure";
import {
  Parcel,
  ParcelItem,
  Payment,
  calculateCustomerBalance,
  type PaymentState,
  createEmptyPaymentState,
  paymentStateFromPayments,
} from "@/features/parcels/domain";
import { ParcelService } from "@/features/parcels/services/ParcelService";
import { ParcelItemService } from "@/features/parcels/services/ParcelItemService";
import { PaymentService } from "@/features/parcels/services/PaymentService";
import { CustomerService } from "@/features/customers/domain";
import { Customer } from "@/features/customers/domain";

// ============================================
// Application Services (orchestrate domain services)
// ============================================

// Singleton instances
export const customerService = new CustomerService(customerRepository);
export const parcelServiceInstance = new ParcelService(parcelRepository, parcelItemRepository);
export const parcelItemServiceInstance = new ParcelItemService(
  parcelItemRepository,
  parcelRepository,
);
export const paymentServiceInstance = new PaymentService(
  paymentRepository,
  parcelRepository,
  parcelItemRepository,
);
const parcelService = parcelServiceInstance;
const parcelItemService = parcelItemServiceInstance;
const paymentService = paymentServiceInstance;

// ============================================
// High-level use cases
// ============================================

export async function initializeApp(): Promise<void> {
  // Ensure self customer exists on first run
  const selfCustomer = await customerService.getSelfCustomer();
  if (!selfCustomer) {
    // Will be created via UI prompt
    return;
  }
}

export async function getParcelWithCalculation(parcelId: number): Promise<{
  parcel: Parcel;
  items: ParcelItem[];
  customers: Customer[];
  balances: Map<number, { owed: number; paid: number; remaining: number }>;
  paymentState: PaymentState;
  payments: Payment[];
} | null> {
  const result = await parcelService.getParcelWithItems(parcelId);
  if (!result) return null;

  const customers = await customerRepository.findAll();
  const payments = await paymentService.getPaymentsForParcel(parcelId);
  const paymentState = paymentStateFromPayments(payments);
  const selfCustomer = await customerService.getSelfCustomer();
  const selfCustomerId = selfCustomer?.id;
  const balances = calculateCustomerBalance(
    result.items,
    customers,
    result.parcel,
    paymentState,
    selfCustomerId,
  );

  return {
    parcel: result.parcel,
    items: result.items,
    customers,
    balances,
    paymentState,
    payments,
  };
}

export async function getAllParcels(): Promise<Parcel[]> {
  return parcelRepository.findAll();
}

export async function createParcel(): Promise<Parcel> {
  return parcelService.createParcel();
}

export async function shipParcel(
  parcelId: number,
  boxWeightG?: number,
  shippingCostBYN?: number,
): Promise<Parcel> {
  return parcelService.shipParcel(parcelId, boxWeightG, shippingCostBYN);
}

export async function updateParcel(
  parcelId: number,
  input: {
    name?: string | null;
    comment?: string | null;
    boxWeightG?: number | null;
    shippingCostBYN?: number | null;
  },
): Promise<Parcel> {
  const parcel = await parcelRepository.findById(parcelId);
  if (!parcel) throw new Error("Parcel not found");
  return parcelRepository.save(parcel.update(input));
}

export async function receiveParcel(
  parcelId: number,
  boxWeightG: number,
  shippingCostBYN: number,
): Promise<Parcel> {
  return parcelService.receiveParcel(parcelId, boxWeightG, shippingCostBYN);
}

export async function markAsDoneParcel(parcelId: number): Promise<Parcel> {
  return parcelService.markAsDoneParcel(parcelId);
}

export async function canShipParcel(parcelId: number): Promise<boolean> {
  return parcelService.canShip(parcelId);
}

export interface BatchItemInput {
  name: string;
  priceCNY: number;
  priceBYN: number;
  quantity: number;
  unit: "pcs" | "packs" | "pairs";
  customerId: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * The gap between the paid batch totals and the sum of item prices is the
 * payment service commission. Spread it over items in proportion to their
 * prices, so every customer pays their own share instead of the self customer
 * covering the whole commission.
 *
 * Both currencies are scaled by the same factor, which keeps the batch rate
 * intact and makes the item sums add up to the entered totals.
 */
export function distributeCommission(
  items: BatchItemInput[],
  totals: { totalCNY: number; totalBYN: number },
): BatchItemInput[] {
  const itemCNY = items.reduce((sum, item) => sum + item.priceCNY, 0);
  const itemBYN = items.reduce((sum, item) => sum + item.priceBYN, 0);
  const diffCNY = totals.totalCNY - itemCNY;
  const diffBYN = totals.totalBYN - itemBYN;

  // A shortfall is a commission. An excess means the prices were entered
  // incorrectly — do not silently rewrite them.
  if (itemCNY <= 0 || diffCNY <= 0.005 || diffBYN <= 0.005) return items;

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

export async function addItemsToParcel(
  parcelId: number,
  items: BatchItemInput[],
  totals?: { totalCNY: number; totalBYN: number },
): Promise<ParcelItem[]> {
  const finalItems = totals ? distributeCommission(items, totals) : items;
  const itemsWithParcelId = finalItems.map((item) => ({ ...item, parcelId }));
  const createdItems = await parcelItemService.addBatch(parcelId, itemsWithParcelId);

  // Auto-create paid payments for self customer's items
  const selfCustomer = await customerService.getSelfCustomer();
  if (selfCustomer) {
    const selfItems = createdItems.filter((item) => item.customerId === selfCustomer.id);
    for (const item of selfItems) {
      await paymentService.setItemPaid(parcelId, item.id, selfCustomer.id, true);
    }
  }

  return createdItems;
}

export async function updateParcelItem(
  itemId: number,
  input: {
    name?: string;
    priceCNY?: number;
    priceBYN?: number;
    quantity?: number;
    unit?: "pcs" | "packs" | "pairs";
    customerId?: number;
    trackNumbers?: string[];
    weightsG?: number[];
    status?: "ordered" | "shipped" | "received" | "lost";
  },
): Promise<ParcelItem> {
  return parcelItemService.updateItem(itemId, input);
}

export async function deleteParcelItem(itemId: number): Promise<void> {
  return parcelItemService.deleteItem(itemId);
}

export async function setParcelItemTracks(itemId: number, tracks: string[]): Promise<ParcelItem> {
  return parcelItemService.setTracks(itemId, tracks);
}

export async function setParcelItemWeights(itemId: number, weights: number[]): Promise<ParcelItem> {
  return parcelItemService.setWeights(itemId, weights);
}

export async function deleteParcel(parcelId: number): Promise<void> {
  return parcelRepository.delete(parcelId);
}

export async function createCustomer(name: string): Promise<Customer> {
  await customerService.validateUniqueName(name);
  return customerRepository.save(Customer.create({ name, isSelf: false }));
}

export async function createSelfCustomer(name: string): Promise<Customer> {
  return customerService.ensureSelfCustomerExists(name);
}

// Payment functions
export async function toggleItemPayment(
  parcelId: number,
  itemId: number,
  customerId: number,
): Promise<void> {
  const payments = await paymentRepository.findByParcelAndCustomer(parcelId, customerId);
  const itemPayment = payments.find((p) => p.type === "item" && p.itemId === itemId);

  if (itemPayment) {
    const updated = itemPayment.update({ paid: !itemPayment.paid });
    await paymentRepository.save(updated);
  } else {
    const payment = Payment.create({ parcelId, customerId, itemId, type: "item", paid: true });
    await paymentRepository.save(payment);
  }
}

export async function toggleShippingPayment(parcelId: number, customerId: number): Promise<void> {
  const payments = await paymentRepository.findByParcelAndCustomer(parcelId, customerId);
  const shippingPayment = payments.find((p) => p.type === "shipping");

  if (shippingPayment) {
    const updated = shippingPayment.update({ paid: !shippingPayment.paid });
    await paymentRepository.save(updated);
  } else {
    const payment = Payment.create({ parcelId, customerId, type: "shipping", paid: true });
    await paymentRepository.save(payment);
  }
}

export async function completeParcelTracks(parcelId: number): Promise<Parcel> {
  return parcelService.completeTracks(parcelId);
}

// Re-export for convenience
export {
  calculateCustomerBalance,
  createEmptyPaymentState,
  type PaymentState,
  paymentStateFromPayments,
  Payment,
} from "@/features/parcels/domain";
export { Parcel, ParcelItem } from "@/features/parcels/domain";
