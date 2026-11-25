// ============================================
// The routed app has one scroller: #main-content. Vue Router's built-in
// restoration tracks window scrolling, which stays at zero here, so the shell
// records this element's offset itself and the router consumes it on back.
// ============================================

const MAIN_SCROLLER_ID = "main-content";
const positions = new Map<string, number>();

export function rememberMainScroll(path: string, top: number): void {
  positions.set(path, top);
}

export function takeMainScroll(path: string): number {
  const top = positions.get(path) ?? 0;
  positions.delete(path);
  return top;
}

export function clearMainScroll(path: string): void {
  positions.delete(path);
}

export function mainScrollTarget(top = 0) {
  return { el: `#${MAIN_SCROLLER_ID}`, top, behavior: "instant" as const };
}
