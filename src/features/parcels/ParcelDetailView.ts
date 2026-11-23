// ============================================
// Parcel detail screen — Vue SFC behind the ViewHandle seam.
// ============================================

import { mountVueView } from "@/app/mountVueView";
import ParcelDetailView from "./ParcelDetailView.vue";

export function mountParcelDetailView(host: HTMLElement) {
  return mountVueView(ParcelDetailView, host);
}
