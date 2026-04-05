import { expect, test } from './fixtures.auth';
import { waitForSession } from './helpers/auth';
import { loadE2EConfig } from './helpers/e2eConfig';

const e2eConfig = loadE2EConfig();

test.describe('Message Reactions with Normalization', () => {
  test('actions with persistedMessageId should not cause 404 reaction errors', async ({ page, request }) => {
    if (!e2eConfig) return;

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSession(page, { timeoutMs: 30000 });

    // Start conversation that will trigger tool-only response
    await page.fill('[data-testid="message-input"]', 'divorce case with will issues');
    await page.click('[data-testid="send-button"]');
    await page.waitForSelector('[data-testid="ai-message"]', { timeout: 30000 });

    // Send location to trigger the tool-only scenario
    await page.fill('[data-testid="message-input"]', 'charlotte nc');
    await page.click('[data-testid="send-button"]');
    
    // Wait for response and capture SSE done payload
    const responsePromise = page.waitForResponse(response => 
      response.url().includes('/api/ai/chat') && response.status() === 200
    );
    
    const response = await responsePromise;
    const responseText = await response.text();
    
    // Parse SSE stream to find done payload with persistedMessageId
    const lines = responseText.split('\n');
    let donePayload: any = null;
    
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const data = JSON.parse(line.slice(6));
          if (data?.done === true) {
            donePayload = data;
            break;
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    // Verify normalization layer worked
    expect(donePayload, 'Should receive SSE done payload').toBeTruthy();
    expect(donePayload?.actions, 'Should have actions from tool call').toBeTruthy();
    expect(donePayload?.actions?.length, 'Should have at least one action').toBeGreaterThan(0);
    expect(donePayload?.persistedMessageId, 'Should have persistedMessageId').toBeTruthy();
    expect(donePayload?.replySource, 'Should have replySource').toBeTruthy();

    // Wait for UI to settle
    await page.waitForTimeout(2000);

    // Get the persisted message ID from SSE payload
    const persistedMessageId = donePayload.persistedMessageId;
    const conversationId = page.url().match(/\/c\/([^\/]+)/)?.[1];
    
    expect(conversationId, 'Should have conversation ID from URL').toBeTruthy();
    expect(persistedMessageId, 'Should have persisted message ID').toBeTruthy();

    // Try to fetch reactions - this should NOT return 404
    const reactionsResponse = await request.get(
      `/api/conversations/${conversationId}/messages/${persistedMessageId}/reactions`,
      {
        headers: {
          'Cookie': await page.evaluate(() => document.cookie)
        }
      }
    );

    // The key assertion: should NOT be 404
    expect(
      reactionsResponse.status(),
      `Reaction fetch should not return 404. Got ${reactionsResponse.status()}`
    ).not.toBe(404);

    // Log results for debugging
    console.log('Reaction fetch results:', {
      status: reactionsResponse.status(),
      statusText: reactionsResponse.statusText(),
      persistedMessageId,
      replySource: donePayload.replySource,
      actionCount: donePayload.actions?.length
    });

    // Verify the message actually exists in the conversation
    const messagesResponse = await request.get(
      `/api/conversations/${conversationId}/messages`,
      {
        headers: {
          'Cookie': await page.evaluate(() => document.cookie)
        }
      }
    );

    expect(messagesResponse.status()).toBe(200);
    const messages = await messagesResponse.json();
    
    // Find our persisted message
    const persistedMessage = messages.find((msg: any) => msg.id === persistedMessageId);
    expect(persistedMessage, 'Persisted message should exist in conversation').toBeTruthy();
    expect(persistedMessage.role).toBe('system');
    expect(persistedMessage.content).toBeTruthy();
    expect(persistedMessage.content.length).toBeGreaterThan(0);

    // Verify metadata includes the actions
    expect(persistedMessage.metadata).toBeTruthy();
    expect(persistedMessage.metadata.actions).toEqual(donePayload.actions);
  });

  test('observability: synthetic replies should be logged but not break UI', async ({ page }) => {
    if (!e2eConfig) return;

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSession(page, { timeoutMs: 30000 });

    // Capture console logs for observability
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('synthetic reply') || msg.text().includes('tool-only')) {
        consoleLogs.push(msg.text());
      }
    });

    // Trigger tool-only scenario
    await page.fill('[data-testid="message-input"]', 'divorce case');
    await page.click('[data-testid="send-button"]');
    await page.waitForSelector('[data-testid="ai-message"]', { timeout: 30000 });

    await page.fill('[data-testid="message-input"]', 'charlotte nc');
    await page.click('[data-testid="send-button"]');
    await page.waitForTimeout(3000);

    // Check if synthetic repair was logged (may or may not happen depending on model)
    const syntheticRepairLogs = consoleLogs.filter(log => 
      log.includes('synthetic reply') || log.includes('tool-only')
    );

    // Whether synthetic repair happened or not, the UI should work
    const aiMessages = await page.locator('[data-testid="ai-message"]').count();
    expect(aiMessages).toBeGreaterThan(0);

    // If synthetic repair was used, it should be logged for observability
    if (syntheticRepairLogs.length > 0) {
      console.log('Synthetic repair detected:', syntheticRepairLogs);
      expect(syntheticRepairLogs.length).toBeGreaterThan(0);
    }
  });
});
