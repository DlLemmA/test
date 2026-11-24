// ============================================
// Supabase client. The database is the only persistent store; this module owns
// the single browser client and the magic-link configuration.
// ============================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase.types";

export type AppSupabaseClient = SupabaseClient<Database>;

let client: AppSupabaseClient | null = null;

export function redirectUrl(): string {
  const base = import.meta.env.BASE_URL || "/";
  return new URL(base, window.location.origin).href;
}

/** Lazily created so unit tests can import mapping code without env vars. */
export function getSupabaseClient(): AppSupabaseClient {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY");
  }

  client = createClient<Database>(url, key, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}
