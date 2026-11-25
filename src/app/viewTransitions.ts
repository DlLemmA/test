import { nextTick } from "vue";
import type { RouteLocationNormalized, Router } from "vue-router";

// Hash router pages share one panel. A selected list row lends its title,
// date and next-step hint to the detail hero for one navigation, so the
// selection morphs instead of blinking into a different layout.
type Direction = "forward" | "backward";

interface TypedViewTransition {
  finished: Promise<void>;
}

type ViewTransitionStarter = (options: {
  update: () => Promise<void> | void;
  types?: string[];
}) => TypedViewTransition;

const ROUTE_DEPTH: Record<string, number> = {
  "sign-in": 0,
  parcels: 0,
  people: 0,
  add: 1,
  parcel: 1,
  customer: 1,
};

let activeTransition: Promise<void> | null = null;

function depthOf(route: RouteLocationNormalized): number {
  return ROUTE_DEPTH[String(route.name)] ?? 0;
}

function hasViewTransitions(): boolean {
  return (
    typeof (document as Document & { startViewTransition?: unknown }).startViewTransition ===
    "function"
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function startTransition(options: {
  update: () => Promise<void> | void;
  types?: string[];
}): TypedViewTransition {
  // Keep the method on `document`; detaching it throws "Illegal invocation".
  return (
    document as Document & { startViewTransition: ViewTransitionStarter }
  ).startViewTransition(options);
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
  // top, and focusing the panel keeps keyboard users oriented. Back skips
  // this so the restored list offset survives.
  document.getElementById("panel-container")?.focus();
}

/**
 * Wait for the router to commit the new route without an `afterEach` listener.
 * A cancelled navigation simply falls through after a bounded number of paints,
 * so a rapid second tap can never leave the guard pending.
 */
async function waitForNewRoute(router: Router, to: RouteLocationNormalized): Promise<boolean> {
  const committed = () => router.currentRoute.value.fullPath === to.fullPath;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop
    await nextTick();
    if (committed()) return true;
  }
  for (let frame = 0; frame < 6; frame += 1) {
    // A cancelled or hidden-page navigation may never paint; the timer keeps
    // the View Transition update callback from timing out at the browser level.
    // oxlint-disable-next-line no-await-in-loop
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 50);
      requestAnimationFrame(() => {
        window.clearTimeout(timer);
        resolve();
      });
    });
    if (committed()) return true;
  }
  return false;
}

export function runViewTransition(
  router: Router,
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
): Promise<boolean> {
  if (
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

  const direction: Direction = depthOf(to) < depthOf(from) ? "backward" : "forward";
  if (from.name === "parcels" && to.name === "parcel") {
    markParcelTransition(Number(to.params.parcelId));
  }
  if (from.name === "people" && to.name === "customer") {
    markCustomerTransition(Number(to.params.customerId));
  }

  return new Promise<boolean>((resolve) => {
    let transition: TypedViewTransition;
    try {
      transition = startTransition({
        types: [direction],
        update: async () => {
          // Let the guard continue only after the old snapshot is captured.
          resolve(true);
          if (!(await waitForNewRoute(router, to))) return;
          if (from.name === "parcel" && to.name === "parcels") {
            markParcelTransition(Number(from.params.parcelId));
          }
          if (from.name === "customer" && to.name === "people") {
            markCustomerTransition(Number(from.params.customerId));
          }
        },
      });
    } catch {
      clearRowTransition();
      resolve(true);
      return;
    }

    activeTransition = transition.finished
      .catch(() => undefined)
      .then(() => {
        clearRowTransition();
        if (direction === "forward") focusPanel();
        activeTransition = null;
      });
  });
}
