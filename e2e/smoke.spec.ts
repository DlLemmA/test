import { expect, test } from "@playwright/test";
import { seedSmokeData, type AppCache } from "./seed";

test.beforeEach(async ({ page }) => {
  await seedSmokeData(page);
});

/** Item groups and their action menus are collapsed until a user opens them. */
async function openKatyaItemMenu(page: import("@playwright/test").Page): Promise<void> {
  const group = page.locator('details[data-item-group][data-customer="2"]');
  if (!(await group.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await group.locator("summary").click();
  }
  await page.locator('.item-entry:has([data-edit="11"]) .entry-menu__trigger').click();
}

test("opens a parcel from the list", async ({ page }) => {
  await page.goto("/#/parcels");
  await expect(page.locator(".page-parcels")).toBeVisible();

  await page.locator('[data-open="2"]').click();

  await expect(page).toHaveURL(/#\/parcel\/2$/);
  await page.locator('details[data-item-group][data-customer="2"] > summary').click();
  await expect(
    page.locator(".page-parcel-detail").getByText("Товар Кати", { exact: true }),
  ).toBeVisible();
});

test("presentation vocabulary stays consistent across screens", async ({ page }) => {
  await page.goto("/#/people");
  await expect(page.locator(".customer-row__name").first()).toHaveText("Я (я)");
  await expect(page.locator(".customer-row__meta").nth(1)).toHaveText("1 товар · 1 посылка");

  await page.goto("/#/parcel/2");
  await page.locator('details[data-item-group][data-customer="2"] > summary').click();
  await expect(
    page.locator(".item-entry").filter({ hasText: "Товар Кати" }).locator(".parcel-entry__hint"),
  ).toContainText("1 шт");
});

test("amounts agree between the parcel and customer screens", async ({ page }) => {
  await page.goto("/#/parcel/2");
  const parcelRemaining = await page
    .locator(".parcel-calc__item")
    .filter({ hasText: "Должны" })
    .locator("b")
    .innerText();

  await page.goto("/#/customer/2");
  const customerDebt = await page.locator(".check-row--total b").innerText();

  expect(customerDebt).toBe(parcelRemaining);
});

test("unpaid items warn without blocking finish", async ({ page }) => {
  await page.goto("/#/parcel/2");
  await expect(page.locator(".detail-action__hint")).toContainText("Не оплачено: 1 товар");

  await page.locator("#markAsDone").click();
  await expect(page.locator('.detail-hero[data-status="done"]')).toBeVisible();
  await expect(page.locator("#exportParcel")).toBeVisible();
});

test("draft rows offer a direct track action; received rows show weights", async ({ page }) => {
  await page.goto("/#/parcel/2");
  await page.locator('details[data-item-group][data-customer="2"] > summary').click();
  const receivedRow = page.locator('.item-entry:has([data-edit="11"])');
  await expect(receivedRow.locator('[data-add-track="11"]')).toHaveCount(0);
  await expect(receivedRow.locator(".track-weight")).toHaveText("200 г");
  await expect(receivedRow.locator(".track-code")).toHaveText("KAT-1");

  await page.evaluate(async () => {
    const cache = (window as unknown as { appCache: AppCache }).appCache;
    await cache.parcels.update(2, { status: "draft" });
  });
  await page.reload();
  await page.locator('details[data-item-group][data-customer="2"] > summary').click();
  const draftRow = page.locator('.item-entry:has([data-edit="11"])');
  await expect(draftRow.locator('[data-add-track="11"]')).toBeVisible();
  await expect(draftRow.locator(".track-weight")).toHaveCount(0);
  await expect(draftRow.locator(".track-code")).toHaveText("KAT-1");
});

test("delivery follows one fact on both screens when weight is missing", async ({ page }) => {
  await page.goto("/#/customer/2");
  await expect(page.locator("[data-toggle-shipping]")).toHaveCount(1);
  const withWeight = await page.locator(".check-row--total b").innerText();

  await page.evaluate(async () => {
    const cache = (window as unknown as { appCache: AppCache }).appCache;
    await cache.parcels.update(2, { boxWeightG: null });
  });
  await page.reload();

  await page.goto("/#/customer/2");
  await expect(page.locator("[data-toggle-shipping]")).toHaveCount(0);
  const withoutWeight = await page.locator(".check-row--total b").innerText();
  expect(withoutWeight).not.toBe(withWeight);

  await page.goto("/#/parcel/2");
  await expect(page.locator(".shipping-paid")).toHaveCount(0);
});

test("a zero delivery share cannot be paid on either screen", async ({ page }) => {
  await page.evaluate(async () => {
    const cache = (window as unknown as { appCache: AppCache }).appCache;
    await cache.parcelItems.update(11, { weightsG: "[]" });
  });

  await page.goto("/#/parcel/2");
  const katya = page.locator('details[data-item-group][data-customer="2"]');
  await expect(katya.locator(".shipping-paid")).toHaveCount(0);
  await expect(katya.locator(".payment-bullet").last()).toContainText("Доставка: —");

  await page.goto("/#/customer/2");
  await expect(page.locator("[data-toggle-shipping]")).toHaveCount(0);

  await page.locator('[data-toggle-payment="11"]').check();
  await expect(page.locator('[data-toggle-parcel="2"]')).toBeChecked();

  const shippingRows = await page.evaluate(async () => {
    const payments = await (
      window as unknown as { appCache: AppCache }
    ).appCache.payments.toArray();
    return payments.filter((payment) => payment.type === "shipping" && payment.paid).length;
  });
  expect(shippingRows).toBe(0);
});

test("payment toggle persists and self stays paid", async ({ page }) => {
  await page.goto("/#/parcel/2");
  await openKatyaItemMenu(page);
  await page.locator('.entry-menu__list [data-toggle-payment="11"]').click();

  await openKatyaItemMenu(page);
  await expect(page.locator('.entry-menu__list [data-toggle-payment="11"]')).toBeDisabled();
  await expect(page.locator('.entry-menu__list [data-toggle-payment="11"]')).toHaveClass(/is-paid/);

  await page.reload();
  await openKatyaItemMenu(page);
  await expect(page.locator('.entry-menu__list [data-toggle-payment="11"]')).toBeDisabled();

  const paid = await page.evaluate(async () => {
    const payments = await (
      window as unknown as { appCache: AppCache }
    ).appCache.payments.toArray();
    return payments.filter((p) => p.itemId === 11 && p.paid).length;
  });
  expect(paid).toBe(1);
});

test("saves a batch with distributed commission and a paid self item", async ({ page }) => {
  await page.goto("/#/add");
  await expect(page.locator("#addParcelSelect")).toHaveValue("1");
  await page.locator("#addParcelSelect").selectOption("0");
  await page.locator("#sumCNY").fill("105");
  await page.locator("#sumBYN").fill("13.65");
  await page.locator('#stage1Form button[type="submit"]').click();

  await page.locator("#customerComboInput").fill("Катя");
  await page.locator('[data-customer-id="2"]').click();
  await page.locator("#csvText").fill("Товар с комиссией 1 шт 100");
  await page.locator("#addBatchBtn").click();
  await page.locator("#checkStepBtn").click();

  await expect(page.getByText("Комиссия (распределится по товарам)")).toBeVisible();
  const parcelsBefore = await page.evaluate(async () => {
    const cache = (window as unknown as { appCache: AppCache }).appCache;
    return (await cache.parcels.toArray()).length;
  });
  await page.locator("#saveBatchBtn").click();
  await expect(
    page.locator("#toastContainer .toast__message", { hasText: "Партия сохранена (1 товар)" }),
  ).toBeVisible();

  const batch = await page.evaluate(async () => {
    const cache = (window as unknown as { appCache: AppCache }).appCache;
    const item = (await cache.parcelItems.toArray()).find((i) => i.name === "Товар с комиссией");
    const payments = await cache.payments.toArray();
    const parcels = await cache.parcels.toArray();
    return {
      priceCNY: item?.priceCNY,
      customerId: item?.customerId,
      payments: payments.length,
      parcels: parcels.length,
      parcelId: item?.parcelId,
    };
  });
  expect(batch.priceCNY).toBe(105);
  expect(batch.customerId).toBe(2);
  expect(batch.payments).toBe(2);
  expect(batch.parcels).toBe(parcelsBefore + 1);
  expect(batch.parcelId).not.toBe(1);

  await page.goto("/#/add");
  await page.locator("#sumCNY").fill("10");
  await page.locator("#sumBYN").fill("1.3");
  await page.locator('#stage1Form button[type="submit"]').click();

  await page.locator("#customerComboInput").fill("Я");
  await page.locator('[data-customer-id="1"]').click();
  await page.locator("#csvText").fill("Товар Я из партии 1 шт 10");
  await page.locator("#addBatchBtn").click();
  await page.locator("#checkStepBtn").click();
  await page.locator("#saveBatchBtn").click();
  await expect(
    page.locator("#toastContainer .toast__message", { hasText: "Партия сохранена (1 товар)" }),
  ).toBeVisible();

  const selfPayment = await page.evaluate(async () => {
    const cache = (window as unknown as { appCache: AppCache }).appCache;
    const item = (await cache.parcelItems.toArray()).find((i) => i.name === "Товар Я из партии");
    const payments = await cache.payments.toArray();
    return payments.find((p) => p.itemId === item?.id);
  });
  expect(selfPayment?.paid).toBe(true);
});

test("batch can be added to a chosen draft and preselected from a parcel", async ({ page }) => {
  await page.goto("/#/add");
  await expect(page.locator("#addParcelSelect option")).toHaveCount(2);
  await expect(page.locator("#addParcelSelect")).toHaveValue("1");
  await expect(page.locator("#addParcelSelect option").nth(1)).toHaveText(/Посылка №1/);

  await page.goto("/#/parcel/1");
  await page.locator("#openBatchForm").click();
  await expect(page.locator("#addParcelSelect")).toHaveValue("1");

  await page.locator("#sumCNY").fill("10");
  await page.locator("#sumBYN").fill("1.3");
  await page.locator('#stage1Form button[type="submit"]').click();
  await page.locator("#customerComboInput").fill("Катя");
  await page.locator('[data-customer-id="2"]').click();
  await page.locator("#csvText").fill("Товар в черновик 1 шт 10");
  await page.locator("#addBatchBtn").click();
  await page.locator("#checkStepBtn").click();

  const parcelsBefore = await page.evaluate(async () => {
    const cache = (window as unknown as { appCache: AppCache }).appCache;
    return (await cache.parcels.toArray()).length;
  });
  await page.locator("#saveBatchBtn").click();
  await expect(
    page.locator("#toastContainer .toast__message", { hasText: "Партия сохранена (1 товар)" }),
  ).toBeVisible();

  const added = await page.evaluate(async () => {
    const cache = (window as unknown as { appCache: AppCache }).appCache;
    const item = (await cache.parcelItems.toArray()).find((i) => i.name === "Товар в черновик");
    return { parcelId: item?.parcelId, parcels: (await cache.parcels.toArray()).length };
  });
  expect(added.parcelId).toBe(1);
  expect(added.parcels).toBe(parcelsBefore);
});

test("combobox creates a customer and the batch keeps the selection", async ({ page }) => {
  await page.goto("/#/add");
  await page.locator("#sumCNY").fill("20");
  await page.locator("#sumBYN").fill("2.6");
  await page.locator('#stage1Form button[type="submit"]').click();

  await page.locator("#customerComboInput").fill("Новый заказчик");
  await page.locator("#csvText").fill("Товар нового 1 шт 20");
  await page.locator("#addBatchBtn").click();
  await expect(
    page.locator("#toastContainer").getByText("Заказчик «Новый заказчик» добавлен"),
  ).toBeVisible();

  await page.locator("#checkStepBtn").click();
  await page.locator("#saveBatchBtn").click();
  await expect(
    page.locator("#toastContainer .toast__message", { hasText: "Партия сохранена (1 товар)" }),
  ).toBeVisible();

  // Reka components drop Vue's scoped-style attribute on their roots, so the
  // toast CSS must be global: a transparent toast means the styles did not apply.
  const toastStyle = await page
    .locator("#toastContainer .toast")
    .first()
    .evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, padding: style.padding };
    });
  expect(toastStyle.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(toastStyle.padding).toBe("10px 16px");

  const ids = await page.evaluate(async () => {
    const cache = (window as unknown as { appCache: AppCache }).appCache;
    const customers = await cache.customers.toArray();
    const items = await cache.parcelItems.toArray();
    return {
      created: customers.find((c) => c.name === "Новый заказчик")?.id,
      assigned: items.find((i) => i.name === "Товар нового")?.customerId,
    };
  });
  expect(ids.created).toBeDefined();
  expect(ids.assigned).toBe(ids.created);
});

