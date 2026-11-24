// ============================================
// Magic-link auth state. The router must not start until the PKCE callback has
// been exchanged, so initAuth() is awaited by main.ts before app.mount().
// ============================================

import type { AuthError, Session } from "@supabase/supabase-js";
import { shallowRef } from "vue";
import { clearCache } from "./cache";
import { getSupabaseClient, redirectUrl } from "./supabase";
import { isTestMode, setTestMode } from "./testMode";

const TEST_SESSION = {
  access_token: "e2e",
  token_type: "bearer",
  expires_in: 3600,
  refresh_token: "e2e",
  user: { id: "e2e-user", email: "e2e@example.test" },
} as unknown as Session;

export const authSession = shallowRef<Session | null>(null);
export const authReady = shallowRef(false);

let unsubscribe: (() => void) | null = null;

export function isTestSession(): boolean {
  return isTestMode();
}

export function enableTestSession(): void {
  setTestMode(true);
  authSession.value = TEST_SESSION;
  authReady.value = true;
}

function authMessage(error: AuthError): Error {
  return new Error(error.message || "Ошибка входа");
}

export async function initAuth(): Promise<void> {
  authReady.value = false;

  if (isTestSession()) {
    authSession.value = TEST_SESSION;
    authReady.value = true;
    return;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw authMessage(error);
  authSession.value = data.session;

  unsubscribe?.();
  const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
    authSession.value = session;
    if (!session) clearCache();
  });
  unsubscribe = () => subscription.subscription.unsubscribe();

  authReady.value = true;
}

export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectUrl() },
  });
  if (error) throw authMessage(error);
}

export async function signOut(): Promise<void> {
  const wasTestSession = isTestSession();
  setTestMode(false);
  if (!wasTestSession) await getSupabaseClient().auth.signOut();
  authSession.value = null;
  clearCache();
}
