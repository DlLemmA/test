// ============================================
// Parcels screen — Vue SFC behind the ViewHandle seam.
// ============================================

import { mountVueView } from "@/app/mountVueView";
import ParcelListView from "./ParcelListView.vue";

export function mountParcelListView(host: HTMLElement) {
  return mountVueView(ParcelListView, host);
}
