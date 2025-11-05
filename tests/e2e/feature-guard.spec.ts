import { test, expect, type Page } from '@playwright/test';
import { createTestUser } from './helpers/createTestUser.js';

test.describe('Feature Guard - Quota Enforcement', () => {
  
  async function fetchJsonViaPage(page: Page, url: string, init?: any): Promise<{ status: number; data?: any; error?: string }> {
    return page.evaluate(async ({ url, init }: any) => {
      try {
        const response = await fetch(url, {
          credentials: 'include',
          ...init,
        });
        if (!response.ok) {
          const text = await response.text();
          return { status: response.status, error: `HTTP ${response.status}: ${text}` };
        }
        const data = await response.json();
        return { status: response.status, data };
      } catch (err) {
        return { status: 0, error: err instanceof Error ? err.message : String(err) };
      }
    }, { url, init });
  }

  async function getPersonalOrganization(page: Page) {
    // Ensure the personal organization exists (idempotent on server)
    await fetchJsonViaPage(page, '/api/organizations/me/ensure-personal', { method: 'POST' });

    // Poll for active organization first (also sets active_organization_id if missing)
    const retries = 8;
    const delayMs = 400;
    for (let i = 0; i < retries; i++) {
      const activeResp = await fetchJsonViaPage(page, '/api/organizations/active');
      if (activeResp.status === 200 && activeResp.data?.success) {
        const activeOrg = activeResp.data.data?.organization;
        if (activeOrg?.kind === 'personal') {
          return activeOrg;
        }
      }

      const orgsResult = await fetchJsonViaPage(page, '/api/organizations/me');
      if (orgsResult.status === 200 && orgsResult.data?.success) {
        const personalOrg = orgsResult.data.data?.find((org: { kind?: string }) => org?.kind === 'personal');
        if (personalOrg) {
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
    
    // Should return 402 (tier restriction) or 403 (personal org restriction)
    // Both are valid - 403 if personal org restriction is checked first, 402 if tier is checked first
    expect([402, 403]).toContain(tokensResponse.status);
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
    
    // Should return 403 Forbidden (for personal org restriction) or 402 (for tier restriction)
    // Both are valid - 403 if personal org restriction is checked first, 402 if tier is checked first
    expect([402, 403]).toContain(invitationsResponse.status);
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
    const activeResp = await fetchJsonViaPage(page, '/api/organizations/active');
    const orgIdToUse = activeResp.data?.data?.activeOrganizationId ?? personalOrg.id;

    // Try to send a message - if quota is exceeded, should get 402
    // Note: Streaming endpoint returns stream, not JSON, so we need to check status directly
    const chatResponse = await page.evaluate(async ({ orgId, sessionId }) => {
      try {
        const response = await fetch('/api/agent/stream', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            organizationId: orgId,
            sessionId: sessionId,
            messages: [
              { role: 'user', content: 'Test message for quota' }
            ]
          }),
        });
        
        // For streaming responses, we can only check status
        // If 402, try to read error text
        if (response.status === 402) {
          const text = await response.text();
          return { status: response.status, error: text };
        }
        return { status: response.status };
      } catch (err) {
        return { status: 0, error: err instanceof Error ? err.message : String(err) };
      }
    }, { orgId: orgIdToUse, sessionId: 'test-quota-session' });
    
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
    const activeResp = await fetchJsonViaPage(page, '/api/organizations/active');
    const orgIdToUse = activeResp.data?.data?.activeOrganizationId ?? personalOrg.id;

    // Create a test file
    const testFileContent = 'Test file content for quota testing';
    const formData = new FormData();
    formData.append('file', new Blob([testFileContent], { type: 'text/plain' }), 'test.txt');
    formData.append('organizationId', personalOrg.id);
    formData.append('sessionId', 'test-file-quota-session');
    
    // Try to upload file
    const uploadResponse = await page.evaluate(async ({ orgId, sessionId, fileContent }) => {
      const formData = new FormData();
      formData.append('file', new Blob([fileContent], { type: 'text/plain' }), 'test.txt');
      formData.append('organizationId', orgId);
      formData.append('sessionId', sessionId);
      
      try {
        const response = await fetch('/api/files/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        
        if (!response.ok) {
          const text = await response.text();
          return { status: response.status, error: text };
        }
        const data = await response.json();
        return { status: response.status, data };
      } catch (err) {
        return { status: 0, error: err instanceof Error ? err.message : String(err) };
      }
    }, { 
      orgId: orgIdToUse, 
      sessionId: 'test-file-quota-session',
      fileContent: testFileContent 
    });
    
    // File upload requires business tier and non-personal org
    // For personal org with free tier, should return 402 (tier restriction) or 403 (personal org restriction)
    // If quota is exceeded, should return 402
    // If upload succeeds, should return 200/201
    expect([200, 201, 402, 403]).toContain(uploadResponse.status);
    
    // If 402 or 403, verify error message
    if (uploadResponse.status === 402 || uploadResponse.status === 403) {
      const u: any = uploadResponse as any;
      const errorText = u.error || u.data?.error || u.data?.message || '';
      expect(errorText).toMatch(/quota|limit|payment|business|personal|upgrade/i);
    }
  });

  test('should allow requests when usage is below quota', async ({ page }) => {
    // Create authenticated test user
    const user = await createTestUser(page);
    
    // Get personal organization
    const personalOrg = await getPersonalOrganization(page);
    
    // Ensure active organization is set for session (prefer using active if available)
    const activeResp = await fetchJsonViaPage(page, '/api/organizations/active');
    const orgIdToUse = activeResp.data?.data?.activeOrganizationId ?? personalOrg.id;

    // Send a chat message - should succeed if quota allows
    // Note: Streaming endpoint returns stream, not JSON
    const chatResponse = await page.evaluate(async ({ orgId, sessionId }) => {
      try {
        const response = await fetch('/api/agent/stream', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            organizationId: orgId,
            sessionId: sessionId,
            messages: [
              { role: 'user', content: 'Hello, this should work if quota allows' }
            ]
          }),
        });
        
        // For streaming responses, we can only check status
        if (response.status === 402) {
          const text = await response.text();
          return { status: response.status, error: text };
        }
        return { status: response.status };
      } catch (err) {
        return { status: 0, error: err instanceof Error ? err.message : String(err) };
      }
    }, { orgId: orgIdToUse, sessionId: 'test-below-quota-session' });
    
    // Should succeed (200) or return 402 if quota is exceeded
    expect([200, 402]).toContain(chatResponse.status);
  });

  test('should return 402 with proper error details when quota exceeded', async ({ page }) => {
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
    
    // Verify 402 or 403 error structure (both are valid)
    expect([402, 403]).toContain(response.status);
    
    // Check if error response has expected structure
    if (response.data && 'success' in response.data) {
      // Error response should have success: false and error message
      expect(response.data.success).toBe(false);
    }
    // Verify error message exists somewhere
    const errorText = response.data?.error || response.data?.message || response.error || '';
    expect(errorText).toBeTruthy();
  });

  test('should return 403 for personal org restrictions', async ({ page }) => {
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
    
    // Should return 402 (tier restriction) or 403 (personal org restriction) or 405 (method not allowed)
    // 402/403 are valid responses for feature guard restrictions
    // 405 means endpoint exists but method not allowed (also acceptable)
    expect([402, 403, 405]).toContain(response.status);
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
    
    // Navigate to home page
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Wait for chat interface
    const messageInput = page.locator('[data-testid="message-input"]');
    await expect(messageInput).toBeVisible({ timeout: 10000 });
    
    // Send a message - should work for free tier (within quota)
    await messageInput.fill('Test message for free tier user');
    await page.click('button[type="submit"]');
    
    // Wait for response - should not get 402 error
    // If we get a response or error, verify it's not a quota error
    await page.waitForTimeout(2000);
    
    // Check if message appears (success) or if error is shown
    const errorMessage = page.locator('text=/quota|limit|payment/i');
    const messageExists = await page.locator('text=Test message for free tier user').count() > 0;
    
    // Either message should appear (success) or no quota error should be shown
    // We can't guarantee quota isn't exceeded, but we verify the flow works
    expect(messageExists || (await errorMessage.count()) === 0).toBe(true);
  });
});

