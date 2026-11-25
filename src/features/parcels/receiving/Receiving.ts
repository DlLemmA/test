// ============================================
// Receiving flow state. One pure reducer owns every transition; the view only
// renders it and runs the writes. No camera, DOM or copy lives here.
// ============================================

import type { Customer } from "@/features/customers/domain";
import { itemWeightState, type Parcel, type ParcelItem } from "../domain";

export type ReceivingMode = "camera" | "manual";
export type ReceivingStep =
  | "start"
  | "scanning"
  | "ticket"
  | "choose"
  | "unknown"
  | "manual"
  | "finish";

export interface ReceivingUnit {
  key: string;
  itemId: number;
  idx: number;
  track: string;
  norm: string;
}

export interface ReceivingState {
  readonly parcel: Parcel;
  readonly items: readonly ParcelItem[];
  readonly customers: readonly Customer[];
  readonly units: readonly ReceivingUnit[];
  readonly byKey: ReadonlyMap<string, ReceivingUnit>;
  readonly byNorm: ReadonlyMap<string, readonly ReceivingUnit[]>;
  readonly weights: ReadonlyMap<string, number>;
  readonly done: ReadonlySet<string>;
  readonly skipped: ReadonlySet<string>;
  readonly lost: ReadonlySet<number>;
  readonly mode: ReceivingMode;
  readonly step: ReceivingStep;
  readonly activeKey: string | null;
  readonly choices: readonly string[];
  readonly code: string;
  readonly pendingItemId: number | null;
  readonly error: string | null;
  readonly saving: boolean;
}

export type ReceivingEvent =
  | { type: "startScanning" }
  | { type: "startManual" }
  | { type: "scan"; code: string }
  | { type: "choose"; key: string }
  | { type: "ticket"; key: string }
  | { type: "nextSibling" }
  | { type: "back" }
  | { type: "weight"; key: string; grams: number }
  | { type: "skip"; key: string }
  | { type: "lost"; itemId: number }
  | { type: "restore"; itemId: number }
  | { type: "manualWeights"; values: readonly { key: string; grams: number }[] }
  | { type: "itemSaved"; item: ParcelItem }
  | { type: "finish" }
  | { type: "commitStart" }
  | { type: "commitDone" }
  | { type: "commitError"; message: string };

export function normalizeTrack(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[\s'"]/g, "");
}

export function unitKey(itemId: number, idx: number): string {
  return `${itemId}:${idx}`;
}

export function initialReceivingState(
  parcel: Parcel,
  items: readonly ParcelItem[],
  customers: readonly Customer[],
): ReceivingState {
  const units: ReceivingUnit[] = [];
  const byKey = new Map<string, ReceivingUnit>();
  const byNorm = new Map<string, ReceivingUnit[]>();

  for (const item of items) {
    item.trackNumbers.forEach((raw, idx) => {
      const track = raw.trim();
      if (!track) return;
      const unit: ReceivingUnit = {
        key: unitKey(item.id, idx),
        itemId: item.id,
        idx,
        track,
        norm: normalizeTrack(track),
      };
      units.push(unit);
      byKey.set(unit.key, unit);
      const matches = byNorm.get(unit.norm) ?? [];
      matches.push(unit);
      byNorm.set(unit.norm, matches);
    });
  }

  const weights = new Map<string, number>();
  const done = new Set<string>();
  for (const unit of units) {
    const weight = items.find((item) => item.id === unit.itemId)?.weightsG[unit.idx] ?? 0;
    if (weight > 0) {
      weights.set(unit.key, weight);
      done.add(unit.key);
    }
  }

  return {
    parcel,
    items,
    customers,
    units,
    byKey,
    byNorm,
    weights,
    done,
    skipped: new Set(),
    lost: new Set(items.filter((item) => item.status === "lost").map((item) => item.id)),
    mode: "camera",
    step: "start",
    activeKey: null,
    choices: [],
    code: "",
    pendingItemId: null,
    error: null,
    saving: false,
  };
}

export function isUnitDone(state: ReceivingState, unit: ReceivingUnit): boolean {
  return state.done.has(unit.key) || state.lost.has(unit.itemId);
}

export function remainingUnits(state: ReceivingState): ReceivingUnit[] {
  return state.units.filter((unit) => !isUnitDone(state, unit));
}

/** Items with the flow's weights applied — the same shape readiness facts expect. */
export function currentItems(state: ReceivingState): ParcelItem[] {
  return state.items.map((item) => {
    if (state.lost.has(item.id)) return item.update({ status: "lost" });
    const weightsG = item.trackNumbers.map(
      (_, idx) => state.weights.get(unitKey(item.id, idx)) ?? 0,
    );
    return item.update({ weightsG });
  });
}

export function itemsToFinish(state: ReceivingState): ParcelItem[] {
  return currentItems(state).filter((item) => {
    if (state.lost.has(item.id)) return false;
    // Empty track placeholders never had a weight in the flow; ignore them the
    // same way the scanner does, then ask ParcelReadiness for the verdict.
    const indexes = item.trackNumbers.flatMap((track, idx) => (track.trim() ? [idx] : []));
    if (indexes.length === 0) return false;
    const tracked = item.update({
      trackNumbers: indexes.map((idx) => item.trackNumbers[idx]!),
      weightsG: indexes.map((idx) => item.weightsG[idx] ?? 0),
    });
    return itemWeightState(tracked).ok;
  });
}

export interface ReceivingFacts {
  units: number;
  weighed: number;
  remaining: number;
  totalWeightG: number;
  isRescan: boolean;
}

/** Counts come from ParcelReadiness, not from a second hand-written definition. */
export function receivingFacts(state: ReceivingState): ReceivingFacts {
  const weighed = currentItems(state).reduce(
    (total, item) => total + itemWeightState(item).filled,
    0,
  );
  return {
    units: state.units.length,
    weighed,
    remaining: remainingUnits(state).length,
    totalWeightG: Array.from(state.weights.values()).reduce((sum, weight) => sum + weight, 0),
    isRescan: state.parcel.status === "received",
  };
}

function openUnit(state: ReceivingState, unit: ReceivingUnit): ReceivingState {
  return { ...state, step: "ticket", activeKey: unit.key, pendingItemId: unit.itemId };
}

function advance(state: ReceivingState): ReceivingState {
  const step: ReceivingStep =
    remainingUnits(state).length === 0 ? "finish" : state.mode === "camera" ? "scanning" : "manual";
  return { ...state, step, activeKey: null, choices: [], code: "", error: null };
}

function scan(state: ReceivingState, rawCode: string): ReceivingState {
  const code = rawCode.trim();
  if (!code) return state;
  const matches = state.byNorm.get(normalizeTrack(code)) ?? [];
  if (matches.length === 0) {
    return { ...state, step: "unknown", code, activeKey: null, choices: [] };
  }
  const preferred =
    state.pendingItemId === null
      ? undefined
      : matches.find((unit) => unit.itemId === state.pendingItemId);
  if (preferred) return openUnit(state, preferred);
  if (matches.length === 1) return openUnit(state, matches[0]!);
  return {
    ...state,
    step: "choose",
    code,
    choices: matches.map((unit) => unit.key),
    activeKey: null,
  };
}

function applyWeights(
  state: ReceivingState,
  values: readonly { key: string; grams: number }[],
): ReceivingState {
  const weights = new Map(state.weights);
  const done = new Set(state.done);
  const skipped = new Set(state.skipped);
  for (const { key, grams } of values) {
    if (!state.byKey.has(key) || !Number.isFinite(grams) || grams < 0) continue;
    weights.set(key, grams);
    done.add(key);
    skipped.delete(key);
  }
  return { ...state, weights, done, skipped };
}

/** Weights for one item in track order, ready for the write port. */
export function weightsForItem(state: ReceivingState, itemId: number): number[] {
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) return [];
  return item.trackNumbers.map((_, idx) => state.weights.get(unitKey(itemId, idx)) ?? 0);
}

