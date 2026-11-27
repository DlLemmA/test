import { describe, expect, it } from "vitest";
import { ParcelItem } from "../domain";
import { buildItemGroups } from "./ItemGroups";

function item(id: number, trackNumbers: string[], tracksCompletedAt?: string) {
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
    weightsG: JSON.stringify(trackNumbers.map(() => 100)),
    status: "shipped",
    tracksCompletedAt,
    createdAt: "2026-11-23T00:00:00.000Z",
  });
}

describe("buildItemGroups", () => {
  it("filters draft items by the 'Треки заполнены' checkbox, not by track presence", () => {
    const view = buildItemGroups(
      [item(1, []), item(2, ["A"]), item(3, ["B"], "2026-11-23T00:00:00.000Z")],
      [],
      "draft",
      "",
      true,
    );

    const visibleIds = view.groups.flatMap((group) => group.visibleRows.map((row) => row.item.id));
    expect(visibleIds).toEqual([1, 2]);
    expect(view.result).toMatchObject({ visible: 2, total: 3, missingOnly: true });
  });
});
