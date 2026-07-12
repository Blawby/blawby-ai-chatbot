import { defineConfig, devices } from "@playwright/test";
import { loadE2EEnvFiles } from "./tests/e2e/helpers/e2eConfig";

loadE2EEnvFiles();

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /production-smoke\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  outputDir: "./.tmp/playwright/production-smoke/results",
  use: {
    baseURL: process.env.E2E_BASE_URL || "https://ai.blawby.com",
    trace: "off",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  globalSetup: "./tests/e2e/global-setup.auth.ts",
  reporter: [
    [
      "html",
      {
        outputFolder: "./.tmp/playwright/production-smoke/report",
        open: "never",
      },
    ],
    ["list"],
  ],
});
