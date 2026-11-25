import { expect, test } from "@playwright/test";
import { seedShipFixture, seedSmokeData } from "./seed";

test.describe("SendAParcel", () => {
  test("blocks an empty draft", async ({ page }) => {
    await seedSmokeData(page);
    await page.goto("/#/parcel/1");
    await page.locator("#shipParcel").click();

    await expect(page.locator(".inline-error")).toContainText("Нельзя отправить пустую посылку");
    await expect(page.locator("#shipForm")).toHaveCount(0);
  });

  test("explains unconfirmed tracks", async ({ page }) => {
    await seedShipFixture(page, "unconfirmed");
    await page.goto("/#/parcel/1");

    await page.locator("#shipParcel").click();
    await expect(page.locator(".inline-error")).toContainText("не отмечены «Треки заполнены»");
    await expect(page.locator("#shipForm")).toHaveCount(0);
  });

  test("blocks an item with no tracks", async ({ page }) => {
    await seedShipFixture(page, "untracked");
    await page.goto("/#/parcel/1");
    await expect(page.locator(".item-entry__no-tracks")).toHaveText("Треков пока нет");

    await page.locator("#shipParcel").click();
    await expect(page.locator(".inline-error")).toContainText("не отмечены");
    await expect(page.locator("#shipForm")).toHaveCount(0);
  });

  test("rejects empty shipping facts and recovers", async ({ page }) => {
    await seedShipFixture(page, "track-ready");
    await page.goto("/#/parcel/1");
    await page.locator("#shipParcel").click();
    await expect(page.locator("#shipForm")).toBeVisible();

    const weight = page.locator("#shipBoxWeight");
    const amount = page.locator("#shipAmount");
    await page.locator("#shipForm button[type='submit']").click();
    await expect(weight).toHaveJSProperty("validationMessage", "Укажите вес посылки");
    await expect(weight).toHaveAttribute("aria-invalid", "true");
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(weight).toBeFocused();
    await expect(page.locator("#shipForm")).toBeVisible();

    await weight.fill("600");
    await amount.fill("12.50");
    await page.locator("#shipForm button[type='submit']").click();
    await expect(
      page.locator("#toastContainer .toast__message", { hasText: "Посылка отправлена" }),
    ).toBeVisible();
    await expect(page.locator("#receiveParcel")).toBeVisible();
  });

  test("ships with typed weight and amount", async ({ page }) => {
    await seedShipFixture(page, "track-ready");
    await page.goto("/#/parcel/1");

    await page.locator("#shipParcel").click();
    await page.locator("#shipBoxWeight").fill("600");
    await page.locator("#shipAmount").fill("12.50");
    await page.locator("#shipForm button[type=submit]").click();

    await expect(
      page.locator("#toastContainer .toast__message", { hasText: "Посылка отправлена" }),
    ).toBeVisible();
    await expect(page.locator("#receiveParcel")).toBeVisible();
  });
});
