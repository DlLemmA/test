// ============================================
// Readiness reason codes -> user-facing copy. Mirrors ParcelStatusInfo:
// domain owns the facts, ui/ owns the words and CSS classes.
// ============================================

import { t } from "@/core/utils";
import type { ItemTrackState, ParcelItem, Readiness } from "../domain";

const ITEMS_FORMS = "товаров | {count} товара | {count} товара | {count} товаров";
const TRACKS_FORMS = "треков | трек | трека | треков";

export type BadgeCopy = { label: string; class: string; title: string };

export function shipBlockMessage(readiness: Readiness): string | null {
  const issue = readiness.issues.find(
    (item) => item.reason === "parcelEmpty" || item.reason === "tracksNotConfirmed",
  );
  if (!issue) return null;
  if (issue.reason === "parcelEmpty") {
    return "Нельзя отправить пустую посылку. Добавьте хотя бы один товар.";
  }
  return `У ${t(ITEMS_FORMS, issue.itemIds.length)} не отмечены «Треки заполнены». Откройте товар, проверьте треки и поставьте галочку.`;
}

export function finishBlockMessage(readiness: Readiness, items: ParcelItem[]): string | null {
  const issue = readiness.issues.find((item) => item.reason === "weightsMissing");
  if (!issue) return null;
  const ids = new Set(issue.itemIds);
  const names = items
    .filter((item) => ids.has(item.id))
    .map((item) => `«${item.name}»`)
    .join(", ");
  return `Нельзя завершить: не взвешены ${names}. Взвесьте треки или отметьте товар потерянным.`;
}

export function finishHint(readiness: Readiness): string | null {
  return readiness.issues.some((item) => item.reason === "weightsMissing")
    ? "Взвесьте все треки или отметьте товар потерянным"
    : null;
}

export function itemTrackBadge(state: ItemTrackState): BadgeCopy {
  switch (state.state) {
    case "none":
      return { label: "Нет треков", class: "state-warn", title: "Заполните трек-номера" };
    case "confirmed":
      return { label: "Треки готовы", class: "state-good", title: "Треки готовы" };
    case "ready":
      return {
        label: `${state.filled}/${state.needed} ${t(TRACKS_FORMS, state.filled)}`,
        class: "state-info",
        title: "Отметьте «Треки заполнены» в карточке товара",
      };
    case "partial":
      return {
        label: `${state.filled}/${state.needed} ${t(TRACKS_FORMS, state.filled)}`,
        class: "state-warn",
        title: "Заполните трек-номера",
      };
  }
}
