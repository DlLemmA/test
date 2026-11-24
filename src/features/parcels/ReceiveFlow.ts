import { customerRepository } from "@/features/customers/infrastructure";
import type { Customer } from "@/features/customers/domain";
import { parcelItemRepository, parcelRepository } from "./infrastructure";
import { parcelCommands } from "@/features/shared/wiring";
import { toastState } from "@/core/state";
import { I, esc, kg, money, t } from "@/core/utils";
import { customerLabel } from "@/features/customers/ui/CustomerPresentation";
import { ITEM_FORMS, TRACK_FORMS } from "./ui/ParcelPresentation";
import { shippingInfoComplete } from "@/features/settlement/domain";
import type { Parcel, ParcelItem } from "./domain";
import {
  currentItems,
  initialReceivingState,
  isUnitDone,
  itemsToFinish,
  receivingFacts,
  receivingReducer,
  weightsForItem,
  type ReceivingEvent,
  type ReceivingUnit,
} from "./receiving/Receiving";
import { cameraScanner, type Scanner } from "./receiving/scanner";

// ============================================
// Receiving ports. The view only orchestrates: load once, persist weights as
// they are entered, mark losses and commit item statuses. The parcel itself
// is already received by ParcelDetailView — no second status transition here.
// ============================================

export interface ReceiveFlowStore {
  load(parcelId: number): Promise<{ parcel: Parcel; items: ParcelItem[]; customers: Customer[] }>;
  saveWeights(itemId: number, weightsG: number[]): Promise<ParcelItem>;
  markLost(itemId: number): Promise<ParcelItem>;
  finishItem(itemId: number): Promise<ParcelItem>;
}

export interface ReceiveFlowDeps {
  store: ReceiveFlowStore;
  scanner: Scanner;
  onComplete: () => void;
}

const defaultStore: ReceiveFlowStore = {
  async load(parcelId) {
    const [parcel, items, customers] = await Promise.all([
      parcelRepository.findById(parcelId),
      parcelItemRepository.findByParcelId(parcelId),
      customerRepository.findAll(),
    ]);
    if (!parcel) throw new Error("Посылка не найдена");
    return { parcel, items, customers };
  },
  async saveWeights(itemId, weightsG) {
    return parcelCommands.updateItem(itemId, { weightsG });
  },
  async markLost(itemId) {
    return parcelCommands.updateItem(itemId, { status: "lost" });
  },
  async finishItem(itemId) {
    return parcelCommands.updateItem(itemId, { status: "received" });
  },
};

export async function openReceiveFlow(parcel: Parcel, onComplete: () => void): Promise<void> {
  await mountReceiveFlow(parcel.id, {
    store: defaultStore,
    scanner: cameraScanner(),
    onComplete,
  });
}

