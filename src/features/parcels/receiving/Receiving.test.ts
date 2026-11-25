import { describe, expect, it } from "vitest";
import { Customer } from "@/features/customers/domain";
import type { ParcelItemStatus } from "@/core/dbSchema";
import { Parcel, ParcelItem } from "../domain";
import {
  currentItems,
  initialReceivingState,
  itemsToFinish,
  normalizeTrack,
  receivingFacts,
  receivingReducer,
  weightsForItem,
  type ReceivingEvent,
  type ReceivingState,
} from "./Receiving";

const CREATED_AT = "2026-01-01T00:00:00.000Z";
const customers = [Customer.fromPersistence({ id: 2, name: "Катя", isSelf: false })];

function parcel(): Parcel {
  return Parcel.create().ship().receive(600, 12);
}

function item(
  id: number,
  trackNumbers: string[],
  weightsG: number[] = [],
  status: ParcelItemStatus = "ordered",
): ParcelItem {
  return ParcelItem.fromPersistence({
    id,
    parcelId: 1,
    name: `Товар ${id}`,
    priceCNY: 10,
    priceBYN: 1.3,
    quantity: 1,
    unit: "pcs",
    customerId: 2,
    trackNumbers: JSON.stringify(trackNumbers),
    weightsG: JSON.stringify(weightsG),
    status,
    createdAt: CREATED_AT,
  });
}

function flow(items: ParcelItem[], current = parcel()): ReceivingState {
  return initialReceivingState(current, items, customers);
}

function apply(state: ReceivingState, ...events: ReceivingEvent[]): ReceivingState {
  return events.reduce(receivingReducer, state);
}

