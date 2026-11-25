import { describe, expect, it } from "vitest";
import { Parcel } from "../domain/Parcel";
import {
  filterParcelRows,
  parcelAttention,
  type ParcelFilter,
  type ParcelListRow,
} from "./parcelListFilter";

const CREATED_AT = "2026-11-23T00:00:00.000Z";

function row(
  id: number,
  status: "draft" | "shipped" | "received" | "done",
  options: Partial<Omit<ParcelListRow, "parcel">> = {},
): ParcelListRow {
  return {
    parcel: Parcel.fromPersistence({ id, status, createdAt: CREATED_AT }),
    tracks: [],
    customerNames: [],
    remaining: 0,
    ...options,
  };
}

const rows: ParcelListRow[] = [
  row(1, "draft", { tracks: ["DRAFT-1"], customerNames: ["Катя"] }),
  row(2, "shipped"),
  row(3, "received", { remaining: 12.5 }),
  row(4, "done", { customerNames: ["Я"] }),
];

function ids(filter: ParcelFilter, query = ""): number[] {
  return filterParcelRows(rows, filter, query).map(({ parcel }) => parcel.id);
}

describe("parcel index filtering", () => {
  it("maps statuses to the ledger chips", () => {
    expect(ids("all")).toEqual([1, 2, 3, 4]);
    expect(ids("draft")).toEqual([1]);
    expect(ids("to-ship")).toEqual([2]);
    expect(ids("received")).toEqual([3, 4]);
    expect(ids("debt")).toEqual([3]);
  });

  it("searches names, numbers, tracks and customers case-insensitively", () => {
    expect(ids("all", "посылка №2")).toEqual([2]);
    expect(ids("all", "draft-1")).toEqual([1]);
    expect(ids("all", "катя")).toEqual([1]);
  });

  it("combines the chip and the query", () => {
    expect(ids("received", "катя")).toEqual([]);
    expect(ids("all", "не найдено")).toEqual([]);
  });

  it("counts what needs attention without treating done parcels as debt", () => {
    expect(parcelAttention(rows)).toEqual({ drafts: 1, awaitingShipment: 1, debt: 1 });
  });
});
