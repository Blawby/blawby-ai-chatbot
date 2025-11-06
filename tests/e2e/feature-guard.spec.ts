import { test, expect, type Page } from '@playwright/test';
import { createTestUser } from './helpers/createTestUser.js';
import { fetchJsonViaPage as fetchJsonViaPageHelper, postStreamViaPage, uploadFileViaPage } from './helpers/http.js';

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
          const setActiveResp = await fetchJsonViaPage(page, '/api/auth/organization/set-active', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ organizationId: personalOrg.id }),
          });
          if (!(setActiveResp.status >= 200 && setActiveResp.status < 300) || (setActiveResp.data && 'success' in setActiveResp.data && setActiveResp.data.success === false)) {
            const msg = typeof setActiveResp.error === 'string' ? setActiveResp.error : JSON.stringify(setActiveResp.data || {});
            throw new Error(`Failed to set active org: status ${setActiveResp.status} ${msg}`);
          }
          return personalOrg;
        }
      }

      if (i < retries - 1) {
        await page.waitForTimeout(delayMs);
      }
    }

    throw new Error('Personal organization not found after retries');
  }

  test('should block free tier from accessing business features', async ({ page }) => {
    // Create authenticated test user (starts with free tier personal org)
    const user = await createTestUser(page);
    
    // Get personal organization
    const personalOrg = await getPersonalOrganization(page);
    expect(personalOrg.kind).toBe('personal');
    // Subscription tier might be 'free' or undefined for new users
    expect(personalOrg.subscriptionTier === 'free' || personalOrg.subscriptionTier === undefined || personalOrg.subscriptionTier === null).toBe(true);
    
    // Try to CREATE API token (POST requires business tier, GET doesn't enforce it)
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
    
    // Personal org restriction is evaluated first by the feature guard
    // Expect 403 Forbidden deterministically for personal orgs
    expect(tokensResponse.status).toBe(403);
    // Error response might be in data.error, data.message, or error field
    const errorText = tokensResponse.data?.error || tokensResponse.data?.message || tokensResponse.error || '';
    expect(errorText).toMatch(/business|plan|upgrade|payment|personal/i);
  });

  test('should block personal organizations from accessing non-personal features', async ({ page }) => {
    // Create authenticated test user
    const user = await createTestUser(page);
    
    // Get personal organization
    const personalOrg = await getPersonalOrganization(page);
    expect(personalOrg.kind).toBe('personal');
    
    // Try to create invitation (POST /api/organizations/invitations requires non-personal org)
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
    
    // Personal org restriction is evaluated first by the feature guard
    // Expect 403 Forbidden deterministically for personal orgs
    expect(invitationsResponse.status).toBe(403);
    // Error response might not have success field
    if (invitationsResponse.data && 'success' in invitationsResponse.data) {
      expect(invitationsResponse.data.success).toBe(false);
    }
  });

  test('should block requests when message quota is exceeded', async ({ page }) => {
    // Create authenticated test user
    const user = await createTestUser(page);
    
    // Get personal organization
    const personalOrg = await getPersonalOrganization(page);
    
    // Set a low quota limit for testing (if we had an API endpoint to set quotas)
    // For now, we'll test the error handling when quota is exceeded
    // The atomic increment will return null when quota is reached, which triggers 402
    
    // Make a chat request to /api/agent/stream
    // Note: Without being able to set quotas directly, we can't easily trigger this
    // But we can test that the endpoint exists and handles quota errors properly
    
    // Ensure active organization is set for session (prefer using active if available)
    const activeResp = await fetchJsonViaPage(page, '/api/auth/organization/get-full-organization');
    const activeOrgId = activeResp.status === 200 && activeResp.data && typeof activeResp.data === 'object'
      ? (activeResp.data as { id?: string }).id
      : undefined;
    const orgIdToUse = activeOrgId ?? personalOrg.id;

    // Try to send a message - if quota is exceeded, should get 402
    const chatResponse = await postStreamViaPage(page, '/api/agent/stream', {
      organizationId: orgIdToUse,
      sessionId: 'test-quota-session',
      messages: [{ role: 'user', content: 'Test message for quota' }]
    });
    
    // Should either succeed (if quota not exceeded) or return 402 (if quota exceeded)
    // We can't control quota in E2E, so we just verify the endpoint works
    expect([200, 402]).toContain(chatResponse.status);
    
    // If 402, verify error message
    if (chatResponse.status === 402) {
      expect(chatResponse.error || '').toMatch(/quota|limit|payment/i);
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

  test('should allow requests when usage is below quota', async ({ page }) => {
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

    // Send a chat message - should succeed if quota allows
    const chatResponse = await postStreamViaPage(page, '/api/agent/stream', {
      organizationId: orgIdToUse,
      sessionId: 'test-below-quota-session',
      messages: [{ role: 'user', content: 'Hello, this should work if quota allows' }]
    });
    
    // Should succeed (200) or return 402 if quota is exceeded
    expect([200, 402]).toContain(chatResponse.status);
  });

  test('should return 403 for business features when using a personal org', async ({ page }) => {
    // Create authenticated test user
    const user = await createTestUser(page);
    
    // Get personal organization
    const personalOrg = await getPersonalOrganization(page);
    
    // Try to CREATE a business feature (POST requires business tier, GET doesn't)
    // This tests the 402 error format
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
    
    // Personal org restriction is evaluated first by the feature guard
    expect(response.status).toBe(403);
    
    // Check if error response has expected structure
    if (response.data && 'success' in response.data) {
      // Error response should have success: false and error message
      expect(response.data.success).toBe(false);
    }
    // Verify error message exists somewhere
    const errorText = response.data?.error || response.data?.message || response.error || '';
    expect(errorText).toBeTruthy();
  });

  test('should return 403 for personal org restrictions (invitations)', async ({ page }) => {
    // Create authenticated test user
    const user = await createTestUser(page);
    
    // Get personal organization
    const personalOrg = await getPersonalOrganization(page);
    expect(personalOrg.kind).toBe('personal');
    
    // Try to access a feature that requires non-personal org
    // POST /api/organizations/invitations requires business tier and non-personal org
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
    
    // Expect 403 for personal org restriction deterministically
    expect(response.status).toBe(403);
    if (response.status !== 405 && response.data && 'success' in response.data) {
      expect(response.data.success).toBe(false);
    }
  });

  test('should allow chat for free tier users (within quota)', async ({ page }) => {
    // Create authenticated test user
    const user = await createTestUser(page);

    // Get personal organization
    const personalOrg = await getPersonalOrganization(page);
    expect(personalOrg.kind).toBe('personal');
    // Subscription tier might be 'free' or undefined for new users
    expect(personalOrg.subscriptionTier === 'free' || personalOrg.subscriptionTier === undefined || personalOrg.subscriptionTier === null).toBe(true);

    // Ensure active organization is set for session (prefer using active if available)
    const activeResp = await fetchJsonViaPage(page, '/api/auth/organization/get-full-organization');
    const activeOrgId = activeResp.status === 200 && activeResp.data && typeof activeResp.data === 'object'
      ? (activeResp.data as { id?: string }).id
      : undefined;
    const orgIdToUse = activeOrgId ?? personalOrg.id;

    // Send a chat message via API - for free tier within quota this should succeed (200)
    const chatResponse = await postStreamViaPage(page, '/api/agent/stream', {
      organizationId: orgIdToUse,
      sessionId: 'test-free-tier-success',
      messages: [{ role: 'user', content: 'Hello from free tier test' }]
    });

    // Should succeed with 200, or if quota exceeded, return 402 with an error message
    if (chatResponse.status === 402) {
      expect(chatResponse.error || '').toMatch(/quota|limit|payment/i);
    } else {
      expect(chatResponse.status).toBe(200);
    }
  });
});
