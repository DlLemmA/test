import { expect, test, type Page } from "@playwright/test";
import { seedReceiveFixture, seedUnweighedFixture } from "./seed";

async function openReceiveDialog(page: Page): Promise<void> {
  await page.goto("/#/parcel/3");
  await page.locator("#receiveParcel").click();
  await expect(page.locator("#receiveFlow")).toBeVisible();
}

test.describe("ReceiveParcel", () => {
  test("accepts weights and commits items", async ({ page }) => {
    await seedReceiveFixture(page);
    await openReceiveDialog(page);
    await expect(page.locator("#rfTitle")).toHaveText("Посылка №3");

    await page.locator("#rfManualStart").click();
    await page.locator('[data-weight-key="30:0"]').fill("150");
    await page.locator("#rfSaveAll").click();
    await expect(page.locator("#rfConfirm")).toBeVisible();
    await page.locator("#rfConfirm").click();

    await expect(page.locator("#receiveFlow")).toHaveCount(0);
    await expect(page.locator("#toastContainer")).toContainText("Веса обновлены");

    await page.reload();
    await expect(page.locator(".detail-hero__next")).toHaveText("Ждёт распределения");
    const row = page.locator(".item-entry").filter({ hasText: "Товар на приёмку" });
    await expect(row).toContainText("150 г");
    await expect(row).toContainText("Получен");
  });

  test("marks a missing item as lost from the list without scanning", async ({ page }) => {
    await seedReceiveFixture(page);
    await openReceiveDialog(page);

    await page.locator("#rfManualStart").click();
    await expect(page.locator("#rfScanForm")).toHaveCount(0);
    const manualRow = page.locator(".rf-manual-item").filter({ hasText: "Товар на приёмку" });
    await expect(manualRow.locator('[data-action="lostItem"]')).toHaveText("Потерян");

    await manualRow.locator('[data-action="lostItem"]').click();
    await expect(page.locator("#toastContainer")).toContainText("Товар на приёмку — потерян");
    await expect(page.locator("#rfConfirm")).toBeVisible();
    await page.locator("#rfConfirm").click();
    await expect(page.locator("#receiveFlow")).toHaveCount(0);

    await page.reload();
    const itemRow = page.locator(".item-entry").filter({ hasText: "Товар на приёмку" });
    await expect(itemRow.locator(".parcel-entry__state")).toHaveText("Потерян");
    await page.locator("#markAsDone").click();
    await expect(
      page.locator("#toastContainer .toast__message", { hasText: "Посылка завершена" }),
    ).toBeVisible();
  });

  test("rejects an unknown track and returns to scanning", async ({ page }) => {
    await seedReceiveFixture(page);
    await openReceiveDialog(page);

    await page.locator("#rfStart").click();
    await page.locator("#rfCodeInput").fill("NO-SUCH-TRACK");
    await page.locator('#rfScanForm button[type="submit"]').click();

    await expect(page.locator("#rfSheet")).toContainText("Трек не найден");
    await expect(page.locator("#rfSheet .rf-track")).toHaveText("NO-SUCH-TRACK");
    await page.locator("#rfUnknownRetry").click();
    await expect(page.locator("#rfCodeInput")).toBeVisible();
  });

  test("keeps confirmation disabled without shipping facts", async ({ page }) => {
    await seedReceiveFixture(page, { withShipping: false });
    await openReceiveDialog(page);

    await page.locator("#rfManualStart").click();
    await page.locator('[data-weight-key="30:0"]').fill("150");
    await page.locator("#rfSaveAll").click();

    await expect(page.locator("#rfSheet")).toContainText(
      "Вес посылки и доставка вводятся при отправке",
    );
    await expect(page.locator("#rfConfirm")).toBeVisible();
    await expect(page.locator("#rfConfirm")).toBeDisabled();
  });

  test("blocks finishing while weights are missing", async ({ page }) => {
    await seedUnweighedFixture(page);
    await page.goto("/#/parcel/2");
    await expect(page.locator(".detail-action__hint").first()).toContainText("Взвесьте все треки");

    await page.locator("#markAsDone").click();
    await expect(
      page.locator("#toastContainer .toast__message", { hasText: "не взвешены" }),
    ).toBeVisible();
  });
});
