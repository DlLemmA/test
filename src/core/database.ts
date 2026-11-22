import Dexie, { type Table } from "dexie";

// ============================================
// Database Row Types
// ============================================

export interface CustomerRow {
  id?: number;
  name: string;
  isSelf: boolean;
}

export interface ParcelRow {
  id?: number;
  name?: string;
  status: ParcelStatus;
  boxWeightG?: number;
  shippingCostBYN?: number;
  shippedAt?: string;
  receivedAt?: string;
  completedAt?: string; // when all tracks filled
  createdAt: string;
}

export type ParcelStatus = "draft" | "shipped" | "received" | "done";

export interface ParcelItemRow {
  id?: number;
  parcelId: number;
  name: string;
  priceCNY: number;
  priceBYN: number;
  quantity: number;
  unit: "pcs" | "packs";
  customerId: number;
  trackNumbers: string; // JSON string[]
  weightsG: string; // JSON number[]
  status: ParcelItemStatus;
  tracksCompletedAt?: string; // when all tracks filled (timestamp)
  createdAt: string;
}

export type ParcelItemStatus = "ordered" | "shipped" | "received" | "lost";

export interface PaymentRow {
  id?: number;
  parcelId: number;
  customerId: number;
  itemId?: number; // null = shipping payment
  type: "item" | "shipping";
  paid: boolean;
  paidAt?: string;
  createdAt: string;
}

// ============================================
// Dexie Database Class
// ============================================

export class AppDatabase extends Dexie {
  customers!: Table<CustomerRow, number>;
  parcels!: Table<ParcelRow, number>;
  parcelItems!: Table<ParcelItemRow, number>;
  payments!: Table<PaymentRow, number>;

  constructor() {
    super("pinduoduo-db");
    this.version(2).stores({
      customers: "++id, name, isSelf",
      parcels: "++id, status, createdAt, shippedAt, receivedAt",
      parcelItems: "++id, parcelId, customerId, status, createdAt",
    });

    this.version(3)
      .stores({
        customers: "++id, name, isSelf",
        parcels: "++id, status, createdAt, shippedAt, receivedAt, completedAt",
        parcelItems: "++id, parcelId, customerId, status, createdAt",
        payments: "++id, parcelId, customerId, itemId, type",
      })
      .upgrade(async (trans) => {
        // Migration: add payments table and completedAt to parcels
        const parcels = trans.table("parcels");
        await parcels.toCollection().modify((parcel) => {
          if (!parcel.completedAt) parcel.completedAt = null;
        });
      });

    this.version(4)
      .stores({
        customers: "++id, name, isSelf",
        parcels: "++id, status, createdAt, shippedAt, receivedAt, completedAt",
        parcelItems: "++id, parcelId, customerId, status, createdAt",
        payments: "++id, parcelId, customerId, itemId, type",
      })
      .upgrade(async (trans) => {
        // Migration: add tracksCompletedAt to parcelItems
        const parcelItems = trans.table("parcelItems");
        await parcelItems.toCollection().modify((item) => {
          if (item.tracksCompletedAt === undefined) item.tracksCompletedAt = null;
        });
      });

    // Hook to auto-set createdAt for parcels
    this.parcels.hook("creating", (_primKey, obj, _trans) => {
      if (!obj.createdAt) obj.createdAt = new Date().toISOString();
    });

    // Hook to auto-set createdAt for parcelItems
    this.parcelItems.hook("creating", (_primKey, obj, _trans) => {
      if (!obj.createdAt) obj.createdAt = new Date().toISOString();
      // Ensure JSON arrays
      if (!obj.trackNumbers) obj.trackNumbers = "[]";
      if (!obj.weightsG) obj.weightsG = "[]";
    });

    // Hook for payments
    this.payments.hook("creating", (_primKey, obj, _trans) => {
      if (!obj.createdAt) obj.createdAt = new Date().toISOString();
    });
  }
}

export const db = new AppDatabase();

// ============================================
// Migration Helpers
// ============================================

export async function migrateFromSqlJs(_sqlJsBytes: Uint8Array): Promise<void> {
  console.log("Migration from sql.js not implemented yet");
}
