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
  retries: 0,
  workers: resolveWorkers(),
  outputDir: './playwright/results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://local.blawby.com',
    trace: 'on-first-retry',
    storageState: { cookies: [], origins: [] }
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: [
    ['html', { outputFolder: './playwright/reports', open: 'never' }],
    ['list']
  ]
});
