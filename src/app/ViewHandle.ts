import type { RouteParams } from "@/core/state";

/** The shell owns the lifetime; a view only knows how to draw itself and stop. */
export interface ViewHandle {
  render(params: RouteParams): void | Promise<void>;
  dispose(): void;
}

export type ViewMount = (host: HTMLElement) => ViewHandle;
