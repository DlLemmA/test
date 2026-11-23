import { parcelRepository, parcelItemRepository } from "./infrastructure";
import { getParcelStatement } from "@/features/statements/service";
import { parcelItemService, parcelService, paymentService } from "@/features/shared/wiring";
import { customerRepository } from "@/features/customers/infrastructure";
import { drawer, confirmDrawer, closeDrawer } from "@/core/drawer";
import { createListenerScope } from "@/core/listeners";
import type { ListenerScope } from "@/core/listeners";
import { router, uiState, toastState } from "@/core/state";
import type { RouteParams } from "@/core/state";
import type { ViewHandle } from "@/app/ViewHandle";
import { I, esc, kg, money } from "@/core/utils";
import { customerLabel } from "@/features/customers/ui/CustomerPresentation";
import { formatDateNumeric, parcelDate } from "./ui/ParcelPresentation";
import {
  Parcel,
  ParcelItem,
  itemsWithoutTracks,
  parcelReadiness,
  type ParcelItemUpdateInput,
} from "./domain";
import type { CustomerBalance } from "@/features/balances/domain";
import type { SettlementFacts } from "@/features/settlement/domain";
import { nextStepLabel } from "./ui/ParcelNextStatus";
import { parcelStatusInfo } from "./ui/ParcelStatusInfo";
import { selectHtml } from "./ui/Select";
import { unitsSelectHtml } from "./ui/UnitsSelect";
import { applyItemGroupsSearch, itemSearchCountText, renderItemGroups } from "./ui/ItemGroups";
import { finishBlockMessage, finishHint, shipBlockMessage } from "./ui/ReadinessCopy";
import { openReceiveFlow } from "./ReceiveFlow";
import { exportParcel } from "./ParcelListView";

interface DetailContext {
  host: HTMLElement;
  scope: ListenerScope;
  itemSearch: { parcelId: number; query: string; missingTracksOnly: boolean };
  openCustomerGroups: Set<number>;
  announceTimer: ReturnType<typeof setTimeout> | null;
  commentFocused: boolean;
  commentDraft: string | null;
  refresh: () => void;
}

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

