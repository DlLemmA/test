import { describe, expect, it } from "vitest";
import { t } from "@/core/utils";
import {
  CUSTOMER_FORMS,
  customerInitials,
  broughtWeight,
  customerKey,
  customerLabel,
  findCustomerByName,
  rankCustomers,
} from "./CustomerPresentation";

const katya = { id: 2, name: "Катя", isSelf: false };
const self = { id: 1, name: "Марина", isSelf: true };

describe("customer presentation", () => {
  it("adds the self suffix only in labels", () => {
    expect(customerLabel(katya)).toBe("Катя");
    expect(customerLabel(self)).toBe("Марина (я)");
    expect(katya.name).toBe("Катя");
  });

  it("uses Я for the self avatar and up to two initials otherwise", () => {
    expect(customerInitials(self)).toBe("Я");
    expect(customerInitials({ name: "Иван Иванов", isSelf: false })).toBe("ИИ");
    expect(customerInitials({ name: "  ", isSelf: false })).toBe("?");
  });

  it("compares typed names and displayed labels equally", () => {
    expect(customerKey(" Марина (Я) ")).toBe("марина");
    expect(findCustomerByName([katya, self], "марина")?.id).toBe(1);
    expect(findCustomerByName([katya, self], customerLabel(self))?.id).toBe(1);
    expect(findCustomerByName([katya, self], "нет")).toBeUndefined();
  });

  it("ranks exact matches first and puts self first without a query", () => {
    const customers = [katya, { id: 3, name: "Катя Петрова", isSelf: false }, self];
    expect(rankCustomers(customers, "").map((c) => c.id)).toEqual([1, 2, 3]);
    expect(rankCustomers(customers, "катя").map((c) => c.id)).toEqual([2, 3]);
    expect(rankCustomers(customers, "петрова").map((c) => c.id)).toEqual([3]);
  });

  it("pluralizes customer counts with four forms", () => {
    expect(t(CUSTOMER_FORMS, 0)).toBe("нет заказчиков");
    expect(t(CUSTOMER_FORMS, 1)).toBe("1 заказчик");
    expect(t(CUSTOMER_FORMS, 3)).toBe("3 заказчика");
    expect(t(CUSTOMER_FORMS, 11)).toBe("11 заказчиков");
  });

  it("shows brought kilograms only when the weight is known", () => {
    expect(broughtWeight([])).toBeNull();
    expect(broughtWeight([{ weightsG: [] }])).toBeNull();
    expect(broughtWeight([{ weightsG: [420, 380] }, { weightsG: [210] }])).toBe("1.010 кг");
  });
});
