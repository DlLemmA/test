import { expect, test } from "@playwright/test";
import { seedReceiveFixture, seedSmokeData } from "../seed";

test("enters from sign-in to the parcel list", async ({ page }) => {
  await page.goto("/#/sign-in?next=/parcels");

  await expect(page.locator("#signInTitle")).toHaveText("Pindoчет");
  await page.locator("#enterTestMode").click();

  await expect(page).toHaveURL(/#\/parcels$/);
  await expect(page.locator(".page-parcels")).toBeVisible();
});

test("opens a parcel and returns to the list", async ({ page }) => {
  await seedSmokeData(page);
  await page.goto("/#/parcels");

  await page.locator('[data-open="2"]').click();
  await expect(page.locator(".detail-hero h1")).toContainText("Посылка №2");

  await page.locator("#backToParcels").click();
  await expect(page).toHaveURL(/#\/parcels$/);
  await expect(page.locator('[data-open="2"]')).toBeVisible();
});

test("creates a batch from pasted lines", async ({ page }) => {
  await seedSmokeData(page);
  await page.goto("/#/add");

  await page.locator("#addParcelSelect").selectOption("0");
  await page.locator("#sumCNY").fill("10");
  await page.locator("#sumBYN").fill("1.3");
  await page.locator('#stage1Form button[type="submit"]').click();

  await page.locator("#customerComboInput").fill("Катя");
  await page.locator('[data-customer-id="2"]').click();
  await page.locator("#csvText").fill("Носки 1 шт 10");
  await page.locator("#addBatchBtn").click();
  await expect(page.locator("#batchItemsList .batch-row")).toHaveCount(1);

  await page.locator("#checkStepBtn").click();
  await page.locator("#saveBatchBtn").click();
  await expect(
    page.locator("#toastContainer .toast__message", { hasText: "Партия сохранена" }),
  ).toBeVisible();
});

test("marks a customer's goods paid", async ({ page }) => {
  await seedSmokeData(page);
  await page.goto("/#/customer/2");

  await page.locator('[data-toggle-goods="2"]').check();
  await expect(page.locator('[data-toggle-goods="2"]')).toBeChecked();
  await expect(
    page.locator("#toastContainer .toast__message", { hasText: "Товары оплачены" }),
  ).toBeVisible();
});

test("exports a finished parcel without a CDN", async ({ page }) => {
  const cdnRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("jsdelivr")) cdnRequests.push(request.url());
  });

  await seedSmokeData(page);
  await page.goto("/#/parcel/2");
  // WebKit's headless share sheet never emits a download, so exercise the
  // same fallback path that iOS uses when Web Share cannot accept files.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
  });
  await page.locator("#markAsDone").click();
  await page.locator("#exportParcel").waitFor();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#exportParcel").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^Посылка_.+\.xlsx$/u);
  expect(cdnRequests).toEqual([]);
});

test("falls back to manual receiving when the camera is unavailable", async ({ page }) => {
  await seedReceiveFixture(page);
  await page.goto("/#/parcel/3");
  await page.locator("#receiveParcel").click();

  await page.locator("#rfManualStart").click();
  await expect(page.locator("#rfScanForm")).toHaveCount(0);
  await expect(page.locator(".rf-manual-item")).toHaveCount(1);
});

test("uses a cheap tab transition and one forward view transition", async ({ page }) => {
  await seedSmokeData(page);
  await page.goto("/#/parcels");
  await expect(page.locator("#bottombar")).toBeVisible();

  await page.evaluate(() => {
    type Starter = (updateCallback: () => Promise<void> | void) => {
      finished: Promise<void>;
      ready?: Promise<void>;
    };
    const doc = document as Document & { startViewTransition?: Starter };
    const original = doc.startViewTransition?.bind(doc);
    const target = window as unknown as {
      viewTransitions: number;
      tabAnimations: number;
      detailAtReady: boolean;
    };
    target.viewTransitions = 0;
    target.tabAnimations = 0;
    target.detailAtReady = false;
    if (original) {
      Object.defineProperty(doc, "startViewTransition", {
        configurable: true,
        value: (updateCallback: () => Promise<void> | void) => {
          target.viewTransitions += 1;
          const transition = original(updateCallback);
          transition.ready
            ?.then(() => {
              target.detailAtReady = !!document.querySelector(
                ".page-parcel-detail .detail-hero h1",
              );
            })
            .catch(() => undefined);
          return transition;
        },
      });
    }
    const panel = document.getElementById("panel-container");
    if (!panel) throw new Error("missing #panel-container");
    new MutationObserver((records) => {
      for (const record of records) {
        if (!(record.target instanceof HTMLElement)) continue;
        const classes = record.target.classList;
        if (
          classes.contains("panel-tab-enter-active") ||
          classes.contains("panel-tab-leave-active")
        ) {
          target.tabAnimations += 1;
        }
      }
    }).observe(panel, { subtree: true, attributes: true, attributeFilter: ["class"] });
  });

  const tabs = [
    { index: 2, url: /#\/people$/ },
    { index: 0, url: /#\/parcels$/ },
    { index: 1, url: /#\/add$/ },
  ];
  for (const tab of tabs) {
    // oxlint-disable-next-line no-await-in-loop
    await page.evaluate((index) => {
      document.querySelectorAll<HTMLElement>("#bottombar .bottombar-item")[index]?.click();
    }, tab.index);
    // oxlint-disable-next-line no-await-in-loop
    await expect(page).toHaveURL(tab.url);
  }

  const afterTabs = await page.evaluate(() => {
    const panel = document.getElementById("panel-container");
    const target = window as unknown as { viewTransitions: number; tabAnimations: number };
    return {
      transitions: target.viewTransitions,
      tabAnimations: target.tabAnimations,
      activeIsPanel: document.activeElement === panel,
      outlineStyle: panel ? getComputedStyle(panel).outlineStyle : "missing",
    };
  });
  expect(afterTabs.activeIsPanel).toBe(false);
  expect(afterTabs.outlineStyle).toBe("none");
  expect(afterTabs.transitions).toBe(0);
  expect(afterTabs.tabAnimations).toBeGreaterThan(0);

  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>("#bottombar .bottombar-item")[0]?.click();
  });
  await page.locator('[data-open="2"]').click();
  await expect(page.locator(".page-parcel-detail")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const target = window as unknown as {
          viewTransitions: number;
          detailAtReady: boolean;
        };
        return {
          viewTransitions: target.viewTransitions,
          detailAtReady: target.detailAtReady,
        };
      }),
    )
    .toMatchObject({ viewTransitions: 1, detailAtReady: true });

  // Back is an ordinary route change: no second snapshot, no morph.
  await page.locator("#backToParcels").click();
  await expect(page.locator(".page-parcels")).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { viewTransitions: number }).viewTransitions),
  ).toBe(1);
});
