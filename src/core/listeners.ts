// ============================================
// Event Listener Management (auto-cleanup)
// ============================================

type ListenerEntry = {
  element: Element | Document | Window;
  event: string;
  handler: EventListener;
  options?: AddEventListenerOptions;
};

const listeners: ListenerEntry[] = [];

/**
 * Add event listener with automatic tracking for cleanup.
 * Usage: on(element, 'click', handler)
 * Returns false if element is null (allows optional chaining: on(el, 'click', fn) && ...)
 */
export function on<K extends keyof HTMLElementEventMap>(
  element: Element | Document | Window | null,
  event: K,
  handler: (this: Element, ev: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): boolean;
export function on(
  element: Element | Document | Window | null,
  event: string,
  handler: EventListener,
  options?: AddEventListenerOptions,
): boolean;
export function on(
  element: Element | Document | Window | null,
  event: string,
  handler: EventListener,
  options?: AddEventListenerOptions,
): boolean {
  if (!element) return false;
  element.addEventListener(event, handler, options);
  listeners.push({ element, event, handler, options });
  return true;
}

/**
 * Remove all tracked listeners. Call on view unmount/rerender.
 */
export function destroy(): void {
  for (const { element, event, handler, options } of listeners) {
    element.removeEventListener(event, handler, options);
  }
  listeners.length = 0;
}

/**
 * Remove specific listener.
 */
export function off(
  element: Element | Document | Window,
  event: string,
  handler: EventListener,
  options?: AddEventListenerOptions,
): void {
  element.removeEventListener(event, handler, options);
  const idx = listeners.findIndex(
    (l) => l.element === element && l.event === event && l.handler === handler,
  );
  if (idx >= 0) listeners.splice(idx, 1);
}
