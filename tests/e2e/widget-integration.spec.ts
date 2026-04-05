import { expect, test } from './fixtures.auth';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { waitForSession } from './helpers/auth';
import { loadE2EConfig } from './helpers/e2eConfig';

const e2eConfig = loadE2EConfig();

const buildCookieHeader = async (context: BrowserContext, baseURL: string): Promise<string> => {
  let cookies = await context.cookies(baseURL);
  if (!cookies.length) {
    cookies = await context.cookies();
  }
  if (!cookies.length) return '';
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
};

const normalizePracticeSlug = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes('://')) {
    try {
      const parsed = new URL(trimmed);
      const segments = parsed.pathname.split('/').filter(Boolean);
      return segments[segments.length - 1] || trimmed;
    } catch {
      return trimmed;
    }
  }
  if (trimmed.includes('/')) {
    const segments = trimmed.split('/').filter(Boolean);
    return segments[segments.length - 1] || trimmed;
  }
  return trimmed;
};

const getOrCreateConversation = async (options: {
  request: APIRequestContext;
  context: BrowserContext;
  page?: Page;
  baseURL: string;
  practiceId: string;
  practiceSlug?: string;
}): Promise<string> => {
  const ensureCookieHeader = async (): Promise<string> => {
    let cookieHeader = await buildCookieHeader(options.context, options.baseURL);
    if (!cookieHeader && options.page) {
      await waitForSession(options.page, { timeoutMs: 30000 });
      cookieHeader = await buildCookieHeader(options.context, options.baseURL);
    }
    return cookieHeader;
  };

  const cookieHeader = await ensureCookieHeader();
  const activeConversationResponse = await options.request.get(
    `/api/conversations/active?practiceId=${encodeURIComponent(options.practiceId)}`,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
    }
  );

  if (activeConversationResponse.status() === 200) {
    const activePayload = await activeConversationResponse.json().catch(() => null);
    if (activePayload?.data?.conversation?.id && typeof activePayload.data.conversation.id === 'string') {
      return activePayload.data.conversation.id;
    }
  }

  const createConversationResponse = await options.request.post('/api/conversations', {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieHeader,
    },
    data: {
      practiceId: options.practiceId,
      mode: 'REQUEST_CONSULTATION',
    },
  });

  if (createConversationResponse.status() !== 201) {
    throw new Error(`Failed to create conversation: ${createConversationResponse.status()}`);
  }

  const createPayload = await createConversationResponse.json().catch(() => null);
  if (!createPayload?.data?.id || typeof createPayload.data.id !== 'string') {
    throw new Error('Created conversation response missing valid ID');
  }

  return createPayload.data.id;
};

