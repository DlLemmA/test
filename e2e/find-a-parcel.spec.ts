import { expect, test } from "@playwright/test";
import { seedSmokeData } from "./seed";

test.beforeEach(async ({ page }) => {
  await seedSmokeData(page);
});

test("finds parcels by name, number or track and filters by status", async ({ page }) => {
  await page.goto("/#/parcels");
  const entries = page.locator(".page-parcels .parcel-entry");
  await expect(entries).toHaveCount(2);
  await expect(page.locator('[data-attention="draft"]')).toContainText("Черновики: 1");
  await expect(page.locator('[data-attention="debt"]')).toContainText("С долгом: 1");

  await page.locator("#parcelSearch").fill("KAT-1");
  await expect(entries).toHaveCount(1);
  await expect(page.locator('[data-open="2"]')).toBeVisible();

  await page.locator("#parcelSearch").fill("");
  await page.locator('[data-filter="draft"]').click();
  await expect(entries).toHaveCount(1);
  await expect(page.locator('[data-open="1"]')).toBeVisible();

  await page.locator('[data-attention="debt"]').click();
  await expect(page.locator('[data-filter="debt"]')).toHaveAttribute("aria-pressed", "true");
  await expect(entries).toHaveCount(1);
  await expect(page.locator('[data-open="2"]')).toBeVisible();

  await page.locator("#parcelSearch").fill("нет такого трека");
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await expect(entries).toHaveCount(2);
});
