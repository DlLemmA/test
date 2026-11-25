import { expect, test } from "@playwright/test";
import { seedReceiveFixture, seedSmokeData } from "../seed";

test("enters from sign-in to the parcel list", async ({ page }) => {
  await page.goto("/#/sign-in?next=/parcels");

  await expect(page.locator("#signInTitle")).toHaveText("Pindoчет");
  await page.locator("#enterTestMode").click();

  await expect(page).toHaveURL(/#\/parcels$/);
  await expect(page.locator(".page-parcels")).toBeVisible();
});

test("opens a parcel and returns to the list", async ({ page }) => {
  await seedSmokeData(page);
  await page.goto("/#/parcels");

  await page.locator('[data-open="2"]').click();
  await expect(page.locator(".detail-hero h1")).toContainText("Посылка №2");

  await page.locator("#backToParcels").click();
  await expect(page).toHaveURL(/#\/parcels$/);
  await expect(page.locator('[data-open="2"]')).toBeVisible();
});

test("creates a batch from pasted lines", async ({ page }) => {
  await seedSmokeData(page);
  await page.goto("/#/add");

  await page.locator("#addParcelSelect").selectOption("0");
  await page.locator("#sumCNY").fill("10");
  await page.locator("#sumBYN").fill("1.3");
  await page.locator('#stage1Form button[type="submit"]').click();

  await page.locator("#customerComboInput").fill("Катя");
  await page.locator('[data-customer-id="2"]').click();
  await page.locator("#csvText").fill("Носки 1 шт 10");
  await page.locator("#addBatchBtn").click();
  await expect(page.locator("#batchItemsList .batch-row")).toHaveCount(1);

  await page.locator("#checkStepBtn").click();
  await page.locator("#saveBatchBtn").click();
  await expect(
    page.locator("#toastContainer .toast__message", { hasText: "Партия сохранена" }),
  ).toBeVisible();
});

test("marks a customer's goods paid", async ({ page }) => {
  await seedSmokeData(page);
  await page.goto("/#/customer/2");

  await page.locator('[data-pay-goods="2"]').click();
  await expect(page.locator('[data-toggle-goods="2"]')).toBeChecked();
  await expect(
    page.locator("#toastContainer .toast__message", { hasText: "Товары оплачены" }),
  ).toBeVisible();
});

test("exports a finished parcel without a CDN", async ({ page }) => {
  const cdnRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("jsdelivr")) cdnRequests.push(request.url());
  });

  await seedSmokeData(page);
  await page.goto("/#/parcel/2");
  // WebKit's headless share sheet never emits a download, so exercise the
  // same fallback path that iOS uses when Web Share cannot accept files.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
  });
  await page.locator("#markAsDone").click();
  await page.locator("#exportParcel").waitFor();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#exportParcel").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^Посылка_.+\.xlsx$/u);
  expect(cdnRequests).toEqual([]);
});

test("falls back to manual receiving when the camera is unavailable", async ({ page }) => {
  await seedReceiveFixture(page);
  await page.goto("/#/parcel/3");
  await page.locator("#receiveParcel").click();

  await page.locator("#rfManualStart").click();
  await expect(page.locator("#rfScanForm")).toHaveCount(0);
  await expect(page.locator(".rf-manual-item")).toHaveCount(1);
});
