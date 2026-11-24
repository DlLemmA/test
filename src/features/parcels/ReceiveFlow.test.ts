// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Customer } from "@/features/customers/domain";
import { Parcel, ParcelItem } from "./domain";
import { mountReceiveFlow, type ReceiveFlowStore } from "./ReceiveFlow";
import { ScriptedScanner } from "./receiving/scanner";

const CREATED_AT = "2026-01-01T00:00:00.000Z";
const customers = [Customer.fromPersistence({ id: 2, name: "Катя", isSelf: false })];
const parcel = Parcel.fromPersistence({
  id: 1,
  status: "received",
  createdAt: CREATED_AT,
  shippedAt: CREATED_AT,
  receivedAt: CREATED_AT,
  boxWeightG: 600,
  shippingCostBYN: 12,
});

function item(id: number, tracks: string[]): ParcelItem {
  return ParcelItem.fromPersistence({
    id,
    parcelId: 1,
    name: `Товар ${id}`,
    priceCNY: 10,
    priceBYN: 1.3,
    quantity: 1,
    unit: "pcs",
    customerId: 2,
    trackNumbers: JSON.stringify(tracks),
    weightsG: "[]",
    status: "ordered",
    createdAt: CREATED_AT,
  });
}

function fixture(items: ParcelItem[]) {
  let current = items;
  const saveWeights = vi.fn<(itemId: number, weightsG: number[]) => Promise<ParcelItem>>(
    async (itemId, weightsG) => {
      current = current.map((entry) => (entry.id === itemId ? entry.update({ weightsG }) : entry));
      return current.find((entry) => entry.id === itemId)!;
    },
  );
  const finishItem = vi.fn<(itemId: number) => Promise<ParcelItem>>(async (itemId) => {
    current = current.map((entry) =>
      entry.id === itemId ? entry.update({ status: "received" }) : entry,
    );
    return current.find((entry) => entry.id === itemId)!;
  });
  return {
    store: {
      async load() {
        return { parcel, items: current, customers };
      },
      saveWeights,
      async markLost(itemId) {
        current = current.map((entry) =>
          entry.id === itemId ? entry.update({ status: "lost" }) : entry,
        );
        return current.find((entry) => entry.id === itemId)!;
      },
      finishItem,
    } satisfies ReceiveFlowStore,
    saveWeights,
    finishItem,
    onComplete: vi.fn<() => void>(() => {}),
  };
}

function click(id: string): void {
  document.querySelector<HTMLButtonElement>(`#${id}`)!.click();
}

function submit(id: string): void {
  document
    .querySelector<HTMLFormElement>(`#${id}`)!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function showModal(this: HTMLDialogElement): void {
  this.open = true;
}

function close(this: HTMLDialogElement): void {
  this.open = false;
  this.dispatchEvent(new Event("close"));
}

beforeEach(() => {
  document.body.innerHTML = "";
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
});

describe("receiving flow without a camera", () => {
  it("runs the manual list from weight entry to item commit", async () => {
    const f = fixture([item(20, ["TRACK-1"])]);
    await mountReceiveFlow(1, { ...f, scanner: new ScriptedScanner() });

    expect(document.querySelector("#rfStart")).not.toBeNull();
    click("rfManualStart");
    document.querySelector<HTMLInputElement>('[data-weight-key="20:0"]')!.value = "150";
    submit("rfManualForm");

    expect(document.querySelector("#rfConfirm")).not.toBeNull();
    expect(f.saveWeights).toHaveBeenCalledWith(20, [150]);
    click("rfConfirm");

    await vi.waitFor(() => expect(f.finishItem).toHaveBeenCalledWith(20));
    expect(f.onComplete).toHaveBeenCalledOnce();
    expect(document.querySelector("#receiveFlow")).toBeNull();
  });

  it("drives scanning through the scanner seam and saves a decode immediately", async () => {
    const f = fixture([item(20, ["TRACK-1"])]);
    const scanner = new ScriptedScanner();
    await mountReceiveFlow(1, { ...f, scanner });

    click("rfStart");
    expect(scanner.starts).toBe(1);
    scanner.emit("track-1");

    expect(document.querySelector("#rfWeight")).not.toBeNull();
    document.querySelector<HTMLInputElement>("#rfWeight")!.value = "120";
    submit("rfWeightForm");

    await vi.waitFor(() => expect(f.saveWeights).toHaveBeenCalledWith(20, [120]));
    expect(scanner.stops).toBeGreaterThan(0);
    expect(document.querySelector("#rfConfirm")).not.toBeNull();
  });

  it("shows unknown and duplicate codes without touching any item", async () => {
    const f = fixture([item(20, ["SAME"]), item(21, ["SAME"])]);
    const scanner = new ScriptedScanner();
    await mountReceiveFlow(1, { ...f, scanner });

    click("rfStart");
    scanner.emit("MISSING");
    expect(document.querySelector("#rfUnknownManual")).not.toBeNull();

    click("rfUnknownRetry");
    scanner.emit("same");
    expect(document.querySelectorAll("[data-choose]")).toHaveLength(2);

    document.querySelector<HTMLButtonElement>('[data-choose="21:0"]')!.click();
    expect(document.querySelector("#rfWeight")).not.toBeNull();
    expect(f.saveWeights).not.toHaveBeenCalled();
  });
});