export function mountParcelDetailView(host: HTMLElement): ViewHandle {
  const scope = createListenerScope();
  const ctx: DetailContext = {
    host,
    scope,
    itemSearch: { parcelId: 0, query: "", missingTracksOnly: false },
    openCustomerGroups: new Set(),
    announceTimer: null,
    commentFocused: false,
    commentDraft: null,
    refresh: () => {},
  };

  // Copy button: native Invoker Commands where supported, click fallback otherwise.
  scope.on(
    document,
    "command",
    (event) => {
      const commandEvent = event as Event & { command?: string; source?: HTMLElement };
      if (commandEvent.command !== "--copy-tracks") return;
      const source = commandEvent.target as HTMLElement | null;
      if (source) copyParcelTracks(commandEvent.source as HTMLElement, source);
    },
    { capture: true },
  );

  if (!("CommandEvent" in window)) {
    scope.on(document, "click", (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
        'button[command="--copy-tracks"]',
      );
      if (!button) return;
      const source = document.getElementById(button.getAttribute("commandfor") || "");
      if (source) copyParcelTracks(button, source);
    });
  }

  async function render(params: RouteParams): Promise<void> {
    if (scope.signal.aborted) return;
    const parcelId = Number(params.parcelId);
    if (!Number.isInteger(parcelId) || parcelId <= 0) {
      router.navigate("parcels");
      return;
    }
    uiState.setCurrentParcelId(parcelId);

    const result = await getParcelStatement(parcelId);
    if (scope.signal.aborted) return;
    if (!result) {
      uiState.setCurrentParcelId(null);
      router.navigate("parcels");
      return;
    }

    const { parcel, items, customers, balance, settlement } = result;

    if (ctx.announceTimer) {
      clearTimeout(ctx.announceTimer);
      ctx.announceTimer = null;
    }
    if (ctx.itemSearch.parcelId !== parcel.id) {
      ctx.itemSearch.parcelId = parcel.id;
      ctx.itemSearch.query = "";
      ctx.itemSearch.missingTracksOnly = false;
      ctx.openCustomerGroups.clear();
    }

    const trackNumbers = items.flatMap((item) =>
      item.trackNumbers.map((track) => track.trim()).filter(Boolean),
    );

    const date = parcelDate(parcel);
    const status = parcelStatusInfo(parcel.status);
    const missingTracks = parcel.status === "draft" ? itemsWithoutTracks(items) : 0;
    const boxWeight = parcel.boxWeightG || 0;
    const tariffPerKg =
      parcel.shippingCostBYN && parcel.boxWeightG
        ? parcel.shippingCostBYN / (parcel.boxWeightG / 1000)
        : 0;

    ctx.host.innerHTML = `
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

      ${renderComment(parcel, ctx)}

      ${
        items.length > 0
          ? `<search class="item-search" aria-label="Поиск товаров в посылке">
              <label class="sr-only" for="parcelItemSearch">Поиск товаров</label>
              <input type="search" id="parcelItemSearch" class="item-search__input" name="itemSearch"
                placeholder="Название, заказчик или трек" value="${esc(ctx.itemSearch.query)}"
                autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="search">
              ${
                parcel.status === "draft" && (missingTracks > 0 || ctx.itemSearch.missingTracksOnly)
                  ? `<button type="button" id="missingTracksFilter" class="item-search__filter${ctx.itemSearch.missingTracksOnly ? " is-active" : ""}"
                      aria-pressed="${ctx.itemSearch.missingTracksOnly}" title="${ctx.itemSearch.missingTracksOnly ? "Снять фильтр «Без треков»" : "Показать товары без треков"}">Без треков <b>${missingTracks}</b><span class="item-search__filter-x" aria-hidden="true">×</span></button>`
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
            settlement,
            ctx.openCustomerGroups,
          )}
          ${items.length > 0 ? '<p class="empty item-search__empty" id="parcelItemNoResults" hidden>Ничего не найдено. Измените запрос.</p>' : ""}
        </div>
      </section>
    </div>
  `;

    bindParcelDetailActions(parcel, items, settlement, ctx);
  }

  ctx.refresh = () => {
    void render(router.currentParams);
  };

  return {
    render,
    dispose: () => {
      if (ctx.announceTimer) clearTimeout(ctx.announceTimer);
      scope.dispose();
    },
  };
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

function renderComment(parcel: Parcel, ctx: DetailContext): string {
  const value = ctx.commentDraft ?? parcel.comment ?? "";
  const rows = ctx.commentFocused ? Math.min(16, Math.max(2, value.split("\n").length)) : 1;
  return `
  <div class="parcel-comment${ctx.commentFocused ? " is-expanded" : ""}" id="parcelCommentBlock">
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
    case "received": {
      const hint = finishHint(parcelReadiness(parcel, items).finish);
      return `<button type="button" class="btn-primary btn-action" id="markAsDone">${I.checkCircle} Завершить</button>
      <button type="button" class="text-btn" id="rescanParcel">${I.scan} Сканировать ещё</button>
      ${hint ? `<p class="detail-action__hint">${esc(hint)}</p>` : ""}`;
    }
    case "done":
      return `<button type="button" class="text-btn" id="exportParcel">${I.sheet} Экспорт в Excel</button>`;
  }
}

