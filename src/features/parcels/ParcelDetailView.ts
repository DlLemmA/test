import { parcelRepository, parcelItemRepository } from "./infrastructure";
import {
  parcelServiceInstance as parcelService,
  parcelItemServiceInstance as parcelItemService,
  getParcelWithCalculation,
  updateParcel,
  shipParcel,
  receiveParcel,
  toggleItemPayment,
  toggleShippingPayment,
} from "@/features/shared/services";
import { customerRepository } from "@/features/customers/infrastructure";
import { drawer, confirmDrawer, closeDrawer } from "@/core/drawer";
import { on } from "@/core/listeners";
import { router, uiState, toastState } from "@/core/state";
import { I, esc, kg, money, t } from "@/core/utils";
import { Parcel, ParcelItem, type ParcelItemUpdateInput, type PaymentState } from "./domain";
import type { CustomerBalance } from "@/features/balances/domain";
import { nextStepLabel } from "./ui/ParcelNextStatus";
import { parcelStatusInfo } from "./ui/ParcelStatusInfo";
import { selectHtml } from "./ui/Select";
import { unitsSelectHtml } from "./ui/UnitsSelect";
import {
  applyItemGroupsSearch,
  itemSearchCountText,
  itemsWithoutTracks,
  renderItemGroups,
} from "./ui/ItemGroups";
import type { Customer } from "@/features/customers/domain";
import { openReceiveFlow } from "./ReceiveFlow";
import { exportParcel } from "./ParcelListView";

// Search stays applied while the parcel is re-rendered after item actions.
const itemSearchState = { parcelId: 0, query: "", missingTracksOnly: false };
const openCustomerGroups = new Set<number>();
let itemSearchAnnounceTimer: ReturnType<typeof setTimeout> | null = null;
// The inline note stays expanded while the user is editing it.
let commentFocused = false;
let commentDraft: string | null = null;

// Copy button: native Invoker Commands where supported, click fallback otherwise.
async function copyParcelTracks(button: HTMLElement, source: HTMLElement): Promise<void> {
  const text = source instanceof HTMLTextAreaElement ? source.value : source.innerText.trim();
  if (!text) {
    toastState.add({ message: "В посылке нет трек-номеров", type: "warn" });
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toastState.add({ message: "Трек-номера скопированы", type: "success" });
  } catch {
    toastState.add({ message: "Не удалось скопировать трек-номера", type: "error" });
  }
}

document.addEventListener(
  "command",
  (event) => {
    const commandEvent = event as Event & { command?: string; source?: HTMLElement };
    if (commandEvent.command !== "--copy-tracks") return;
    const source = commandEvent.target as HTMLElement | null;
    if (source) copyParcelTracks(commandEvent.source as HTMLElement, source);
  },
  true,
);

if (!("CommandEvent" in window)) {
  document.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
      'button[command="--copy-tracks"]',
    );
    if (!button) return;
    const source = document.getElementById(button.getAttribute("commandfor") || "");
    if (source) copyParcelTracks(button, source);
  });
}

export async function renderParcelDetailView(): Promise<void> {
  const root = document.getElementById("parcelView");
  if (!root) return;

  const parcelId = uiState.currentParcelId;
  if (!parcelId) {
    root.innerHTML = `<section class="section"><h2>Нет выбранной посылки</h2></section>`;
    return;
  }

  const result = await getParcelWithCalculation(parcelId);
  if (!result) {
    uiState.setCurrentParcelId(null);
    renderParcelDetailView();
    return;
  }

  const { parcel, items, customers, balance, paymentState } = result;

  if (itemSearchAnnounceTimer) {
    clearTimeout(itemSearchAnnounceTimer);
    itemSearchAnnounceTimer = null;
  }
  if (itemSearchState.parcelId !== parcel.id) {
    itemSearchState.parcelId = parcel.id;
    itemSearchState.query = "";
    itemSearchState.missingTracksOnly = false;
    openCustomerGroups.clear();
  }

  const trackNumbers = items.flatMap((item) =>
    item.trackNumbers.map((track) => track.trim()).filter(Boolean),
  );

  const date = detailDate(parcel);
  const status = parcelStatusInfo(parcel.status);
  const missingTracks = parcel.status === "draft" ? itemsWithoutTracks(items) : 0;
  const boxWeight = parcel.boxWeightG || 0;
  const tariffPerKg =
    parcel.shippingCostBYN && parcel.boxWeightG
      ? parcel.shippingCostBYN / (parcel.boxWeightG / 1000)
      : 0;

  root.innerHTML = `
    <div class="page page-parcel-detail">
      <div class="detail-topbar">
        <button type="button" class="text-btn" id="backToParcels">${I.chevronLeft} Все посылки</button>
        <div class="detail-topbar__actions">
          <button type="button" class="text-btn" id="copyParcelTracks" command="--copy-tracks" commandfor="parcelTracksSource"><span class="sr-only">Скопировать трек-номера</span><span aria-hidden="true">${I.copy} Трек-номера</span></button>
          <button type="button" class="text-btn" id="editParcel">${I.pencil} Изменить</button>
        </div>
      </div>
      <textarea id="parcelTracksSource" class="sr-only" readonly tabindex="-1" aria-hidden="true">${esc(trackNumbers.join("\n"))}</textarea>

      <section class="detail-hero" data-status="${parcel.status}">
        <div class="detail-hero__date" title="${date.title}">
          <b>${date.day}</b>
          <span>${date.month}</span>
        </div>
        <div class="detail-hero__body min-w-0">
          <div class="detail-hero__title-row">
            <h1>${parcel.name ? esc(parcel.name) : `Посылка №${parcel.id}`}</h1>
            <span class="detail-state state-${status.class}">${esc(status.label)}</span>
          </div>
          <p class="detail-hero__next">${nextStepLabel(parcel.status)}</p>
        </div>
      </section>

      ${renderCalculation(parcel, items, balance.byCustomer, tariffPerKg, boxWeight)}

      <div class="detail-action">${primaryAction(parcel, items)}</div>

      ${renderComment(parcel)}

      ${
        items.length > 0
          ? `<search class="item-search" aria-label="Поиск товаров в посылке">
              <label class="sr-only" for="parcelItemSearch">Поиск товаров</label>
              <input type="search" id="parcelItemSearch" class="item-search__input" name="itemSearch"
                placeholder="Название, заказчик или трек" value="${esc(itemSearchState.query)}"
                autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="search">
              ${
                parcel.status === "draft" &&
                (missingTracks > 0 || itemSearchState.missingTracksOnly)
                  ? `<button type="button" id="missingTracksFilter" class="item-search__filter${itemSearchState.missingTracksOnly ? " is-active" : ""}"
                      aria-pressed="${itemSearchState.missingTracksOnly}" title="${itemSearchState.missingTracksOnly ? "Снять фильтр «Без треков»" : "Показать товары без треков"}">Без треков <b>${missingTracks}</b><span class="item-search__filter-x" aria-hidden="true">×</span></button>`
                  : ""
              }
              <span id="parcelItemSearchCount" class="item-search__count" role="status" aria-live="polite" hidden></span>
            </search>`
          : ""
      }

      <section class="section">
        <header class="section-title with-action">
          <h2>Товары</h2>
          ${parcel.status === "draft" ? `<button type="button" class="text-btn" id="addItem">${I.plus} Добавить</button>` : ""}
        </header>
        <div id="parcelItemsList">
          ${renderItemGroups(
            items,
            parcel,
            customers,
            balance.byCustomer,
            balance.deliveryByItem,
            paymentState,
            openCustomerGroups,
          )}
          ${items.length > 0 ? '<p class="empty item-search__empty" id="parcelItemNoResults" hidden>Ничего не найдено. Измените запрос.</p>' : ""}
        </div>
      </section>
    </div>
  `;

  bindParcelDetailActions(parcel, items, customers, paymentState);
}

