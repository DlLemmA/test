import { esc } from "@/core/utils";
import { customerInitials } from "./CustomerPresentation";
import type { Customer } from "../domain";

export type CustomerMarkVariant = "box" | "list" | "avatar";

// Variant controls size and border; the short label itself lives in presentation.
export function customerMark(
  customer: Customer | undefined,
  variant: CustomerMarkVariant = "box",
): string {
  const text = customer ? customerInitials(customer) : "—";
  return `<span class="customer-mark customer-mark--${variant}" aria-hidden="true">${esc(text)}</span>`;
}
