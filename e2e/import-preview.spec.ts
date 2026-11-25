import { expect, test } from "@playwright/test";
import { seedSmokeData } from "./seed";

test.beforeEach(async ({ page }) => {
  await seedSmokeData(page);
});

test("previews numbered import lines and blocks bad rows before commit", async ({ page }) => {
  await page.goto("/#/add");
  await page.locator("#sumCNY").fill("10");
  await page.locator("#sumBYN").fill("1.3");
  await page.locator('#stage1Form button[type="submit"]').click();

  await page.locator("#customerComboInput").fill("Катя");
  await page.locator('[data-customer-id="2"]').click();
  await page.locator("#csvText").fill("Носки 1 шт 10\nПлохо 0 шт 5");

  const lines = page.locator(".import-preview__line");
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0).locator(".import-preview__ok")).toContainText("Носки");
  await expect(lines.nth(1).locator(".import-preview__error")).toContainText(
    "Строка 2: неверное количество",
  );

  await page.locator("#addBatchBtn").click();
  await expect(page.locator('[role="alert"]', { hasText: "Строка 2" })).toBeVisible();
  await expect(page.locator("#batchItemsList .batch-row")).toHaveCount(0);

  await page.locator("#csvText").fill("Носки 1 шт 10");
  await expect(lines).toHaveCount(1);
  await expect(lines.first().locator(".import-preview__error")).toHaveCount(0);
  await page.locator("#addBatchBtn").click();
  await expect(page.locator("#batchItemsList .batch-row")).toHaveCount(1);
});
