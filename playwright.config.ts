import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 2,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { 
      command: 'npm run dev:worker:clean', 
      url: 'http://localhost:8787', 
      reuseExistingServer: true, 
      timeout: 120000
    },
    { 
      command: 'npm run dev', 
      url: 'http://localhost:5173', 
      reuseExistingServer: true
    },
  ],
});
