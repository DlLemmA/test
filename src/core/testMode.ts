// Dev-only marker for the deterministic e2e session. Kept separate from auth
// so the cache can read it without importing the auth module (and its client).

const TEST_SESSION_FLAG = "pindo-e2e-session";

export function isTestMode(): boolean {
  return (
    import.meta.env.DEV &&
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(TEST_SESSION_FLAG) === "1"
  );
}

export function setTestMode(enabled: boolean): void {
  if (!import.meta.env.DEV || typeof sessionStorage === "undefined") return;
  if (enabled) sessionStorage.setItem(TEST_SESSION_FLAG, "1");
  else sessionStorage.removeItem(TEST_SESSION_FLAG);
}