function renderCalculation(
  parcel: Parcel,
  items: ParcelItem[],
  balances: Map<number, CustomerBalance>,
  tariffPerKg: number,
  boxWeight: number,
): string {
  const goodsTotal = items.reduce((sum, item) => sum + item.totalPriceBYN, 0);
  const delivery = parcel.shippingCostBYN || 0;
  const remaining = Array.from(balances.values()).reduce((sum, b) => sum + b.remaining, 0);
  const bullets: { label: string; value: string; strong?: boolean; warn?: boolean }[] = [
    { label: "Позиций", value: String(items.length) },
    { label: "Вес", value: boxWeight > 0 ? `${kg(boxWeight)} кг` : "—" },
    { label: "Товары", value: money(goodsTotal) },
    { label: "Доставка", value: delivery > 0 ? money(delivery) : "—" },
    { label: "Итого", value: money(goodsTotal + delivery), strong: true },
    { label: "Курс", value: tariffPerKg > 0 ? `${tariffPerKg.toFixed(2)} BYN/кг` : "—" },
    { label: "Остаток", value: money(remaining), warn: remaining > 0 },
  ];

  return `
    <div class="parcel-calc" aria-label="Расчёт по посылке">
      ${bullets
        .map(
          (b) => `
        <span class="parcel-calc__item${b.strong ? " is-total" : ""}${b.warn ? " is-warn" : ""}">
          <span class="parcel-calc__label">${b.label}</span>
          <b>${b.value}</b>
        </span>`,
        )
        .join("")}
    </div>
  `;
}

function renderComment(parcel: Parcel): string {
  const value = commentDraft ?? parcel.comment ?? "";
  const rows = commentFocused ? Math.min(16, Math.max(2, value.split("\n").length)) : 1;
  return `
    <div class="parcel-comment${commentFocused ? " is-expanded" : ""}" id="parcelCommentBlock">
      <textarea id="parcelCommentText" class="parcel-comment__text" rows="${rows}"
        placeholder="Заметка о посылке…" aria-label="Заметка о посылке">${esc(value)}</textarea>
    </div>
  `;
}

function primaryAction(parcel: Parcel, items: ParcelItem[]): string {
  switch (parcel.status) {
    case "draft":
      return `<button type="button" class="btn-primary btn-action" id="shipParcel">${I.package} Отправить</button>
        <button type="button" class="text-btn" id="openBatchForm">${I.plus} Партия товаров</button>`;
    case "shipped":
      return `<button type="button" class="btn-primary btn-action" id="receiveParcel">${I.scan} Получить посылку</button>`;
    case "received":
      return `<button type="button" class="btn-primary btn-action" id="markAsDone">${I.checkCircle} Завершить</button>
        <button type="button" class="text-btn" id="rescanParcel">${I.scan} Сканировать ещё</button>
        ${allItemsReady(items) ? "" : '<p class="detail-action__hint">Взвесьте все треки или отметьте товар потерянным</p>'}`;
    case "done":
      return `<button type="button" class="text-btn" id="exportParcel">${I.sheet} Экспорт в Excel</button>`;
  }
}

function allItemsReady(items: ParcelItem[]): boolean {
  return items.every(
    (item) => item.status === "lost" || item.trackNumbers.length === 0 || item.hasAllWeights,
  );
}

