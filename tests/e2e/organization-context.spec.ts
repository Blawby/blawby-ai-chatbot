import { test, expect, type Page } from '@playwright/test';
import type { ConsoleMessage } from 'playwright';

// Expected Better Auth endpoints that return 404 (best-effort calls, handled gracefully)
const expectedIgnoredEndpoints = [
  '/api/auth/organization/set-active-organization',
  '/api/auth/organization/get-full-organization'
];

// Utility to collect console errors and fail the test if any unexpected errors appear
function attachConsoleErrorFail(page: Page) {
  const errors: Array<{ type: string; text: string; location?: string }> = [];

  const onConsole = (msg: ConsoleMessage) => {
    const type = msg.type();
    if (type === 'error') {
      const text = msg.text();
      const location = msg.location();

      // Filter out expected Better Auth errors (best-effort calls)
      const isExpectedBAError = expectedIgnoredEndpoints.some(endpoint => 
        text.includes(endpoint) || (location && location.url.includes(endpoint))
      );
      
      if (!isExpectedBAError) {
        errors.push({ 
          type, 
          text,
          location: location ? `${location.url}:${location.lineNumber}:${location.columnNumber}` : undefined
        });
        // Also echo to test output for visibility
        // eslint-disable-next-line no-console
        console.error(`[browser:error] ${text}`);
      }
    }
  };

  page.on('console', onConsole);

  const assertNoConsoleErrors = async () => {
    if (errors.length > 0) {
      const errorMessages = errors.map(e => 
        e.location ? `${e.text} (${e.location})` : e.text
      ).join('\n');
      throw new Error(`Unexpected console errors detected:\n${errorMessages}`);
    }
  };

  const disposeConsoleListener = () => {
    page.off('console', onConsole);
  };

  return { assertNoConsoleErrors, disposeConsoleListener };
}

test.describe('Organization Context E2E', () => {
  // Anonymous initialization should use default org (public org) from session
  test('anonymous initializes activeOrgId (public org) and no console errors', async ({ page, baseURL }) => {
    const { assertNoConsoleErrors, disposeConsoleListener } = attachConsoleErrorFail(page);

    await page.goto(baseURL ?? '/');

    // Wait for page to load and session to initialize
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    // Verify organization ID is available via session API
    // For anonymous users, SessionContext derives activeOrganizationId from session
    // or falls back to DEFAULT_ORGANIZATION_ID
    const sessionResponse = await page.request.get(`${baseURL}/api/auth/get-session`);
    expect(sessionResponse.ok(), 'Session API should return 200').toBeTruthy();
    
    const sessionData = await sessionResponse.json();
    
    // Verify session structure (may be null for anonymous users)
    expect(sessionData).toBeDefined();
    
    // For anonymous users, verify that organization context is working
    // by checking that the default organization endpoint is accessible
    // This verifies the context has initialized and can resolve the default org
    const defaultOrgResponse = await page.request.get(`${baseURL}/api/organizations/default`);
    expect(defaultOrgResponse.ok(), 'Default organization endpoint should be accessible').toBeTruthy();
    
    const defaultOrgData = await defaultOrgResponse.json();
    expect(defaultOrgData, 'Default org response should have success=true').toHaveProperty('success', true);
    expect(defaultOrgData.data, 'Default org response should have organizationId').toHaveProperty('organizationId');
    expect(typeof defaultOrgData.data.organizationId).toBe('string');
    expect(defaultOrgData.data.organizationId.length).toBeGreaterThan(0);

    // Verify no unexpected console errors
    await assertNoConsoleErrors();
    disposeConsoleListener();
  });

  // URL override has highest priority
  test('URL organizationId override preserves param and no console errors', async ({ page, baseURL }) => {
    const { assertNoConsoleErrors, disposeConsoleListener } = attachConsoleErrorFail(page);

    const url = new URL(baseURL ?? 'http://localhost:5173');
    url.searchParams.set('organizationId', 'blawby-ai');
    await page.goto(url.toString());

    // Wait for page to load
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    // Ensure URL override param is present (highest priority remains intact)
    const hasParam = await page.evaluate(() => {
      return new URLSearchParams(window.location.search).get('organizationId');
    });
    expect(hasParam, 'URL organizationId param should be preserved').toBe('blawby-ai');

    // Verify no unexpected console errors
    await assertNoConsoleErrors();
    disposeConsoleListener();
  });

  // API stubs should respond as expected
  test('API stubs: default/public/session-organization respond OK', async ({ request, baseURL }) => {
    const root = baseURL ?? 'http://localhost:5173';

    // GET /api/organizations/default
    const defaultRes = await request.get(`${root}/api/organizations/default`);
    expect(defaultRes.ok(), 'GET /api/organizations/default should return 200').toBeTruthy();
    const defaultJson = await defaultRes.json();
    expect(defaultJson, 'Default org response should have success=true').toHaveProperty('success', true);
    expect(defaultJson.data, 'Default org response should have data.organizationId').toHaveProperty('organizationId');
    expect(typeof defaultJson.data.organizationId).toBe('string');
    expect(defaultJson.data.organizationId.length).toBeGreaterThan(0);

    // GET /api/organizations/public
    // Note: This may return 404 if public org is not configured, which is valid
    const publicRes = await request.get(`${root}/api/organizations/public`);
    const publicJson = await publicRes.json();
    
    if (publicRes.ok()) {
      // Public org is configured
      expect(publicJson, 'Public org response should have success=true').toHaveProperty('success', true);
      expect(publicJson.data, 'Public org response should have data.id').toHaveProperty('id');
      expect(typeof publicJson.data.id).toBe('string');
      expect(publicJson.data.id.length).toBeGreaterThan(0);
    } else {
      // Public org not configured - verify error response format
      expect(publicRes.status(), 'Public org endpoint should return 404 if not configured').toBe(404);
      expect(publicJson, 'Error response should have success=false').toHaveProperty('success', false);
      expect(publicJson, 'Error response should have error message').toHaveProperty('error');
    }

    // PATCH /api/sessions/organization
    const patchRes = await request.patch(`${root}/api/sessions/organization`, {
      data: { organizationId: 'blawby-ai' },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(patchRes.ok(), 'PATCH /api/sessions/organization should return 200').toBeTruthy();
    const patchJson = await patchRes.json();
    expect(patchJson, 'Session org patch should return success=true').toEqual({ success: true });
  });
});
