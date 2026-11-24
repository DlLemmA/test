import type { PostgrestError } from "@supabase/supabase-js";

export class StaleWriteError extends Error {
  constructor() {
    super("Данные изменились — обновите");
    this.name = "StaleWriteError";
  }
}

/** Translate PostgREST failures into messages the UI can show as-is. */
export function cloudError(error: PostgrestError): Error {
  if (error.code === "PGRST116") return new StaleWriteError();
  if (error.code === "42501" || error.code === "PGRST301") {
    return new Error("Нет доступа к общим данным");
  }
  return new Error(error.message || "Ошибка базы данных");
}
