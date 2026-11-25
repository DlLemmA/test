import { expect, test } from "@playwright/test";
import { seedSmokeData } from "./seed";

test.beforeEach(async ({ page }) => {
  await seedSmokeData(page);
});

test("pays a customer's goods from the labelled balance action", async ({ page }) => {
  await page.goto("/#/customer/2");
  await expect(page.getByText("Баланс заказчика", { exact: true })).toBeVisible();

  const goodsAction = page.locator('[data-pay-goods="2"]');
  await expect(goodsAction).toHaveText("Отметить оплату");
  await goodsAction.click();
  await expect(
    page.locator("#toastContainer .toast__message", { hasText: "Товары оплачены" }),
  ).toBeVisible();
  await expect(page.locator('[data-toggle-goods="2"]')).toBeChecked();
  await expect(goodsAction).toHaveText("Снять оплату");
});
