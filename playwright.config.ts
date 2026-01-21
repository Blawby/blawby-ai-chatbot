import { defineConfig, devices } from '@playwright/test';

const resolveWorkers = (): number => {
  const raw = Number(process.env.E2E_WORKERS);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return 1;
};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 2,
  workers: resolveWorkers(),
  outputDir: './playwright/results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://local.blawby.com',
    trace: 'on-first-retry',
    storageState: 'playwright/.auth/owner.json',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  globalSetup: './tests/e2e/global-setup.ts',
  reporter: [
    ['html', { outputFolder: './playwright/reports', open: 'never' }],
    ['list']
  ],
  // dev:full is started manually for E2E runs
});