function detailDate(parcel: Parcel): { day: string; month: string; title: string } {
  const iso = parcel.shippedAt || parcel.createdAt;
  const d = new Date(iso);
  const valid = !Number.isNaN(d.getTime());
  return {
    day: valid ? d.toLocaleDateString("ru-RU", { day: "2-digit" }) : "—",
    month: valid ? d.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "") : "нет",
    title: parcel.shippedAt
      ? `отправлена ${valid ? d.toLocaleDateString("ru-RU") : ""}`
      : `создана ${valid ? d.toLocaleDateString("ru-RU") : ""}`,
  };
}

const ITEMS_GENITIVE_FORMS = "товаров | {count} товара | {count} товара | {count} товаров";

function applyItemSearch(): void {
  const input = document.getElementById("parcelItemSearch") as HTMLInputElement | null;
  const list = document.getElementById("parcelItemsList");
  if (!input || !list) return;

  const missingOnly =
    itemSearchState.missingTracksOnly && !!document.getElementById("missingTracksFilter");
  const result = applyItemGroupsSearch(list, input.value, missingOnly);
  const countText = itemSearchCountText(result);

  const noResults = document.getElementById("parcelItemNoResults");
  if (noResults) {
    noResults.hidden = (result.queryLength === 0 && !result.missingOnly) || result.visible > 0;
  }

  const count = document.getElementById("parcelItemSearchCount");
  if (itemSearchAnnounceTimer) clearTimeout(itemSearchAnnounceTimer);
  itemSearchAnnounceTimer = setTimeout(() => {
    if (!count) return;
    count.textContent = countText;
    count.hidden = countText.length === 0;
  }, 180);
}

