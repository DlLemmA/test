import { describe, expect, it } from "vitest";
import { Parcel } from "../domain/Parcel";
import { parcelTimeline } from "./parcelTimeline";

const CREATED_AT = "2026-01-02T00:00:00.000Z";

function parcel(status: "draft" | "shipped" | "received" | "done"): Parcel {
  return Parcel.fromPersistence({
    id: 1,
    status,
    createdAt: CREATED_AT,
    shippedAt: "2026-01-03T00:00:00.000Z",
    receivedAt: "2026-01-04T00:00:00.000Z",
    completedAt: "2026-01-05T00:00:00.000Z",
  });
}

describe("parcel status rail", () => {
  it("uses the same four steps for every status", () => {
    expect(parcelTimeline(parcel("draft")).map((step) => step.label)).toEqual([
      "Черновик",
      "Отправлена",
      "Получена",
      "Готова",
    ]);
  });

  it("marks the current step and leaves later steps pending", () => {
    expect(parcelTimeline(parcel("shipped")).map((step) => step.state)).toEqual([
      "done",
      "current",
      "future",
      "future",
    ]);
    expect(parcelTimeline(parcel("done")).every((step) => step.state !== "future")).toBe(true);
  });

  it("shows the matching date in mono-friendly numeric form", () => {
    expect(parcelTimeline(parcel("received"))[2]?.date).toBe(
      new Date("2026-01-04T00:00:00.000Z").toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    );
  });
});
