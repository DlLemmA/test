import { expect, test, type Page } from "@playwright/test";
import { seedSmokeData } from "./seed";

async function enterSums(page: Page, cny: string, byn: string) {
  await page.locator("#sumCNY").fill(cny);
  await page.locator("#sumBYN").fill(byn);
  await page.locator('#stage1Form button[type="submit"]').click();
}

async function enterPlainBatch(page: Page, customer: string, customerId: string, csv: string) {
  await page.locator("#customerComboInput").fill(customer);
  await page.locator(`[data-customer-id="${customerId}"]`).click();
  await page.locator("#csvText").fill(csv);
  await page.locator("#addBatchBtn").click();
  await page.locator("#checkStepBtn").click();
}

test.describe("MakeAnOrder", () => {
  test.beforeEach(async ({ page }) => {
    await seedSmokeData(page);
  });

  test("creates a new parcel from a batch and distributes commission", async ({ page }) => {
    await page.goto("/#/add");
    await expect(page.locator("#addParcelSelect")).toHaveValue("1");
    await page.locator("#addParcelSelect").selectOption("0");
    await enterSums(page, "105", "13.65");
    await enterPlainBatch(page, "Катя", "2", "Товар с комиссией 1 шт 100");

    await expect(page.getByText("Комиссия (распределится по товарам)")).toBeVisible();
    await page.locator("#saveBatchBtn").click();
    await expect(
      page.locator("#toastContainer .toast__message", { hasText: "Партия сохранена (1 товар)" }),
    ).toBeVisible();
    await expect(page.locator(".parcel-index .parcel-entry")).toHaveCount(3);

    await page.locator('[data-open="3"]').click();
    await expect(page.locator(".detail-hero h1")).toHaveText("Посылка №3");
    const group = page.locator('[data-item-group][data-customer="2"]');
    await expect(group).toContainText("Товар с комиссией");
    await expect(group.locator(".item-entry__price")).toHaveText("13.65 BYN");
    await expect(page.locator(".parcel-calc__item--headline")).toContainText("Должны");
    await expect(page.locator(".parcel-calc__item--headline")).toContainText("13.65 BYN");
  });

  test("records an item for the self customer as paid", async ({ page }) => {
    await page.goto("/#/add");
    await enterSums(page, "10", "1.3");
    await enterPlainBatch(page, "Я", "1", "Товар Я из партии 1 шт 10");
    await page.locator("#saveBatchBtn").click();
    await expect(
      page.locator("#toastContainer .toast__message", { hasText: "Партия сохранена (1 товар)" }),
    ).toBeVisible();

    await expect(page.locator(".parcel-index .parcel-entry")).toHaveCount(2);
    await page.locator('[data-open="1"]').click();
    const selfGroup = page.locator('[data-item-group][data-customer="1"]');
    await expect(selfGroup).toContainText("Товар Я из партии");
    await expect(selfGroup.locator("[data-toggle-payment]").first()).toBeChecked();
    await expect(selfGroup.locator(".item-pay-summary")).toContainText("Оплачено");
  });

  test("adds a batch to the preselected draft", async ({ page }) => {
    await page.goto("/#/add");
    await expect(page.locator("#addParcelSelect option")).toHaveCount(2);
    await expect(page.locator("#addParcelSelect")).toHaveValue("1");
    await expect(page.locator("#addParcelSelect option").nth(1)).toHaveText(/Посылка №1/);

    await page.goto("/#/parcel/1");
    await page.locator("#openBatchForm").click();
    await expect(page.locator("#addParcelSelect")).toHaveValue("1");

    await enterSums(page, "10", "1.3");
    await enterPlainBatch(page, "Катя", "2", "Товар в черновик 1 шт 10");

    await page.locator("#saveBatchBtn").click();
    await expect(
      page.locator("#toastContainer .toast__message", { hasText: "Партия сохранена (1 товар)" }),
    ).toBeVisible();
    await expect(page.locator(".parcel-index .parcel-entry")).toHaveCount(2);

    await page.locator('[data-open="1"]').click();
    await expect(page.locator('[data-item-group][data-customer="2"]')).toContainText(
      "Товар в черновик",
    );
  });

  test("creates a customer inline and keeps the selection", async ({ page }) => {
    await page.goto("/#/add");
    await enterSums(page, "20", "2.6");

    await page.locator("#customerComboInput").fill("Новый заказчик");
    await page.locator("#csvText").fill("Товар нового 1 шт 20");
    await page.locator("#addBatchBtn").click();
    await expect(
      page.locator("#toastContainer .toast__message", {
        hasText: "Заказчик «Новый заказчик» добавлен",
      }),
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

    await page.goto("/#/people");
    const customer = page.locator(".customer-line").filter({ hasText: "Новый заказчик" });
    await expect(customer.locator(".customer-row__meta")).toContainText("1 товар");
    await customer.locator("[data-open-customer]").click();
    await expect(page.locator(".customer-items-fold")).toContainText("Товар нового");
  });

  test("rejects invalid totals before showing goods", async ({ page }) => {
    await page.goto("/#/add");
    const expected = page.locator("#expectedItemsCount");
    const cny = page.locator("#sumCNY");

    await expected.fill("0");
    await cny.fill("0");
    await page.locator("#sumBYN").fill("1.3");
    await page.locator('#stage1Form button[type="submit"]').click();

    await expect(expected).toHaveJSProperty(
      "validationMessage",
      "Укажите количество товаров целым числом от 1",
    );
    await expect(expected).toBeFocused();
    await expect(page.locator(".page-head h1")).toHaveText("Новая партия");

    await expected.fill("1");
    await page.locator('#stage1Form button[type="submit"]').click();
    await expect(cny).toHaveJSProperty("validationMessage", "Укажите сумму заказа в CNY");
    await expect(cny).toBeFocused();

    await cny.fill("10");
    await page.locator('#stage1Form button[type="submit"]').click();
    await expect(page.locator(".page-head h1")).toHaveText("Товары партии");
  });

  test("requires at least one goods row before review", async ({ page }) => {
    await page.goto("/#/add");
    await enterSums(page, "10", "1.3");

    await page.locator("#checkStepBtn").click();
    await expect(
      page.locator("#toastContainer .toast__message", {
        hasText: "Добавьте хотя бы один товар в партию",
      }),
    ).toBeVisible();
    await expect(page.locator(".page-head h1")).toHaveText("Товары партии");

    await enterPlainBatch(page, "Катя", "2", "Товар 1 шт 10");
    await expect(page.locator(".page-head h1")).toHaveText("Проверка партии");
  });

  test("adds a single item through the wizard", async ({ page }) => {
    await page.goto("/#/parcel/1");
    await expect(page.locator(".page-parcel-detail")).toBeVisible();

    await page.locator("#addItem").click();
    await expect(page.locator("#itemForm")).toBeVisible();

    await page.locator("#itemName").fill("Новый товар");
    await page.locator("#itemPriceCNY").fill("10");
    await page.locator("#itemPriceBYN").fill("3");
    await page.locator("[data-panel='main'] button[type='submit']").click();

    await expect(page.locator("#toastContainer")).toContainText("Товар сохранён");
    const row = page.locator(".item-entry").filter({ hasText: "Новый товар" });
    await expect(row).toBeVisible();

    await row.locator("[data-edit]").click();
    await expect(page.locator("#itemForm")).toBeVisible();
    await expect(page.locator("[data-panel='tracks']")).toBeVisible();
    await page.locator("[data-track-row] input[name='track']").first().fill("TRACK-NEW");
    await page.locator("input[name='tracksCompleted']").check();
    await page.locator("[data-panel='tracks'] button[type='submit']").click();

    await expect(page.locator("#toastContainer")).toContainText("Товар сохранён");
    await expect(row).toContainText("TRACK-NEW");
  });
});