function bindParcelDetailActions(
  parcel: Parcel,
  items: ParcelItem[],
  customers: Customer[],
  paymentState: PaymentState,
): void {
  document.getElementById("backToParcels")?.addEventListener("click", () => {
    router.navigate("parcels");
  });

  const commentBlock = document.getElementById("parcelCommentBlock");
  const commentText = document.getElementById("parcelCommentText") as HTMLTextAreaElement | null;
  if (commentBlock && commentText) {
    const resize = () => {
      commentText.style.height = "auto";
      commentText.style.height = `${commentText.scrollHeight}px`;
    };
    const expand = () => {
      if (commentFocused) return;
      commentFocused = true;
      commentBlock.classList.add("is-expanded");
      resize();
    };
    const collapse = () => {
      commentFocused = false;
      commentBlock.classList.remove("is-expanded");
      commentText.style.height = "";
    };

    on(commentText, "focus", expand);
    on(commentText, "click", expand);
    on(commentText, "input", () => {
      commentDraft = commentText.value;
      if (commentFocused) resize();
    });
    on(commentText, "keydown", (e) => {
      if (e.key === "Escape") commentText.blur();
    });
    on(commentText, "blur", () => {
      collapse();
      const next = (commentDraft ?? commentText.value).trim();
      commentDraft = null;
      if (next === (parcel.comment || "")) return;
      void updateParcel(parcel.id, { comment: next || null })
        .then(() => toastState.add({ message: "Заметка сохранена", type: "success" }))
        .catch((err) => {
          toastState.add({ message: "Не удалось сохранить заметку", type: "error" });
          console.error(err);
        });
    });
  }

  const itemSearch = document.getElementById("parcelItemSearch") as HTMLInputElement | null;
  const missingFilter = document.getElementById("missingTracksFilter");
  const syncMissingFilter = (): void => {
    missingFilter?.classList.toggle("is-active", itemSearchState.missingTracksOnly);
    missingFilter?.setAttribute("aria-pressed", String(itemSearchState.missingTracksOnly));
    missingFilter?.setAttribute(
      "title",
      itemSearchState.missingTracksOnly
        ? "Снять фильтр «Без треков»"
        : "Показать товары без треков",
    );
  };
  const clearItemSearch = (): void => {
    if (!itemSearch) return;
    itemSearch.value = "";
    itemSearchState.query = "";
    itemSearchState.missingTracksOnly = false;
    syncMissingFilter();
    applyItemSearch();
  };
  on(missingFilter, "click", () => {
    itemSearchState.missingTracksOnly = !itemSearchState.missingTracksOnly;
    syncMissingFilter();
    applyItemSearch();
  });

  if (itemSearch) {
    on(itemSearch, "input", () => {
      itemSearchState.query = itemSearch.value;
      applyItemSearch();
    });
    // The native cancel button of type="search" fires `search` as well.
    on(itemSearch, "search", () => {
      itemSearchState.query = itemSearch.value;
      applyItemSearch();
    });
    on(itemSearch, "keydown", (e) => {
      if (e.key === "Escape" && itemSearch.value) {
        e.preventDefault();
        clearItemSearch();
      }
    });
  }
  applyItemSearch();

  document.getElementById("exportParcel")?.addEventListener("click", async () => {
    await exportParcel(parcel);
  });

  // Ship parcel — box weight is entered before the parcel leaves
  document.getElementById("shipParcel")?.addEventListener("click", () => {
    if (items.length === 0) {
      toastState.add({
        message: "Нельзя отправить пустую посылку. Добавьте хотя бы один товар.",
        type: "error",
      });
      return;
    }
    const itemsWithoutTracks = items.filter((i) => !i.tracksCompleted);
    if (itemsWithoutTracks.length > 0) {
      toastState.add({
        message: `У ${t(ITEMS_GENITIVE_FORMS, itemsWithoutTracks.length)} не отмечены «Треки заполнены». Откройте товар, проверьте треки и поставьте галочку.`,
        type: "error",
      });
      return;
    }
    openShipForm(parcel);
  });

  // Receiving starts immediately: mark the parcel received (date + status), then scan weights.
  const openScan = (target: Parcel = parcel) =>
    void openReceiveFlow(target, () => renderParcelDetailView());
  document.getElementById("receiveParcel")?.addEventListener("click", async () => {
    try {
      const received = await receiveParcel(
        parcel.id,
        parcel.boxWeightG || 0,
        parcel.shippingCostBYN || 0,
      );
      openScan(received);
      void renderParcelDetailView();
    } catch (err) {
      toastState.add({ message: "Не удалось отметить получение", type: "error" });
      console.error(err);
    }
  });
  document.getElementById("rescanParcel")?.addEventListener("click", () => openScan());

  // Mark parcel as done (received -> done) only when every item is weighed or lost.
  document.getElementById("markAsDone")?.addEventListener("click", async () => {
    const notReady = items.filter(
      (item) => item.status !== "lost" && item.trackNumbers.length > 0 && !item.hasAllWeights,
    );
    if (notReady.length > 0) {
      toastState.add({
        message: `Нельзя завершить: не взвешены ${notReady.map((item) => `«${item.name}»`).join(", ")}. Взвесьте треки или отметьте товар потерянным.`,
        type: "error",
      });
      return;
    }
    try {
      await parcelService.markAsDoneParcel(parcel.id);
      renderParcelDetailView();
      toastState.add({ message: "Посылка завершена", type: "success" });
    } catch (err) {
      toastState.add({ message: "Не удалось завершить посылку", type: "error" });
      console.error(err);
    }
  });

  // Edit parcel
  document.getElementById("editParcel")?.addEventListener("click", () => {
    openParcelEditForm(parcel);
  });

  // Add item (for draft without batch form)
  document.getElementById("addItem")?.addEventListener("click", () => {
    openItemForm(null, parcel.id, parcel.status);
  });

  // Item actions
  const listRoot = document.getElementById("parcelItemsList");
  if (listRoot) {
    // Payment checkboxes live inside the group's <summary>; their clicks must not toggle it.
    listRoot.querySelectorAll<HTMLElement>("summary label").forEach((label) => {
      on(label, "click", (event) => event.stopPropagation());
    });
    listRoot.querySelectorAll<HTMLDetailsElement>("details[data-item-group]").forEach((group) => {
      const customerId = Number(group.dataset.customer);
      on(group, "toggle", () => {
        if (group.open) openCustomerGroups.add(customerId);
        else openCustomerGroups.delete(customerId);
      });
    });
    listRoot.querySelectorAll("[data-edit]").forEach((b) => {
      const el = b as HTMLElement;
      on(el, "click", () => {
        el.closest("details")?.removeAttribute("open");
        openItemForm(
          parseInt(el.dataset.edit!),
          parcel.id,
          parcel.status,
          defaultItemStep(parcel.status),
        );
      });
    });
    listRoot.querySelectorAll("[data-move]").forEach((b) => {
      const el = b as HTMLElement;
      on(el, "click", () => {
        el.closest("details")?.removeAttribute("open");
        moveItem(parseInt(el.dataset.move!));
      });
    });
    listRoot.querySelectorAll("[data-delete]").forEach((b) => {
      const el = b as HTMLElement;
      on(el, "click", () => {
        el.closest("details")?.removeAttribute("open");
        deleteItem(parseInt(el.dataset.delete!));
      });
    });

    // Add track button — open the item wizard straight on the tracks step.
    listRoot.querySelectorAll("[data-add-track]").forEach((b) => {
      const el = b as HTMLElement;
      on(el, "click", () => {
        openItemForm(parseInt(el.dataset.addTrack!), parcel.id, parcel.status, "tracks");
      });
    });

    // Toggle item payment (shipped/received)
    listRoot.querySelectorAll("[data-toggle-payment]").forEach((btn) => {
      const el = btn as HTMLElement;
      on(el, "click", async () => {
        const itemId = parseInt(el.dataset.togglePayment!);
        const item = items.find((i) => i.id === itemId);
        if (!item) return;
        const newPaid = !paymentState.itemPaid.get(itemId);
        await toggleItemPayment(parcel.id, itemId, item.customerId);
        renderParcelDetailView();
      });
    });
  }

  // Batch form: open the full add page with this parcel preselected
  document.getElementById("openBatchForm")?.addEventListener("click", () => {
    router.navigate("add", { parcelId: String(parcel.id) });
  });

  // Payment checkboxes in received summary
  document.querySelectorAll(".item-paid-all").forEach((checkbox) => {
    const el = checkbox as HTMLInputElement;
    const customerId = parseInt(el.dataset.customer!);
    const customerItems = items.filter((i) => i.customerId === customerId);
    const allPaid = customerItems.every((i) => paymentState.itemPaid.get(i.id));
    el.indeterminate = !allPaid && customerItems.some((i) => paymentState.itemPaid.get(i.id));

    on(el, "change", async () => {
      for (const item of customerItems) {
        await toggleItemPayment(parcel.id, item.id, customerId);
      }
      renderParcelDetailView();
    });
  });

  document.querySelectorAll(".shipping-paid").forEach((checkbox) => {
    const el = checkbox as HTMLInputElement;
    const customerId = parseInt(el.dataset.customer!);

    on(el, "change", async () => {
      if (parcel.status !== "done") return;
      await toggleShippingPayment(parcel.id, customerId);
      renderParcelDetailView();
    });
  });
}