/** The whole flow runs with any Scanner/Store pair — no camera needed in tests. */
export async function mountReceiveFlow(parcelId: number, deps: ReceiveFlowDeps): Promise<void> {
  const { parcel, items, customers } = await deps.store.load(parcelId);
  let state = initialReceivingState(parcel, items, customers);
  const facts = () => receivingFacts(state);

  document.getElementById("receiveFlow")?.remove();

  const isRescan = facts().isRescan;
  const dialog = document.createElement("dialog");
  dialog.id = "receiveFlow";
  dialog.className = "rf-dialog";
  dialog.setAttribute("aria-labelledby", "rfTitle");
  dialog.innerHTML = `
    <div class="rf">
      <header class="rf-topbar">
        <button type="button" class="rf-icon-btn" id="rfClose" aria-label="Закрыть">${I.x}</button>
        <div class="rf-heading">
          <b id="rfTitle">Посылка №${parcel.id}</b>
          <span id="rfProgress"></span>
        </div>
        <button type="button" class="rf-top-action" id="rfHeaderDone">${isRescan ? "Сохранить" : "Принять товары"}</button>
      </header>
      <div class="rf-progress-track" aria-hidden="true"><div id="rfProgressBar"></div></div>
      <div class="rf-camera">
        <video id="rfVideo" muted playsinline autoplay></video>
        <div class="rf-reticle" aria-hidden="true"></div>
        <p class="rf-hint" id="rfHint">Сканируйте трек-номер</p>
        <div class="rf-last" id="rfLast" aria-live="polite"></div>
      </div>
      <section class="rf-sheet" id="rfSheet"></section>
    </div>
  `;
  document.body.appendChild(dialog);
  dialog.showModal();

  const sheet = dialog.querySelector<HTMLElement>("#rfSheet")!;
  const video = dialog.querySelector<HTMLVideoElement>("#rfVideo")!;
  const hint = dialog.querySelector<HTMLElement>("#rfHint")!;
  const last = dialog.querySelector<HTMLElement>("#rfLast")!;
  const progress = dialog.querySelector<HTMLElement>("#rfProgress")!;
  const progressBar = dialog.querySelector<HTMLElement>("#rfProgressBar")!;

  function q<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return dialog.querySelector<T>(`#${id}`);
  }

  // Camera and the manual search box are view details, not flow facts.
  let cameraOn = false;
  let cameraWanted = true;
  let search = "";
  let closed = false;
  let lastTicketKey: string | null = null;

  function syncCamera(): void {
    const shouldRun =
      !closed && state.step === "scanning" && state.mode === "camera" && cameraWanted;
    if (shouldRun && !cameraOn) {
      cameraOn = true;
      hint.textContent = "Наведите камеру на штрихкод";
      void deps.scanner
        .start(video, (code) => {
          if (cameraOn) handleCode(code);
        })
        .catch(() => {
          cameraOn = false;
          cameraWanted = false;
          hint.textContent = "Камера недоступна — введите трек вручную";
          updateCameraToggle();
        });
    } else if (!shouldRun && cameraOn) {
      deps.scanner.stop();
      cameraOn = false;
    }
    updateCameraToggle();
  }

  function updateCameraToggle(): void {
    const toggle = q("rfToggleCamera");
    if (toggle) toggle.textContent = cameraOn ? "Остановить камеру" : "Включить камеру";
  }

  function focusField(id: string, select = false): void {
    requestAnimationFrame(() => {
      const el = q<HTMLInputElement>(id);
      if (!el) return;
      el.focus({ preventScroll: true });
      if (select) el.select();
    });
  }

  function dispatch(event: ReceivingEvent): void {
    const next = receivingReducer(state, event);
    if (next === state) return;
    state = next;
    render();
  }

  function renderChrome(): void {
    const { units, remaining, totalWeightG } = facts();
    const processed = units - remaining;
    progress.textContent = `${processed} / ${t(TRACK_FORMS, units)} · ${totalWeightG} г`;
    progressBar.style.width = `${units ? (processed / units) * 100 : 100}%`;
  }

  function customerName(customerId: number): string {
    const customer = state.customers.find((entry) => entry.id === customerId);
    return customer ? customerLabel(customer) : "";
  }

  function siblingsHtml(unit: ReceivingUnit): string {
    const list = state.units.filter((candidate) => candidate.itemId === unit.itemId);
    if (list.length < 2) return "";
    return `<div class="rf-siblings" role="group" aria-label="Треки этого товара">
      ${list
        .map((candidate) => {
          const weight = state.weights.get(candidate.key);
          const cls =
            candidate.key === unit.key
              ? "is-current"
              : isUnitDone(state, candidate)
                ? "is-done"
                : "";
          return `<button type="button" class="rf-chip ${cls}" data-action="ticket" data-key="${candidate.key}" data-sibling="${candidate.key}" ${candidate.key === unit.key ? 'aria-current="true"' : ""}>${weight ? I.check : ""}${candidate.idx + 1}${weight ? ` · ${weight} г` : ""}</button>`;
        })
        .join("")}
    </div>`;
  }

  function manualRowsHtml(): string {
    return currentItems(state)
      .filter((item) => state.units.some((unit) => unit.itemId === item.id))
      .map((item) => {
        const list = state.units.filter((unit) => unit.itemId === item.id);
        const needle = `${item.name} ${customerName(item.customerId)} ${list
          .map((unit) => unit.track)
          .join(" ")}`.toLowerCase();
        return `
          <div class="rf-manual-item" data-search="${esc(needle)}" ${search && !needle.includes(search.trim().toLowerCase()) ? "hidden" : ""}>
            <div class="rf-manual-name">${esc(item.name)}<span>${esc(customerName(item.customerId))}</span></div>
            ${list
              .map((unit) => {
                const fieldId = `mw_${unit.key.replace(":", "_")}`;
                return `<div class="rf-manual-row">
                  <span class="rf-manual-track">${esc(unit.track)}</span>
                  <label class="visually-hidden" for="${fieldId}">Вес трека ${unit.idx + 1} товара ${esc(item.name)}</label>
                  <input id="${fieldId}" data-weight-key="${unit.key}" class="rf-manual-weight" type="number" inputmode="numeric" min="0" step="1" placeholder="г" value="${state.weights.get(unit.key) ?? ""}">
                </div>`;
              })
              .join("")}
          </div>`;
      })
      .join("");
  }

  function finishHtml(): string {
    const current = facts();
    const hasShippingInfo = shippingInfoComplete(state.parcel);
    return `
      <div class="rf-grab"></div>
      <h2 class="rf-title">${isRescan ? "Сохранить веса" : "Принять товары"}</h2>
      <p class="rf-sub">Взвешено ${current.weighed} из ${t(TRACK_FORMS, current.units)} · ${current.totalWeightG} г товаров</p>
      <p class="rf-sub rf-shipping">Вес всей посылки ${kg(state.parcel.boxWeightG ?? 0)} кг · доставка ${money(state.parcel.shippingCostBYN ?? 0)}</p>
      ${current.remaining ? `<div class="rf-warn">Не обработано ${t(TRACK_FORMS, current.remaining)} — ${isRescan ? "веса можно сохранить позже" : "можно принять и без них"}.</div>` : ""}
      ${hasShippingInfo ? "" : '<div class="rf-warn">Вес посылки и доставка вводятся при отправке. Заполните их в редактировании посылки.</div>'}
      <p class="rf-error" id="rfFinishError" role="alert" ${state.error ? "" : "hidden"}>${esc(state.error ?? "")}</p>
      <button type="button" class="rf-primary" id="rfConfirm" data-action="confirm" ${hasShippingInfo && !state.saving ? "" : "disabled"}>${I.check} ${isRescan ? "Сохранить веса" : "Принять товары"}</button>
      <button type="button" class="rf-link" id="rfBackTracks" data-action="back">← Вернуться к трекам</button>
    `;
  }

  function renderSheet(): void {
    switch (state.step) {
      case "start":
        sheet.innerHTML = `
          <div class="rf-grab"></div>
          <h2 class="rf-title">Приёмка товаров</h2>
          <p class="rf-sub">${t(TRACK_FORMS, state.units.length)} · ${t(ITEM_FORMS, state.items.length)}. Сканируйте по одному — вес сохраняется сразу.</p>
          <button type="button" class="rf-primary" id="rfStart" data-action="startScanning" autofocus>${I.scan} Начать сканирование</button>
          <button type="button" class="rf-secondary" id="rfManualStart" data-action="startManual">Ввести веса списком</button>
          <p class="rf-note">Камеру можно выключить: трек всегда можно ввести с клавиатуры.</p>
        `;
        break;
      case "scanning":
        hint.textContent = "Сканируйте трек-номер";
        sheet.innerHTML = `
          <form class="rf-scanbar" id="rfScanForm">
            <label class="visually-hidden" for="rfCodeInput">Трек-номер</label>
            <input id="rfCodeInput" name="code" type="text" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="done" placeholder="Ввести трек вручную">
            <button type="submit" class="rf-send" aria-label="Найти трек">${I.arrowRight}</button>
          </form>
          <div class="rf-scan-actions">
            <button type="button" class="rf-link" id="rfToggleCamera" data-action="toggleCamera">${cameraOn ? "Остановить камеру" : "Включить камеру"}</button>
            <button type="button" class="rf-link" id="rfOpenManual" data-action="startManual">Все треки списком</button>
          </div>
        `;
        break;
      case "ticket": {
        const unit = state.activeKey ? state.byKey.get(state.activeKey) : undefined;
        const item = unit ? state.items.find((entry) => entry.id === unit.itemId) : undefined;
        if (!unit || !item) return;
        const current = state.weights.get(unit.key);
        sheet.innerHTML = `
          <div class="rf-grab"></div>
          <div class="rf-ticket-head">
            <span class="rf-pill">Трек ${unit.idx + 1} из ${state.units.filter((candidate) => candidate.itemId === unit.itemId).length}</span>
            <span class="rf-ticket-customer">${esc(customerName(item.customerId))}</span>
          </div>
          <h2 class="rf-ticket-title">${esc(item.name)}</h2>
          <div class="rf-track">${esc(unit.track)}</div>
          ${siblingsHtml(unit)}
          <form class="rf-weight-form" id="rfWeightForm">
            <label class="rf-weight-label" for="rfWeight">Вес этого трека, г</label>
            <input id="rfWeight" name="weight" class="rf-weight-input" type="number" inputmode="numeric" enterkeyhint="done" min="0" step="1" required autocomplete="off" value="${current ?? ""}">
            <p class="rf-error" id="rfWeightError" role="alert" hidden>Введите вес — число от 0 граммов.</p>
            <button type="submit" class="rf-primary" id="rfSaveWeight">${I.check} ${current ? "Перезаписать вес" : "Сохранить вес"}</button>
          </form>
          <p class="rf-keyhint">Коснитесь поля — клавиатура откроется сразу.</p>
          <div class="rf-row">
            <button type="button" class="rf-secondary" id="rfLost" data-action="lost">Потерян</button>
            <button type="button" class="rf-secondary" id="rfSkip" data-action="skip">Пропустить</button>
          </div>
          ${state.units.some((candidate) => candidate.itemId === unit.itemId) ? '<button type="button" class="rf-link" id="rfSiblingNext" data-action="nextSibling">Следующий трек товара →</button>' : ""}
        `;
        if (state.activeKey !== lastTicketKey) {
          lastTicketKey = state.activeKey;
          focusField("rfWeight", true);
        }
        break;
      }
      case "choose":
        sheet.innerHTML = `
          <div class="rf-grab"></div>
          <h2 class="rf-title">Трек у нескольких товаров</h2>
          <p class="rf-sub">Выберите товар для трека ${esc(state.code)}</p>
          <div class="rf-choices">
            ${state.choices
              .map((key) => {
                const unit = state.byKey.get(key);
                const item = unit
                  ? state.items.find((entry) => entry.id === unit.itemId)
                  : undefined;
                if (!unit || !item) return "";
                const list = state.units.filter((candidate) => candidate.itemId === unit.itemId);
                const weight = state.weights.get(unit.key);
                return `<button type="button" class="rf-choice" data-action="choose" data-key="${unit.key}" data-choose="${unit.key}">
                  <b>${esc(item.name)}</b>
                  <span>${esc(customerName(item.customerId))} · ${unit.idx + 1}/${list.length}${weight ? ` · ${weight} г` : ""}</span>
                </button>`;
              })
              .join("")}
          </div>
          <button type="button" class="rf-link" id="rfChooseBack" data-action="back">← Сканировать другой</button>
        `;
        break;
      case "unknown":
        sheet.innerHTML = `
          <div class="rf-grab"></div>
          <h2 class="rf-title">Трек не найден</h2>
          <div class="rf-track">${esc(state.code)}</div>
          <p class="rf-sub">Этого трека нет в посылке №${parcel.id}. Проверьте номер или выберите товар вручную.</p>
          <button type="button" class="rf-primary" id="rfUnknownManual" data-action="startManual">Выбрать товар вручную</button>
          <button type="button" class="rf-secondary" id="rfUnknownRetry" data-action="back">Сканировать ещё</button>
        `;
        break;
      case "manual": {
        const rows = manualRowsHtml();
        sheet.innerHTML = `
          <div class="rf-grab"></div>
          <h2 class="rf-title">Все треки списком</h2>
          <label class="visually-hidden" for="rfSearch">Поиск товара или трека</label>
          <input type="search" id="rfSearch" class="rf-search" placeholder="Найти товар или трек" value="${esc(search)}">
          <form id="rfManualForm" class="rf-manual-form">
            ${rows || '<p class="rf-sub">В этой посылке нет треков.</p>'}
            <button type="submit" class="rf-primary" id="rfSaveAll">${I.check} Сохранить веса</button>
          </form>
          <button type="button" class="rf-link" id="rfBackScan" data-action="backToScan">← К сканеру</button>
        `;
        break;
      }
      case "finish":
        sheet.innerHTML = finishHtml();
        break;
    }
  }

  function render(): void {
    renderChrome();
    renderSheet();
    syncCamera();
  }

  function handleCode(code: string): void {
    if (!code) return;
    last.textContent = code;
    dispatch({ type: "scan", code });
    if (state.step === "unknown") {
      navigator.vibrate?.([20, 50, 20]);
      hint.textContent = "Трек не найден в этой посылке";
    } else {
      navigator.vibrate?.(15);
      hint.textContent = "Трек найден";
    }
  }

  async function persistWeights(itemId: number): Promise<void> {
    try {
      const saved = await deps.store.saveWeights(itemId, weightsForItem(state, itemId));
      dispatch({ type: "itemSaved", item: saved });
    } catch (err) {
      console.error(err);
    }
  }

  async function saveWeight(unit: ReceivingUnit, grams: number): Promise<void> {
    dispatch({ type: "weight", key: unit.key, grams });
    await persistWeights(unit.itemId);
    navigator.vibrate?.(18);
    toastState.add({
      message: `${state.items.find((item) => item.id === unit.itemId)?.name ?? "Товар"} · трек ${unit.idx + 1} · ${grams} г сохранено`,
      type: "success",
    });
  }

  async function markLost(itemId: number): Promise<void> {
    const item = state.items.find((entry) => entry.id === itemId);
    if (!item) return;
    try {
      const saved = await deps.store.markLost(itemId);
      dispatch({ type: "lost", itemId });
      dispatch({ type: "itemSaved", item: saved });
      toastState.add({ message: `${item.name} — потерян`, type: "warn" });
    } catch (err) {
      console.error(err);
    }
  }

  async function submitManual(form: HTMLFormElement): Promise<void> {
    const values: { key: string; grams: number }[] = [];
    const changedItems = new Set<number>();
    let invalid = false;

    form.querySelectorAll<HTMLInputElement>("[data-weight-key]").forEach((input) => {
      const raw = input.value.trim();
      if (!raw) return;
      const grams = Number(raw);
      if (!Number.isFinite(grams) || grams < 0) {
        input.setAttribute("aria-invalid", "true");
        invalid = true;
        return;
      }
      input.setAttribute("aria-invalid", "false");
      const key = input.dataset.weightKey!;
      if (state.weights.get(key) === grams && state.done.has(key)) return;
      values.push({ key, grams });
      const unit = state.byKey.get(key);
      if (unit) changedItems.add(unit.itemId);
    });

    if (invalid) {
      toastState.add({ message: "Проверьте выделенные веса", type: "error" });
      return;
    }

    dispatch({ type: "manualWeights", values });
    // Each save dispatches `itemSaved`; keep those reducer updates ordered.
    // oxlint-disable-next-line no-await-in-loop
    for (const itemId of changedItems) await persistWeights(itemId);
    toastState.add({ message: "Веса сохранены", type: "success" });
  }

  async function commit(): Promise<void> {
    if (state.saving) return;
    dispatch({ type: "commitStart" });
    try {
      // Finish commits one item at a time so a failure leaves earlier items saved.
      // oxlint-disable-next-line no-await-in-loop
      for (const item of itemsToFinish(state)) await deps.store.finishItem(item.id);
      dispatch({ type: "commitDone" });
      dialog.close();
      toastState.add({
        message: isRescan ? "Веса обновлены" : "Товары приняты",
        type: "success",
      });
      deps.onComplete();
    } catch (err) {
      dispatch({
        type: "commitError",
        message: "Не удалось сохранить приёмку. Попробуйте ещё раз.",
      });
      console.error(err);
    }
  }

  sheet.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-action]");
    if (!button || !sheet.contains(button)) return;
    const action = button.dataset.action;
    switch (action) {
      case "startScanning":
        dispatch({ type: "startScanning" });
        break;
      case "startManual":
        dispatch({ type: "startManual" });
        break;
      case "toggleCamera":
        cameraWanted = !cameraWanted;
        if (!cameraWanted) {
          deps.scanner.stop();
          cameraOn = false;
        }
        syncCamera();
        break;
      case "back":
        dispatch({ type: "back" });
        break;
      case "backToScan":
        dispatch({ type: "startScanning" });
        break;
      case "choose":
      case "ticket":
        if (action && button.dataset.key) dispatch({ type: action, key: button.dataset.key });
        break;
      case "nextSibling":
        dispatch({ type: "nextSibling" });
        break;
      case "skip":
        if (state.activeKey) dispatch({ type: "skip", key: state.activeKey });
        break;
      case "lost": {
        const unit = state.activeKey ? state.byKey.get(state.activeKey) : undefined;
        if (unit) void markLost(unit.itemId);
        break;
      }
      case "finish":
        dispatch({ type: "finish" });
        break;
      case "confirm":
        void commit();
        break;
    }
  });

  sheet.addEventListener("submit", (event) => {
    const form = event.target as HTMLFormElement;
    event.preventDefault();
    if (form.id === "rfScanForm") {
      const input = q<HTMLInputElement>("rfCodeInput");
      if (!input?.value.trim()) return;
      const code = input.value.trim();
      input.value = "";
      handleCode(code);
      return;
    }
    if (form.id === "rfWeightForm") {
      const input = q<HTMLInputElement>("rfWeight");
      const raw = input?.value.trim() ?? "";
      const grams = Number(raw);
      const error = q("rfWeightError");
      if (raw === "" || !Number.isFinite(grams) || grams < 0) {
        if (error) error.hidden = false;
        input?.setAttribute("aria-invalid", "true");
        input?.focus();
        return;
      }
      if (error) error.hidden = true;
      input?.setAttribute("aria-invalid", "false");
      const unit = state.activeKey ? state.byKey.get(state.activeKey) : undefined;
      if (unit) void saveWeight(unit, grams);
      return;
    }
    if (form.id === "rfManualForm") void submitManual(form);
  });

  sheet.addEventListener("input", (event) => {
    const target = event.target as HTMLElement;
    if (target.id === "rfSearch") {
      search = (target as HTMLInputElement).value;
      const term = search.trim().toLowerCase();
      sheet.querySelectorAll<HTMLElement>(".rf-manual-item").forEach((row) => {
        row.hidden = !(row.dataset.search ?? "").includes(term);
      });
    }
    if (target.id === "rfWeight") {
      const error = q("rfWeightError");
      if (error) error.hidden = true;
      target.removeAttribute("aria-invalid");
    }
  });

  q("rfClose")?.addEventListener("click", () => dialog.close());
  q("rfHeaderDone")?.addEventListener("click", () => dispatch({ type: "finish" }));
  dialog.addEventListener("cancel", () => deps.scanner.stop());
  dialog.addEventListener("close", () => {
    closed = true;
    deps.scanner.stop();
    dialog.remove();
  });

  render();
}
