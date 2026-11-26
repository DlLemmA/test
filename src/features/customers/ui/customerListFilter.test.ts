import { describe, expect, it } from "vitest";
import { Customer } from "../domain";
import type { CustomerStatement } from "@/features/statements/service";
import { filterCustomerStatements } from "./customerListFilter";

function statement(id: number, name: string): CustomerStatement {
  return {
    customer: Customer.fromPersistence({ id, name, isSelf: name === "Я" }),
    items: [],
    parcels: [],
    parcelCount: 0,
    balance: {} as CustomerStatement["balance"],
  };
}

const statements = [statement(1, "Я"), statement(2, "Катя"), statement(3, "Иван")];

describe("customer index search", () => {
  it("returns every customer for an empty query", () => {
    expect(filterCustomerStatements(statements, "   ")).toBe(statements);
  });

  it("finds names case-insensitively", () => {
    expect(
      filterCustomerStatements(statements, "кат").map(({ customer }) => customer.name),
    ).toEqual(["Катя"]);
    expect(filterCustomerStatements(statements, "ИВАН")).toHaveLength(1);
  });

  it("returns no rows for an unmatched name", () => {
    expect(filterCustomerStatements(statements, "нет такого")).toEqual([]);
  });
});
