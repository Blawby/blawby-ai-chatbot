import { defineConfig, devices } from '@playwright/test';

const PUBLIC_WIDGET_SPECS = [
  /.*widget-diagnose\.spec\.ts/,
  /.*widget-intake-flow\.spec\.ts/,
  /.*widget-intake-ai-fires\.spec\.ts/,
  /.*widget-intake-ai-failure\.spec\.ts/,
  /.*widget-embed\.spec\.ts/,
  /.*widget-performance\.spec\.ts/,
  /.*responsive-public\.spec\.ts/,
  // responsive-screenshots.spec.ts requires seeded owner auth state and is
  // matched only by playwright.auth.config.ts (run via test:e2e:screenshots).
];

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
  timeout: 150000,
  testDir: './tests/e2e',
  testMatch: PUBLIC_WIDGET_SPECS,
  // Strip the platform suffix so a baseline produced on Windows is
  // comparable against Linux CI when the underlying browser version
  // matches. Default template includes -{platform} which would force
  // per-OS baselines.
  snapshotPathTemplate: '{testFileDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  fullyParallel: true,
  retries: 0,
  workers: resolveWorkers(),
  outputDir: './.tmp/playwright/public/results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://local.blawby.com',
    trace: 'retain-on-failure',
    storageState: { cookies: [], origins: [] },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile',  use: { ...devices['Desktop Chrome'], viewport: RESPONSIVE_VIEWPORTS.mobile  } },
    { name: 'tablet',  use: { ...devices['Desktop Chrome'], viewport: RESPONSIVE_VIEWPORTS.tablet  } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: RESPONSIVE_VIEWPORTS.desktop } },
  ],
  globalSetup: './tests/e2e/global-setup.public.ts',
  reporter: [
    ['html', { outputFolder: './.tmp/playwright/public/report', open: 'never' }],
    ['list']
  ],
});