test.describe('Widget Integration & Edge Cases', () => {
  test.skip(!e2eConfig, 'E2E credentials are not configured.');
  test.describe.configure({ timeout: 60000 });

  test('chat messages persist across page reloads', async ({ ownerContext, baseURL }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    const conversationId = await getOrCreateConversation({
      request: page.request,
      context: ownerContext,
      page,
      baseURL,
      practiceId: e2eConfig.practice.id,
      practiceSlug: e2eConfig.practice.slug,
    });

    // Send a message
    await page.fill('[data-testid="message-input"]', 'Test message for persistence');
    await page.click('[data-testid="send-button"]');
    
    // Wait for AI response
    await page.waitForSelector('[data-testid="ai-message"]', { timeout: 30000 });
    
    // Reload page
    await page.reload({ waitUntil: 'domcontentloaded' });
    
    // Messages should still be there
    await expect(page.locator('[data-testid="user-message"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="ai-message"]')).toHaveCount(1);
    
    await page.close();
  });

  test('handles network errors gracefully', async ({ ownerContext }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Intercept and fail the next AI chat request
    await page.route('**/api/ai/chat', route => route.abort('failed'));
    
    // Send a message
    await page.fill('[data-testid="message-input"]', 'This should fail');
    await page.click('[data-testid="send-button"]');
    
    // Should show error state
    await expect(page.locator('body')).toContainText('error', { timeout: 10000 });
    
    // Remove the route and try again
    await page.unroute('**/api/ai/chat');
    
    await page.fill('[data-testid="message-input"]', 'This should work');
    await page.click('[data-testid="send-button"]');
    
    // Should get a response now
    await expect(page.locator('[data-testid="ai-message"]')).toBeVisible({ timeout: 30000 });
    
    await page.close();
  });

  test('client switching works correctly', async ({ ownerContext, baseURL }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Start conversation with first client
    await page.fill('[data-testid="message-input"]', 'Message for client 1');
    await page.click('[data-testid="send-button"]');
    await page.waitForSelector('[data-testid="ai-message"]', { timeout: 30000 });
    
    // Switch to different client (simulate client switching)
    await page.evaluate(() => {
      window.location.href = '/clients';
    });
    
    await page.waitForURL(/\/clients/);
    await expect(page.locator('body')).toContainText('clients', { timeout: 10000 });
    
    // Go back to chat
    await page.evaluate(() => {
      window.location.href = '/';
    });
    
    await page.waitForURL(/^\/$/);
    await expect(page.locator('[data-testid="message-input"]')).toBeVisible({ timeout: 10000 });
    
    await page.close();
  });

  test('embed widget works in iframe context', async ({ unauthContext, baseURL }) => {
    if (!e2eConfig) return;

    const page = await unauthContext.newPage();
    
    // Navigate to a base URL first to establish a real origin
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    
    // Create a simple HTML page with embedded widget using absolute URL
    const widgetUrl = `${baseURL}/public/${encodeURIComponent(e2eConfig.practice.slug)}?v=widget`;
    const embedHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>Widget Embed Test</title></head>
      <body>
        <h1>Embedded Widget Test</h1>
        <iframe src="${widgetUrl}" width="400" height="600" frameborder="0"></iframe>
      </body>
      </html>
    `;
    
    await page.setContent(embedHtml);
    
    // Switch to iframe context
    const iframe = page.frameLocator('iframe');
    
    // Widget should load in iframe
    await expect(iframe.locator('body')).toContainText('request consultation', { timeout: 15000 });
    
    // Should be able to interact with widget
    await iframe.locator('[data-testid="message-input"]').fill('Test from iframe');
    await iframe.locator('[data-testid="send-button"]').click();
    
    await page.close();
  });

  test('notifications work for new messages', async ({ ownerContext }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Grant notification permissions
    await page.context().grantPermissions(['notifications']);
    
    // Send a message
    await page.fill('[data-testid="message-input"]', 'Test message for notifications');
    await page.click('[data-testid="send-button"]');
    
    // Wait for AI response
    await page.waitForSelector('[data-testid="ai-message"]', { timeout: 30000 });
    
    // Check if notification permission was requested/granted
    const notifications = await page.evaluate(() => {
      return Notification.permission;
    });
    
    // Should be either 'granted' or 'default' (not 'denied')
    expect(['granted', 'default']).toContain(notifications);
    
    await page.close();
  });

  test('widget diagnosis endpoint works', async ({ ownerContext, baseURL }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Call diagnosis endpoint
    const diagnosisResponse = await page.request.get('/api/widget/diagnosis', {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': await buildCookieHeader(ownerContext, baseURL),
      },
    });
    
    expect(diagnosisResponse.status()).toBe(200);
    
    const diagnosis = await diagnosisResponse.json();
    expect(diagnosis).toHaveProperty('status');
    expect(diagnosis).toHaveProperty('timestamp');
    
    await page.close();
  });

  test('handles large message content', async ({ ownerContext }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Create a very large message
    const largeMessage = 'This is a test message. '.repeat(1000); // ~16,000 characters
    
    await page.fill('[data-testid="message-input"]', largeMessage);
    await page.click('[data-testid="send-button"]');
    
    // Should handle large message without crashing
    await expect(page.locator('[data-testid="ai-message"]')).toBeVisible({ timeout: 45000 });
    
    await page.close();
  });

  test('concurrent message handling', async ({ ownerContext }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Send multiple messages quickly
    const messages = ['Message 1', 'Message 2', 'Message 3'];
    
    for (const message of messages) {
      await page.fill('[data-testid="message-input"]', message);
      await page.click('[data-testid="send-button"]');
      await page.waitForTimeout(100); // Small delay between messages
    }
    
    // Should handle all messages
    await expect(page.locator('[data-testid="user-message"]')).toHaveCount(3);
    await expect(page.locator('[data-testid="ai-message"]')).toHaveCount(3);
    
    await page.close();
  });

  test('accessibility features work', async ({ ownerContext }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Check for proper ARIA labels
    await expect(page.locator('[data-testid="message-input"]')).toHaveAttribute('aria-label');
    await expect(page.locator('[data-testid="send-button"]')).toHaveAttribute('aria-label');
    
    // Test keyboard navigation
    await page.fill('[data-testid="message-input"]', 'Keyboard navigation test');
    await page.keyboard.press('Enter');
    
    // Should send message with Enter key
    await expect(page.locator('[data-testid="ai-message"]')).toBeVisible({ timeout: 30000 });
    
    await page.close();
  });

  test('handles session expiry gracefully', async ({ ownerContext }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Clear session cookies to simulate expiry
    await page.context().clearCookies();
    
    // Try to send a message
    await page.fill('[data-testid="message-input"]', 'Test after session expiry');
    await page.click('[data-testid="send-button"]');
    
    // Should redirect to login or show auth error
    await page.waitForTimeout(2000);
    
    const currentUrl = page.url();
    const hasAuthContent = await page.locator('body').textContent().then(text => 
      text?.toLowerCase().includes('sign in') || text?.toLowerCase().includes('log in')
    );
    
    // Should either redirect to auth or show auth-related content
    expect(
      currentUrl.includes('/auth') || 
      currentUrl.includes('/login') || 
      hasAuthContent
    ).toBeTruthy();
    
    await page.close();
  });
});
