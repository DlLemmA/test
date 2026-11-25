import { expect, test } from "@playwright/test";

test("links a standalone manifest and a touch icon", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("meta[name='apple-mobile-web-app-capable']")).toHaveAttribute(
    "content",
    "yes",
  );

  const manifestLink = page.locator("link[rel='manifest']");
  await expect(manifestLink).toHaveAttribute("href", /manifest\.webmanifest$/);
  const href = await manifestLink.getAttribute("href");
  expect(href).toBeTruthy();
  const manifestUrl = new URL(href!, page.url());
  const response = await page.request.get(manifestUrl.toString());
  expect(response.ok()).toBe(true);

  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: "Посылки — учёт заказов",
    short_name: "Посылки",
    display: "standalone",
    background_color: "#f7f4ed",
  });

  const icons = manifest.icons as Array<{ src: string }>;
  const iconResponses = await Promise.all(
    icons.map(async (icon) => ({
      src: icon.src,
      response: await page.request.get(new URL(icon.src, manifestUrl).toString()),
    })),
  );
  for (const { src, response: iconResponse } of iconResponses) {
    expect(iconResponse.ok(), `icon ${src}`).toBe(true);
  }

  const iconLink = page.locator("link[rel='apple-touch-icon']");
  await expect(iconLink).toHaveAttribute("href", /apple-touch-icon\.png$/);
  const iconHref = await iconLink.getAttribute("href");
  const iconResponse = await page.request.get(new URL(iconHref!, page.url()).toString());
  expect(iconResponse.ok()).toBe(true);
});
