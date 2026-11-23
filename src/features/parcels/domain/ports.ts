import type { Parcel } from "./Parcel";
import type { ParcelItem } from "./ParcelItem";
import type { Payment } from "./Payment";

// ============================================
// Read ports. Every mutation goes through ParcelWriteStore and the named
// commands in ../commands; adapters may do more, but callers cannot.
// ============================================

export interface ParcelRepository {
  findAll(): Promise<Parcel[]>;
  findById(id: number): Promise<Parcel | null>;
}

export interface ParcelItemRepository {
  findByParcelId(parcelId: number): Promise<ParcelItem[]>;
  findAll(): Promise<ParcelItem[]>;
  findById(id: number): Promise<ParcelItem | null>;
}

export interface PaymentRepository {
  findAll(): Promise<Payment[]>;
  findByParcelId(parcelId: number): Promise<Payment[]>;
  findByParcelAndCustomer(parcelId: number, customerId: number): Promise<Payment[]>;
  findByCustomer(customerId: number): Promise<Payment[]>;
  save(payment: Payment): Promise<Payment>;
}

/** One operation = one adapter transaction; no CRUD surface leaks to callers. */
export interface ParcelWriteStore {
  saveParcel(parcel: Parcel): Promise<Parcel>;
  /** Insert a batch atomically and return the persisted items with their ids. */
  addItems(items: ParcelItem[]): Promise<ParcelItem[]>;
  saveItem(item: ParcelItem): Promise<ParcelItem>;
  deleteItem(id: number): Promise<void>;
  /** Delete a parcel with its items and payments in one transaction. */
  deleteParcel(id: number): Promise<void>;
}
