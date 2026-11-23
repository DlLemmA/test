import { expect, test } from "@playwright/test";
import { seedSmokeData, type AppDb } from "./seed";

test.beforeEach(async ({ page }) => {
  await seedSmokeData(page);
});

/** Item groups and their action menus are collapsed until a user opens them. */
async function openKatyaItemMenu(page: import("@playwright/test").Page): Promise<void> {
  await page.locator('details[data-item-group][data-customer="2"] > summary').click();
  await page
    .locator("details.entry-menu")
    .filter({ has: page.locator('[data-toggle-payment="11"]') })
    .locator("summary")
    .click();
}

test("opens a parcel from the list", async ({ page }) => {
  await page.goto("/#parcels");
  await expect(page.locator(".page-parcels")).toBeVisible();

  await page.locator('[data-open="2"]').click();

  await expect(page).toHaveURL(/#parcel\/2$/);
  await page.locator('details[data-item-group][data-customer="2"] > summary').click();
  await expect(
    page.locator(".page-parcel-detail").getByText("Товар Кати", { exact: true }),
  ).toBeVisible();
});

test("payment toggle persists and self stays paid", async ({ page }) => {
  await page.goto("/#parcel/2");
  await openKatyaItemMenu(page);
  await page.locator('[data-toggle-payment="11"]').click();

  await expect(page.locator('[data-toggle-payment="11"]')).toHaveClass(/is-paid/);
  await expect(page.locator('[data-toggle-payment="11"]')).toBeDisabled();
  await expect(page.locator('[data-toggle-payment="10"]')).toBeDisabled();

  await page.reload();
  await openKatyaItemMenu(page);
  await expect(page.locator('[data-toggle-payment="11"]')).toHaveClass(/is-paid/);

  const paid = await page.evaluate(async () => {
    const payments = await (window as unknown as { appDb: AppDb }).appDb.payments.toArray();
    return payments.filter((p) => p.itemId === 11 && p.paid).length;
  });
  expect(paid).toBe(1);
});

test("saves a batch with distributed commission and a paid self item", async ({ page }) => {
  await page.goto("/#add");
  await page.locator("#sumCNY").fill("105");
  await page.locator("#sumBYN").fill("13.65");
  await page.locator('#stage1Form button[type="submit"]').click();

  await page.locator("#customerComboInput").fill("Катя");
  await page.locator('[data-customer-id="2"]').click();
  await page.locator("#csvText").fill("Товар с комиссией 1 шт 100");
  await page.locator("#addBatchBtn").click();
  await page.locator("#checkStepBtn").click();

  await expect(page.getByText("Комиссия (распределится по товарам)")).toBeVisible();
  await page.locator("#saveBatchBtn").click();
  await expect(page.getByText("Партия сохранена (1 товаров)")).toBeVisible();

  const batch = await page.evaluate(async () => {
    const db = (window as unknown as { appDb: AppDb }).appDb;
    const item = (await db.parcelItems.toArray()).find((i) => i.name === "Товар с комиссией");
    const payments = await db.payments.toArray();
    return { priceCNY: item?.priceCNY, customerId: item?.customerId, payments: payments.length };
  });
  expect(batch.priceCNY).toBe(105);
  expect(batch.customerId).toBe(2);
  expect(batch.payments).toBe(2);

  await page.goto("/#add");
  await page.locator("#sumCNY").fill("10");
  await page.locator("#sumBYN").fill("1.3");
  await page.locator('#stage1Form button[type="submit"]').click();

  await page.locator("#customerComboInput").fill("Я");
  await page.locator('[data-customer-id="1"]').click();
  await page.locator("#csvText").fill("Товар Я из партии 1 шт 10");
  await page.locator("#addBatchBtn").click();
  await page.locator("#checkStepBtn").click();
  await page.locator("#saveBatchBtn").click();
  await expect(page.getByText("Партия сохранена (1 товаров)")).toBeVisible();

  const selfPayment = await page.evaluate(async () => {
    const db = (window as unknown as { appDb: AppDb }).appDb;
    const item = (await db.parcelItems.toArray()).find((i) => i.name === "Товар Я из партии");
    const payments = await db.payments.toArray();
    return payments.find((p) => p.itemId === item?.id);
  });
  expect(selfPayment?.paid).toBe(true);
});

test("customer card toggles one item and the whole parcel", async ({ page }) => {
  await page.goto("/#customer/2");

  await page.locator('[data-toggle-payment="11"]').check();
  await expect(
    page.locator("#toastContainer").getByText("Товар отмечен как оплаченный"),
  ).toBeVisible();

  await page.locator('[data-toggle-parcel="2"]').check();
  await expect(page.locator("#toastContainer").getByText("Посылка оплачена")).toBeVisible();

  const state = await page.evaluate(async () => {
    const payments = await (window as unknown as { appDb: AppDb }).appDb.payments.toArray();
    return {
      paidItems: payments.filter((p) => p.type === "item" && p.paid).length,
      paidShipping: payments.filter((p) => p.type === "shipping" && p.paid).length,
    };
  });
  expect(state.paidItems).toBe(1);
  expect(state.paidShipping).toBe(1);
});
