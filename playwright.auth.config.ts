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
  testMatch: [
    /.*auth-modes\.spec\.ts/,
    /.*chat-messages\.spec\.ts/,
    /.*clients\.spec\.ts/,
    /.*intake-invite\.spec\.ts/,
    /.*notifications\.spec\.ts/,
  ],
  fullyParallel: true,
  // Default to Chromium when no project is provided on the CLI
  defaultProject: 'chromium',
  retries: 0,
  workers: resolveWorkers(),
  outputDir: './.tmp/playwright/auth/results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://local.blawby.com',
    trace: 'retain-on-failure',
    storageState: './.tmp/playwright/auth/state/owner.json',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  globalSetup: './tests/e2e/global-setup.auth.ts',
  reporter: [
    ['html', { outputFolder: './.tmp/playwright/auth/report', open: 'never' }],
    ['list']
  ],
});
