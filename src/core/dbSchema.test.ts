import { describe, expect, it } from "vitest";
import {
  CNY_TO_BYN,
  ITEM_STATUSES,
  PARCEL_STATUSES,
  TABLES,
  UNITS,
  numberArray,
  stringArray,
} from "./dbSchema";

describe("schema descriptor", () => {
  it("owns every storage string used by the console", () => {
    expect(TABLES).toEqual(["customers", "parcels", "parcelItems", "payments"]);
    expect(PARCEL_STATUSES).toContain("received");
    expect(ITEM_STATUSES).toContain("lost");
    expect(UNITS).toEqual(["pcs", "packs", "pairs"]);
    expect(CNY_TO_BYN).toBe(0.13);
  });

  it("round-trips JSON fields through one codec", () => {
    expect(stringArray.decode(stringArray.encode(["a", "b"]))).toEqual(["a", "b"]);
    expect(numberArray.decode(numberArray.encode([100, 200]))).toEqual([100, 200]);
    expect(stringArray.decode(undefined)).toEqual([]);
    expect(numberArray.decode(null)).toEqual([]);
    expect(() => stringArray.decode('{"not":"an array"}')).toThrow(/JSON-массив/);
  });
});
