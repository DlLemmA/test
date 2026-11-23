// ============================================
// Hash history for vue-router that keeps the app's existing URL grammar:
// #parcels, #parcel/2, #add, #customer/2 — no leading slash after '#'.
// vue-router still owns matching and navigation; this adapter only maps
// its internal '/parcel/2' locations to the browser hash and back.
// ============================================

import type { HistoryState, RouterHistory } from "vue-router";

type NavigationCallback = Parameters<RouterHistory["listen"]>[0];
type NavigationInformation = Parameters<NavigationCallback>[2];

const DEFAULT_ROUTE = "/parcels";

function readLocation(): string {
  const value = window.location.hash.replace(/^#/, "").replace(/^\//, "");
  return value ? `/${value}` : DEFAULT_ROUTE;
}

function toHash(path: string): string {
  return `#${path.replace(/^\//, "")}`;
}

function buildState(current: string): HistoryState {
  return {
    back: null,
    current,
    forward: null,
    replaced: true,
    position: window.history.length,
    scroll: null,
  };
}

export function createLegacyHashHistory(): RouterHistory {
  let location = readLocation();
  let state: HistoryState = (window.history.state as HistoryState | null) ?? buildState(location);
  const listeners = new Set<NavigationCallback>();
  let pauseState: string | null = null;

  function changeLocation(to: string, nextState: HistoryState, replace: boolean): void {
    window.history[replace ? "replaceState" : "pushState"](nextState, "", toHash(to));
    location = to;
    state = nextState;
  }

  function onLocationChange(eventState?: HistoryState | null): void {
    const to = readLocation();
    const from = location;
    const fromState = state;
    const nextState = eventState ?? (window.history.state as HistoryState | null) ?? buildState(to);
    location = to;
    state = nextState;
    if (pauseState && pauseState === from) {
      pauseState = null;
      return;
    }

    // Browser back/forward through a hash fires both popstate and hashchange.
    // Staying on the same hash is not a route change; ignoring the second event
    // keeps each navigation observable exactly once.
    if (to === from) return;

    const delta = Number(nextState.position ?? 0) - Number(fromState.position ?? 0);
    const info = {
      type: "pop",
      direction: delta > 0 ? "forward" : delta < 0 ? "back" : "",
      delta,
    } as NavigationInformation;
    listeners.forEach((listener) => listener(to, from, info));
  }

  const onPopState = (event: PopStateEvent): void =>
    onLocationChange(event.state as HistoryState | null);
  const onHashChange = (): void => onLocationChange();
  window.addEventListener("popstate", onPopState);
  window.addEventListener("hashchange", onHashChange);

  return {
    base: "",
    get location() {
      return location;
    },
    get state() {
      return state;
    },
    push(to, data) {
      const currentState: HistoryState = {
        ...state,
        ...(window.history.state as HistoryState | null),
        forward: to,
        scroll: null,
      };
      changeLocation(location, currentState, true);
      changeLocation(
        to,
        { ...buildState(to), position: Number(currentState.position ?? 0) + 1, ...data },
        false,
      );
    },
    replace(to, data) {
      changeLocation(to, { ...state, ...buildState(to), ...data, position: state.position }, true);
    },
    go(delta, triggerListeners = true) {
      if (!triggerListeners) pauseState = location;
      window.history.go(delta);
    },
    listen(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    createHref(to) {
      return toHash(to);
    },
    destroy() {
      listeners.clear();
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("hashchange", onHashChange);
    },
  };
}
