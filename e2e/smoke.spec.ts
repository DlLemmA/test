import { expect, test } from "@playwright/test";
import { seedPaidDraftFixture, seedSmokeData, type AppCache } from "./seed";

test.beforeEach(async ({ page }) => {
  await seedSmokeData(page);
});

test("opens a parcel from the list", async ({ page }) => {
  await page.goto("/#/parcels");
  await expect(page.locator(".page-parcels")).toBeVisible();

  await page.locator('[data-open="2"]').click();

  await expect(page).toHaveURL(/#\/parcel\/2$/);
  await expect(
    page.locator(".page-parcel-detail").getByText("Товар Кати", { exact: true }),
  ).toBeVisible();
});

test("goods stay visible when the customer heading is clicked", async ({ page }) => {
  await page.goto("/#/parcel/2");
  const group = page.locator('[data-item-group][data-customer="2"]');
  const fold = group.locator(".customer-items-fold");
  const goods = group.locator(".item-entry");
  await expect(fold).toHaveAttribute("open", "");
  await expect(goods).toBeVisible();

  await group.locator(".item-group__head b").first().click();
  await expect(fold).toHaveAttribute("open", "");
  await expect(goods).toBeVisible();
  await expect(goods).toHaveCount(1);
});

test("settlement checks span the full group width", async ({ page }) => {
  await page.goto("/#/parcel/2");
  const group = page.locator('[data-item-group][data-customer="2"]');
  const entry = group.locator(".item-group__head");
  const checks = entry.locator(".settle-entry__checks");
  const rows = checks.locator(".pay-summary");
  await expect(rows).toHaveCount(2);
  expect(await rows.first().evaluate((el) => getComputedStyle(el).marginBottom)).toBe("0px");

  const entryBox = await entry.boundingBox();
  const checksBox = await checks.boundingBox();
  expect(checksBox!.x).toBe(entryBox!.x);
  expect(Math.abs(checksBox!.width - entryBox!.width)).toBeLessThan(1);

  const goods = await rows.nth(0).boundingBox();
  const delivery = await rows.nth(1).boundingBox();
  expect(goods!.y).toBe(delivery!.y);
});

test("items fold collapses without removing the rows", async ({ page }) => {
  await page.goto("/#/parcel/2");
  const group = page.locator('[data-item-group][data-customer="2"]');
  const fold = group.locator(".customer-items-fold");
  const goods = group.locator(".item-entry");
  await expect(fold).toHaveAttribute("open", "");
  await expect(goods).toHaveCount(1);

  await fold.locator("summary").click();
  await expect(fold).not.toHaveAttribute("open", "");
  await expect(goods).toBeHidden();
  await expect(goods).toHaveCount(1);
  await expect(group.locator(".item-paid-all")).toBeVisible();

  await fold.locator("summary").click();
  await expect(fold).toHaveAttribute("open", "");
  await expect(goods).toBeVisible();
});

test("presentation vocabulary stays consistent across screens", async ({ page }) => {
  await page.goto("/#/people");
  await expect(page.locator(".customer-row__name").first()).toHaveText("Я (я)");
  await expect(page.locator(".customer-row__meta").nth(1)).toHaveText(
    "1 товар · 1 посылка · привезено 0.200 кг",
  );

  await page.goto("/#/parcel/2");
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
  const groupDebt = page.locator(
    '[data-item-group][data-customer="2"] .item-group__head .parcel-debt',
  );
  await expect(groupDebt).toHaveText(`Долг ${parcelRemaining}`);
  await expect(groupDebt).toHaveClass(/is-debt/);

  await page.goto("/#/customer/2");
  await expect(page.locator(".detail-hero__facts")).toContainText("привезено 0.200 кг");
  await expect(
    page.locator(".item-check", { hasText: "Товар Кати" }).locator(".item-check__weight"),
  ).toHaveText("200 г");
  const customerDebt = await page.locator(".check-row--total b").innerText();
  await expect(page.locator(".customer-statement .parcel-debt")).toHaveText(`Долг ${customerDebt}`);

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
  const receivedRow = page.locator('.item-entry:has([data-edit="11"])');
  await expect(receivedRow.locator('[data-add-track="11"]')).toHaveCount(0);
  await expect(receivedRow.locator(".track-weight")).toHaveText("200 г");
  await expect(receivedRow.locator(".track-code")).toHaveText("KAT-1");
  await expect(receivedRow.locator(".entry-menu__trigger")).toHaveCount(0);

  await receivedRow.locator("[data-edit]").click();
  await expect(page.locator("[data-panel='weights']")).toBeVisible();
  await expect(page.locator("[data-panel='tracks']")).toHaveCount(0);
  await page.locator(".drawer-close").click();

  await page.evaluate(async () => {
    const cache = (window as unknown as { appCache: AppCache }).appCache;
    await cache.parcels.update(2, { status: "draft" });
  });
  await page.reload();
  const draftRow = page.locator('.item-entry:has([data-edit="11"])');
  await expect(draftRow.locator('[data-add-track="11"]')).toBeVisible();
  await expect(draftRow.locator(".track-weight")).toHaveCount(0);
  await expect(draftRow.locator(".track-code")).toHaveText("KAT-1");

  await draftRow.locator("[data-edit]").click();
  await expect(page.locator("[data-panel='tracks']")).toBeVisible();
});

test("item rows use the ledger line treatment", async ({ page }) => {
  await page.goto("/#/parcel/2");
  const row = page.locator('.item-entry:has([data-edit="11"])');
  await expect(row.locator(".item-entry__side")).toBeVisible();
  await expect(row.locator(".item-entry__price")).toBeVisible();
  await expect(row.locator(".pay-check")).toBeVisible();
  await expect(row.locator(".track-value-row")).toHaveCount(1);
  await expect(
    page.locator('[data-item-group][data-customer="2"] .customer-items-fold > summary'),
  ).toContainText("Товары");

  const trackRadius = await row
    .locator(".track-value-row")
    .evaluate((el) => getComputedStyle(el).borderRadius);
  const payRadius = await row
    .locator(".pay-check")
    .evaluate((el) => getComputedStyle(el).borderRadius);
  const editBackground = await row
    .locator(".parcel-entry__actions > .btn-icon")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(trackRadius).toBe("6px");
  expect(payRadius).toBe("999px");
  expect(editBackground).toBe("rgba(0, 0, 0, 0)");
});

test("delivery follows one fact on both screens when weight is missing", async ({ page }) => {
  await page.goto("/#/customer/2");
  await expect(page.locator("[data-toggle-shipping]")).toBeEnabled();
  const withWeight = await page.locator(".check-row--total b").innerText();

  await page.evaluate(async () => {
    const cache = (window as unknown as { appCache: AppCache }).appCache;
    await cache.parcels.update(2, { boxWeightG: null });
  });
  await page.reload();

  await page.goto("/#/customer/2");
  await expect(page.locator("[data-toggle-shipping]")).toBeDisabled();
  await expect(page.locator(".pay-summary--delivery .pay-summary__note")).toContainText(
    "цена не задана",
  );
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
  const katya = page.locator('[data-item-group][data-customer="2"]');
  await expect(katya.locator(".shipping-paid")).toHaveCount(0);
  await expect(katya.locator(".payment-bullet").last()).toContainText("Доставка: —");

  await page.goto("/#/customer/2");
  await expect(page.locator("[data-toggle-shipping]")).toBeDisabled();

  await page.locator(".customer-items-fold > summary").click();
  await page.locator('[data-toggle-payment="11"]').check();
  await expect(page.locator('[data-toggle-goods="2"]')).toBeChecked();

  const shippingRows = await page.evaluate(async () => {
    const payments = await (
      window as unknown as { appCache: AppCache }
    ).appCache.payments.toArray();
    return payments.filter((payment) => payment.type === "shipping" && payment.paid).length;
  });
  expect(shippingRows).toBe(0);
});

test("paid goods without delivery are not shown as paid", async ({ page }) => {
  await seedPaidDraftFixture(page);
  await page.goto("/#/customer/2");
  const draft = page.locator(".customer-statement").filter({ hasText: "Посылка #1" });
  const pill = draft.locator(".parcel-debt");

  await expect(draft.locator(".parcel-entry__head .parcel-debt")).toHaveCount(0);
  await expect(pill).toHaveText("без доставки");
  await expect(pill).toHaveClass(/is-pending/);

  await page.goto("/#/parcel/1");
  await expect(page.locator(".parcel-calc__item--headline")).toContainText("Доставка не учтена");
  const groupPill = page.locator(
    '[data-item-group][data-customer="2"] .item-group__head .parcel-debt',
  );
  await expect(groupPill).toHaveText("без доставки");
  await expect(groupPill).toHaveClass(/is-pending/);
});

test("payment toggle sits with the price and self stays paid", async ({ page }) => {
  await page.goto("/#/parcel/2");
  await expect(page.locator('[data-toggle-payment="10"]')).toHaveCount(0);

  const pay = page.locator('[data-toggle-payment="11"]');
  const payLabel = page.locator('.pay-check:has([data-toggle-payment="11"]) .pay-check__label');
  await expect(pay).not.toBeChecked();
  await expect(payLabel).toHaveText("Оплатить");
  await pay.check();
  await expect(pay).toBeChecked();
  await expect(payLabel).toHaveText("Оплачено");

  // A mistaken payment can be unchecked from the same spot.
  await pay.uncheck();
  await expect(pay).not.toBeChecked();
  await expect(payLabel).toHaveText("Оплатить");
  await pay.check();
  await expect(pay).toBeChecked();

  await page.reload();
  await expect(page.locator('[data-toggle-payment="11"]')).toBeChecked();

  const paid = await page.evaluate(async () => {
    const payments = await (
      window as unknown as { appCache: AppCache }
    ).appCache.payments.toArray();
    return payments.filter((p) => p.itemId === 11 && p.paid).length;
  });
  expect(paid).toBe(1);
});

test("goods payment checkbox flips immediately and stays in sync", async ({ page }) => {
  await page.goto("/#/parcel/2");
  const check = page.locator('.item-paid-all[data-customer="2"]');
  const label = page.locator('[data-item-group][data-customer="2"] .payment-bullet', {
    hasText: "Товары:",
  });
  await expect(label).toContainText("2.60 BYN");
  await expect(check).not.toBeChecked();
  await expect(label).toContainText("не оплачено");

  await check.check();
  await expect(check).toBeChecked();
  await expect(label).toContainText("оплачено");
  await expect(label.locator(".pay-summary__amount")).toHaveCSS("color", "rgb(15, 123, 90)");
  await expect(page.locator("#toastContainer")).not.toContainText("Не удалось изменить оплату");
});

test("customer card toggles one item, all goods and shipping", async ({ page }) => {
  await page.goto("/#/customer/2");
  await expect(page.locator(".customer-items")).toBeHidden();
  await expect(page.getByText("Посылка оплачена")).toHaveCount(0);
  await page.locator(".customer-items-fold > summary").click();
  await expect(page.locator('[data-toggle-payment="11"]')).toBeVisible();
  await expect(
    page.locator(".pay-summary", { hasText: "Товары оплачены" }).locator(".pay-summary__amount"),
  ).toHaveText("2.60 BYN");
  await expect(page.locator('[data-toggle-shipping="2"]')).not.toBeChecked();

  await page.locator('[data-toggle-payment="11"]').check();
  await expect(
    page.locator("#toastContainer .toast__message", { hasText: "Товар отмечен как оплаченный" }),
  ).toBeVisible();
  await expect(page.locator('[data-toggle-goods="2"]')).toBeChecked();
  await expect(
    page.locator('.item-check:has([data-toggle-payment="11"]) .item-check__price'),
  ).toHaveCSS("color", "rgb(15, 123, 90)");

  await page.locator('[data-toggle-shipping="2"]').check();
  await expect(
    page.locator("#toastContainer .toast__message", { hasText: "Доставка оплачена" }),
  ).toBeVisible();
  await expect(
    page.locator(".pay-summary", { hasText: "Доставка оплачена" }).locator(".pay-summary__amount"),
  ).toHaveCSS("color", "rgb(15, 123, 90)");

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

test("goods checkbox pays goods only and turns pink", async ({ page }) => {
  await page.goto("/#/customer/2");
  await expect(page.locator(".customer-items")).toBeHidden();
  const goods = page.locator('[data-toggle-goods="2"]');
  await expect(goods).not.toBeChecked();

  await goods.check();
  await expect(page.locator('[data-toggle-payment="11"]')).toBeChecked();
  await expect(page.locator('[data-toggle-shipping="2"]')).not.toBeChecked();
  expect(await goods.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    "rgb(216, 27, 96)",
  );

  await goods.uncheck();
  await expect(page.locator('[data-toggle-payment="11"]')).not.toBeChecked();
  await expect(page.locator(".parcel-debt")).toHaveClass(/is-debt/);
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
    next: getComputedStyle(document.querySelector(".detail-hero__next")!).getPropertyValue(
      "view-transition-name",
    ),
  }));
  expect(names).toEqual({
    title: "parcel-title",
    date: "parcel-date",
    next: "parcel-next",
  });
});

