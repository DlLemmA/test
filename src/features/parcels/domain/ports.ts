import type { Parcel } from "./Parcel";
import type { ParcelItem } from "./ParcelItem";
import type { Payment } from "./Payment";

// ============================================
// Repository Interfaces (Ports)
// ============================================

export interface ParcelRepository {
  findAll(): Promise<Parcel[]>;
  findById(id: number): Promise<Parcel | null>;
  findByIdWithItems(id: number): Promise<ParcelWithItems | null>;
  save(parcel: Parcel): Promise<Parcel>;
  delete(id: number): Promise<void>;
}

export interface ParcelItemRepository {
  findByParcelId(parcelId: number): Promise<ParcelItem[]>;
  findAll(): Promise<ParcelItem[]>;
  findById(id: number): Promise<ParcelItem | null>;
  save(item: ParcelItem): Promise<ParcelItem>;
  delete(id: number): Promise<void>;
  deleteByParcelId(parcelId: number): Promise<void>;
}

export interface PaymentRepository {
  findAll(): Promise<Payment[]>;
  findByParcelId(parcelId: number): Promise<Payment[]>;
  findByParcelAndCustomer(parcelId: number, customerId: number): Promise<Payment[]>;
  findByCustomer(customerId: number): Promise<Payment[]>;
  save(payment: Payment): Promise<Payment>;
  delete(id: number): Promise<void>;
}

export interface ParcelWithItems {
  parcel: Parcel;
  items: ParcelItem[];
}
