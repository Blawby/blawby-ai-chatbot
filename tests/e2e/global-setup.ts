import { FullConfig } from '@playwright/test';
import { chromium } from 'playwright';

async function globalSetup(config: FullConfig) {
  console.log('🔧 Running Playwright global setup...');
  
  // 1. Verify worker is running (http://localhost:8787/api/health)
  const maxRetries = 10;
  const retryDelay = 2000;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('http://localhost:8787/api/health');
      if (response.ok) {
        console.log('✅ Worker is running and healthy');
        break;
      } else {
        if (i === maxRetries - 1) {
          throw new Error(
            `Worker health check failed after ${maxRetries} attempts. ` +
            `Make sure wrangler is running: npm run dev:worker:clean`
          );
        }
        console.log(`⏳ Waiting for worker... (attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    } catch (error) {
      if (i === maxRetries - 1) {
        throw new Error(
          `Worker health check failed after ${maxRetries} attempts. ` +
          `Make sure wrangler is running: npm run dev:worker:clean`
        );
      }
      console.log(`⏳ Waiting for worker... (attempt ${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  // 2. Verify Better Auth secret is configured
  // This is checked in tests/setup-worker.ts, but we'll verify here too
  try {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const devVarsPath = join(process.cwd(), '.dev.vars');
    const devVarsContent = readFileSync(devVarsPath, 'utf-8');
    const hasSecret = devVarsContent.includes('BETTER_AUTH_SECRET=');
    
    if (!hasSecret) {
      console.warn('⚠️  BETTER_AUTH_SECRET not found in .dev.vars');
      console.warn('⚠️  Tests may use memory adapter instead of D1');
      console.warn('⚠️  See docs/testing.md for setup instructions');
    } else {
      console.log('✅ BETTER_AUTH_SECRET found in .dev.vars');
    }
  } catch (error) {
    console.warn('⚠️  Could not read .dev.vars:', error);
  }
  
  // 3. Seed default organization if needed
  // This would typically be done via a database migration or seed script
  // For now, we'll just log that it should be done
  console.log('🔐 Creating persisted authenticated session (storageState)...');

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: 'http://localhost:5173' });
  const page = await context.newPage();

  // Attempt to check an existing session to avoid duplicate signups (idempotent)
  let hasSession = false;
  try {
    const sessionRes = await page.evaluate(async () => {
      const r = await fetch('/api/auth/get-session', { credentials: 'include' });
      if (!r.ok) return null;
      const data: any = await r.json().catch(() => null);
      return data?.session ?? null;
    });
    hasSession = Boolean(sessionRes);
  } catch {}

  if (!hasSession) {
    const timestamp = Date.now();
    const email = `e2e-setup-${timestamp}@example.com`;
    const password = 'TestPassword123!';

    // Avoid onboarding redirects
    await page.addInitScript(() => {
      try {
        localStorage.setItem('onboardingCompleted', 'true');
        localStorage.setItem('onboardingCheckDone', 'true');
      } catch {}
    });

    await page.goto('/auth');
    await page.waitForLoadState('domcontentloaded');

    // Switch to Sign up
    try { await page.click('[data-testid="auth-toggle-signup"]', { timeout: 5000 }); } catch {}
    await page.fill('[data-testid="signup-name-input"]', 'E2E Setup User');
    await page.fill('[data-testid="signup-email-input"]', email);
    await page.fill('[data-testid="signup-password-input"]', password);
    await page.fill('[data-testid="signup-confirm-password-input"]', password);
    await page.click('[data-testid="signup-submit-button"]');

    // Wait for session establishment
    let authenticated = false;
    for (let i = 0; i < 20; i++) {
      const s = await page.evaluate(async () => {
        try {
          const r = await fetch('/api/auth/get-session', { credentials: 'include' });
          if (!r.ok) return null;
          const data: any = await r.json().catch(() => null);
          return data?.session ?? null;
        } catch { return null; }
      });
      if (s) { authenticated = true; break; }
      await page.waitForTimeout(300);
    }

    if (!authenticated) {
      console.warn('⚠️  Global setup could not establish a session via UI signup in time; tests may re-auth.');
    }
  }

  // Persist storage state
  const { mkdirSync } = await import('fs');
  const { join } = await import('path');
  const authDir = join(process.cwd(), 'playwright', '.auth');
  try { mkdirSync(authDir, { recursive: true }); } catch {}
  const storagePath = join(authDir, 'user.json');
  await context.storageState({ path: storagePath });

  await browser.close();
  console.log('✅ storageState saved to playwright/.auth/user.json');
  console.log('✅ Global setup complete');
}

export default globalSetup;