describe("receiving reducer", () => {
  it("derives units, normalized codes and already weighed/lost facts", () => {
    const state = flow([
      item(10, [" TRACK-1 "], [120]),
      item(11, ["", "TRACK-2"]),
      item(12, ["LOST-1"], [], "lost"),
    ]);

    expect(state.units.map((unit) => unit.key)).toEqual(["10:0", "11:1", "12:0"]);
    expect(state.units.map((unit) => unit.norm)).toEqual(["TRACK-1", "TRACK-2", "LOST-1"]);
    expect([...state.done]).toEqual(["10:0"]);
    expect([...state.lost]).toEqual([12]);
    expect(receivingFacts(state)).toMatchObject({
      units: 3,
      weighed: 1,
      remaining: 1,
      totalWeightG: 120,
      isRescan: true,
    });
  });

  it("treats quotes and spaces in scanned codes as the same track", () => {
    expect(normalizeTrack(`  track '1`)).toBe("TRACK1");
    const state = flow([item(10, ["TRACK 1"])]);
    expect(apply(state, { type: "scan", code: `"track1"` }).step).toBe("ticket");
  });

  it("routes unknown, unique and duplicate scans without writing", () => {
    const state = flow([item(10, ["A-1"]), item(11, ["A-1"])]);

    expect(apply(state, { type: "scan", code: "NOPE" })).toMatchObject({
      step: "unknown",
      code: "NOPE",
    });
    const unique = flow([item(10, ["A-1"])]);
    expect(apply(unique, { type: "scan", code: "a-1" })).toMatchObject({
      step: "ticket",
      activeKey: "10:0",
      pendingItemId: 10,
    });
    expect(apply(state, { type: "scan", code: "A-1" })).toMatchObject({
      step: "choose",
      choices: ["10:0", "11:0"],
    });
    expect(state.step).toBe("start");
    expect(state.parcel.status).toBe("received");
  });

  it("prefers the last scanned item when a code is shared", () => {
    const state = flow([item(10, ["A-1"]), item(11, ["A-1"])]);
    const chosen = apply(state, { type: "scan", code: "A-1" }, { type: "choose", key: "11:0" });
    expect(apply(chosen, { type: "scan", code: "A-1" }).activeKey).toBe("11:0");
  });

  it("walks sibling tracks in camera mode and finishes when the last one is weighed", () => {
    const state = apply(flow([item(10, ["A-1", "A-2"])]), { type: "scan", code: "A-1" });
    const first = apply(state, { type: "weight", key: "10:0", grams: 100 });

    expect(first.activeKey).toBe("10:1");
    expect(weightsForItem(first, 10)).toEqual([100, 0]);

    const done = apply(first, { type: "weight", key: "10:1", grams: 200 });
    expect(done.step).toBe("finish");
    expect(weightsForItem(done, 10)).toEqual([100, 200]);
    expect(itemsToFinish(done).map((entry) => entry.id)).toEqual([10]);
  });

  it("counts skipped and lost units as processed but not weighed", () => {
    const state = flow([item(10, ["A-1"]), item(11, ["B-1"])]);

    const skipped = apply(state, { type: "startScanning" }, { type: "skip", key: "10:0" });
    expect([...skipped.skipped]).toEqual(["10:0"]);
    expect(receivingFacts(skipped).remaining).toBe(1);

    const lost = apply(skipped, { type: "lost", itemId: 11 });
    expect(receivingFacts(lost).remaining).toBe(0);
    expect(receivingFacts(lost).weighed).toBe(0);
    expect(itemsToFinish(lost)).toEqual([]);
    expect(lost.step).toBe("finish");

    const restored = apply(lost, { type: "restore", itemId: 11 });
    expect([...restored.lost]).toEqual([]);
    expect(receivingFacts(restored).remaining).toBe(1);
    expect(restored.step).toBe("scanning");
  });

  it("keeps the manual list until everything is processed", () => {
    const state = apply(flow([item(10, ["A-1"]), item(11, ["B-1"])]), { type: "startManual" });

    expect(apply(state, { type: "weight", key: "10:0", grams: 50 }).step).toBe("manual");
    const done = apply(state, {
      type: "manualWeights",
      values: [
        { key: "10:0", grams: 50 },
        { key: "11:0", grams: 70 },
      ],
    });
    expect(done.step).toBe("finish");
    expect(receivingFacts(done).totalWeightG).toBe(120);
  });

  it("ignores empty track placeholders when deciding which items to finish", () => {
    const state = flow([item(10, ["", "A-2"])]);
    const next = apply(state, { type: "weight", key: "10:1", grams: 90 });

    expect(itemsToFinish(next).map((entry) => entry.id)).toEqual([10]);
    expect(receivingFacts(next)).toMatchObject({ weighed: 1, remaining: 0 });
  });

  it("uses ParcelReadiness weight facts instead of a second definition", () => {
    const state = apply(flow([item(10, ["A-1", "A-2"])]), {
      type: "weight",
      key: "10:0",
      grams: 100,
    });

    expect(receivingFacts(state).weighed).toBe(1);
    expect(itemsToFinish(state)).toEqual([]);
    const current = currentItems(state)[0];
    expect(current?.weightsG).toEqual([100, 0]);
  });

  it("never changes the parcel status and never mutates the previous state", () => {
    const state = flow([item(10, ["A-1"])]);
    const next = apply(
      state,
      { type: "startScanning" },
      { type: "scan", code: "A-1" },
      { type: "weight", key: "10:0", grams: 100 },
      { type: "finish" },
      { type: "commitStart" },
      { type: "commitDone" },
    );

    expect(next.parcel.status).toBe("received");
    expect(state.step).toBe("start");
    expect(state.weights.size).toBe(0);
    expect([...state.done]).toEqual([]);
  });

  it("records saved writes and commit feedback in state", () => {
    const saved = item(10, ["A-1"], [100]);
    const state = apply(flow([item(10, ["A-1"])]), { type: "itemSaved", item: saved });

    expect(state.items[0]?.weightsG).toEqual([100]);
    expect(apply(state, { type: "commitStart" }).saving).toBe(true);
    expect(apply(state, { type: "commitError", message: "ошибка" })).toMatchObject({
      saving: false,
      error: "ошибка",
    });
  });

  it("goes back to the current mode and to the next unprocessed sibling", () => {
    const state = apply(flow([item(10, ["A-1", "A-2"])]), { type: "scan", code: "A-1" });
    expect(apply(state, { type: "back" })).toMatchObject({ step: "scanning", activeKey: null });

    const manual = apply(state, { type: "startManual" });
    expect(apply(manual, { type: "back" }).step).toBe("manual");

    const weighed = apply(state, { type: "weight", key: "10:0", grams: 10 });
    expect(apply(weighed, { type: "nextSibling" }).activeKey).toBe("10:1");
    const last = apply(weighed, { type: "weight", key: "10:1", grams: 20 });
    expect(apply(last, { type: "nextSibling" }).step).toBe("finish");
  });
});
