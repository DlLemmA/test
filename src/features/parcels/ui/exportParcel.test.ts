import { describe, expect, it } from "vitest";
import { isShareDismissed, parcelExportFileName } from "./exportParcel";

describe("parcel export adapter", () => {
  it("builds a stable .xlsx name from the parcel and export dates", () => {
    const name = parcelExportFileName(
      "2026-01-01T00:00:00.000Z",
      new Date("2026-11-25T12:00:00.000Z"),
    );
    expect(name).toMatch(/^Посылка_\d{2}-\d{2}-\d{4}_2026-11-25\.xlsx$/u);
  });

  it("treats a dismissed share sheet as a non-error", () => {
    expect(isShareDismissed(new DOMException("dismissed", "AbortError"))).toBe(true);
    expect(isShareDismissed(new Error("network"))).toBe(false);
  });
});
