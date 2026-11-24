import { describe, expect, it } from "vitest";
import { cloudError, StaleWriteError } from "./cloudErrors";
import type { PostgrestError } from "@supabase/supabase-js";

function error(code: string, message = "raw"): PostgrestError {
  return { code, message, details: "", hint: "" } as PostgrestError;
}

describe("cloudError", () => {
  it("maps a no-row update to a stale-write message", () => {
    expect(cloudError(error("PGRST116"))).toBeInstanceOf(StaleWriteError);
    expect(cloudError(error("PGRST116")).message).toBe("Данные изменились — обновите");
  });

  it("maps RLS failures to an access message", () => {
    expect(cloudError(error("42501")).message).toBe("Нет доступа к общим данным");
    expect(cloudError(error("PGRST301")).message).toBe("Нет доступа к общим данным");
  });

  it("keeps other backend messages", () => {
    expect(cloudError(error("23505", "duplicate key")).message).toBe("duplicate key");
  });
});