test("customer row parts morph into the detail hero", async ({ page }) => {
  await page.goto("/#/people");
  await expect(page.locator(".page-customers")).toBeVisible();

  await page.locator('[data-open-customer="2"]').click();
  await expect(page.locator(".page-customer-detail")).toBeVisible();

  const names = await page.evaluate(() => ({
    title: getComputedStyle(document.querySelector(".detail-hero h1")!).getPropertyValue(
      "view-transition-name",
    ),
    mark: getComputedStyle(document.querySelector(".detail-hero .customer-mark")!).getPropertyValue(
      "view-transition-name",
    ),
    facts: getComputedStyle(document.querySelector(".detail-hero__facts")!).getPropertyValue(
      "view-transition-name",
    ),
  }));
  expect(names).toEqual({
    title: "customer-title",
    mark: "customer-mark",
    facts: "customer-facts",
  });
});

test("bottom dock keeps its own compositing layer", async ({ page }) => {
  await page.goto("/#/parcels");
  const wrap = page.locator(".bottombar-wrap");
  await expect(wrap).toBeVisible();
  expect(await wrap.evaluate((el) => getComputedStyle(el).willChange)).toBe("transform");
  await expect(page.locator("#bottombar a")).toHaveCount(3);
});

test("search filters items without toggling a group", async ({ page }) => {
  await page.goto("/#/parcel/2");
  const group = page.locator('[data-item-group][data-customer="2"]');
  const fold = group.locator(".customer-items-fold");
  await expect(group).toBeVisible();
  await expect(fold).toHaveAttribute("open", "");
  await expect(group.locator(".item-entry")).toHaveCount(1);

  await fold.locator("summary").click();
  await expect(fold).not.toHaveAttribute("open", "");

  await page.locator("#parcelItemSearch").fill("Катя");
  await expect(group).toBeVisible();
  await expect(fold).toHaveAttribute("open", "");
  await expect(group.locator(".item-entry")).toHaveCount(1);
  await expect(group.locator(".item-entry")).toContainText("Товар Кати");

  await page.locator("#parcelItemSearch").fill("нет такого товара");
  await expect(group).toHaveCount(0);
  await expect(page.locator("#parcelItemNoResults")).toBeVisible();
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

    const entry = page.locator(".parcel-entry:has(.parcel-entry__hint)").first();
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

    const hint = entry.locator(".parcel-entry__hint").first();
    const hintStyle = await hint.evaluate((el) => {
      const style = getComputedStyle(el);
      return { overflow: style.overflow, ellipsis: style.textOverflow };
    });
    expect(hintStyle).toEqual({ overflow: "hidden", ellipsis: "ellipsis" });
  }

  await expectParcelEntryStyles("/#/customer/2");
  await expectParcelEntryStyles("/#/parcel/2");
  await expectParcelEntryStyles("/#/parcels");

  await page.goto("/#/customer/2");
  const arrow = page.locator(".page-customer-detail .parcel-line .btn-icon").first();
  await expect(arrow).toBeVisible();
  const arrowStyle = await arrow.evaluate((el) => {
    const style = getComputedStyle(el);
    return { bg: style.backgroundColor, color: style.color, width: style.width };
  });
  expect(arrowStyle).toEqual({
    bg: "rgb(255, 228, 239)",
    color: "rgb(157, 20, 80)",
    width: "40px",
  });
});

test("parcel status is not repeated next to the next step", async ({ page }) => {
  await page.goto("/#/parcels");
  await expect(page.locator(".page-parcels .parcel-entry__state")).toHaveCount(0);

  await page.goto("/#/parcel/2");
  await expect(page.locator(".detail-state")).toHaveCount(0);
  await expect(page.locator(".detail-hero__next")).toHaveText("Ждёт распределения");
  await expect(page.locator(".item-group__head .parcel-entry__state")).toHaveCount(0);

  await page.goto("/#/customer/2");
  await expect(page.locator(".customer-statement .parcel-entry__state")).toHaveCount(0);
  await expect(page.locator(".customer-parcel-hint__text")).toHaveText("Ждёт распределения");
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
