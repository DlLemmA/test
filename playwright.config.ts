import { defineConfig, devices } from "@playwright/test";

const port = 5173;
const deployedURL = process.env.E2E_BASE_URL;
const baseURL = deployedURL
  ? new URL(deployedURL).href.replace(/\/?$/, "/")
  : `http://127.0.0.1:${port}/test/`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /iphone\/.*\.spec\.ts/,
    },
    {
      name: "webkit-iphone-12",
      use: { ...devices["iPhone 12 Pro"], browserName: "webkit" },
      testMatch: /iphone\/.*\.spec\.ts/,
    },
    {
      name: "webkit-iphone-16",
      use: { ...devices["iPhone 16 Pro"], browserName: "webkit" },
      testMatch: /iphone\/.*\.spec\.ts/,
    },
  ],
  ...(deployedURL
    ? {}
    : {
        webServer: {
          command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
