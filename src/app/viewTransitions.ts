import { nextTick } from "vue";
import type { RouteLocationNormalized, Router } from "vue-router";

// Hash router pages share one panel. A selected list row lends its title,
// date, status badge and next-step hint to the detail hero for one navigation,
// so the selection morphs instead of blinking into a different layout.
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

function depthOf(route: RouteLocationNormalized): number {
  return ROUTE_DEPTH[String(route.name)] ?? 0;
}

function hasViewTransitions(): boolean {
  return (
    typeof (document as Document & { startViewTransition?: unknown }).startViewTransition ===
    "function"
  );
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

/** Mark the row whose title, date, badge and hint should morph into the detail hero. */
export function markParcelTransition(id: number): void {
  clearParcelTransition();
  document
    .querySelector(`[data-open="${id}"]`)
    ?.closest(".parcel-entry")
    ?.classList.add("is-vt-source");
}

export function clearParcelTransition(): void {
  document
    .querySelectorAll(".is-vt-source")
    .forEach((element) => element.classList.remove("is-vt-source"));
}

function focusPanel(): void {
  document.getElementById("panel-container")?.focus({ preventScroll: true });
}

export function runViewTransition(
  router: Router,
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
): Promise<boolean> {
  if (
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

  return new Promise<boolean>((resolve) => {
    const transition = startTransition({
      types: [direction],
      update: async () => {
        // Let the guard continue only after the old snapshot is captured.
        resolve(true);
        await new Promise<void>((done) => {
          const stop = router.afterEach(() => {
            stop();
            done();
          });
        });
        await nextTick();
        if (from.name === "parcel" && to.name === "parcels") {
          markParcelTransition(Number(from.params.parcelId));
        }
      },
    });

    void transition.finished.finally(() => {
      clearParcelTransition();
      focusPanel();
    });
  });
}
