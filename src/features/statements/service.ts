// ============================================
// Statement loading — the only place that assembles statement facts.
// It reuses the existing repositories; no new ports or adapters.
// ============================================

import { customerRepository } from "@/features/customers/infrastructure";
import {
  parcelItemRepository,
  parcelRepository,
  paymentRepository,
} from "@/features/parcels/infrastructure";
import {
  buildCustomerStatement,
  buildCustomerStatements,
  buildParcelStatement,
  type CustomerStatement,
  type ParcelStatement,
  type StatementData,
} from "./domain/Statement";

export type {
  CustomerParcelStatement,
  CustomerStatement,
  ParcelStatement,
} from "./domain/Statement";

async function loadAll(): Promise<StatementData> {
  const [customers, parcels, items, payments] = await Promise.all([
    customerRepository.findAll(),
    parcelRepository.findAll(),
    parcelItemRepository.findAll(),
    paymentRepository.findAll(),
  ]);
  return { customers, parcels, items, payments };
}

export async function getParcelStatement(parcelId: number): Promise<ParcelStatement | null> {
  const [parcel, customers, items, payments] = await Promise.all([
    parcelRepository.findById(parcelId),
    customerRepository.findAll(),
    parcelItemRepository.findByParcelId(parcelId),
    paymentRepository.findByParcelId(parcelId),
  ]);
  if (!parcel) return null;
  return buildParcelStatement({ customers, parcels: [parcel], items, payments }, parcelId);
}

export async function getCustomerStatement(customerId: number): Promise<CustomerStatement | null> {
  const [customer, customers, parcels, items, payments] = await Promise.all([
    customerRepository.findById(customerId),
    customerRepository.findAll(),
    parcelRepository.findAll(),
    parcelItemRepository.findAll(),
    paymentRepository.findByCustomer(customerId),
  ]);
  if (!customer) return null;
  return buildCustomerStatement({ customers, parcels, items, payments }, customerId);
}

export async function getCustomerStatements(): Promise<CustomerStatement[]> {
  return buildCustomerStatements(await loadAll());
}
