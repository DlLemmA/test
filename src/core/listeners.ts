// ============================================
// Event Listener Management.
// `on` is a thin adapter over addEventListener; a caller that owns a lifetime
// creates a scope and all its listeners die with that scope.
// ============================================

export interface ListenerScope {
  readonly signal: AbortSignal;
  on<K extends keyof HTMLElementEventMap>(
    element: Element | Document | Window | null,
    event: K,
    handler: (this: Element, ev: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): boolean;
  on(
    element: Element | Document | Window | null,
    event: string,
    handler: EventListener,
    options?: AddEventListenerOptions,
  ): boolean;
  dispose(): void;
}

/** Add one listener. Returns false for a missing element so callers can skip binds. */
function on<K extends keyof HTMLElementEventMap>(
  element: Element | Document | Window | null,
  event: K,
  handler: (this: Element, ev: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): boolean;
function on(
  element: Element | Document | Window | null,
  event: string,
  handler: EventListener,
  options?: AddEventListenerOptions,
): boolean;
function on(
  element: Element | Document | Window | null,
  event: string,
  handler: EventListener,
  options?: AddEventListenerOptions,
): boolean {
  if (!element) return false;
  element.addEventListener(event, handler, options);
  return true;
}

class Scope implements ListenerScope {
  readonly signal: AbortSignal;
  private readonly controller = new AbortController();

  constructor() {
    this.signal = this.controller.signal;
  }

  on<K extends keyof HTMLElementEventMap>(
    element: Element | Document | Window | null,
    event: K,
    handler: (this: Element, ev: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): boolean;
  on(
    element: Element | Document | Window | null,
    event: string,
    handler: EventListener,
    options?: AddEventListenerOptions,
  ): boolean;
  on(
    element: Element | Document | Window | null,
    event: string,
    handler: EventListener,
    options?: AddEventListenerOptions,
  ): boolean {
    return on(element, event, handler, { ...options, signal: this.signal });
  }

  dispose(): void {
    this.controller.abort();
  }
}

/** One scope per mounted owner. Disposing it releases every listener it added. */
export function createListenerScope(): ListenerScope {
  return new Scope();
}
