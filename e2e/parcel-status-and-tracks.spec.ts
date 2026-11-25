import { expect, test } from "@playwright/test";
import { seedSmokeData } from "./seed";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test.beforeEach(async ({ page }) => {
  await seedSmokeData(page);
});

test("shows the status rail and copies a single track from its row", async ({ page }) => {
  await page.goto("/#/parcel/2");

  // Done parcels hide track rows, so copy while the tracks are still shown.
  await page.locator('button.track-value-row[aria-label="Скопировать трек-номер KAT-1"]').click();
  await expect(
    page.locator("#toastContainer .toast__message", { hasText: "Трек-номер скопирован" }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("KAT-1");

  await page.locator("#markAsDone").click();
  const rail = page.locator(".status-rail");
  await expect(rail.locator('[data-step="draft"]')).toHaveAttribute("data-state", "done");
  await expect(rail.locator('[data-step="done"]')).toHaveAttribute("data-state", "current");
  await expect(rail.locator('[data-step="done"]')).toContainText("Готова");
});