// ============================================
// Helper Functions
// ============================================

function openShipForm(parcel: Parcel): void {
  drawer(
    "Отправить посылку",
    `
    <form id="shipForm" novalidate>
      <p class="small muted">Вес и сумма доставки относятся ко всей посылке. Их можно уточнить при получении.</p>
      <div class="field">
        <label for="shipBoxWeight">Вес посылки, г *</label>
        <input id="shipBoxWeight" name="boxWeightG" type="number" inputmode="numeric" min="1" step="1" required autofocus value="${parcel.boxWeightG ?? ""}" placeholder="Например, 600">
      </div>
      <div class="field">
        <label for="shipAmount">Сумма доставки, BYN *</label>
        <input id="shipAmount" name="shippingCostBYN" type="number" inputmode="decimal" min="0.01" step="0.01" required value="${parcel.shippingCostBYN ?? ""}" placeholder="Например, 12.50">
      </div>
      <div class="actions"><button type="submit" class="btn-primary w-full">${I.package} Отправить</button></div>
    </form>
  `,
  );

  const form = document.getElementById("shipForm") as HTMLFormElement | null;
  if (!form) return;
  form.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
    on(input, "input", () => {
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
    });
  });
  on(form, "submit", async (e) => {
    e.preventDefault();
    const weightInput = form.querySelector<HTMLInputElement>('[name="boxWeightG"]');
    const amountInput = form.querySelector<HTMLInputElement>('[name="shippingCostBYN"]');
    const boxWeightG = Number(weightInput?.value);
    const shippingCostBYN = Number(amountInput?.value);
    const invalidWeight =
      weightInput?.value.trim() === "" || !Number.isFinite(boxWeightG) || boxWeightG <= 0;
    const invalidAmount =
      amountInput?.value.trim() === "" || !Number.isFinite(shippingCostBYN) || shippingCostBYN <= 0;
    weightInput?.setCustomValidity(invalidWeight ? "Укажите вес посылки" : "");
    amountInput?.setCustomValidity(invalidAmount ? "Укажите сумму доставки" : "");
    if (invalidWeight || invalidAmount) {
      weightInput?.setAttribute("aria-invalid", String(invalidWeight));
      amountInput?.setAttribute("aria-invalid", String(invalidAmount));
      form.reportValidity();
      (invalidWeight ? weightInput : amountInput)?.focus();
      return;
    }
    weightInput?.setAttribute("aria-invalid", "false");
    amountInput?.setAttribute("aria-invalid", "false");
    await shipParcel(parcel.id, boxWeightG, shippingCostBYN);
    closeDrawer();
    renderParcelDetailView();
    toastState.add({ message: "Посылка отправлена", type: "success" });
  });
}

async function openParcelEditForm(parcel: Parcel): Promise<void> {
  drawer(
    "Редактировать посылку",
    `
    <form id="parcelForm">
      <div class="field"><label for="parcelName">Название посылки</label><input id="parcelName" name="name" value="${esc(parcel.name || "")}" placeholder="Например: Посылка из PDD #5"></div>
      <div class="field">
        <label for="parcelCommentInput">Комментарий</label>
        <textarea id="parcelCommentInput" name="comment" rows="8" placeholder="Заметки, долги, пожелания — что угодно, кроме самих товаров">${esc(parcel.comment || "")}</textarea>
      </div>
      <div class="field"><label for="parcelBoxWeight">Вес посылки, г</label><input id="parcelBoxWeight" name="boxWeightG" type="number" min="0" step="1" value="${parcel.boxWeightG ?? ""}" placeholder="Например, 600"></div>
      <div class="field"><label>Стоимость доставки (BYN)</label><input name="shippingCostBYN" type="number" step="0.01" value="${parcel.shippingCostBYN || ""}" placeholder="Стоимость доставки карго"></div>
      <div class="actions"><button type="submit">Сохранить</button></div>
    </form>
  `,
  );

  const form = document.getElementById("parcelForm") as HTMLFormElement;
  if (form) {
    on(form, "submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const name = formData.get("name")?.toString().trim() || null;
      const comment = formData.get("comment")?.toString().trim() || null;
      const boxWeightRaw = formData.get("boxWeightG")?.toString().trim() || "";
      const boxWeightG = boxWeightRaw === "" ? null : Number(boxWeightRaw);
      const shippingCostBYN = formData.get("shippingCostBYN")?.toString();

      await parcelRepository.save(
        parcel.update({
          name,
          comment,
          boxWeightG,
          shippingCostBYN: shippingCostBYN ? parseFloat(shippingCostBYN) : null,
        }),
      );
      closeDrawer();
      renderParcelDetailView();
      toastState.add({ message: "Посылка сохранена", type: "success" });
    });
  }
}

type ItemFormStep = "main" | "tracks" | "weights";

function defaultItemStep(status: Parcel["status"]): ItemFormStep {
  if (status === "draft" || status === "shipped") return "tracks";
  if (status === "received") return "weights";
  return "main";
}

function openItemForm(
  itemId: number | null,
  parcelId: number,
  parcelStatus: Parcel["status"],
  initialStep: ItemFormStep = "main",
): void {
  if (itemId) {
    parcelItemRepository.findById(itemId).then((item) => {
      if (item) renderItemForm(item, parcelId, false, parcelStatus, initialStep);
    });
  } else {
    renderItemForm(null, parcelId, true, parcelStatus, "main");
  }
}

