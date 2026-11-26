// ============================================
// Customer index search — one pure fact derived from the statements the list
// already loaded. The view owns only the reactive query.
// ============================================

import type { CustomerStatement } from "@/features/statements/service";

export function filterCustomerStatements(
  statements: CustomerStatement[],
  query: string,
): CustomerStatement[] {
  const needle = query.trim().toLocaleLowerCase("ru-RU");
  if (!needle) return statements;
  return statements.filter((statement) =>
    statement.customer.name.toLocaleLowerCase("ru-RU").includes(needle),
  );
}
