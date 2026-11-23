// ============================================
// Toast view — one delegated listener, actions resolved by id.
// The index of a button among `.toast-action` elements is not an identity.
// ============================================

import type { ListenerScope } from "@/core/listeners";
import { toastState, type Toast } from "@/core/state";
import { esc } from "@/core/utils";

function toastColor(type: Toast["type"]): string {
  switch (type) {
    case "error":
      return "#b42318";
    case "warn":
      return "#92400e";
    default:
      return "#0f7b5a";
  }
}

export function mountToastRendering(container: HTMLElement, scope: ListenerScope): () => void {
  let actions = new Map<string, Toast["action"]>();

  const unsubscribe = toastState.subscribe((toasts) => {
    actions = new Map(
      toasts.flatMap((toast) => (toast.action ? [[toast.id, toast.action] as const] : [])),
    );
    container.innerHTML = toasts
      .map(
        (toast) => `
      <div class="toast toast-enter" style="background-color: ${toastColor(toast.type)}">
        ${esc(toast.message)}
        ${toast.action ? `<button type="button" class="toast-action" data-toast-id="${esc(toast.id)}">${esc(toast.action.label)}</button>` : ""}
      </div>
    `,
      )
      .join("");
  });

  // One listener survives every re-render; the toast id travels with the button.
  scope.on(container, "click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-toast-id]");
    if (!button) return;
    const id = button.dataset.toastId;
    if (!id) return;
    actions.get(id)?.onClick();
    toastState.remove(id);
  });

  return () => {
    unsubscribe();
    actions.clear();
  };
}
