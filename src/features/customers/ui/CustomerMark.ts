import { esc } from "@/core/utils";
import type { Customer } from "../domain";

export type CustomerMarkVariant = "box" | "list" | "avatar";

// One source of truth for the customer's short label: "Я" for self,
// otherwise up to two initials. Visual size/border is a variant, not a
// different label calculation.
export function customerInitials(customer: Pick<Customer, "name" | "isSelf">): string {
  if (customer.isSelf) return "Я";
  return (
    customer.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() || "")
      .join("") || "?"
  );
}

export function customerMark(
  customer: Customer | undefined,
  variant: CustomerMarkVariant = "box",
): string {
  const text = customer ? customerInitials(customer) : "—";
  return `<span class="customer-mark customer-mark--${variant}" aria-hidden="true">${esc(text)}</span>`;
}