test("goods payment checkbox flips immediately and stays in sync", async ({ page }) => {
  await page.goto("/#/parcel/2");
  const check = page.locator('.item-paid-all[data-customer="2"]');
  const label = page.locator('details[data-item-group][data-customer="2"] .payment-bullet', {
    hasText: "Товары:",
  });
  await expect(check).not.toBeChecked();
  await expect(label).toContainText("не оплачено");

  await check.check();
  await expect(check).toBeChecked();
  await expect(label).toContainText("оплачено");
  await expect(page.locator("#toastContainer")).not.toContainText("Не удалось изменить оплату");
});

test("ship button explains why a draft is not ready", async ({ page }) => {
  await page.evaluate(async () => {
    const cache = (window as unknown as { appCache: AppCache }).appCache;
    await cache.parcelItems.add({
      parcelId: 1,
      name: "Товар без треков",
      priceCNY: 1,
      priceBYN: 0.1,
      quantity: 1,
      unit: "pcs",
      customerId: 2,
      trackNumbers: "[]",
      weightsG: "[]",
      status: "ordered",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  await page.goto("/#/parcel/1");
  await page.locator('details[data-item-group][data-customer="2"] > summary').click();
  await expect(page.locator(".page-parcel-detail").getByText("Нет треков")).toBeVisible();

  await page.locator("#shipParcel").click();
  await expect(page.locator("#toastContainer").getByText(/не отмечены/)).toBeVisible();
});

test("ship form accepts typed weight and amount", async ({ page }) => {
  await page.evaluate(async (createdAt) => {
    const cache = (window as unknown as { appCache: AppCache }).appCache;
    await cache.parcelItems.add({
      parcelId: 1,
      name: "Товар с треком",
      priceCNY: 1,
      priceBYN: 0.5,
      quantity: 1,
      unit: "pcs",
      customerId: 2,
      trackNumbers: JSON.stringify(["TRACK-1"]),
      weightsG: "[]",
      status: "ordered",
      tracksCompletedAt: createdAt,
      createdAt,
    });
  }, "2026-01-01T00:00:00.000Z");

  await page.goto("/#/parcel/1");
  await page.locator("#shipParcel").click();
  await page.locator("#shipBoxWeight").fill("600");
  await page.locator("#shipAmount").fill("12.50");
  await page.locator("#shipForm button[type=submit]").click();

  await expect(
    page.locator("#toastContainer .toast__message", { hasText: "Посылка отправлена" }),
  ).toBeVisible();
  await expect(page.locator("#receiveParcel")).toBeVisible();
});

test("finish button explains which items are unweighed", async ({ page }) => {
  await page.evaluate(async () => {
    const cache = (window as unknown as { appCache: AppCache }).appCache;
    await cache.parcelItems.update(11, { weightsG: "[]" });
  });

  await page.goto("/#/parcel/2");
  await expect(page.locator(".detail-action__hint").first()).toContainText("Взвесьте все треки");

  await page.locator("#markAsDone").click();
  await expect(page.locator("#toastContainer").getByText(/не взвешены/)).toBeVisible();
});

test("receiving saves weights and commits items without reopening the parcel", async ({ page }) => {
  await page.evaluate(async (createdAt) => {
    const cache = (window as unknown as { appCache: AppCache }).appCache;
    await cache.parcels.add({
      id: 3,
      status: "shipped",
      createdAt,
      shippedAt: createdAt,
      boxWeightG: 100,
      shippingCostBYN: 10,
    });
    await cache.parcelItems.add({
      id: 30,
      parcelId: 3,
      name: "Товар на приёмку",
      priceCNY: 10,
      priceBYN: 1.3,
      quantity: 1,
      unit: "pcs",
      customerId: 1,
      trackNumbers: JSON.stringify(["RCV-1"]),
      weightsG: "[]",
      status: "ordered",
      createdAt,
    });
  }, "2026-01-01T00:00:00.000Z");

  await page.goto("/#/parcel/3");
  await page.locator("#receiveParcel").click();
  await expect(page.locator("#receiveFlow")).toBeVisible();
  await expect(page.locator("#rfTitle")).toHaveText("Посылка №3");

  await page.locator("#rfManualStart").click();
  await page.locator('[data-weight-key="30:0"]').fill("150");
  await page.locator("#rfSaveAll").click();
  await expect(page.locator("#rfConfirm")).toBeVisible();
  await page.locator("#rfConfirm").click();

  await expect(page.locator("#receiveFlow")).toHaveCount(0);
  await expect(page.locator("#toastContainer")).toContainText("Веса обновлены");

  const saved = await page.evaluate(async () => {
    const cache = (window as unknown as { appCache: AppCache }).appCache;
    const parcel = await cache.parcels.get(3);
    const item = await cache.parcelItems.get(30);
    return { status: parcel?.status, weight: item?.weightsG, itemStatus: item?.status };
  });
  expect(saved.status).toBe("received");
  expect(JSON.parse(saved.weight as string)).toEqual([150]);
  expect(saved.itemStatus).toBe("received");
});

test("customer card toggles one item and the whole parcel", async ({ page }) => {
  await page.goto("/#/customer/2");

  await page.locator('[data-toggle-payment="11"]').check();
  await expect(
    page.locator("#toastContainer").getByText("Товар отмечен как оплаченный"),
  ).toBeVisible();

  await page.locator('[data-toggle-parcel="2"]').check();
  await expect(page.locator("#toastContainer").getByText("Посылка оплачена")).toBeVisible();

  const state = await page.evaluate(async () => {
    const payments = await (
      window as unknown as { appCache: AppCache }
    ).appCache.payments.toArray();
    return {
      paidItems: payments.filter((p) => p.type === "item" && p.paid).length,
      paidShipping: payments.filter((p) => p.type === "shipping" && p.paid).length,
    };
  });
  expect(state.paidItems).toBe(1);
  expect(state.paidShipping).toBe(1);
});

test("a route change mounts its view exactly once", async ({ page }) => {
  await page.goto("/#/parcels");
  await expect(page.locator(".page-parcels")).toBeVisible();

  // Count root element insertions in the router outlet, not innerHTML writes:
  // two owners of the same route show up as 2+.
  await page.evaluate(() => {
    const target = window as unknown as { viewRenders: number };
    const host = document.getElementById("panel-container");
    if (!host) throw new Error("missing #panel-container");
    target.viewRenders = 0;
    new MutationObserver((records) => {
      for (const record of records) {
        if (Array.from(record.addedNodes).some((node) => node instanceof Element)) {
          target.viewRenders += 1;
        }
      }
    }).observe(host, { childList: true });
  });

  await page.locator('[data-open="2"]').click();
  await expect(page).toHaveURL(/#\/parcel\/2$/);
  await expect(page.locator(".page-parcel-detail")).toBeVisible();

  const renders = await page.evaluate(
    () => (window as unknown as { viewRenders: number }).viewRenders,
  );
  expect(renders).toBe(1);
  await expect(page.locator("#bottombar a")).toHaveCount(3);
});

test("parcel row parts morph into the detail hero", async ({ page }) => {
  await page.goto("/#/parcels");
  await expect(page.locator(".page-parcels")).toBeVisible();

  await page.locator('[data-open="2"]').click();
  await expect(page.locator(".page-parcel-detail")).toBeVisible();

  const names = await page.evaluate(() => ({
    title: getComputedStyle(document.querySelector(".detail-hero h1")!).getPropertyValue(
      "view-transition-name",
    ),
    date: getComputedStyle(document.querySelector(".detail-hero__date")!).getPropertyValue(
      "view-transition-name",
    ),
    status: getComputedStyle(document.querySelector(".detail-state")!).getPropertyValue(
      "view-transition-name",
    ),
    next: getComputedStyle(document.querySelector(".detail-hero__next")!).getPropertyValue(
      "view-transition-name",
    ),
  }));
  expect(names).toEqual({
    title: "parcel-title",
    date: "parcel-date",
    status: "parcel-status",
    next: "parcel-next",
  });
});

test("bottom dock keeps its own compositing layer", async ({ page }) => {
  await page.goto("/#/parcels");
  const wrap = page.locator(".bottombar-wrap");
  await expect(wrap).toBeVisible();
  expect(await wrap.evaluate((el) => getComputedStyle(el).willChange)).toBe("transform");
  await expect(page.locator("#bottombar a")).toHaveCount(3);
});

test("search opens a matching group without toggling it repeatedly", async ({ page }) => {
  await page.goto("/#/parcel/2");
  const group = page.locator('details[data-item-group][data-customer="2"]');
  await expect(group).toBeVisible();

  await page.evaluate(() => {
    const el = document.querySelector<HTMLDetailsElement>(
      'details[data-item-group][data-customer="2"]',
    );
    if (!el) throw new Error("missing group");
    const w = window as unknown as { groupToggles: string[] };
    w.groupToggles = [];
    el.addEventListener("toggle", () => w.groupToggles.push(String(el.open)));
  });

  await page.locator("#parcelItemSearch").fill("Катя");
  await expect(group).toHaveAttribute("open", "");

  // Programmatic `open` fires `toggle` too. The handler must set that state,
  // not flip it — otherwise Vue and the browser ping-pong forever.
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(() => (window as unknown as { groupToggles: string[] }).groupToggles),
  ).toEqual(["true"]);
});

test("drawer keeps its sheet chrome and action buttons", async ({ page }) => {
  await page.goto("/#/parcels");
  await expect(page.locator(".page-parcels")).toBeVisible();

  const entry = page.locator(".parcel-entry").filter({ hasText: "Посылка №1" });
  await entry.locator(".entry-menu__trigger").click();
  await page.locator(".entry-menu__list [data-del]").click();
  await expect(page.locator(".drawer-content .notice")).toBeVisible();

  const chrome = await page.evaluate(() => {
    const doc = document;
    const pick = (selector: string) => {
      const el = doc.querySelector<HTMLElement>(selector);
      if (!el) throw new Error(`missing ${selector}`);
      const style = getComputedStyle(el);
      return {
        display: style.display,
        position: style.position,
        background: style.backgroundColor,
        radius: style.borderTopLeftRadius,
        maxWidth: style.maxWidth,
        gap: style.gap,
      };
    };
    const handle = doc.querySelector<HTMLElement>(".drawer-handle");
    return {
      overlay: pick(".app-drawer-overlay"),
      sheet: pick(".app-drawer-content"),
      handle: pick(".drawer-handle"),
      handleBar: handle ? getComputedStyle(handle, "::after").width : "missing",
      close: pick(".drawer-close"),
      content: pick(".drawer-content"),
      actions: pick(".drawer-actions"),
    };
  });

  expect(chrome.overlay.position).toBe("fixed");
  expect(chrome.overlay.background).toBe("rgba(42, 29, 39, 0.45)");
  expect(chrome.sheet.position).toBe("fixed");
  expect(chrome.sheet.maxWidth).toBe("620px");
  expect(chrome.sheet.background).toBe("rgb(253, 251, 246)");
  expect(chrome.sheet.radius).toBe("20px");
  expect(chrome.handle.display).toBe("flex");
  expect(chrome.handleBar).toBe("40px");
  expect(chrome.close.background).toBe("rgb(255, 244, 248)");
  expect(chrome.close.radius).toBe("999px");
  expect(chrome.content.display).toBe("flex");
  expect(chrome.content.gap).toBe("12px");
  expect(chrome.actions.display).toBe("flex");
});

test("header offers sign out", async ({ page }) => {
  await page.goto("/#/parcels");
  await expect(page.locator(".page-parcels")).toBeVisible();
  await expect(page.locator("#signOutBtn")).toBeVisible();
  await expect(page.locator("#demoBtn")).toHaveCount(0);
});

test("shared parcel-entry styles load on every route", async ({ page }) => {
  async function expectParcelEntryStyles(route: string): Promise<void> {
    await page.goto(route);
    await page.reload();

    const entry = page.locator(".parcel-entry").first();
    await expect(entry).toBeVisible();
    expect(await entry.evaluate((el) => getComputedStyle(el).display)).toBe("grid");

    const head = entry.locator(".parcel-entry__head").first();
    const headStyle = await head.evaluate((el) => {
      const style = getComputedStyle(el);
      return { display: style.display, justify: style.justifyContent, gap: style.gap };
    });
    expect(headStyle.display).toBe("flex");
    expect(headStyle.justify).toBe("space-between");
    expect(headStyle.gap).toBe("8px");

    const state = entry.locator(".parcel-entry__state").first();
    const stateStyle = await state.evaluate((el) => {
      const style = getComputedStyle(el);
      const dot = getComputedStyle(el, "::before");
      return { position: style.position, padding: style.paddingLeft, dot: dot.width };
    });
    expect(stateStyle.position).toBe("relative");
    expect(stateStyle.padding).toBe("9px");
    expect(stateStyle.dot).toBe("5px");
  }

  await expectParcelEntryStyles("/#/customer/2");
  await expectParcelEntryStyles("/#/parcel/2");
  await expectParcelEntryStyles("/#/parcels");
});

test("parcel deletion drawer cancels and confirms", async ({ page }) => {
  await page.goto("/#/parcels");
  await expect(page.locator(".page-parcels")).toBeVisible();

  async function openDeleteDrawer(): Promise<void> {
    const entry = page.locator(".parcel-entry").filter({ hasText: "Посылка №1" });
    await entry.locator(".entry-menu__trigger").click();
    await page.locator(".entry-menu__list [data-del]").click();
  }

  await openDeleteDrawer();
  await expect(page.locator(".drawer-content .notice")).toHaveText(
    "Посылка, товары и платежи по ней будут удалены. Это действие нельзя отменить.",
  );
  await page.locator(".drawer-actions button").filter({ hasText: "Отмена" }).click();
  await expect(page.locator(".drawer-actions")).toHaveCount(0);
  await expect(page.locator(".parcel-entry").filter({ hasText: "Посылка №1" })).toBeVisible();

  await openDeleteDrawer();
  await page.locator(".drawer-actions button").filter({ hasText: "Удалить" }).click();
  await expect(page.locator(".parcel-entry").filter({ hasText: "Посылка №1" })).toHaveCount(0);
  await expect(page.locator("#toastContainer")).toContainText("Посылка удалена");
});

test("customer drawer creates, validates and edits a customer", async ({ page }) => {
  await page.goto("/#/people");
  await expect(page.locator(".page-customers")).toBeVisible();

  await page.locator("#addCustomer").click();
  await expect(page.locator("#customerForm")).toBeVisible();

  await page.locator("#customerForm button[type='submit']").click();
  await expect(page.locator("#customerNameError")).toHaveText("Укажите имя заказчика");

  await page.locator("#customerName").fill("Проверка");
  await expect(page.locator("#customerNameError")).toBeHidden();
  await page.locator("#customerForm button[type='submit']").click();

  await expect(page.locator("#toastContainer")).toContainText("Заказчик сохранён");
  const row = page.locator(".customer-index li").filter({ hasText: "Проверка" });
  await expect(row).toBeVisible();

  await row.locator("[data-edit-customer]").click();
  await expect(page.locator("#customerName")).toHaveValue("Проверка");
  await page.locator("#customerName").fill("Проверка 2");
  await page.locator("#customerForm button[type='submit']").click();
  await expect(page.locator(".customer-index")).toContainText("Проверка 2");
});

test("item wizard adds a draft item with tracks", async ({ page }) => {
  await page.goto("/#/parcel/1");
  await expect(page.locator(".page-parcel-detail")).toBeVisible();

  await page.locator("#addItem").click();
  await expect(page.locator("#itemForm")).toBeVisible();

  await page.locator("#itemName").fill("Новый товар");
  await page.locator("#itemPriceCNY").fill("10");
  await page.locator("#itemPriceBYN").fill("3");
  await page.locator("[data-panel='main'] button[type='submit']").click();

  await expect(page.locator("#toastContainer")).toContainText("Товар сохранён");
  await page.locator('details[data-item-group][data-customer="1"] > summary').click();
  const row = page.locator(".item-entry").filter({ hasText: "Новый товар" });
  await expect(row).toBeVisible();

  await row.locator("[data-edit]").click();
  await expect(page.locator("#itemForm")).toBeVisible();
  await expect(page.locator("[data-panel='tracks']")).toBeVisible();
  await page.locator("[data-track-row] input[name='track']").first().fill("TRACK-NEW");
  await page.locator("input[name='tracksCompleted']").check();
  await page.locator("[data-panel='tracks'] button[type='submit']").click();

  await expect(page.locator("#toastContainer")).toContainText("Товар сохранён");
  await expect(row).toContainText("Треки готовы");
});

test("sign-in is a public route for a signed-out user", async ({ page }) => {
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/#/sign-in");

  await expect(page.locator("#signInTitle")).toHaveText("Pindoчет");
  await expect(page.locator("#signInEmail")).toBeVisible();
  await expect(page.locator("#sendMagicLink")).toBeEnabled();
  await expect(page.locator(".app-shell")).toHaveCount(0);

  await page.goto("/#/parcels");
  await expect(page).toHaveURL(/\/#\/sign-in\?next=\/parcels$/);
});

test("dev sign-in can enter test mode without email", async ({ page }) => {
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/#/sign-in?next=/parcels");

  const entry = page.locator("#enterTestMode");
  await expect(entry).toBeVisible();
  await expect(entry).toContainText("Войти в тестовом режиме");

  await entry.click();

  await expect(page).toHaveURL(/#\/parcels$/);
  await expect(page.locator(".page-parcels")).toBeVisible();
});
