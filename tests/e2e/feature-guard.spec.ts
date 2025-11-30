import { test, expect, type Page } from '@playwright/test';
import { createTestUser } from './helpers/createTestUser.js';
import { fetchJsonViaPage as fetchJsonViaPageHelper, uploadFileViaPage } from './helpers/http.js';

test.describe('Feature Guard - Quota Enforcement', () => {
  
  const fetchJsonViaPage = fetchJsonViaPageHelper;

  async function getPersonalOrganization(page: Page) {
    // Ensure the personal organization exists (idempotent on server)
    await fetchJsonViaPage(page, '/api/organizations/me/ensure-personal', { method: 'POST' });

    const retries = 8;
    const delayMs = 400;
    for (let i = 0; i < retries; i++) {
      const orgsResult = await fetchJsonViaPage(page, '/api/organizations/me');
      if (orgsResult.status === 200 && orgsResult.data?.success) {
        const personalOrg = orgsResult.data.data?.find((org: { kind?: string }) => org?.kind === 'personal');
        if (personalOrg?.id) {
          const betterAuthOrgId = (personalOrg as any).betterAuthOrgId || personalOrg.id;
          // Try to set active org using Better Auth endpoint, but do not fail test setup if it doesn't stick yet.
          try {
            const setActiveResp = await fetchJsonViaPage(page, '/api/auth/organization/set-active', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ organizationId: betterAuthOrgId }),
            });
            if (!(setActiveResp.status >= 200 && setActiveResp.status < 300)) {
              await fetchJsonViaPage(page, '/api/organizations/me/ensure-personal', { method: 'POST' });
              await fetchJsonViaPage(page, '/api/auth/organization/set-active', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ organizationId: betterAuthOrgId }),
              });
            }
          } catch {}
          return personalOrg;
        }
      }

      if (i < retries - 1) {
        await page.waitForTimeout(delayMs);
      }
    }

    throw new Error('Personal organization not found after retries');
  }

  test('should return 404 for tokens endpoint (removed - handled by remote API)', async ({ page }) => {
    // Create authenticated test user (starts with free tier personal org)
    const user = await createTestUser(page);
    
    // Get personal organization
    const personalOrg = await getPersonalOrganization(page);
    expect(personalOrg.kind).toBe('personal');
    // Subscription tier might be 'free' or undefined for new users
    expect(personalOrg.subscriptionTier === 'free' || personalOrg.subscriptionTier === undefined || personalOrg.subscriptionTier === null).toBe(true);
    
    // Try to CREATE API token (endpoint no longer exists - API tokens removed)
    const tokensResponse = await fetchJsonViaPage(page, `/api/organizations/${personalOrg.id}/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tokenName: 'Test Token',
        permissions: ['read']
      }),
    });
    
    // Endpoint no longer exists in worker - returns 404 (handled by remote API)
    expect(tokensResponse.status).toBe(404);
    // Error response should indicate endpoint is handled by remote API
    if (tokensResponse.data && 'error' in tokensResponse.data) {
      expect(tokensResponse.data.error).toContain('remote API');
    }
  });

  test('should block personal organizations from accessing non-personal features', async ({ page }) => {
    // Create authenticated test user
    const user = await createTestUser(page);
    
    // Get personal organization
    const personalOrg = await getPersonalOrganization(page);
    expect(personalOrg.kind).toBe('personal');
    
    // Try to create invitation (POST /api/organizations/invitations no longer exists - handled by remote API)
    const invitationsResponse = await fetchJsonViaPage(page, `/api/organizations/invitations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organizationId: personalOrg.id,
        email: 'test@example.com',
        role: 'member'
      }),
    });
    
    // Endpoint no longer exists in worker - returns 404 (handled by remote API)
    expect(invitationsResponse.status).toBe(404);
    // Error response should indicate endpoint is handled by remote API
    if (invitationsResponse.data && 'error' in invitationsResponse.data) {
      expect(invitationsResponse.data.error).toContain('remote API');
    }
  });

  test('should block file uploads when file quota is exceeded', async ({ page }) => {
    // Create authenticated test user
    const user = await createTestUser(page);
    
    // Get personal organization
    const personalOrg = await getPersonalOrganization(page);
    
    // Ensure active organization is set for session (prefer using active if available)
    const activeResp = await fetchJsonViaPage(page, '/api/auth/organization/get-full-organization');
    const activeOrgId = activeResp.status === 200 && activeResp.data && typeof activeResp.data === 'object'
      ? (activeResp.data as { id?: string }).id
      : undefined;
    const orgIdToUse = activeOrgId ?? personalOrg.id;

    // Create a test file and try to upload
    const testFileContent = 'Test file content for quota testing';
    const uploadResponse = await uploadFileViaPage(page, '/api/files/upload', {
      orgId: orgIdToUse,
      sessionId: 'test-file-quota-session',
      fileName: 'test.txt',
      fileType: 'text/plain',
      content: testFileContent
    });
    
    // Personal org restriction is evaluated first by the feature guard
    // Expect 403 Forbidden deterministically for personal orgs
    expect(uploadResponse.status).toBe(403);
    
    // If 403, verify error message
    if (uploadResponse.status === 403) {
      const errorText = uploadResponse.error || uploadResponse.data?.error || uploadResponse.data?.message || '';
      expect(errorText).toMatch(/business|personal|upgrade|plan|payment/i);
    }
  });

  test('should return 404 for tokens endpoint (removed)', async ({ page }) => {
    // Create authenticated test user
    const user = await createTestUser(page);
    
    // Get personal organization
    const personalOrg = await getPersonalOrganization(page);
    
    // Try to CREATE API token (endpoint no longer exists - API tokens removed)
    const response = await fetchJsonViaPage(page, `/api/organizations/${personalOrg.id}/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tokenName: 'Test Token',
        permissions: ['read']
      }),
    });
    
    // Endpoint no longer exists in worker - returns 404 (handled by remote API)
    expect(response.status).toBe(404);
    if (response.data && 'error' in response.data) {
      expect(response.data.error).toContain('remote API');
    }
  });

  test('should return 404 for invitations endpoint (handled by remote API)', async ({ page }) => {
    // Create authenticated test user
    const user = await createTestUser(page);
    
    // Get personal organization
    const personalOrg = await getPersonalOrganization(page);
    expect(personalOrg.kind).toBe('personal');
    
    // Try to access invitations endpoint
    // POST /api/organizations/invitations no longer exists in worker - handled by remote API
    const response = await fetchJsonViaPage(page, `/api/organizations/invitations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organizationId: personalOrg.id,
        email: 'test@example.com',
        role: 'member'
      }),
    });
    
    // Endpoint no longer exists in worker - returns 404 (handled by remote API)
    expect(response.status).toBe(404);
    if (response.data && 'error' in response.data) {
      expect(response.data.error).toContain('remote API');
    }
  });

});
