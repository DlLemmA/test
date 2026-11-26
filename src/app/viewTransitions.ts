import type { RouteLocationNormalized } from "vue-router";

// Hash router pages share one panel. A selected list row lends its title,
// date and next-step hint to the detail hero, so the selection morphs instead
// of blinking into a different layout. Only the forward list → detail step is
// animated; going back is an ordinary route change.
interface TypedViewTransition {
  finished: Promise<void>;
  ready?: Promise<void>;
  updateCallbackDone?: Promise<void>;
}

type ViewTransitionStarter = (updateCallback: () => Promise<void> | void) => TypedViewTransition;

let activeTransition: Promise<void> | null = null;

function hasViewTransitions(): boolean {
  return (
    typeof (document as Document & { startViewTransition?: unknown }).startViewTransition ===
    "function"
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function startTransition(updateCallback: () => void): TypedViewTransition {
  // Keep the method on `document`; detaching it throws "Illegal invocation".
  return (
    document as Document & { startViewTransition: ViewTransitionStarter }
  ).startViewTransition(updateCallback);
}

function isForwardMorph(from: RouteLocationNormalized, to: RouteLocationNormalized): boolean {
  return (
    (from.name === "parcels" && to.name === "parcel") ||
    (from.name === "people" && to.name === "customer")
  );
}

/** Mark the row whose title, date and hint should morph into the detail hero. */
export function markParcelTransition(id: number): void {
  clearRowTransition();
  document
    .querySelector(`[data-open="${id}"]`)
    ?.closest(".parcel-entry")
    ?.classList.add("is-vt-source");
}

/** Mark the customer row whose name, avatar and facts lend themselves to detail. */
export function markCustomerTransition(id: number): void {
  clearRowTransition();
  document
    .querySelector(`[data-open-customer="${id}"]`)
    ?.closest(".customer-line")
    ?.classList.add("is-vt-source");
}

export function clearRowTransition(): void {
  document
    .querySelectorAll(".is-vt-source")
    .forEach((element) => element.classList.remove("is-vt-source"));
}

function focusPanel(): void {
  // No preventScroll: on a forward navigation the scroller is already at the
  // top, and focusing the panel keeps keyboard users oriented.
  document.getElementById("panel-container")?.focus();
}

/**
 * Called from `router.beforeResolve`, after lazy route components are loaded.
 * Resolving the guard is the documented view-transition update callback: the
 * router confirms navigation and Vue paints the new view before WebKit takes
 * the new snapshot. No route polling is needed.
 */
export function runViewTransition(
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
): Promise<boolean> {
  if (
    !isForwardMorph(from, to) ||
    activeTransition ||
    prefersReducedMotion() ||
    !hasViewTransitions() ||
    !from.name ||
    to.fullPath === from.fullPath ||
    to.name === "sign-in" ||
    from.name === "sign-in"
  ) {
    return Promise.resolve(true);
  }

  if (to.name === "parcel") markParcelTransition(Number(to.params.parcelId));
  if (to.name === "customer") markCustomerTransition(Number(to.params.customerId));

  return new Promise<boolean>((resolveGuard) => {
    let transition: TypedViewTransition;
    try {
      transition = startTransition(() => resolveGuard(true));
    } catch {
      clearRowTransition();
      resolveGuard(true);
      return;
    }

    // A skipped transition rejects `ready`; `finished` still settles, so keep
    // both handled to avoid console noise on rapid back-to-back navigation.
    transition.ready?.catch(() => undefined);
    transition.updateCallbackDone?.catch(() => undefined);
    activeTransition = transition.finished
      .catch(() => undefined)
      .then(() => {
        clearRowTransition();
        focusPanel();
        activeTransition = null;
      });
  });
}
