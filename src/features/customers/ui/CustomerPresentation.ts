// ============================================
// Customer presentation: labels, initials and name equivalence.
// UI copy belongs here; the domain keeps only customer facts.
// ============================================

export const SELF_SUFFIX = "(я)";
export const SELF_INITIAL = "Я";
export const CUSTOMER_FORMS =
  "нет заказчиков | {count} заказчик | {count} заказчика | {count} заказчиков";

export type CustomerLike = { name: string; isSelf: boolean };

export function customerLabel(customer: CustomerLike): string {
  return customer.isSelf ? `${customer.name} ${SELF_SUFFIX}` : customer.name;
}

export function customerInitials(customer: CustomerLike): string {
  if (customer.isSelf) return SELF_INITIAL;
  return (
    customer.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() || "")
      .join("") || "?"
  );
}

/** Typed names and displayed labels compare equally: "Марина" === "Марина (я)". */
export function customerKey(value: string): string {
  return value
    .trim()
    .replace(/\s*\(я\)\s*$/i, "")
    .toLocaleLowerCase("ru-RU");
}

export function findCustomerByName<T extends { name: string }>(
  customers: T[],
  value: string,
): T | undefined {
  const key = customerKey(value);
  if (!key) return undefined;
  return customers.find((customer) => customerKey(customer.name) === key);
}

const NO_MATCH = -1;
const EXACT = 0;
const PREFIX = 1;
const WORD_PREFIX = 2;
const SUBSTRING = 3;

function matchScore(customer: CustomerLike, key: string): number {
  const name = customer.name.toLocaleLowerCase("ru-RU");

  // With no query, show everyone; "self" simply goes first.
  if (!key) return customer.isSelf ? EXACT : PREFIX;
  if (customerKey(customer.name) === key) return EXACT;
  if (name.startsWith(key)) return PREFIX;
  if (name.split(/\s+/).some((word) => word.startsWith(key))) return WORD_PREFIX;
  if (name.includes(key)) return SUBSTRING;
  return NO_MATCH;
}

/** Best matches first; ties keep the original customer order. */
export function rankCustomers<T extends CustomerLike>(customers: T[], query: string): T[] {
  const key = customerKey(query);
  return customers
    .map((customer, index) => ({ customer, index, score: matchScore(customer, key) }))
    .filter(({ score }) => score !== NO_MATCH)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ customer }) => customer);
}