function renderItemForm(
  item: ParcelItem | null,
  parcelId: number,
  isNew: boolean,
  parcelStatus: Parcel["status"],
  initialStep: ItemFormStep,
): void {
  customerRepository.findAll().then((customers) => {
    const customerOptions = customers.map((c) => ({
      value: c.id,
      label: `${c.name}${c.isSelf ? " (я)" : ""}`,
      selected: c.id === item?.customerId,
    }));

    const canEditTracks = !isNew && parcelStatus !== "done";
    const canEditWeights = !isNew && parcelStatus === "received";
    const step: ItemFormStep = isNew
      ? "main"
      : initialStep === "weights" && !canEditWeights
        ? "tracks"
        : initialStep;
    const trackRowHtml = (idx: number, track = ""): string => `
      <div class="item-track-row" data-track-row>
        <div class="field">
          <label for="itemTrack${idx}" data-track-label>Трек ${idx + 1}</label>
          <input id="itemTrack${idx}" name="track" value="${esc(track)}" placeholder="Трек ${idx + 1}" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">
        </div>
        <button type="button" class="track-remove" data-remove-track>
          <span class="sr-only" data-remove-label>Удалить трек ${idx + 1}</span>${I.x}
        </button>
      </div>
    `;
    const initialTracks = item?.trackNumbers.length ? item.trackNumbers : [""];
    const trackRows = canEditTracks
      ? initialTracks.map((track, idx) => trackRowHtml(idx, track)).join("")
      : "";
    const weightRowHtml = (idx: number, track: string, weight: number | string = ""): string => `
      <div class="weight-row" data-weight-row data-track="${esc(track)}">
        <span class="weight-row__code">${idx + 1}. ${esc(track)}</span>
        <div class="field">
          <label for="itemWeight${idx}">Вес ${idx + 1}, г</label>
          <input id="itemWeight${idx}" name="weight" type="number" min="0" step="1" inputmode="numeric" placeholder="г" value="${weight}">
        </div>
      </div>
    `;
    const weightRows = canEditWeights
      ? (item?.trackNumbers || [])
          .map((track, idx) => weightRowHtml(idx, track, item?.weightsG[idx] ?? ""))
          .join("") || '<div class="empty">Сначала добавьте трек-номера</div>'
      : "";

    drawer(
      isNew ? "Новый товар" : "Редактировать товар",
      `
      <form id="itemForm" class="item-wizard" novalidate>
        ${
          canEditTracks
            ? `<nav class="wizard-steps" aria-label="Шаги редактирования товара">
                <ol class="item-wizard__steps">
                  <li>
                    <button type="button" class="wizard-step" data-step="main">
                      <span class="wizard-step__dot" aria-hidden="true">1</span>
                      <span class="wizard-step__label">Товар</span>
                    </button>
                  </li>
                  <li>
                    <button type="button" class="wizard-step" data-step="tracks">
                      <span class="wizard-step__dot" aria-hidden="true">2</span>
                      <span class="wizard-step__label">Треки</span>
                    </button>
                  </li>
                  <li>
                    <button type="button" class="wizard-step ${canEditWeights ? "" : "is-locked"}" data-step="weights" ${canEditWeights ? "" : 'disabled aria-disabled="true"'} title="${canEditWeights ? "Веса" : "Веса доступны после получения"}">
                      <span class="wizard-step__dot" aria-hidden="true">3</span>
                      <span class="wizard-step__label">Веса</span>
                    </button>
                  </li>
                </ol>
              </nav>`
            : ""
        }
        <div class="item-wizard__panel grid grid-cols-2 gap-3" data-panel="main" ${step === "main" ? "" : "hidden"}>
          <div class="field col-span-2"><label for="itemName">Название *</label><input id="itemName" name="name" required autocomplete="off" value="${esc(item?.name || "")}" ${step === "main" ? "autofocus" : ""}></div>
          <div class="field col-span-2"><label for="itemCustomer">Заказчик *</label>${selectHtml({ id: "itemCustomer", name: "customer_id", required: true, options: customerOptions })}</div>
          <div class="field"><label for="itemPriceCNY">Цена за всю позицию (CNY) *</label><input id="itemPriceCNY" name="priceCNY" type="number" step="0.01" required value="${item?.priceCNY || ""}"></div>
          <div class="field"><label for="itemPriceBYN">Цена за всю позицию (BYN) *</label><input id="itemPriceBYN" name="priceBYN" type="number" step="0.01" required value="${item?.priceBYN || ""}"></div>
          <div class="field"><label for="itemQuantity">Количество *</label><input id="itemQuantity" name="quantity" type="number" step="1" min="1" required value="${item?.quantity || 1}"></div>
          <div class="field"><label for="itemUnit">Единица</label>${unitsSelectHtml({ id: "itemUnit", name: "unit", current: item?.unit })}</div>
          <div class="item-wizard__actions col-span-2">
            ${
              canEditTracks
                ? '<button type="button" class="btn-secondary" data-goto="tracks" enterkeyhint="next">Далее: треки</button>'
                : ""
            }
            <button type="submit" class="btn-primary" enterkeyhint="done">${isNew ? "Добавить" : "Сохранить"}</button>
          </div>
        </div>
        ${
          canEditTracks
            ? `<div class="item-wizard__panel" data-panel="tracks" ${step === "tracks" ? "" : "hidden"}>
                <p class="item-wizard__context"><span>Товар</span> <b>${esc(item?.name || "")}</b></p>
                <fieldset class="item-wizard__tracks">
                  <legend>Трек-номера</legend>
                  <div class="grid gap-2" data-track-rows>${trackRows}</div>
                  <button type="button" class="text-btn" data-add-track-row>${I.plus} Добавить трек</button>
                </fieldset>
                <label class="checkline item-wizard__complete">
                  <input type="checkbox" name="tracksCompleted" ${item?.tracksCompleted ? "checked" : ""}>
                  <span>Треки заполнены</span>
                </label>
                <div class="item-wizard__actions">
                  <button type="button" class="text-btn" data-goto="main">Назад</button>
                  ${canEditWeights ? '<button type="button" class="btn-secondary" data-goto="weights" enterkeyhint="next">Далее: веса</button>' : ""}
                  <button type="submit" class="btn-primary" enterkeyhint="done">Сохранить</button>
                </div>
              </div>`
            : ""
        }
        ${
          canEditWeights
            ? `<div class="item-wizard__panel" data-panel="weights" ${step === "weights" ? "" : "hidden"}>
                <p class="item-wizard__context"><span>Товар</span> <b>${esc(item?.name || "")}</b></p>
                <fieldset class="item-wizard__weights">
                  <legend>Веса треков</legend>
                  <div class="grid gap-2" data-weight-rows>${weightRows}</div>
                </fieldset>
                <div class="item-wizard__actions">
                  <button type="button" class="text-btn" data-goto="tracks">Назад</button>
                  <button type="submit" class="btn-primary" enterkeyhint="done">Сохранить</button>
                </div>
              </div>`
            : ""
        }
      </form>
    `,
    );

    const form = document.getElementById("itemForm") as HTMLFormElement;
    if (!form) return;

    const rowsHost = form.querySelector<HTMLElement>("[data-track-rows]");
    const weightHost = form.querySelector<HTMLElement>("[data-weight-rows]");
    const completeCheckbox = form.querySelector<HTMLInputElement>('input[name="tracksCompleted"]');
    const trackRowsNow = () => Array.from(form.querySelectorAll<HTMLElement>("[data-track-row]"));
    const syncWeightRows = () => {
      if (!weightHost) return;
      const savedWeights = new Map(
        Array.from(weightHost.querySelectorAll<HTMLElement>("[data-weight-row]")).map((row) => [
          row.dataset.track || "",
          row.querySelector<HTMLInputElement>('input[name="weight"]')?.value || "",
        ]),
      );
      const tracks = trackRowsNow()
        .map(
          (row) => row.querySelector<HTMLInputElement>('input[name="track"]')?.value.trim() || "",
        )
        .filter(Boolean);
      weightHost.innerHTML = tracks.length
        ? tracks
            .map((track, idx) => weightRowHtml(idx, track, savedWeights.get(track) ?? ""))
            .join("")
        : '<div class="empty">Сначала добавьте трек-номера</div>';
    };

    const stepButtons = Array.from(form.querySelectorAll<HTMLButtonElement>("[data-step]"));
    const panels = Array.from(form.querySelectorAll<HTMLElement>("[data-panel]"));
    const activate = (next: ItemFormStep) => {
      if (next === "weights") syncWeightRows();
      const nextIndex = stepButtons.findIndex((button) => button.dataset.step === next);
      stepButtons.forEach((button, index) => {
        const active = button.dataset.step === next;
        button.classList.toggle("is-active", active);
        button.classList.toggle("is-done", index < nextIndex);
        if (active) button.setAttribute("aria-current", "step");
        else button.removeAttribute("aria-current");
      });
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.panel !== next;
      });
      const panel = panels.find((p) => p.dataset.panel === next);
      panel?.querySelector<HTMLElement>("input, select, button")?.focus();
    };
    activate(step);

    const goTo = (next: ItemFormStep) => {
      if (next === "tracks" && !form.reportValidity()) return;
      activate(next);
    };
    stepButtons.forEach((button) => {
      on(button, "click", () => goTo(button.dataset.step as ItemFormStep));
    });
    form.querySelectorAll<HTMLButtonElement>("[data-goto]").forEach((button) => {
      on(button, "click", () => goTo(button.dataset.goto as ItemFormStep));
    });

    const reindexTrackRows = () => {
      const rows = trackRowsNow();
      rows.forEach((row, idx) => {
        const trackInput = row.querySelector<HTMLInputElement>('input[name="track"]');
        const trackLabel = row.querySelector<HTMLLabelElement>("[data-track-label]");
        const removeBtn = row.querySelector<HTMLButtonElement>("[data-remove-track]");
        const removeLabel = row.querySelector<HTMLElement>("[data-remove-label]");
        const trackId = `itemTrack${idx}`;
        if (trackInput) {
          trackInput.id = trackId;
          trackInput.placeholder = `Трек ${idx + 1}`;
        }
        if (trackLabel) {
          trackLabel.htmlFor = trackId;
          trackLabel.textContent = `Трек ${idx + 1}`;
        }
        if (removeLabel) removeLabel.textContent = `Удалить трек ${idx + 1}`;
        if (removeBtn) removeBtn.hidden = rows.length === 1;
      });
    };
    reindexTrackRows();

    on(form, "click", (e) => {
      const target = e.target as Element;
      if (target.closest("[data-add-track-row]") && rowsHost) {
        rowsHost.insertAdjacentHTML("beforeend", trackRowHtml(trackRowsNow().length));
        reindexTrackRows();
        trackRowsNow().at(-1)?.querySelector<HTMLInputElement>('input[name="track"]')?.focus();
        return;
      }
      const removeBtn = target.closest<HTMLElement>("[data-remove-track]");
      if (!removeBtn) return;
      const row = removeBtn.closest<HTMLElement>("[data-track-row]");
      if (!row) return;
      if (trackRowsNow().length > 1) row.remove();
      else
        row.querySelectorAll("input").forEach((input) => ((input as HTMLInputElement).value = ""));
      reindexTrackRows();
    });

    on(rowsHost, "input", () => {
      completeCheckbox?.setCustomValidity("");
      completeCheckbox?.removeAttribute("aria-invalid");
    });
    on(completeCheckbox, "change", () => {
      if (!completeCheckbox?.checked) {
        completeCheckbox?.setCustomValidity("");
        completeCheckbox?.removeAttribute("aria-invalid");
        return;
      }
      const hasEmpty = trackRowsNow().some(
        (row) => !row.querySelector<HTMLInputElement>('input[name="track"]')?.value.trim(),
      );
      completeCheckbox.setCustomValidity(hasEmpty ? "Заполните все трек-номера" : "");
      if (hasEmpty) {
        completeCheckbox.setAttribute("aria-invalid", "true");
        completeCheckbox.reportValidity();
      } else {
        completeCheckbox.removeAttribute("aria-invalid");
      }
    });

    on(form, "submit", async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const formData = new FormData(form);
      const rawData = {
        parcelId,
        name: formData.get("name")?.toString().trim() || "",
        customerId: parseInt(formData.get("customer_id")?.toString() || "0"),
        priceCNY: parseFloat(formData.get("priceCNY")?.toString() || "0"),
        priceBYN: parseFloat(formData.get("priceBYN")?.toString() || "0"),
        quantity: parseInt(formData.get("quantity")?.toString() || "1"),
        unit: (formData.get("unit")?.toString() as "pcs" | "packs" | "pairs") || "pcs",
      };
      const data: ParcelItemUpdateInput = { ...rawData };

      const rows = trackRowsNow()
        .map(
          (row) => row.querySelector<HTMLInputElement>('input[name="track"]')?.value.trim() || "",
        )
        .filter(Boolean);
      const tracksComplete = completeCheckbox?.checked || false;
      const hasEmptyTrack = trackRowsNow().some(
        (row) => !row.querySelector<HTMLInputElement>('input[name="track"]')?.value.trim(),
      );
      if (canEditTracks && tracksComplete && hasEmptyTrack) {
        completeCheckbox?.setCustomValidity("Заполните все трек-номера");
        completeCheckbox?.setAttribute("aria-invalid", "true");
        completeCheckbox?.reportValidity();
        return;
      }

      if (canEditTracks && (rows.length > 0 || (item?.trackNumbers.length || 0) > 0)) {
        data.trackNumbers = rows;
        if (canEditWeights) {
          const weights = new Map(
            Array.from(form.querySelectorAll<HTMLElement>("[data-weight-row]")).map((row) => [
              row.dataset.track || "",
              parseInt(
                row.querySelector<HTMLInputElement>('input[name="weight"]')?.value || "0",
                10,
              ) || 0,
            ]),
          );
          data.weightsG = rows.map((track) => weights.get(track) ?? 0);
        }
      }

      if (isNew) {
        const newItem = ParcelItem.create(rawData);
        await parcelItemRepository.save(newItem);
      } else if (item) {
        const { parcelId: _, ...updateData } = data;
        const updated = item.update(updateData);
        await parcelItemRepository.save(updated);
        if (canEditTracks && tracksComplete) {
          await parcelItemService.updateItem(item.id, {
            tracksCompletedAt: new Date().toISOString(),
          });
        }
      }
      closeDrawer();
      renderParcelDetailView();
      toastState.add({ message: "Товар сохранён", type: "success" });
    });
  });
}