function applyItemSearch(ctx: DetailContext): void {
  const input = document.getElementById("parcelItemSearch") as HTMLInputElement | null;
  const list = document.getElementById("parcelItemsList");
  if (!input || !list) return;

  const missingOnly =
    ctx.itemSearch.missingTracksOnly && !!document.getElementById("missingTracksFilter");
  const result = applyItemGroupsSearch(list, input.value, missingOnly);
  const countText = itemSearchCountText(result);

  const noResults = document.getElementById("parcelItemNoResults");
  if (noResults) {
    noResults.hidden = (result.queryLength === 0 && !result.missingOnly) || result.visible > 0;
  }

  const count = document.getElementById("parcelItemSearchCount");
  if (ctx.announceTimer) clearTimeout(ctx.announceTimer);
  ctx.announceTimer = setTimeout(() => {
    if (!count) return;
    count.textContent = countText;
    count.hidden = countText.length === 0;
  }, 180);
}

function bindParcelDetailActions(
  parcel: Parcel,
  items: ParcelItem[],
  settlement: SettlementFacts,
  ctx: DetailContext,
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
      if (ctx.commentFocused) return;
      ctx.commentFocused = true;
      commentBlock.classList.add("is-expanded");
      resize();
    };
    const collapse = () => {
      ctx.commentFocused = false;
      commentBlock.classList.remove("is-expanded");
      commentText.style.height = "";
    };

    ctx.scope.on(commentText, "focus", expand);
    ctx.scope.on(commentText, "click", expand);
    ctx.scope.on(commentText, "input", () => {
      ctx.commentDraft = commentText.value;
      if (ctx.commentFocused) resize();
    });
    ctx.scope.on(commentText, "keydown", (e) => {
      if (e.key === "Escape") commentText.blur();
    });
    ctx.scope.on(commentText, "blur", () => {
      collapse();
      const next = (ctx.commentDraft ?? commentText.value).trim();
      ctx.commentDraft = null;
      if (next === (parcel.comment || "")) return;
      void parcelService
        .updateParcel(parcel.id, { comment: next || null })
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
    missingFilter?.classList.toggle("is-active", ctx.itemSearch.missingTracksOnly);
    missingFilter?.setAttribute("aria-pressed", String(ctx.itemSearch.missingTracksOnly));
    missingFilter?.setAttribute(
      "title",
      ctx.itemSearch.missingTracksOnly ? "Снять фильтр «Без треков»" : "Показать товары без треков",
    );
  };
  const clearItemSearch = (): void => {
    if (!itemSearch) return;
    itemSearch.value = "";
    ctx.itemSearch.query = "";
    ctx.itemSearch.missingTracksOnly = false;
    syncMissingFilter();
    applyItemSearch(ctx);
  };
  ctx.scope.on(missingFilter, "click", () => {
    ctx.itemSearch.missingTracksOnly = !ctx.itemSearch.missingTracksOnly;
    syncMissingFilter();
    applyItemSearch(ctx);
  });

  if (itemSearch) {
    ctx.scope.on(itemSearch, "input", () => {
      ctx.itemSearch.query = itemSearch.value;
      applyItemSearch(ctx);
    });
    // The native cancel button of type="search" fires `search` as well.
    ctx.scope.on(itemSearch, "search", () => {
      ctx.itemSearch.query = itemSearch.value;
      applyItemSearch(ctx);
    });
    ctx.scope.on(itemSearch, "keydown", (e) => {
      if (e.key === "Escape" && itemSearch.value) {
        e.preventDefault();
        clearItemSearch();
      }
    });
  }
  applyItemSearch(ctx);

  document.getElementById("exportParcel")?.addEventListener("click", async () => {
    await exportParcel(parcel);
  });

  // Ship parcel — box weight is entered before the parcel leaves
  document.getElementById("shipParcel")?.addEventListener("click", () => {
    const message = shipBlockMessage(parcelReadiness(parcel, items).ship);
    if (message) {
      toastState.add({ message, type: "error" });
      return;
    }
    openShipForm(parcel, ctx);
  });

  // Receiving starts immediately: mark the parcel received (date + status), then scan weights.
  const openScan = (target: Parcel = parcel) => void openReceiveFlow(target, () => ctx.refresh());
  document.getElementById("receiveParcel")?.addEventListener("click", async () => {
    try {
      const received = await parcelService.receiveParcel(
        parcel.id,
        parcel.boxWeightG || 0,
        parcel.shippingCostBYN || 0,
      );
      openScan(received);
      void ctx.refresh();
    } catch (err) {
      toastState.add({ message: "Не удалось отметить получение", type: "error" });
      console.error(err);
    }
  });
  document.getElementById("rescanParcel")?.addEventListener("click", () => openScan());

  // Mark parcel as done (received -> done) only when every item is weighed or lost.
  document.getElementById("markAsDone")?.addEventListener("click", async () => {
    const message = finishBlockMessage(parcelReadiness(parcel, items).finish, items);
    if (message) {
      toastState.add({ message, type: "error" });
      return;
    }
    try {
      await parcelService.markAsDoneParcel(parcel.id);
      ctx.refresh();
      toastState.add({ message: "Посылка завершена", type: "success" });
    } catch (err) {
      toastState.add({ message: "Не удалось завершить посылку", type: "error" });
      console.error(err);
    }
  });

  // Edit parcel
  document.getElementById("editParcel")?.addEventListener("click", () => {
    openParcelEditForm(parcel, ctx);
  });

  // Add item (for draft without batch form)
  document.getElementById("addItem")?.addEventListener("click", () => {
    openItemForm(null, parcel.id, parcel.status, "main", ctx);
  });

  // Item actions
  const listRoot = document.getElementById("parcelItemsList");
  if (listRoot) {
    // Payment checkboxes live inside the group's <summary>; their clicks must not toggle it.
    listRoot.querySelectorAll<HTMLElement>("summary label").forEach((label) => {
      ctx.scope.on(label, "click", (event) => event.stopPropagation());
    });
    listRoot.querySelectorAll<HTMLDetailsElement>("details[data-item-group]").forEach((group) => {
      const customerId = Number(group.dataset.customer);
      ctx.scope.on(group, "toggle", () => {
        if (group.open) ctx.openCustomerGroups.add(customerId);
        else ctx.openCustomerGroups.delete(customerId);
      });
    });
    listRoot.querySelectorAll("[data-edit]").forEach((b) => {
      const el = b as HTMLElement;
      ctx.scope.on(el, "click", () => {
        el.closest("details")?.removeAttribute("open");
        openItemForm(
          parseInt(el.dataset.edit!),
          parcel.id,
          parcel.status,
          defaultItemStep(parcel.status),
          ctx,
        );
      });
    });
    listRoot.querySelectorAll("[data-move]").forEach((b) => {
      const el = b as HTMLElement;
      ctx.scope.on(el, "click", () => {
        el.closest("details")?.removeAttribute("open");
        moveItem(parseInt(el.dataset.move!), ctx);
      });
    });
    listRoot.querySelectorAll("[data-delete]").forEach((b) => {
      const el = b as HTMLElement;
      ctx.scope.on(el, "click", () => {
        el.closest("details")?.removeAttribute("open");
        deleteItem(parseInt(el.dataset.delete!), ctx);
      });
    });

    // Add track button — open the item wizard straight on the tracks step.
    listRoot.querySelectorAll("[data-add-track]").forEach((b) => {
      const el = b as HTMLElement;
      ctx.scope.on(el, "click", () => {
        openItemForm(parseInt(el.dataset.addTrack!), parcel.id, parcel.status, "tracks", ctx);
      });
    });

    // Toggle item payment (shipped/received)
    listRoot.querySelectorAll("[data-toggle-payment]").forEach((btn) => {
      const el = btn as HTMLElement;
      ctx.scope.on(el, "click", async () => {
        const itemId = parseInt(el.dataset.togglePayment!);
        const item = items.find((i) => i.id === itemId);
        if (!item) return;
        await paymentService.toggleItemPayment(parcel.id, itemId, item.customerId);
        ctx.refresh();
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
    const allPaid = customerItems.every((i) => settlement.paidItems.has(i.id));
    el.indeterminate = !allPaid && customerItems.some((i) => settlement.paidItems.has(i.id));

    ctx.scope.on(el, "change", async () => {
      await paymentService.setParcelPayment(
        parcel.id,
        customerId,
        customerItems.map((item) => item.id),
        el.checked,
        false,
      );
      ctx.refresh();
    });
  });

  document.querySelectorAll(".shipping-paid").forEach((checkbox) => {
    const el = checkbox as HTMLInputElement;
    const customerId = parseInt(el.dataset.customer!);

    ctx.scope.on(el, "change", async () => {
      if (!settlement.deliveryInvoiced) return;
      await paymentService.toggleShippingPayment(parcel.id, customerId);
      ctx.refresh();
    });
  });
}

// ============================================
// Helper Functions
// ============================================

function openShipForm(parcel: Parcel, ctx: DetailContext): void {
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
    ctx.scope.on(input, "input", () => {
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
    });
  });
  ctx.scope.on(form, "submit", async (e) => {
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
    await parcelService.shipParcel(parcel.id, boxWeightG, shippingCostBYN);
    closeDrawer();
    ctx.refresh();
    toastState.add({ message: "Посылка отправлена", type: "success" });
  });
}

async function openParcelEditForm(parcel: Parcel, ctx: DetailContext): Promise<void> {
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
    ctx.scope.on(form, "submit", async (e) => {
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
      ctx.refresh();
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
  ctx: DetailContext,
): void {
  if (itemId) {
    parcelItemRepository.findById(itemId).then((item) => {
      if (item) renderItemForm(item, parcelId, false, parcelStatus, initialStep, ctx);
    });
  } else {
    renderItemForm(null, parcelId, true, parcelStatus, "main", ctx);
  }
}

function renderItemForm(
  item: ParcelItem | null,
  parcelId: number,
  isNew: boolean,
  parcelStatus: Parcel["status"],
  initialStep: ItemFormStep,
  ctx: DetailContext,
): void {
  customerRepository.findAll().then((customers) => {
    const customerOptions = customers.map((c) => ({
      value: c.id,
      label: customerLabel(c),
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
      ctx.scope.on(button, "click", () => goTo(button.dataset.step as ItemFormStep));
    });
    form.querySelectorAll<HTMLButtonElement>("[data-goto]").forEach((button) => {
      ctx.scope.on(button, "click", () => goTo(button.dataset.goto as ItemFormStep));
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

    ctx.scope.on(form, "click", (e) => {
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

    ctx.scope.on(rowsHost, "input", () => {
      completeCheckbox?.setCustomValidity("");
      completeCheckbox?.removeAttribute("aria-invalid");
    });
    ctx.scope.on(completeCheckbox, "change", () => {
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

    ctx.scope.on(form, "submit", async (e) => {
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
      ctx.refresh();
      toastState.add({ message: "Товар сохранён", type: "success" });
    });
  });
}

async function moveItem(itemId: number, ctx: DetailContext): Promise<void> {
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
    label: `Посылка №${p.id} (${formatDateNumeric(p.createdAt)})`,
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
    ctx.scope.on(form, "submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const targetId = parseInt(formData.get("targetParcel")?.toString() || "0");
      if (targetId) {
        await parcelItemRepository.save(item.update({ parcelId: targetId }));
        closeDrawer();
        ctx.refresh();
        toastState.add({ message: "Товар перемещён", type: "success" });
      }
    });
  }
}

async function deleteItem(itemId: number, ctx: DetailContext): Promise<void> {
  confirmDrawer(
    "Удалить товар",
    "Товар будет удалён. Это действие нельзя отменить.",
    "Удалить",
    async () => {
      await parcelItemRepository.delete(itemId);
      ctx.refresh();
      toastState.add({ message: "Товар удалён", type: "success" });
    },
  );
}