export function receivingReducer(state: ReceivingState, event: ReceivingEvent): ReceivingState {
  switch (event.type) {
    case "startScanning":
      return { ...state, mode: "camera", step: "scanning", error: null };
    case "startManual":
      return { ...state, mode: "manual", step: "manual", activeKey: null, error: null };
    case "scan":
      return scan(state, event.code);
    case "choose": {
      const unit = state.byKey.get(event.key);
      return unit ? openUnit(state, unit) : state;
    }
    case "ticket": {
      const unit = state.byKey.get(event.key);
      return unit ? openUnit(state, unit) : state;
    }
    case "nextSibling": {
      const active = state.activeKey ? state.byKey.get(state.activeKey) : undefined;
      if (!active) return state;
      const next = state.units.find(
        (unit) => unit.itemId === active.itemId && !isUnitDone(state, unit),
      );
      return next ? openUnit(state, next) : advance(state);
    }
    case "back":
      return {
        ...state,
        step: state.mode === "camera" ? "scanning" : "manual",
        activeKey: null,
        choices: [],
        code: "",
        error: null,
      };
    case "weight": {
      const unit = state.byKey.get(event.key);
      if (!unit || !Number.isFinite(event.grams) || event.grams < 0) return state;
      const updated = applyWeights(state, [{ key: event.key, grams: event.grams }]);
      const next = updated.units.find(
        (candidate) => candidate.itemId === unit.itemId && !isUnitDone(updated, candidate),
      );
      return next && updated.mode === "camera" ? openUnit(updated, next) : advance(updated);
    }
    case "skip": {
      if (!state.byKey.has(event.key)) return state;
      const done = new Set(state.done);
      const skipped = new Set(state.skipped);
      done.add(event.key);
      skipped.add(event.key);
      return advance({ ...state, done, skipped });
    }
    case "lost": {
      const lost = new Set(state.lost);
      const done = new Set(state.done);
      lost.add(event.itemId);
      for (const unit of state.units) {
        if (unit.itemId === event.itemId) done.add(unit.key);
      }
      return advance({ ...state, lost, done });
    }
    case "restore": {
      const lost = new Set(state.lost);
      const done = new Set(state.done);
      lost.delete(event.itemId);
      for (const unit of state.units) {
        if (unit.itemId === event.itemId && !(state.weights.get(unit.key)! > 0)) {
          done.delete(unit.key);
        }
      }
      return advance({ ...state, lost, done });
    }
    case "manualWeights":
      return advance(applyWeights(state, event.values));
    case "itemSaved": {
      const items = state.items.map((item) => (item.id === event.item.id ? event.item : item));
      return { ...state, items };
    }
    case "finish":
      return { ...state, step: "finish", activeKey: null, error: null };
    case "commitStart":
      return { ...state, saving: true, error: null };
    case "commitDone":
      return { ...state, saving: false, error: null };
    case "commitError":
      return { ...state, saving: false, error: event.message };
  }
}
