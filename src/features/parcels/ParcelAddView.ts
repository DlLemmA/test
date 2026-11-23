// ============================================
// Batch wizard — Vue SFC behind the ViewHandle seam.
// ============================================

import { mountVueView } from "@/app/mountVueView";
import ParcelAddView from "./ParcelAddView.vue";

export function mountParcelAddView(host: HTMLElement) {
  return mountVueView(ParcelAddView, host);
}
