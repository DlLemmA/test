// ============================================
// Parcel readiness — the single in-process home for "can we advance?" rules.
// It returns facts and reason codes; ui/ is responsible for turning them into copy.
// ============================================

import type { Parcel } from "./Parcel";
import type { ParcelItem } from "./ParcelItem";

export type ReadinessReason =
  | "wrongStatus"
  | "parcelEmpty"
  | "tracksNotConfirmed"
  | "weightsMissing";

export type ReadinessIssue = {
  reason: ReadinessReason;
  /** Items responsible for the issue; empty when the parcel itself is the subject. */
  itemIds: number[];
};

export type Readiness = {
  ok: boolean;
  issues: ReadinessIssue[];
};

export type ParcelReadiness = {
  ship: Readiness;
  completeTracks: Readiness;
  finish: Readiness;
};

export type TrackState = "none" | "partial" | "ready" | "confirmed";
export type ItemTrackState = { filled: number; needed: number; state: TrackState };
export type ItemWeightState = { filled: number; needed: number; ok: boolean };

/** Track counts come from the data; the manual confirmation flag is authoritative for transitions. */
export function itemTrackState(item: ParcelItem): ItemTrackState {
  const filled = item.trackNumbers.filter((track) => track.trim() !== "").length;
  const needed = Math.max(item.quantity, item.trackNumbers.length);
  const state: TrackState =
    filled === 0
      ? "none"
      : item.tracksCompleted
        ? "confirmed"
        : filled >= needed
          ? "ready"
          : "partial";
  return { filled, needed, state };
}

/** Items still waiting for the manual "Треки заполнены" confirmation. */
export function itemsWithUnconfirmedTracks(items: ParcelItem[]): ParcelItem[] {
  return items.filter((item) => !item.tracksCompleted);
}

export function itemWeightState(item: ParcelItem): ItemWeightState {
  const needed = item.trackNumbers.length;
  const filled = item.weightsG.filter((weight) => weight > 0).length;
  return {
    filled,
    needed,
    ok: item.weightsG.length >= needed && item.weightsG.every((weight) => weight > 0),
  };
}

function issue(reason: ReadinessReason, itemIds: number[] = []): ReadinessIssue {
  return { reason, itemIds };
}

function result(issues: ReadinessIssue[]): Readiness {
  return { ok: issues.length === 0, issues };
}

export function parcelReadiness(parcel: Parcel, items: ParcelItem[]): ParcelReadiness {
  const unconfirmed = itemsWithUnconfirmedTracks(items).map((item) => item.id);
  const unweighed = items
    .filter(
      (item) => item.status !== "lost" && item.trackNumbers.length > 0 && !itemWeightState(item).ok,
    )
    .map((item) => item.id);

  const ship: ReadinessIssue[] = [];
  if (parcel.status !== "draft") ship.push(issue("wrongStatus"));
  if (items.length === 0) ship.push(issue("parcelEmpty"));
  if (unconfirmed.length > 0) ship.push(issue("tracksNotConfirmed", unconfirmed));

  const completeTracks: ReadinessIssue[] = [];
  if (parcel.status !== "draft" && parcel.status !== "shipped") {
    completeTracks.push(issue("wrongStatus"));
  }
  if (unconfirmed.length > 0) completeTracks.push(issue("tracksNotConfirmed", unconfirmed));

  const finish: ReadinessIssue[] = [];
  if (parcel.status !== "received") finish.push(issue("wrongStatus"));
  if (unweighed.length > 0) finish.push(issue("weightsMissing", unweighed));

  return {
    ship: result(ship),
    completeTracks: result(completeTracks),
    finish: result(finish),
  };
}
