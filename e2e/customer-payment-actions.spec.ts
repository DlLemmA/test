import { expect, test } from "@playwright/test";
import { seedSmokeData } from "./seed";

test.beforeEach(async ({ page }) => {
  await seedSmokeData(page);
});

test("pays a customer's goods from the labelled checkbox", async ({ page }) => {
  await page.goto("/#/customer/2");
  await expect(page.getByText("Баланс заказчика", { exact: true })).toBeVisible();

  const goodsCheckbox = page.locator('[data-toggle-goods="2"]');
  await expect(goodsCheckbox).not.toBeChecked();
  await goodsCheckbox.check();
  await expect(
    page.locator("#toastContainer .toast__message", { hasText: "Товары оплачены" }),
  ).toBeVisible();
  await expect(goodsCheckbox).toBeChecked();
});
