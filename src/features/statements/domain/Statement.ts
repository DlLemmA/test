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
import { settlementFacts, type SettlementFacts } from "@/features/settlement/domain";
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
  settlement: SettlementFacts;
}

/** One customer's slice of a parcel, with the whole parcel's balance context. */
export interface CustomerParcelStatement {
  parcel: Parcel;
  items: ParcelItem[];
  balance: CustomerBalanceResult;
  settlement: SettlementFacts;
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
  const selfId = selfCustomerId(data.customers);
  const balance = customerBalances({
    parcel,
    items,
    paymentState,
    selfCustomerId: selfId,
  });

  return {
    parcel,
    items,
    customers: data.customers,
    balance,
    settlement: settlementFacts({ parcel, items, paymentState, selfCustomerId: selfId }),
  };
}

/**
 * Rebuild a statement with an already-decided payment state. Used for an
 * optimistic checkbox update: the same policy and balance math as a fresh
 * load, but without a round trip to Supabase.
 */
/** Every parcel in the ledger with the same facts the detail screen uses. */
export function buildParcelStatements(data: StatementData): ParcelStatement[] {
  return data.parcels
    .map((parcel) => buildParcelStatement(data, parcel.id))
    .filter((statement): statement is ParcelStatement => statement !== null);
}

export function withPaymentState(
  statement: ParcelStatement,
  paymentState: PaymentState,
): ParcelStatement {
  const selfId = selfCustomerId(statement.customers);
  return {
    ...statement,
    balance: customerBalances({
      parcel: statement.parcel,
      items: statement.items,
      paymentState,
      selfCustomerId: selfId,
    }),
    settlement: settlementFacts({
      parcel: statement.parcel,
      items: statement.items,
      paymentState,
      selfCustomerId: selfId,
    }),
  };
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
    parcels.push({
      parcel,
      items: customerItems,
      balance,
      settlement: settlementFacts({
        parcel,
        items: parcelItems,
        paymentState,
        selfCustomerId: selfId,
      }),
    });
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
