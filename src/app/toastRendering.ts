// ============================================
// Toast host — Vue owns the rendering, toastState owns the facts.
// No delegated listener: Vue keeps each action bound to its toast id.
// ============================================

import { createApp, reactive } from "vue";
import { toastState, type Toast } from "@/core/state";
import ToastHost from "./ToastHost.vue";

export function mountToastHost(host: HTMLElement): () => void {
  const view = reactive<{ toasts: Toast[] }>({ toasts: toastState.getAll() });
  const unsubscribe = toastState.subscribe((toasts) => {
    view.toasts = [...toasts];
  });
  const app = createApp(ToastHost, { view });
  app.mount(host);

  return () => {
    unsubscribe();
    app.unmount();
  };
}
