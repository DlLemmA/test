import type { PostgrestError } from "@supabase/supabase-js";
import { refreshCache } from "./cache";
import { cloudError } from "./cloudErrors";

/** A zero-row update means another device won; reload before reporting it. */
export async function throwWriteError(error: PostgrestError): Promise<never> {
  if (error.code === "PGRST116") await refreshCache();
  throw cloudError(error);
}

export function requireData<T>(data: T | null): T {
  if (data === null) throw new Error("База не вернула сохранённую строку");
  return data;
}
