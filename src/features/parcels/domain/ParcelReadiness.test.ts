import { describe, expect, it } from "vitest";
import type { ParcelStatus } from "@/core/database";
import { Parcel } from "./Parcel";
import { ParcelItem } from "./ParcelItem";
import {
  itemTrackState,
  itemWeightState,
  itemsWithoutTracks,
  parcelReadiness,
} from "./ParcelReadiness";

function parcel(status: ParcelStatus = "draft") {
  return Parcel.fromPersistence({
    id: 1,
    status,
    createdAt: "2026-11-23T00:00:00.000Z",
  });
}

function item(
  id: number,
  overrides: {
    quantity?: number;
    status?: "ordered" | "shipped" | "received" | "lost";
    trackNumbers?: string[];
    weightsG?: number[];
    tracksCompletedAt?: string;
  } = {},
) {
  return ParcelItem.fromPersistence({
    id,
    parcelId: 1,
    name: `Товар ${id}`,
    priceCNY: 10,
    priceBYN: 1.3,
    quantity: overrides.quantity ?? 1,
    unit: "pcs",
    customerId: 1,
    trackNumbers: JSON.stringify(overrides.trackNumbers ?? ["TRACK-1"]),
    weightsG: JSON.stringify(overrides.weightsG ?? [100]),
    status: overrides.status ?? "shipped",
    tracksCompletedAt: overrides.tracksCompletedAt,
    createdAt: "2026-11-23T00:00:00.000Z",
  });
}

const confirmed = () => item(1, { tracksCompletedAt: "2026-11-23" });

describe("parcelReadiness", () => {
  it("blocks shipping an empty parcel and reports the reason", () => {
    const { ship } = parcelReadiness(parcel("draft"), []);
    expect(ship.ok).toBe(false);
    expect(ship.issues).toEqual([{ reason: "parcelEmpty", itemIds: [] }]);
  });

  it("requires every item to have confirmed tracks, including lost items", () => {
    const unconfirmed = item(2, { status: "lost", tracksCompletedAt: undefined });
    const { ship, completeTracks } = parcelReadiness(parcel("draft"), [confirmed(), unconfirmed]);

    expect(ship.issues).toEqual([{ reason: "tracksNotConfirmed", itemIds: [2] }]);
    expect(completeTracks.issues).toEqual([{ reason: "tracksNotConfirmed", itemIds: [2] }]);
    expect(parcelReadiness(parcel("draft"), [confirmed()]).ship.ok).toBe(true);
  });

  it("keeps the existing empty-parcel behaviour for the manual tracks flag", () => {
    const { completeTracks } = parcelReadiness(parcel("draft"), []);
    expect(completeTracks.ok).toBe(true);
  });

  it("reports a wrong status for each transition", () => {
    const ready = confirmed();
    expect(parcelReadiness(parcel("shipped"), [ready]).ship.issues[0]?.reason).toBe("wrongStatus");
    expect(parcelReadiness(parcel("done"), [ready]).completeTracks.issues[0]?.reason).toBe(
      "wrongStatus",
    );
    expect(parcelReadiness(parcel("shipped"), [ready]).finish.issues[0]?.reason).toBe(
      "wrongStatus",
    );
  });

  it("exempts lost and trackless items from weighing, but not unweighed ones", () => {
    const { finish } = parcelReadiness(parcel("received"), [
      item(1, { trackNumbers: [], weightsG: [] }),
      item(2, { status: "lost", weightsG: [] }),
      item(3, { trackNumbers: ["TRACK-3"], weightsG: [0] }),
    ]);

    expect(finish.ok).toBe(false);
    expect(finish.issues).toEqual([{ reason: "weightsMissing", itemIds: [3] }]);
  });

  it("allows finishing once every tracked item is weighed", () => {
    const { finish } = parcelReadiness(parcel("received"), [
      item(1, { trackNumbers: ["A", "B"], weightsG: [100, 200] }),
    ]);
    expect(finish.ok).toBe(true);
  });
});

describe("item readiness facts", () => {
  it("distinguishes no, partial, ready and confirmed tracks", () => {
    expect(itemTrackState(item(1, { trackNumbers: [] })).state).toBe("none");
    expect(itemTrackState(item(2, { trackNumbers: ["A", ""], quantity: 2 })).state).toBe("partial");
    expect(itemTrackState(item(3, { trackNumbers: ["A", "B"], quantity: 1 })).state).toBe("ready");
    expect(itemTrackState(item(4, { tracksCompletedAt: "2026-11-23" })).state).toBe("confirmed");
  });

  it("counts only filled tracks for the zero-track filter", () => {
    expect(
      itemsWithoutTracks([item(1, { trackNumbers: [] }), item(2, { trackNumbers: ["A", ""] })]),
    ).toBe(1);
  });

  it("requires a positive weight for every track position", () => {
    expect(itemWeightState(item(1, { trackNumbers: ["A", "B"], weightsG: [100, 0] })).ok).toBe(
      false,
    );
    expect(itemWeightState(item(2, { trackNumbers: ["A", "B"], weightsG: [100, 200] })).ok).toBe(
      true,
    );
  });
});
