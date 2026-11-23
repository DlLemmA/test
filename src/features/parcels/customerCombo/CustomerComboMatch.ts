import type { Customer } from "@/features/customers/domain";

// Lower scores come first in the picker. -1 means "not a match at all".
const NO_MATCH = -1;
const EXACT = 0;
const PREFIX = 1;
const WORD_PREFIX = 2;
const SUBSTRING = 3;

// Ignore the "(я)" suffix added in the UI, so typed names and stored names compare equally.
export function customerKey(value: string): string {
  return value
    .trim()
    .replace(/\s*\(я\)\s*$/i, "")
    .toLocaleLowerCase("ru-RU");
}

export function findCustomerByName(customers: Customer[], value: string): Customer | undefined {
  const key = customerKey(value);
  if (!key) return undefined;
  return customers.find((customer) => customerKey(customer.name) === key);
}

function matchScore(customer: Customer, key: string): number {
  const name = customer.name.toLocaleLowerCase("ru-RU");

  // With no query, show everyone; "self" simply goes first.
  if (!key) return customer.isSelf ? EXACT : PREFIX;
  if (customerKey(customer.name) === key) return EXACT;
  if (name.startsWith(key)) return PREFIX;
  if (name.split(/\s+/).some((word) => word.startsWith(key))) return WORD_PREFIX;
  if (name.includes(key)) return SUBSTRING;
  return NO_MATCH;
}

// Best matches first; ties keep the original customer order.
export function rankCustomers(customers: Customer[], query: string): Customer[] {
  const key = customerKey(query);
  return customers
    .map((customer, index) => ({ customer, index, score: matchScore(customer, key) }))
    .filter(({ score }) => score !== NO_MATCH)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ customer }) => customer);
}
