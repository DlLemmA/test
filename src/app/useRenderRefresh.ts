// ============================================
// Pull-to-refresh for Vue views behind ViewHandle.
// AppShell calls render() on every visit, even with the same route params,
// so a view must re-read its repositories then. The returned refresh() is
// for local mutations (a form save, a payment toggle) that need the same
// re-read without a route change.
// ============================================

import { shallowRef, watch } from "vue";

export function useRenderRefresh(
  props: { renderTick: number },
  load: (signal: AbortSignal) => Promise<void>,
): () => void {
  const localTick = shallowRef(0);

  watch(
    [() => props.renderTick, localTick],
    (_source, _previous, onCleanup) => {
      const controller = new AbortController();
      onCleanup(() => controller.abort());
      void load(controller.signal);
    },
    { immediate: true },
  );

  return () => {
    localTick.value += 1;
  };
}
