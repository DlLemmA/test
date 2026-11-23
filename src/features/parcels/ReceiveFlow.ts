import { customerRepository } from "@/features/customers/infrastructure";
import type { Customer } from "@/features/customers/domain";
import { parcelItemRepository } from "./infrastructure";
import { parcelItemService, parcelService } from "@/features/shared/wiring";
import { toastState } from "@/core/state";
import { I, esc, kg, money, t } from "@/core/utils";
import { customerLabel } from "@/features/customers/ui/CustomerPresentation";
import { ITEM_FORMS, TRACK_FORMS } from "./ui/ParcelPresentation";
import type { Parcel, ParcelItem } from "./domain";
import { shippingInfoComplete } from "@/features/settlement/domain";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

type Unit = {
  key: string;
  itemId: number;
  idx: number;
  track: string;
  norm: string;
};

type Mode = "camera" | "manual";

function normalize(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[\s'"]/g, "");
}

/**
 * Scanner-first receiving flow.
 *
 * The camera stays open and each decode opens a single-track ticket. Weights are
 * persisted immediately, so the flow can be closed at any moment without losing
 * work. A manual list is always available for unreadable labels or desktop use.
 */
export async function openReceiveFlow(parcel: Parcel, onComplete: () => void): Promise<void> {
  let items = await parcelItemRepository.findByParcelId(parcel.id);
  const customers = await customerRepository.findAll();
  const customerMap = new Map<number, Customer>(customers.map((c) => [c.id, c]));

  const document_ = document;
  document_.getElementById("receiveFlow")?.remove();

  const isRescan = parcel.status === "received";
  const dialog = document_.createElement("dialog");
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
  document_.body.appendChild(dialog);
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

  // ---- Data model -------------------------------------------------------
  const units: Unit[] = [];
  const unitByKey = new Map<string, Unit>();
  const byNorm = new Map<string, Unit[]>();

  for (const item of items) {
    item.trackNumbers.forEach((raw, idx) => {
      const track = raw.trim();
      if (!track) return;
      const unit: Unit = {
        key: `${item.id}:${idx}`,
        itemId: item.id,
        idx,
        track,
        norm: normalize(track),
      };
      units.push(unit);
      unitByKey.set(unit.key, unit);
      const list = byNorm.get(unit.norm) ?? [];
      list.push(unit);
      byNorm.set(unit.norm, list);
    });
  }

  const done = new Set<string>();
  const skipped = new Set<string>();
  const weights = new Map<string, number>();
  for (const unit of units) {
    const w = items.find((i) => i.id === unit.itemId)?.weightsG[unit.idx] ?? 0;
    if (w > 0) {
      weights.set(unit.key, w);
      done.add(unit.key);
    }
  }

  const lostItems = new Set<number>(items.filter((i) => i.status === "lost").map((i) => i.id));

  let mode: Mode = "camera";
  let pendingItemId: number | null = null;
  let closed = false;

  function itemOf(unit: Unit): ParcelItem | undefined {
    return items.find((i) => i.id === unit.itemId);
  }

  function itemUnits(itemId: number): Unit[] {
    return units.filter((u) => u.itemId === itemId);
  }

  function hasWeight(unit: Unit): boolean {
    return (weights.get(unit.key) ?? 0) > 0;
  }

  function isDone(unit: Unit): boolean {
    return done.has(unit.key) || lostItems.has(unit.itemId);
  }

  function remaining(): Unit[] {
    return units.filter((u) => !isDone(u));
  }

  function totalWeightG(): number {
    let sum = 0;
    for (const w of weights.values()) sum += w;
    return sum;
  }

  function updateProgress(): void {
    const processed = units.length - remaining().length;
    progress.textContent = `${processed} / ${t(TRACK_FORMS, units.length)} · ${totalWeightG()} г`;
    progressBar.style.width = `${units.length ? (processed / units.length) * 100 : 100}%`;
  }

  function customerName(customerId: number): string {
    const customer = customerMap.get(customerId);
    return customer ? customerLabel(customer) : "";
  }

  async function persistWeights(itemId: number): Promise<void> {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const next = item.trackNumbers.map((_, idx) => weights.get(`${itemId}:${idx}`) ?? 0);
    const saved = await parcelItemService.updateItem(itemId, { weightsG: next });
    items = items.map((i) => (i.id === itemId ? saved : i));
  }

  // ---- Camera -----------------------------------------------------------
  let reader: BrowserMultiFormatReader | null = null;
  let controls: IScannerControls | null = null;
  let scanning = false;
  let starting = false;

  function stopCamera(): void {
    scanning = false;
    const active = controls;
    controls = null;
    try {
      active?.stop();
    } catch {
      // camera may already have been released
    }
  }

  async function startCamera(): Promise<void> {
    if (scanning || starting || closed || mode !== "camera") return;
    starting = true;
    scanning = true;
    hint.textContent = "Наведите камеру на штрихкод";

    try {
      if (!reader) {
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.DATA_MATRIX,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        reader = new BrowserMultiFormatReader(hints);
      }

      const active = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        video,
        (result, error, callbackControls) => {
          if (!scanning) return;
          if (result) {
            const code = result.getText().trim();
            scanning = false;
            try {
              callbackControls?.stop();
            } catch {
              // ignore
            }
            if (controls === callbackControls) controls = null;
            handleCode(code);
            return;
          }
          if (error && error.name !== "NotFoundException") {
            console.warn("ZXing scan error:", error);
          }
        },
      );

      if (scanning) {
        controls = active;
      } else {
        try {
          active.stop();
        } catch {
          // ignore
        }
      }
    } catch {
      scanning = false;
      hint.textContent = "Камера недоступна — введите трек вручную";
    } finally {
      starting = false;
    }
  }

  function handleCode(code: string): void {
    if (!code) return;
    last.textContent = code;
    const matches = byNorm.get(normalize(code)) ?? [];

    if (matches.length === 0) {
      navigator.vibrate?.([20, 50, 20]);
      hint.textContent = "Трек не найден в этой посылке";
      renderUnknown(code);
      return;
    }

    navigator.vibrate?.(15);
    hint.textContent = "Трек найден";

    const preferred =
      pendingItemId !== null ? matches.find((u) => u.itemId === pendingItemId) : undefined;
    if (preferred) {
      showTicket(preferred);
    } else if (matches.length === 1) {
      const unit = matches[0]!;
      pendingItemId = unit.itemId;
      showTicket(unit);
    } else {
      renderChoose(matches, code);
    }
  }

  // ---- Sheets -----------------------------------------------------------
  function focusField(id: string, select = false): void {
    requestAnimationFrame(() => {
      const el = q<HTMLInputElement>(id);
      if (!el) return;
      el.focus({ preventScroll: true });
      if (select) el.select();
    });
  }

  function renderStart(): void {
    sheet.innerHTML = `
      <div class="rf-grab"></div>
      <h2 class="rf-title">Приёмка товаров</h2>
      <p class="rf-sub">${t(TRACK_FORMS, units.length)} · ${t(ITEM_FORMS, items.length)}. Сканируйте по одному — вес сохраняется сразу.</p>
      <button type="button" class="rf-primary" id="rfStart" autofocus>${I.scan} Начать сканирование</button>
      <button type="button" class="rf-secondary" id="rfManualStart">Ввести веса списком</button>
      <p class="rf-note">Камеру можно выключить: трек всегда можно ввести с клавиатуры.</p>
    `;
    q("rfStart")?.addEventListener("click", () => {
      mode = "camera";
      renderScanning();
      void startCamera();
    });
    q("rfManualStart")?.addEventListener("click", () => {
      mode = "manual";
      stopCamera();
      renderManual();
    });
  }

  function renderScanning(): void {
    hint.textContent = "Сканируйте трек-номер";
    sheet.innerHTML = `
      <form class="rf-scanbar" id="rfScanForm">
        <label class="visually-hidden" for="rfCodeInput">Трек-номер</label>
        <input id="rfCodeInput" name="code" type="text" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="done" placeholder="Ввести трек вручную">
        <button type="submit" class="rf-send" aria-label="Найти трек">${I.arrowRight}</button>
      </form>
      <div class="rf-scan-actions">
        <button type="button" class="rf-link" id="rfToggleCamera">${scanning ? "Остановить камеру" : "Включить камеру"}</button>
        <button type="button" class="rf-link" id="rfOpenManual">Все треки списком</button>
      </div>
    `;
    q<HTMLFormElement>("rfScanForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = q<HTMLInputElement>("rfCodeInput");
      if (!input?.value.trim()) return;
      const code = input.value.trim();
      input.value = "";
      handleCode(code);
    });
    q("rfToggleCamera")?.addEventListener("click", () => {
      if (scanning) {
        stopCamera();
        q("rfToggleCamera")!.textContent = "Включить камеру";
      } else {
        void startCamera().then(() => {
          if (q("rfToggleCamera"))
            q("rfToggleCamera")!.textContent = scanning ? "Остановить камеру" : "Включить камеру";
        });
      }
    });
    q("rfOpenManual")?.addEventListener("click", () => {
      mode = "manual";
      stopCamera();
      renderManual();
    });
  }

  function showTicket(unit: Unit): void {
    pendingItemId = unit.itemId;
    const item = itemOf(unit);
    if (!item) return;

    const list = itemUnits(unit.itemId);
    const current = weights.get(unit.key);
    const siblings =
      list.length > 1
        ? `<div class="rf-siblings" role="group" aria-label="Треки этого товара">
            ${list
              .map((u) => {
                const w = weights.get(u.key);
                const cls = u.key === unit.key ? "is-current" : w ? "is-done" : "";
                return `<button type="button" class="rf-chip ${cls}" data-sibling="${u.key}" ${u.key === unit.key ? 'aria-current="true"' : ""}>${w ? I.check : ""}${u.idx + 1}${w ? ` · ${w} г` : ""}</button>`;
              })
              .join("")}
          </div>`
        : "";

    sheet.innerHTML = `
      <div class="rf-grab"></div>
      <div class="rf-ticket-head">
        <span class="rf-pill">Трек ${unit.idx + 1} из ${list.length}</span>
        <span class="rf-ticket-customer">${esc(customerName(item.customerId))}</span>
      </div>
      <h2 class="rf-ticket-title">${esc(item.name)}</h2>
      <div class="rf-track">${esc(unit.track)}</div>
      ${siblings}
      <form class="rf-weight-form" id="rfWeightForm">
        <label class="rf-weight-label" for="rfWeight">Вес этого трека, г</label>
        <input id="rfWeight" name="weight" class="rf-weight-input" type="number" inputmode="numeric" enterkeyhint="done" min="0" step="1" required autocomplete="off" value="${current ?? ""}">
        <p class="rf-error" id="rfWeightError" role="alert" hidden>Введите вес — число от 0 граммов.</p>
        <button type="submit" class="rf-primary" id="rfSaveWeight">${I.check} ${current ? "Перезаписать вес" : "Сохранить вес"}</button>
      </form>
      <p class="rf-keyhint">Коснитесь поля — клавиатура откроется сразу.</p>
      <div class="rf-row">
        <button type="button" class="rf-secondary" id="rfLost">Потерян</button>
        <button type="button" class="rf-secondary" id="rfSkip">Пропустить</button>
      </div>
      ${list.length > 1 ? '<button type="button" class="rf-link" id="rfSiblingNext">Следующий трек товара →</button>' : ""}
    `;

    const weightInput = q<HTMLInputElement>("rfWeight");
    weightInput?.addEventListener("click", () => weightInput.select());
    focusField("rfWeight", true);

    q<HTMLFormElement>("rfWeightForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const raw = weightInput?.value.trim() ?? "";
      const value = Number(raw);
      const error = q("rfWeightError");
      if (raw === "" || !Number.isFinite(value) || value < 0) {
        if (error) error.hidden = false;
        weightInput?.setAttribute("aria-invalid", "true");
        weightInput?.focus();
        return;
      }
      if (error) error.hidden = true;
      weightInput?.setAttribute("aria-invalid", "false");
      void saveWeight(unit, value);
    });

    sheet.querySelectorAll<HTMLButtonElement>("[data-sibling]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = unitByKey.get(btn.dataset.sibling!);
        if (next) showTicket(next);
      });
    });

    q("rfSiblingNext")?.addEventListener("click", () => {
      const next = itemUnits(unit.itemId).find((u) => !isDone(u));
      if (next) showTicket(next);
      else afterUnit();
    });

    q("rfSkip")?.addEventListener("click", () => {
      done.add(unit.key);
      skipped.add(unit.key);
      updateProgress();
      afterUnit();
    });

    q("rfLost")?.addEventListener("click", () => {
      void markLost(item);
    });
  }

  async function saveWeight(unit: Unit, value: number): Promise<void> {
    weights.set(unit.key, value);
    done.add(unit.key);
    skipped.delete(unit.key);
    await persistWeights(unit.itemId);
    updateProgress();
    navigator.vibrate?.(18);
    toastState.add({
      message: `${itemOf(unit)?.name ?? "Товар"} · трек ${unit.idx + 1} · ${value} г сохранено`,
      type: "success",
    });

    const next = itemUnits(unit.itemId).find((u) => !isDone(u));
    if (next && mode === "camera") {
      showTicket(next);
      return;
    }
    afterUnit();
  }

  async function markLost(item: ParcelItem): Promise<void> {
    await parcelItemService.updateItem(item.id, { status: "lost" });
    lostItems.add(item.id);
    for (const unit of itemUnits(item.id)) done.add(unit.key);
    updateProgress();
    toastState.add({ message: `${item.name} — потерян`, type: "warn" });
    afterUnit();
  }

  function afterUnit(): void {
    if (remaining().length === 0) {
      renderFinish();
      return;
    }
    if (mode === "camera") {
      renderScanning();
      void startCamera();
    } else {
      renderManual();
    }
  }

  function renderChoose(matches: Unit[], code: string): void {
    sheet.innerHTML = `
      <div class="rf-grab"></div>
      <h2 class="rf-title">Трек у нескольких товаров</h2>
      <p class="rf-sub">Выберите товар для трека ${esc(code)}</p>
      <div class="rf-choices">
        ${matches
          .map((u) => {
            const item = itemOf(u);
            return `<button type="button" class="rf-choice" data-choose="${u.key}">
              <b>${esc(item?.name ?? "Товар")}</b>
              <span>${esc(customerName(item?.customerId ?? 0))} · ${u.idx + 1}/${itemUnits(u.itemId).length}${hasWeight(u) ? ` · ${weights.get(u.key)} г` : ""}</span>
            </button>`;
          })
          .join("")}
      </div>
      <button type="button" class="rf-link" id="rfChooseBack">← Сканировать другой</button>
    `;
    sheet.querySelectorAll<HTMLButtonElement>("[data-choose]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const unit = unitByKey.get(btn.dataset.choose!);
        if (unit) showTicket(unit);
      });
    });
    q("rfChooseBack")?.addEventListener("click", () => {
      if (mode === "camera") {
        renderScanning();
        void startCamera();
      } else {
        renderManual();
      }
    });
  }

  function renderUnknown(code: string): void {
    sheet.innerHTML = `
      <div class="rf-grab"></div>
      <h2 class="rf-title">Трек не найден</h2>
      <div class="rf-track">${esc(code)}</div>
      <p class="rf-sub">Этого трека нет в посылке №${parcel.id}. Проверьте номер или выберите товар вручную.</p>
      <button type="button" class="rf-primary" id="rfUnknownManual">Выбрать товар вручную</button>
      <button type="button" class="rf-secondary" id="rfUnknownRetry">Сканировать ещё</button>
    `;
    q("rfUnknownManual")?.addEventListener("click", () => {
      mode = "manual";
      stopCamera();
      renderManual();
    });
    q("rfUnknownRetry")?.addEventListener("click", () => {
      if (mode === "camera") {
        renderScanning();
        void startCamera();
      } else {
        renderManual();
      }
    });
  }

  function renderManual(filter = ""): void {
    const rows = items
      .filter((item) => itemUnits(item.id).length > 0)
      .map((item) => {
        const customer = customerName(item.customerId);
        const list = itemUnits(item.id);
        const search =
          `${item.name} ${customer} ${list.map((u) => u.track).join(" ")}`.toLowerCase();
        return `
          <div class="rf-manual-item" data-search="${esc(search)}">
            <div class="rf-manual-name">${esc(item.name)}<span>${esc(customer)}</span></div>
            ${list
              .map((u) => {
                const fieldId = `mw_${u.key.replace(":", "_")}`;
                return `<div class="rf-manual-row">
                  <span class="rf-manual-track">${esc(u.track)}</span>
                  <label class="visually-hidden" for="${fieldId}">Вес трека ${u.idx + 1} товара ${esc(item.name)}</label>
                  <input id="${fieldId}" data-weight-key="${u.key}" class="rf-manual-weight" type="number" inputmode="numeric" min="0" step="1" placeholder="г" value="${weights.get(u.key) ?? ""}">
                </div>`;
              })
              .join("")}
          </div>`;
      })
      .join("");

    sheet.innerHTML = `
      <div class="rf-grab"></div>
      <h2 class="rf-title">Все треки списком</h2>
      <label class="visually-hidden" for="rfSearch">Поиск товара или трека</label>
      <input type="search" id="rfSearch" class="rf-search" placeholder="Найти товар или трек" value="${esc(filter)}">
      <form id="rfManualForm" class="rf-manual-form">
        ${rows || '<p class="rf-sub">В этой посылке нет треков.</p>'}
        <button type="submit" class="rf-primary" id="rfSaveAll">${I.check} Сохранить веса</button>
      </form>
      <button type="button" class="rf-link" id="rfBackScan">← К сканеру</button>
    `;

    const search = q<HTMLInputElement>("rfSearch");
    search?.addEventListener("input", () => {
      const term = search.value.trim().toLowerCase();
      sheet.querySelectorAll<HTMLElement>(".rf-manual-item").forEach((el) => {
        el.hidden = !(el.dataset.search ?? "").includes(term);
      });
    });

    q<HTMLFormElement>("rfManualForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.currentTarget as HTMLFormElement;
      const changedItems = new Set<number>();
      let invalid = false;

      form.querySelectorAll<HTMLInputElement>("[data-weight-key]").forEach((input) => {
        const raw = input.value.trim();
        if (!raw) return;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) {
          input.setAttribute("aria-invalid", "true");
          invalid = true;
          return;
        }
        input.setAttribute("aria-invalid", "false");
        const key = input.dataset.weightKey!;
        if (done.has(key) && weights.get(key) === value) return;
        weights.set(key, value);
        done.add(key);
        skipped.delete(key);
        const unit = unitByKey.get(key);
        if (unit) changedItems.add(unit.itemId);
      });

      if (invalid) {
        toastState.add({ message: "Проверьте выделенные веса", type: "error" });
        return;
      }

      for (const itemId of changedItems) await persistWeights(itemId);
      updateProgress();
      toastState.add({ message: "Веса сохранены", type: "success" });
      if (remaining().length === 0) renderFinish();
      else if (mode === "camera") renderScanning();
      else renderManual(search?.value ?? "");
    });

    q("rfBackScan")?.addEventListener("click", () => {
      mode = "camera";
      renderScanning();
    });
  }

  function renderFinish(): void {
    stopCamera();
    const missing = remaining().length;
    const weighed = units.filter(hasWeight).length;
    const boxWeightG = parcel.boxWeightG ?? 0;
    const shippingCostBYN = parcel.shippingCostBYN ?? 0;
    const hasShippingInfo = shippingInfoComplete(parcel);

    sheet.innerHTML = `
      <div class="rf-grab"></div>
      <h2 class="rf-title">${isRescan ? "Сохранить веса" : "Принять товары"}</h2>
      <p class="rf-sub">Взвешено ${weighed} из ${t(TRACK_FORMS, units.length)} · ${totalWeightG()} г товаров</p>
      <p class="rf-sub rf-shipping">Вес всей посылки ${kg(boxWeightG)} кг · доставка ${money(shippingCostBYN)}</p>
      ${missing ? `<div class="rf-warn">Не обработано ${t(TRACK_FORMS, missing)} — ${isRescan ? "веса можно сохранить позже" : "можно принять и без них"}.</div>` : ""}
      ${hasShippingInfo ? "" : '<div class="rf-warn">Вес посылки и доставка вводятся при отправке. Заполните их в редактировании посылки.</div>'}
      <p class="rf-error" id="rfFinishError" role="alert" hidden></p>
      <button type="button" class="rf-primary" id="rfConfirm" ${hasShippingInfo ? "" : "disabled"}>${I.check} ${isRescan ? "Сохранить веса" : "Принять товары"}</button>
      <button type="button" class="rf-link" id="rfBackTracks">← Вернуться к трекам</button>
    `;

    q("rfBackTracks")?.addEventListener("click", () => {
      if (mode === "camera") renderScanning();
      else renderManual();
    });

    q("rfConfirm")?.addEventListener("click", async () => {
      const error = q("rfFinishError");
      if (error) error.hidden = true;

      const button = q<HTMLButtonElement>("rfConfirm");
      if (button) button.disabled = true;
      try {
        for (const item of items) {
          if (lostItems.has(item.id)) continue;
          const list = itemUnits(item.id);
          if (list.length > 0 && list.every(hasWeight)) {
            await parcelItemService.updateItem(item.id, { status: "received" });
          }
        }
        if (!isRescan) await parcelService.receiveParcel(parcel.id, boxWeightG, shippingCostBYN);
        dialog.close();
        toastState.add({
          message: isRescan ? "Веса обновлены" : "Товары приняты",
          type: "success",
        });
        onComplete();
      } catch (err) {
        if (button) button.disabled = false;
        if (error) {
          error.hidden = false;
          error.textContent = "Не удалось сохранить приёмку. Попробуйте ещё раз.";
        }
        console.error(err);
      }
    });
  }

  // ---- Lifecycle --------------------------------------------------------
  q("rfClose")?.addEventListener("click", () => dialog.close());
  q("rfHeaderDone")?.addEventListener("click", () => renderFinish());

  dialog.addEventListener("cancel", () => {
    stopCamera();
  });
  dialog.addEventListener("close", () => {
    closed = true;
    stopCamera();
    dialog.remove();
  });

  updateProgress();
  renderStart();
}
