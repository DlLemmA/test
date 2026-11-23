// ============================================
// Statement — one set of facts per parcel / per customer.
// Every screen and the Excel export render these facts; none of them
// reassembles balances or payment state on their own.
// ============================================

import {
  customerBalances,
  emptyCustomerBalance,
  sumCustomerBalances,
  type CustomerBalance,
  type CustomerBalanceResult,
} from "@/features/balances/domain";
import type { Customer } from "@/features/customers/domain";
import {
  paymentStateFromPayments,
  type Parcel,
  type ParcelItem,
  type Payment,
  type PaymentState,
} from "@/features/parcels/domain";

/** Everything the statement builder needs; the loader supplies it. */
export interface StatementData {
  customers: Customer[];
  parcels: Parcel[];
  items: ParcelItem[];
  payments: Payment[];
}

/** The single source of truth for one parcel (screen + Excel). */
export interface ParcelStatement {
  parcel: Parcel;
  items: ParcelItem[];
  customers: Customer[];
  balance: CustomerBalanceResult;
  paymentState: PaymentState;
}

/** One customer's slice of a parcel, with the whole parcel's balance context. */
export interface CustomerParcelStatement {
  parcel: Parcel;
  items: ParcelItem[];
  balance: CustomerBalanceResult;
  paymentState: PaymentState;
}

/** A customer across every parcel they appear in. */
export interface CustomerStatement {
  customer: Customer;
  items: ParcelItem[];
  parcels: CustomerParcelStatement[];
  balance: CustomerBalance;
  parcelCount: number;
}

function selfCustomerId(customers: Customer[]): number | undefined {
  return customers.find((customer) => customer.isSelf)?.id;
}

export function buildParcelStatement(
  data: StatementData,
  parcelId: number,
): ParcelStatement | null {
  const parcel = data.parcels.find((candidate) => candidate.id === parcelId);
  if (!parcel) return null;

  const items = data.items.filter((item) => item.parcelId === parcelId);
  const payments = data.payments.filter((payment) => payment.parcelId === parcelId);
  const paymentState = paymentStateFromPayments(payments);
  const balance = customerBalances({
    parcel,
    items,
    paymentState,
    selfCustomerId: selfCustomerId(data.customers),
  });

  return { parcel, items, customers: data.customers, balance, paymentState };
}

export function buildCustomerStatement(
  data: StatementData,
  customerId: number,
): CustomerStatement | null {
  const customer = data.customers.find((candidate) => candidate.id === customerId);
  if (!customer) return null;

  const items = data.items.filter((item) => item.customerId === customerId);
  const selfId = selfCustomerId(data.customers);
  const parcels: CustomerParcelStatement[] = [];
  const balances: CustomerBalance[] = [];

  for (const parcel of data.parcels) {
    const customerItems = items.filter((item) => item.parcelId === parcel.id);
    if (customerItems.length === 0) continue;

    // Delivery shares are proportional to the whole parcel's weight, and
    // payment state is scoped to one parcel and one customer.
    const parcelItems = data.items.filter((item) => item.parcelId === parcel.id);
    const payments = data.payments.filter(
      (payment) => payment.parcelId === parcel.id && payment.customerId === customerId,
    );
    const paymentState = paymentStateFromPayments(payments);
    const balance = customerBalances({
      parcel,
      items: parcelItems,
      paymentState,
      selfCustomerId: selfId,
    });
    balances.push(balance.byCustomer.get(customerId) ?? emptyCustomerBalance());
    parcels.push({ parcel, items: customerItems, balance, paymentState });
  }

  return {
    customer,
    items,
    parcels,
    balance: sumCustomerBalances(balances),
    parcelCount: parcels.length,
  };
}

export function buildCustomerStatements(data: StatementData): CustomerStatement[] {
  return data.customers.flatMap((customer) => {
    const statement = buildCustomerStatement(data, customer.id);
    return statement ? [statement] : [];
  });
}
