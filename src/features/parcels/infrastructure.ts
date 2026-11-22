import { db } from "@/core/database";
import {
  Parcel,
  ParcelItem,
  Payment,
  type ParcelRepository,
  type ParcelItemRepository,
  type ParcelWithItems,
  type PaymentRepository,
} from "./domain";
import { Customer } from "@/features/customers/domain";

// ============================================
// Parcel Repository Implementation
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

  async findByIdWithItems(id: number): Promise<ParcelWithItems | null> {
    const parcel = await this.findById(id);
    if (!parcel) return null;
    const items = await parcelItemRepository.findByParcelId(id);
    return { parcel, items };
  }

  async save(parcel: Parcel): Promise<Parcel> {
    const data = parcel.toPersistence();
    if (parcel.id === 0) {
      const id = await db.parcels.add(data as any);
      return Parcel.fromPersistence({ ...data, id });
    } else {
      await db.parcels.update(parcel.id, data);
      return parcel;
    }
  }

  async delete(id: number): Promise<void> {
    await db.transaction("rw", db.parcels, db.parcelItems, async () => {
      await db.parcelItems.where("parcelId").equals(id).delete();
      await db.parcels.delete(id);
    });
  }
}

// ============================================
// ParcelItem Repository Implementation
// ============================================

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

  async save(item: ParcelItem): Promise<ParcelItem> {
    const data = item.toPersistence();
    if (item.id === 0) {
      const id = await db.parcelItems.add(data as any);
      return ParcelItem.fromPersistence({ ...data, id });
    } else {
      await db.parcelItems.update(item.id, data);
      return item;
    }
  }

  async delete(id: number): Promise<void> {
    await db.parcelItems.delete(id);
  }

  async deleteByParcelId(parcelId: number): Promise<void> {
    await db.parcelItems.where("parcelId").equals(parcelId).delete();
  }
}

// ============================================
// Payment Repository Implementation
// ============================================

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
    } else {
      await db.payments.update(payment.id, data);
      return payment;
    }
  }

  async delete(id: number): Promise<void> {
    await db.payments.delete(id);
  }
}

// ============================================
// Singleton Instances
// ============================================

export const parcelRepository = new DexieParcelRepository();
export const parcelItemRepository = new DexieParcelItemRepository();
export const paymentRepository = new DexiePaymentRepository();
