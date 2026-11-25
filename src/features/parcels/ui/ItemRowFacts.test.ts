import { describe, expect, it } from "vitest";
import { itemRowFacts, type ItemFactsInput } from "./ItemRowFacts";

const item = (overrides: Partial<ItemFactsInput> = {}): ItemFactsInput => ({
  status: "received",
  weightsG: [200],
  ...overrides,
});

describe("item row facts", () => {
  it("keeps tracks and payment in a draft, without weight or a badge", () => {
    const facts = itemRowFacts("draft", item({ status: "ordered", weightsG: [] }), false);
    expect(facts.showTracks).toBe(true);
    expect(facts.showTrackWeights).toBe(false);
    expect(facts.compactWeight).toBeNull();
    expect(facts.badge).toBeNull();
    expect(facts.canPay).toBe(true);
  });

  it("keeps tracks while awaiting receipt, without weight or a badge", () => {
    const facts = itemRowFacts("shipped", item({ status: "shipped", weightsG: [] }), false);
    expect(facts.showTracks).toBe(true);
    expect(facts.showTrackWeights).toBe(false);
    expect(facts.compactWeight).toBeNull();
    expect(facts.badge).toBeNull();
  });

  it("shows per-track weight after receiving and no normal-status badge", () => {
    const facts = itemRowFacts("received", item(), false);
    expect(facts.showTracks).toBe(true);
    expect(facts.showTrackWeights).toBe(true);
    expect(facts.compactWeight).toBeNull();
    expect(facts.badge).toBeNull();
  });

  it("collapses tracks into one weight line once done", () => {
    const facts = itemRowFacts("done", item({ weightsG: [120, 80] }), false);
    expect(facts.showTracks).toBe(false);
    expect(facts.showTrackWeights).toBe(false);
    expect(facts.compactWeight).toBe("вес 200 г");
    expect(facts.canPay).toBe(true);
  });

  it("says when the done weight is unknown", () => {
    expect(itemRowFacts("done", item({ weightsG: [] }), false).compactWeight).toBe("вес не задан");
  });

  it("keeps the lost badge and drops weight copy", () => {
    const facts = itemRowFacts("received", item({ status: "lost" }), false);
    expect(facts.badge).toEqual({ label: "Потерян", class: "bad" });
    expect(facts.showTrackWeights).toBe(false);
    expect(itemRowFacts("done", item({ status: "lost" }), false).compactWeight).toBeNull();
  });

  it("keeps self items static but paid", () => {
    expect(itemRowFacts("draft", item(), true).canPay).toBe(false);
  });
});
