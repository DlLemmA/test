// ============================================
// Vue <-> ViewHandle adapter
// The shell still owns the lifetime. Mounting is deferred to the first
// render() so a Vue view always starts with real route params; later render()
// calls bump renderTick, which is what a view watches to pull fresh facts.
// ============================================

import { createApp, defineComponent, h, shallowRef } from "vue";
import type { Component } from "vue";
import type { AppRouteParams } from "./router";
import { appRouter } from "./router";
import type { ViewHandle } from "./ViewHandle";

export interface VueViewProps {
  params: AppRouteParams;
  renderTick: number;
}

export function mountVueView(component: Component<VueViewProps>, host: HTMLElement): ViewHandle {
  const current = shallowRef<VueViewProps>({ params: {}, renderTick: 0 });

  const Host = defineComponent({
    name: "VueViewHost",
    setup: () => () => h(component, current.value),
  });

  const app = createApp(Host);
  app.use(appRouter);
  let mounted = false;

  return {
    render(params: AppRouteParams): void {
      if (!mounted) {
        current.value = { params, renderTick: 0 };
        app.mount(host);
        mounted = true;
        return;
      }
      current.value = { params, renderTick: current.value.renderTick + 1 };
    },
    dispose(): void {
      if (mounted) app.unmount();
      mounted = false;
    },
  };
}
