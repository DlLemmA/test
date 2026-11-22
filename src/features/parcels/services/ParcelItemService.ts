import { ParcelItem } from "../domain/ParcelItem";
import type { ParcelItemCreateInput, ParcelItemUpdateInput } from "../domain/ParcelItem";
import type { ParcelItemRepository, ParcelRepository } from "../domain/ports";

export class ParcelItemService {
  constructor(
    private itemRepo: ParcelItemRepository,
    private parcelRepo: ParcelRepository,
  ) {}

  async addBatch(parcelId: number, items: ParcelItemCreateInput[]): Promise<ParcelItem[]> {
    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new Error("Parcel not found");
    if (parcel.status !== "draft") throw new Error("Can only add items to draft parcel");

    const created: ParcelItem[] = [];
    for (const input of items) {
      const item = ParcelItem.create({ ...input, parcelId });
      const saved = await this.itemRepo.save(item);
      created.push(saved);
    }
    return created;
  }

  async updateItem(itemId: number, input: ParcelItemUpdateInput): Promise<ParcelItem> {
    const item = await this.itemRepo.findById(itemId);
    if (!item) throw new Error("Item not found");
    const parcel = await this.parcelRepo.findById(item.parcelId);
    if (!parcel) throw new Error("Parcel not found");

    // If parcel is shipped/received, only allow track/weight/tracks-completed updates
    if (parcel.status !== "draft") {
      const allowedKeys: (keyof ParcelItemUpdateInput)[] = [
        "trackNumbers",
        "weightsG",
        "status",
        "tracksCompletedAt",
      ];
      const filteredInput: ParcelItemUpdateInput = {};
      for (const key of allowedKeys) {
        if (key in input) (filteredInput as any)[key] = (input as any)[key];
      }
      const updated = item.update(filteredInput);
      return this.itemRepo.save(updated);
    }

    const updated = item.update(input);
    return this.itemRepo.save(updated);
  }

  async deleteItem(itemId: number): Promise<void> {
    const item = await this.itemRepo.findById(itemId);
    if (!item) throw new Error("Item not found");
    const parcel = await this.parcelRepo.findById(item.parcelId);
    if (!parcel) throw new Error("Parcel not found");
    if (parcel.status !== "draft") throw new Error("Can only delete items from draft parcel");
    await this.itemRepo.delete(itemId);
  }

  async setTracks(itemId: number, tracks: string[]): Promise<ParcelItem> {
    const item = await this.itemRepo.findById(itemId);
    if (!item) throw new Error("Item not found");
    const updated = item.update({ trackNumbers: tracks });
    return this.itemRepo.save(updated);
  }

  async setWeights(itemId: number, weights: number[]): Promise<ParcelItem> {
    const item = await this.itemRepo.findById(itemId);
    if (!item) throw new Error("Item not found");
    const updated = item.update({ weightsG: weights });
    return this.itemRepo.save(updated);
  }
}
