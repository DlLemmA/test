import { describe, expect, it } from "vitest";
import { ParcelItem } from "../domain";
import { buildItemGroups, itemSearchCountText } from "./ItemGroups";

function item(
  id: number,
  overrides: {
    trackNumbers?: string[];
    weightsG?: number[];
    status?: "ordered" | "shipped" | "received" | "lost";
    tracksCompletedAt?: string;
  } = {},
) {
  const trackNumbers = overrides.trackNumbers ?? [];
  return ParcelItem.fromPersistence({
    id,
    parcelId: 1,
    name: `Товар ${id}`,
    priceCNY: 10,
    priceBYN: 1.3,
    quantity: 1,
    unit: "pcs",
    customerId: 1,
    trackNumbers: JSON.stringify(trackNumbers),
    weightsG: JSON.stringify(overrides.weightsG ?? trackNumbers.map(() => 100)),
    status: overrides.status ?? "shipped",
    tracksCompletedAt: overrides.tracksCompletedAt,
    createdAt: "2026-11-23T00:00:00.000Z",
  });
}

function visibleIds(view: ReturnType<typeof buildItemGroups>): number[] {
  return view.groups.flatMap((group) => group.visibleRows.map((row) => row.item.id));
}

describe("buildItemGroups", () => {
  it("filters draft items by the 'Треки заполнены' checkbox, not by track presence", () => {
    const view = buildItemGroups(
      [
        item(1, { trackNumbers: [] }),
        item(2, { trackNumbers: ["A"] }),
        item(3, { trackNumbers: ["B"], tracksCompletedAt: "2026-11-23T00:00:00.000Z" }),
      ],
      [],
      "draft",
      "",
      "tracks",
    );

    expect(visibleIds(view)).toEqual([1, 2]);
    expect(view.result).toMatchObject({ visible: 2, total: 3, filter: "tracks" });
    expect(itemSearchCountText(view.result)).toBe("2 товара без треков из 3");
  });

  it("filters received items by missing weight, ignoring lost and trackless goods", () => {
    const view = buildItemGroups(
      [
        item(1, { trackNumbers: [], weightsG: [] }),
        item(2, { status: "lost", trackNumbers: ["B"], weightsG: [] }),
        item(3, { trackNumbers: ["C"], weightsG: [0] }),
        item(4, { trackNumbers: ["D"], weightsG: [100] }),
      ],
      [],
      "received",
      "",
      "weights",
    );

    expect(visibleIds(view)).toEqual([3]);
    expect(view.result).toMatchObject({ visible: 1, total: 4, filter: "weights" });
    expect(itemSearchCountText(view.result)).toBe("1 товар без веса из 4");
  });
});
