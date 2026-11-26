import { expect, test } from "@playwright/test";
import { seedSmokeData } from "./seed";

test.beforeEach(async ({ page }) => {
  await seedSmokeData(page);
});

test("finds a customer by name and clears the search", async ({ page }) => {
  await page.goto("/#/people");
  const rows = page.locator(".customer-index li");
  await expect(rows).toHaveCount(2);

  await page.locator("#customerSearch").fill("кат");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Катя");

  await page.locator("#customerSearch").fill("нет такого");
  await expect(page.getByText("Ничего не найдено")).toBeVisible();

  await page.getByRole("button", { name: "Сбросить поиск" }).click();
  await expect(rows).toHaveCount(2);
});
