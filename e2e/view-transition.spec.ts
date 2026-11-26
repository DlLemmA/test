import { expect, test } from "@playwright/test";
import { seedSmokeData } from "./seed";

test("the detail title is present when the view transition takes its new snapshot", async ({
  page,
}) => {
  await seedSmokeData(page);
  await page.goto("/#/parcels");
  await expect(page.locator('[data-open="2"]')).toBeVisible();

  await page.evaluate(() => {
    type Starter = (updateCallback: () => Promise<void> | void) => {
      finished: Promise<void>;
      ready?: Promise<void>;
    };
    const doc = document as Document & { startViewTransition?: Starter };
    const original = doc.startViewTransition?.bind(doc);
    const target = window as unknown as {
      vtCheck: {
        starts: number;
        detailAtReady: boolean;
        listAtReady: boolean;
        titleMoves: boolean;
      };
    };
    target.vtCheck = {
      starts: 0,
      detailAtReady: false,
      listAtReady: false,
      titleMoves: false,
    };
    if (!original) return;
    Object.defineProperty(doc, "startViewTransition", {
      configurable: true,
      value: (updateCallback: () => Promise<void> | void) => {
        target.vtCheck.starts += 1;
        const transition = original(updateCallback);
        transition.ready
          ?.then(() => {
            target.vtCheck.detailAtReady = !!document.querySelector(
              ".page-parcel-detail .detail-hero h1",
            );
            target.vtCheck.listAtReady = !!document.querySelector(".page-parcels");
            const group = document
              .getAnimations()
              .find(
                (animation) =>
                  animation.effect?.pseudoElement === "::view-transition-group(parcel-title)",
              );
            const frames = group?.effect?.getKeyframes?.() ?? [];
            target.vtCheck.titleMoves =
              frames.length === 2 && JSON.stringify(frames[0]) !== JSON.stringify(frames[1]);
          })
          .catch(() => undefined);
        return transition;
      },
    });
  });

  await page.locator('[data-open="2"]').click();
  await expect(page.locator(".page-parcel-detail")).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { vtCheck: unknown }).vtCheck))
    .toMatchObject({
      starts: 1,
      detailAtReady: true,
      listAtReady: false,
      titleMoves: true,
    });
});
