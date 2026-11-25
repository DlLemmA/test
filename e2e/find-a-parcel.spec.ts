import { expect, test } from "@playwright/test";
import { seedSmokeData } from "./seed";

test.beforeEach(async ({ page }) => {
  await seedSmokeData(page);
});

test("finds parcels by name, number or track and filters by status", async ({ page }) => {
  await page.goto("/#/parcels");
  const entries = page.locator(".page-parcels .parcel-entry");
  await expect(entries).toHaveCount(2);

  await page.locator("#parcelSearch").fill("KAT-1");
  await expect(entries).toHaveCount(1);
  await expect(page.locator('[data-open="2"]')).toBeVisible();

  await page.locator("#parcelSearch").fill("");
  await page.locator('[data-filter="draft"]').click();
  await expect(entries).toHaveCount(1);
  await expect(page.locator('[data-open="1"]')).toBeVisible();

  await page.locator('[data-filter="debt"]').click();
  await expect(page.locator('[data-filter="debt"]')).toHaveAttribute("aria-pressed", "true");
  await expect(entries).toHaveCount(1);
  await expect(page.locator('[data-open="2"]')).toBeVisible();

  await page.locator("#parcelSearch").fill("нет такого трека");
  const empty = page.locator(".screen-state[data-kind='empty']");
  await expect(empty.getByText("Ничего не найдено")).toBeVisible();
  await expect(empty).toHaveCSS("border-left-width", "0px");
  await expect(empty).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await expect(entries).toHaveCount(2);
});
