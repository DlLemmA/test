// Which facts earn space in an item row depends on the parcel's stage.
// Draft is about tracks, receiving is about weight, done is about money.
import type { ParcelItemStatus, ParcelStatus } from "@/core/dbSchema";
import { parcelItemStatusInfo, type StatusInfo } from "./ParcelStatusInfo";

export interface ItemFactsInput {
  status: ParcelItemStatus;
  weightsG: readonly number[];
}

export interface ItemRowFacts {
  /** Only a lost item needs a status badge; normal states are shown by their facts. */
  badge: StatusInfo | null;
  showTracks: boolean;
  showTrackWeights: boolean;
  compactWeight: string | null;
  canPay: boolean;
}

function compactWeightLabel(weightsG: readonly number[]): string {
  const total = weightsG.reduce((sum, weight) => sum + weight, 0);
  return total > 0 ? `вес ${total} г` : "вес не задан";
}

export function itemRowFacts(
  parcelStatus: ParcelStatus,
  item: ItemFactsInput,
  isSelf: boolean,
): ItemRowFacts {
  const lost = item.status === "lost";
  return {
    badge: lost ? parcelItemStatusInfo("lost") : null,
    showTracks: parcelStatus !== "done",
    showTrackWeights: parcelStatus === "received" && !lost,
    compactWeight: parcelStatus === "done" && !lost ? compactWeightLabel(item.weightsG) : null,
    canPay: !isSelf,
  };
}
