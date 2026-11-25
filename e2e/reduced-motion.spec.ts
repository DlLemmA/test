import { expect, test } from "@playwright/test";
import { seedReceiveFixture, seedSmokeData } from "./seed";

test.use({ reducedMotion: "reduce" });

test("keeps progress, toasts and drawers static but visible", async ({ page }) => {
  await seedSmokeData(page);
  await page.goto("/#/add");
  await page.locator("#sumCNY").fill("10");
  await page.locator("#sumBYN").fill("1.3");
  await page.locator('#stage1Form button[type="submit"]').click();

  await page.locator("#customerComboInput").fill("Катя");
  await page.locator('[data-customer-id="2"]').click();
  await page.locator("#csvText").fill("Носки 1 шт 10");
  await page.locator("#addBatchBtn").click();

  const fill = page.locator(".rate-fill");
  await expect(fill).toBeVisible();
  await expect(fill).toHaveCSS("transition-duration", "0s");

  const toast = page.locator("#toastContainer .toast").first();
  await expect(toast).toBeVisible();
  await expect(toast).toHaveCSS("animation-name", "none");

  await page.goto("/#/people");
  await page.locator("#addCustomer").click();
  const sheet = page.locator(".app-drawer-content");
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveCSS("animation-name", "none");
  await expect(sheet).toHaveCSS("transition-duration", "0s");
  await expect(page.locator(".app-drawer-overlay")).toHaveCSS("animation-name", "none");
});

test("keeps scan feedback visible without animation", async ({ page }) => {
  await seedReceiveFixture(page);
  await page.goto("/#/parcel/3");
  await page.locator("#receiveParcel").click();
  await page.locator("#rfStart").click();
  await page.locator("#rfCodeInput").fill("NO-SUCH-TRACK");
  await page.locator('#rfScanForm button[type="submit"]').click();

  const flash = page.locator("#rfFlash");
  await expect(flash).toHaveCSS("opacity", "0.7");
  await expect(flash).toHaveCSS("animation-name", "none");
});
