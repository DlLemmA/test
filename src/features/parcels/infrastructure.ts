import { db } from "@/core/database";
import {
  Parcel,
  ParcelItem,
  Payment,
  type ParcelRepository,
  type ParcelItemRepository,
  type ParcelWriteStore,
  type PaymentRepository,
} from "./domain";

// ============================================
// Read adapters
// ============================================

export class DexieParcelRepository implements ParcelRepository {
  async findAll(): Promise<Parcel[]> {
    const rows = await db.parcels.orderBy("createdAt").reverse().toArray();
    return rows.map(Parcel.fromPersistence);
  }

  async findById(id: number): Promise<Parcel | null> {
    const row = await db.parcels.get(id);
    return row ? Parcel.fromPersistence(row) : null;
  }
}

export class DexieParcelItemRepository implements ParcelItemRepository {
  async findByParcelId(parcelId: number): Promise<ParcelItem[]> {
    const rows = await db.parcelItems.where("parcelId").equals(parcelId).toArray();
    return rows.map(ParcelItem.fromPersistence);
  }

  async findAll(): Promise<ParcelItem[]> {
    const rows = await db.parcelItems.toArray();
    return rows.map(ParcelItem.fromPersistence);
  }

  async findById(id: number): Promise<ParcelItem | null> {
    const row = await db.parcelItems.get(id);
    return row ? ParcelItem.fromPersistence(row) : null;
  }
}

export class DexiePaymentRepository implements PaymentRepository {
  async findAll(): Promise<Payment[]> {
    const rows = await db.payments.toArray();
    return rows.map(Payment.fromPersistence);
  }

  async findByParcelId(parcelId: number): Promise<Payment[]> {
    const rows = await db.payments.where("parcelId").equals(parcelId).toArray();
    return rows.map(Payment.fromPersistence);
  }

  async findByParcelAndCustomer(parcelId: number, customerId: number): Promise<Payment[]> {
    const rows = await db.payments
      .where("parcelId")
      .equals(parcelId)
      .and((p) => p.customerId === customerId)
      .toArray();
    return rows.map(Payment.fromPersistence);
  }

  async findByCustomer(customerId: number): Promise<Payment[]> {
    const rows = await db.payments.where("customerId").equals(customerId).toArray();
    return rows.map(Payment.fromPersistence);
  }

  async save(payment: Payment): Promise<Payment> {
    const data = payment.toPersistence();
    if (payment.id === 0) {
      const id = await db.payments.add(data as any);
      return Payment.fromPersistence({ ...data, id });
    }
    await db.payments.update(payment.id, data);
    return payment;
  }
}

// ============================================
// Write adapter — aggregate operations, transactional by construction
// ============================================

export class DexieParcelWriteStore implements ParcelWriteStore {
  async saveParcel(parcel: Parcel): Promise<Parcel> {
    const data = parcel.toPersistence();
    if (parcel.id === 0) {
      const id = await db.parcels.add(data as any);
      return Parcel.fromPersistence({ ...data, id });
    }
    await db.parcels.update(parcel.id, data);
    return parcel;
  }

  async addItems(items: ParcelItem[]): Promise<ParcelItem[]> {
    return db.transaction("rw", db.parcelItems, async () => {
      const saved: ParcelItem[] = [];
      for (const item of items) {
        const data = item.toPersistence();
        const id = await db.parcelItems.add(data as any);
        saved.push(ParcelItem.fromPersistence({ ...data, id }));
      }
      return saved;
    });
  }

  async saveItem(item: ParcelItem): Promise<ParcelItem> {
    const data = item.toPersistence();
    if (item.id === 0) {
      const id = await db.parcelItems.add(data as any);
      return ParcelItem.fromPersistence({ ...data, id });
    }
    await db.parcelItems.update(item.id, data);
    return item;
  }

  async deleteItem(id: number): Promise<void> {
    await db.parcelItems.delete(id);
  }

  async deleteParcel(id: number): Promise<void> {
    await db.transaction("rw", db.parcels, db.parcelItems, db.payments, async () => {
      await db.payments.where("parcelId").equals(id).delete();
      await db.parcelItems.where("parcelId").equals(id).delete();
      await db.parcels.delete(id);
    });
  }
}

// ============================================
// Singleton Instances
// ============================================

export const parcelRepository = new DexieParcelRepository();
export const parcelItemRepository = new DexieParcelItemRepository();
export const paymentRepository = new DexiePaymentRepository();
export const parcelWriteStore = new DexieParcelWriteStore();
