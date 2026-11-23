// ============================================
// Composition root — the only place domain services are wired to adapters.
// ============================================

import { CustomerService } from "@/features/customers/domain";
import { customerRepository, customerWriteStore } from "@/features/customers/infrastructure";
import { ParcelCommands } from "@/features/parcels/commands/ParcelCommands";
import { PaymentService } from "@/features/parcels/services/PaymentService";
import {
  parcelItemRepository,
  parcelRepository,
  parcelWriteStore,
  paymentRepository,
} from "@/features/parcels/infrastructure";

export const customerService = new CustomerService(customerRepository, customerWriteStore);
export const parcelCommands = new ParcelCommands(
  parcelRepository,
  parcelItemRepository,
  parcelWriteStore,
);
export const paymentService = new PaymentService(
  paymentRepository,
  async () => (await customerService.getSelfCustomer())?.id,
);
