import { FullConfig } from '@playwright/test';
import { execSync } from 'child_process';

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
  console.log('✅ Global setup complete');
}

export default globalSetup;

