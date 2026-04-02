import { defineConfig, devices } from '@playwright/test';

const PUBLIC_WIDGET_SPECS = [
  /.*widget-diagnose\.spec\.ts/,
  /.*widget-intake-flow\.spec\.ts/,
  /.*widget-embed\.spec\.ts/,
  /.*widget-performance\.spec\.ts/,
];

const resolveWorkers = (): number => {
  const raw = Number(process.env.E2E_WORKERS);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return 1;
};

export default defineConfig({
  timeout: 150000,
  testDir: './tests/e2e',
  testMatch: PUBLIC_WIDGET_SPECS,
  fullyParallel: true,
  retries: 0,
  workers: resolveWorkers(),
  outputDir: './.tmp/playwright/public/results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://local.blawby.com',
    trace: 'retain-on-failure',
    storageState: { cookies: [], origins: [] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  globalSetup: './tests/e2e/global-setup.public.ts',
  reporter: [
    ['html', { outputFolder: './.tmp/playwright/public/report', open: 'never' }],
    ['list']
  ],
});
