// ============================================
// Composition root — the only place domain services are wired to adapters.
// ============================================

import { CustomerService } from "@/features/customers/domain";
import { customerRepository } from "@/features/customers/infrastructure";
import { PaymentService } from "@/features/parcels/services/PaymentService";
import { ParcelItemService } from "@/features/parcels/services/ParcelItemService";
import { ParcelService } from "@/features/parcels/services/ParcelService";
import {
  parcelItemRepository,
  parcelRepository,
  paymentRepository,
} from "@/features/parcels/infrastructure";

export const customerService = new CustomerService(customerRepository);
export const parcelService = new ParcelService(parcelRepository, parcelItemRepository);
export const parcelItemService = new ParcelItemService(parcelItemRepository, parcelRepository);
export const paymentService = new PaymentService(
  paymentRepository,
  async () => (await customerService.getSelfCustomer())?.id,
);
