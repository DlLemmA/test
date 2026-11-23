// ============================================
// Customers screen — Vue SFC behind the ViewHandle seam.
// ============================================

import { mountVueView } from "@/app/mountVueView";
import CustomersView from "./CustomersView.vue";

export function mountCustomersView(host: HTMLElement) {
  return mountVueView(CustomersView, host);
}
