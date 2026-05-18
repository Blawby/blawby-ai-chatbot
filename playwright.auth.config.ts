import { defineConfig, devices } from '@playwright/test';

const RESPONSIVE_VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
} as const;

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
    /.*pricing-gate-membership\.spec\.ts/,
    /.*responsive-auth\.spec\.ts/,
    /.*responsive-screenshots\.spec\.ts/,
  ],
  // Strip the platform suffix so a baseline produced on Windows is
  // comparable against Linux CI when the underlying browser version
  // matches. Default template includes -{platform} which would force
  // per-OS baselines.
  snapshotPathTemplate: '{testFileDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  fullyParallel: true,
  retries: 0,
  workers: resolveWorkers(),
  outputDir: './.tmp/playwright/auth/results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://local.blawby.com',
    trace: 'retain-on-failure',
    storageState: './.tmp/playwright/auth/state/owner.json',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile',  use: { ...devices['Desktop Chrome'], viewport: RESPONSIVE_VIEWPORTS.mobile  } },
    { name: 'tablet',  use: { ...devices['Desktop Chrome'], viewport: RESPONSIVE_VIEWPORTS.tablet  } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: RESPONSIVE_VIEWPORTS.desktop } },
  ],
  globalSetup: './tests/e2e/global-setup.auth.ts',
  reporter: [
    ['html', { outputFolder: './.tmp/playwright/auth/report', open: 'never' }],
    ['list']
  ],
});