async function moveItem(itemId: number): Promise<void> {
  const item = await parcelItemRepository.findById(itemId);
  if (!item) return;

  const parcels = await parcelRepository.findAll();
  const otherDrafts = parcels.filter((p) => p.id !== item.parcelId && p.status === "draft");

  if (otherDrafts.length === 0) {
    toastState.add({ message: "Нет других черновиков для перемещения", type: "warn" });
    return;
  }

  const options = otherDrafts.map((p) => ({
    value: p.id,
    label: `Посылка №${p.id} (${p.formattedDate})`,
  }));

  drawer(
    "Переместить товар",
    `
    <form id="moveForm">
      <div class="field"><label>Выберите посылку</label>${selectHtml({ name: "targetParcel", options })}</div>
      <div class="actions"><button type="submit">Переместить</button></div>
    </form>
  `,
  );

  const form = document.getElementById("moveForm") as HTMLFormElement;
  if (form) {
    on(form, "submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const targetId = parseInt(formData.get("targetParcel")?.toString() || "0");
      if (targetId) {
        await parcelItemRepository.save(item.update({ parcelId: targetId }));
        closeDrawer();
        renderParcelDetailView();
        toastState.add({ message: "Товар перемещён", type: "success" });
      }
    });
  }
}

async function deleteItem(itemId: number): Promise<void> {
  confirmDrawer(
    "Удалить товар",
    "Товар будет удалён. Это действие нельзя отменить.",
    "Удалить",
    async () => {
      await parcelItemRepository.delete(itemId);
      renderParcelDetailView();
      toastState.add({ message: "Товар удалён", type: "success" });
    },
  );
}

// Auto-render when route becomes active
router.subscribe((route, params) => {
  if (route === "parcel") {
    const parcelId = parseInt(params.parcelId || "0");
    if (parcelId) {
      uiState.setCurrentParcelId(parcelId);
    }
    renderParcelDetailView();
  }
});
