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
  type PaymentState,
  type BatchItemInput,
  type BatchTotals,
  paymentStateFromPayments,
  reconcileBatch,
} from "@/features/parcels/domain";
import { customerBalances, type CustomerBalanceResult } from "@/features/balances/domain";
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
  async () => (await customerService.getSelfCustomer())?.id,
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
  balance: CustomerBalanceResult;
  paymentState: PaymentState;
  payments: Payment[];
} | null> {
  const result = await parcelService.getParcelWithItems(parcelId);
  if (!result) return null;

  const customers = await customerRepository.findAll();
  const payments = await paymentService.getPaymentsForParcel(parcelId);
  const paymentState = paymentStateFromPayments(payments);
  const selfCustomerId = customers.find((customer) => customer.isSelf)?.id;
  const balance = customerBalances({
    parcel: result.parcel,
    items: result.items,
    paymentState,
    selfCustomerId,
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

export async function addItemsToParcel(
  parcelId: number,
  items: BatchItemInput[],
  totals?: BatchTotals,
): Promise<ParcelItem[]> {
  const finalItems = totals ? reconcileBatch(items, totals).items : items;
  const itemsWithParcelId = finalItems.map((item) => ({ ...item, parcelId }));
  const createdItems = await parcelItemService.addBatch(parcelId, itemsWithParcelId);

  // Payment recording resolves the self customer and marks their items paid.
  await paymentService.markSelfItemsPaid(parcelId, createdItems);

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

export async function completeParcelTracks(parcelId: number): Promise<Parcel> {
  return parcelService.completeTracks(parcelId);
}

// Re-export for convenience
export {
  createEmptyPaymentState,
  type PaymentState,
  paymentStateFromPayments,
  Payment,
} from "@/features/parcels/domain";
export { Parcel, ParcelItem } from "@/features/parcels/domain";
