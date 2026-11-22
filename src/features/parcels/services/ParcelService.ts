import { Parcel } from "../domain/Parcel";
import type { ParcelItemRepository, ParcelRepository, ParcelWithItems } from "../domain/ports";

export class ParcelService {
  constructor(
    private parcelRepo: ParcelRepository,
    private itemRepo: ParcelItemRepository,
  ) {}

  async getParcelWithItems(parcelId: number): Promise<ParcelWithItems | null> {
    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) return null;
    const items = await this.itemRepo.findByParcelId(parcelId);
    return { parcel, items };
  }

  async createParcel(): Promise<Parcel> {
    return this.parcelRepo.save(Parcel.create());
  }

  async shipParcel(
    parcelId: number,
    boxWeightG?: number,
    shippingCostBYN?: number,
  ): Promise<Parcel> {
    let parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new Error("Parcel not found");
    const canShip = await this.canShip(parcelId);
    if (!canShip) throw new Error("Cannot ship parcel: not all items have track numbers");
    const update: { boxWeightG?: number; shippingCostBYN?: number } = {};
    if (boxWeightG !== undefined) update.boxWeightG = boxWeightG;
    if (shippingCostBYN !== undefined) update.shippingCostBYN = shippingCostBYN;
    if (Object.keys(update).length > 0) parcel = parcel.update(update);
    const shipped = parcel.ship();
    return this.parcelRepo.save(shipped);
  }

  async receiveParcel(
    parcelId: number,
    boxWeightG: number,
    shippingCostBYN: number,
  ): Promise<Parcel> {
    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new Error("Parcel not found");
    const received = parcel.receive(boxWeightG, shippingCostBYN);
    return this.parcelRepo.save(received);
  }

  async markAsDoneParcel(parcelId: number): Promise<Parcel> {
    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new Error("Parcel not found");
    const items = await this.itemRepo.findByParcelId(parcelId);
    const notReady = items.filter(
      (item) => item.status !== "lost" && item.trackNumbers.length > 0 && !item.hasAllWeights,
    );
    if (notReady.length > 0) {
      throw new Error("Cannot complete parcel: not all items are weighed or marked lost");
    }
    const done = parcel.markAsDone();
    return this.parcelRepo.save(done);
  }

  async canShip(parcelId: number): Promise<boolean> {
    const items = await this.itemRepo.findByParcelId(parcelId);
    return items.length > 0 && items.every((item) => item.tracksCompleted);
  }

  // Mark parcel as having all tracks filled (sets completedAt)
  async completeTracks(parcelId: number): Promise<Parcel> {
    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new Error("Parcel not found");
    const items = await this.itemRepo.findByParcelId(parcelId);
    if (!items.every((item) => item.tracksCompleted)) {
      throw new Error("Not all items have all track numbers filled");
    }
    const completed = parcel.setCompleted();
    return this.parcelRepo.save(completed);
  }
}
