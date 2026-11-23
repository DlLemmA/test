// ============================================
// Customer detail screen — Vue SFC behind the ViewHandle seam.
// ============================================

import { mountVueView } from "@/app/mountVueView";
import CustomerDetailView from "./CustomerDetailView.vue";

export function mountCustomerDetailView(host: HTMLElement) {
  return mountVueView(CustomerDetailView, host);
}
