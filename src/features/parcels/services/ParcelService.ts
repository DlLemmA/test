import { Parcel } from "../domain/Parcel";
import { parcelReadiness } from "../domain/ParcelReadiness";
import type { ParcelItemRepository, ParcelRepository, ParcelWithItems } from "../domain/ports";

function reasons(issues: { reason: string }[]): string {
  return issues.map((issue) => issue.reason).join(", ");
}

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

  async updateParcel(
    parcelId: number,
    input: {
      name?: string | null;
      comment?: string | null;
      boxWeightG?: number | null;
      shippingCostBYN?: number | null;
    },
  ): Promise<Parcel> {
    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new Error("Parcel not found");
    return this.parcelRepo.save(parcel.update(input));
  }

  async shipParcel(
    parcelId: number,
    boxWeightG?: number,
    shippingCostBYN?: number,
  ): Promise<Parcel> {
    let parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new Error("Parcel not found");
    const { ship } = parcelReadiness(parcel, await this.itemRepo.findByParcelId(parcelId));
    if (!ship.ok) throw new Error(`Cannot ship parcel: ${reasons(ship.issues)}`);
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
    const { finish } = parcelReadiness(parcel, await this.itemRepo.findByParcelId(parcelId));
    if (!finish.ok) throw new Error(`Cannot complete parcel: ${reasons(finish.issues)}`);
    const done = parcel.markAsDone();
    return this.parcelRepo.save(done);
  }

  // Mark parcel as having all tracks filled (sets completedAt)
  async completeTracks(parcelId: number): Promise<Parcel> {
    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) throw new Error("Parcel not found");
    const { completeTracks } = parcelReadiness(
      parcel,
      await this.itemRepo.findByParcelId(parcelId),
    );
    if (!completeTracks.ok) {
      throw new Error(`Cannot complete tracks: ${reasons(completeTracks.issues)}`);
    }
    const completed = parcel.setCompleted();
    return this.parcelRepo.save(completed);
  }
}
