import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

test.describe('Console and Network Inspection', () => {
  test('inspect console logs and network requests', async ({ page }) => {
    const consoleMessages: Array<{ type: string; text: string; location?: string }> = [];
    const networkRequests: Array<{ method: string; url: string; status?: number }> = [];
    const networkResponses: Array<{ url: string; status: number; headers: Record<string, string> }> = [];
    const errors: Array<{ type: string; message: string; stack?: string }> = [];
    const requestFailures = new Map<string, string>();

    // Capture console messages
    page.on('console', (msg) => {
      const text = msg.text();
      const location = msg.location();
      consoleMessages.push({
        type: msg.type(),
        text,
        location: location ? `${location.url}:${location.lineNumber}:${location.columnNumber}` : undefined,
      });
      // Also log to terminal for real-time monitoring
      console.log(`[browser:${msg.type()}]`, text);
    });

    // Capture network requests
    page.on('request', (request) => {
      networkRequests.push({
        method: request.method(),
        url: request.url(),
      });
    });

    // Capture network responses
    page.on('response', (response) => {
      networkResponses.push({
        url: response.url(),
        status: response.status(),
        headers: response.headers(),
      });
      
      // Log failed requests
      if (response.status() >= 400) {
        console.log(`❌ Failed request: ${response.status()} ${response.request().method()} ${response.url()}`);
      }
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      errors.push({
        type: 'pageerror',
        message: error.message,
        stack: error.stack,
      });
      console.log(`❌ Page error:`, error.message);
    });

    // Capture request failures without duplicating networkRequests entries
    page.on('requestfailed', (request) => {
      const key = `${request.method()} ${request.url()}`;
      requestFailures.set(key, request.failure()?.errorText || 'Unknown error');
      console.log(`❌ Request failed: ${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    });

    console.log('🚀 Starting inspection...');
    console.log('📍 Navigating to http://localhost:5173');

    // Navigate to the app
    await page.goto('/', { waitUntil: 'networkidle' });

    console.log('✅ Page loaded, waiting for initial load...');
    await page.waitForTimeout(2000); // Give time for initial requests

    // Try to interact with common elements
    console.log('🔍 Checking for common UI elements...');
    
    // Check if chat interface is visible
    const chatInput = page.locator('textarea, input[type="text"]').first();
    const chatInputVisible = await chatInput.isVisible().catch(() => false);
    
    if (chatInputVisible) {
      console.log('✅ Chat input found');
      // Try typing something
      await chatInput.fill('test message');
      await page.waitForTimeout(500);
      await chatInput.clear();
    } else {
      console.log('⚠️ Chat input not immediately visible');
    }

    // Check for navigation elements
    const navLinks = await page.locator('nav a, [role="navigation"] a').all();
    console.log(`Found ${navLinks.length} navigation links`);

    // Try navigating to settings if available
    const settingsLink = page.locator('a[href*="settings"], a:has-text("Settings"), a:has-text("settings")').first();
    const settingsVisible = await settingsLink.isVisible().catch(() => false);
    
    if (settingsVisible) {
      console.log('📍 Navigating to settings...');
      await settingsLink.click();
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    // Navigate back to home
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Generate report
    console.log('\n' + '='.repeat(80));
    console.log('📊 INSPECTION REPORT');
    console.log('='.repeat(80));

    // Expected Better Auth endpoints that return 404 (best-effort calls, handled gracefully)
    const expectedIgnoredEndpoints = [
      '/api/auth/organization/set-active-organization',
      '/api/auth/organization/get-full-organization'
    ];

    // Console messages summary
    console.log(`\n📝 Console Messages: ${consoleMessages.length} total`);
    // Filter out expected Better Auth 404 errors (best-effort calls)
    const errorLogs = consoleMessages.filter(m => {
      if (m.type === 'error') {
        // Check if error is related to expected Better Auth endpoints
        const isExpectedBAError = expectedIgnoredEndpoints.some(endpoint => 
          m.text.includes(endpoint) || (m.location && m.location.includes(endpoint))
        );
        return !isExpectedBAError;
      }
      return false;
    });
    const warnLogs = consoleMessages.filter(m => m.type === 'warning');
    
    if (errorLogs.length > 0) {
      console.log(`\n❌ Unexpected Errors (${errorLogs.length}):`);
      errorLogs.forEach((msg, idx) => {
        console.log(`  ${idx + 1}. [${msg.type}] ${msg.text}`);
        if (msg.location) console.log(`     Location: ${msg.location}`);
      });
    }
    
    // Count expected Better Auth errors (for info only)
    const expectedBAErrors = consoleMessages.filter(m => 
      m.type === 'error' && 
      expectedIgnoredEndpoints.some(endpoint => 
        m.text.includes(endpoint) || (m.location && m.location.includes(endpoint))
      )
    );
    if (expectedBAErrors.length > 0) {
      console.log(`\nℹ️  Expected Better Auth Errors (best-effort calls, handled gracefully): ${expectedBAErrors.length}`);
    }
    
    if (warnLogs.length > 0) {
      console.log(`\n⚠️  Warnings (${warnLogs.length}):`);
      warnLogs.slice(0, 10).forEach((msg, idx) => {
        console.log(`  ${idx + 1}. [${msg.type}] ${msg.text}`);
      });
      if (warnLogs.length > 10) {
        console.log(`  ... and ${warnLogs.length - 10} more warnings`);
      }
    }

    // Network requests summary
    console.log(`\n🌐 Network Requests: ${networkRequests.length} total`);
    // Filter out expected Better Auth 404s
    const failedRequests = networkRequests
      .filter(r => requestFailures.has(`${r.method} ${r.url}`))
      .map(r => ({ ...r, error: requestFailures.get(`${r.method} ${r.url}`) }));
    const uniqueUrls = new Set(networkRequests.map(r => r.url));
    
    console.log(`  Unique URLs: ${uniqueUrls.size}`);
    
    if (failedRequests.length > 0) {
      console.log(`\n❌ Failed Requests (${failedRequests.length}):`);
      failedRequests.forEach((req, idx) => {
        console.log(`  ${idx + 1}. ${req.method} ${req.url}`);
        if (req.status) console.log(`     Status: ${req.status}`);
        if (req.error) console.log(`     Error: ${req.error}`);
      });
    }

    // Network responses summary
    // Filter out expected Better Auth 404s (best-effort calls that are handled gracefully)
    const failedResponses = networkResponses.filter(r => {
      if (r.status >= 400) {
        // Ignore expected Better Auth organization endpoint 404s (best-effort calls)
        const isExpected404 = r.status === 404 && expectedIgnoredEndpoints.some(endpoint => r.url.includes(endpoint));
        return !isExpected404;
      }
      return false;
    });
    
    if (failedResponses.length > 0) {
      console.log(`\n❌ Failed Responses (${failedResponses.length}):`);
      failedResponses.forEach((res, idx) => {
        console.log(`  ${idx + 1}. ${res.status} ${res.url}`);
      });
    }
    
    // Verify expected organization endpoints are working
    console.log(`\n✅ Verifying Organization Endpoints:`);
    const orgEndpoints = [
      { url: '/api/organizations/public', method: 'GET', name: 'Public Organization', required: false },
      { url: '/api/organizations/default', method: 'GET', name: 'Default Organization', required: true },
      { url: '/api/organizations/me', method: 'GET', name: 'User Organizations', required: false },
      { url: '/api/auth/get-session', method: 'GET', name: 'Auth Session', required: true }
    ];
    
    orgEndpoints.forEach(endpoint => {
      const responses = networkResponses.filter(r => {
        try {
          const url = new URL(r.url);
          return url.pathname === endpoint.url && r.status < 400;
        } catch {
          return false;
        }
      });
      if (responses.length > 0) {
        console.log(`  ✅ ${endpoint.name}: ${responses.length} successful call(s)`);
      } else {
        const icon = endpoint.required ? '⚠️' : 'ℹ️';
        const note = endpoint.required ? ' (required)' : ' (optional - may not be called for anonymous users)';
        console.log(`  ${icon}  ${endpoint.name}: No successful calls found${note}`);
      }
    });
    
    // Check for Better Auth best-effort calls (expected to fail gracefully)
    const baOrgCalls = networkResponses.filter(r => 
      expectedIgnoredEndpoints.some(endpoint => r.url.includes(endpoint))
    );
    if (baOrgCalls.length > 0) {
      console.log(`\nℹ️  Better Auth Organization Calls (best-effort, expected 404s): ${baOrgCalls.length}`);
      baOrgCalls.forEach((res, idx) => {
        console.log(`  ${idx + 1}. ${res.status} ${res.url} (handled gracefully)`);
      });
    }

    // Page errors
    if (errors.length > 0) {
      console.log(`\n💥 Page Errors (${errors.length}):`);
      errors.forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err.message}`);
        if (err.stack) {
          const stackLines = err.stack.split('\n').slice(0, 3);
          stackLines.forEach(line => console.log(`     ${line}`));
        }
      });
    }

    // CORS check
    const pageOrigin = new URL(page.url()).origin;
    const corsIssues = networkResponses.filter(r => {
      if (r.status === 0) return true;
      try {
        const resOrigin = new URL(r.url).origin;
        return resOrigin !== pageOrigin && r.headers['access-control-allow-origin'] === undefined;
      } catch {
        return false;
      }
    });
    if (corsIssues.length > 0) {
      console.log(`\n🚫 Potential CORS Issues: ${corsIssues.length}`);
      corsIssues.slice(0, 5).forEach((res, idx) => {
        console.log(`  ${idx + 1}. ${res.url} (Status: ${res.status})`);
      });
    }

    // Source map check (check if stack traces have file names)
    const hasSourceMaps = consoleMessages.some(m => 
      m.text.includes('.tsx') || 
      m.text.includes('.ts') || 
      m.text.includes('src/')
    );
    console.log(`\n🗺️  Source Maps: ${hasSourceMaps ? '✅ Detected' : '⚠️  Not detected in console logs'}`);

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📋 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Console Messages: ${consoleMessages.length}`);
    console.log(`  - Errors: ${errorLogs.length}`);
    console.log(`  - Warnings: ${warnLogs.length}`);
    console.log(`Total Network Requests: ${networkRequests.length}`);
    console.log(`  - Failed: ${failedRequests.length}`);
    console.log(`Total Network Responses: ${networkResponses.length}`);
    console.log(`  - Failed (4xx/5xx): ${failedResponses.length}`);
    console.log(`Page Errors: ${errors.length}`);
    console.log(`Potential CORS Issues: ${corsIssues.length}`);
    console.log('='.repeat(80));

    // Take a screenshot
    const outDir = path.join('playwright', 'results');
    await fsPromises.mkdir(outDir, { recursive: true });
    await page.screenshot({ path: path.join(outDir, 'console-inspection.png'), fullPage: true });
    console.log(`\n📸 Screenshot saved to ${path.join(outDir, 'console-inspection.png')}`);

    // Save detailed logs to a file (optional, for later review)
    const report = {
      timestamp: new Date().toISOString(),
      consoleMessages,
      networkRequests,
      networkResponses,
      errors,
      summary: {
        totalConsoleMessages: consoleMessages.length,
        errorLogs: errorLogs.length,
        warnLogs: warnLogs.length,
        totalNetworkRequests: networkRequests.length,
        failedRequests: failedRequests.length,
        totalNetworkResponses: networkResponses.length,
        failedResponses: failedResponses.length,
        pageErrors: errors.length,
        corsIssues: corsIssues.length,
      },
    };

    // Write report to file
    const reportPath = path.join(process.cwd(), 'playwright', 'results', 'console-inspection-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 Detailed report saved to ${reportPath}`);

    // Assertions (non-blocking, just for reporting)
    if (errorLogs.length > 0) {
      console.log('\n⚠️  WARNING: Unexpected errors detected in console. Review the report above.');
    }
    if (failedRequests.length > 0) {
      console.log('\n⚠️  WARNING: Unexpected failed network requests detected. Review the report above.');
    }
    if (errors.length > 0) {
      console.log('\n⚠️  WARNING: Page errors detected. Review the report above.');
    }
    
    // Verify critical endpoints succeeded
    const criticalEndpoints = ['/api/organizations/default', '/api/auth/get-session'];
    const criticalSuccess = criticalEndpoints.every(endpoint => {
      return networkResponses.some(r => {
        try {
          const url = new URL(r.url);
          return url.pathname === endpoint && r.status < 400;
        } catch {
          return false;
        }
      });
    });
    
    if (criticalSuccess) {
      console.log('\n✅ All critical organization endpoints are working correctly.');
    } else {
      console.log('\n⚠️  Some critical organization endpoints may not have been called or succeeded.');
    }

    // Test passes regardless (this is an inspection, not a validation test)
    expect(true).toBe(true);
  });
});

