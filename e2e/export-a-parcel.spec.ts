import { expect, test } from "@playwright/test";
import { seedSmokeData } from "./seed";

test("exports a finished parcel as a local xlsx download", async ({ page }) => {
  const cdnRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("jsdelivr")) cdnRequests.push(request.url());
  });

  await seedSmokeData(page);
  await page.goto("/#/parcel/2");
  await page.locator("#markAsDone").click();
  await page.locator("#exportParcel").waitFor();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#exportParcel").click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^Посылка_.+\.xlsx$/u);
  await expect(
    page.locator("#toastContainer .toast__message", { hasText: "Файл скачан" }),
  ).toBeVisible();
  expect(cdnRequests).toEqual([]);
});
