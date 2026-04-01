import { expect, test } from './fixtures.public';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Intake QuickAction Diagnosis', () => {
  test.describe.configure({ timeout: 120000 });

  test('capture intake debug logs', async ({ anonPage }) => {
    const debugLogs: any[] = [];
    const practiceSlug = process.env.E2E_PRACTICE_SLUG || 'paul-yahoo';

    // Step 1: Enable client-side debug logging
    await anonPage.addInitScript(() => {
      (window as any).__blawbyQuickActionDebug = true;
    });

    // Step 2: Capture console logs and network responses
    anonPage.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[QuickActionDebug]')) {
        debugLogs.push({
          source: 'console',
          timestamp: new Date().toISOString(),
          type: msg.type(),
          text
        });
      }
    });

    anonPage.on('response', async (response) => {
      if (response.url().includes('/api/ai/chat')) {
        console.log(`[QuickActionDebug] Captured response from ${response.url()}`);
        try {
          const text = await response.text();
          // Find the last line that starts with "data: " and contains "done: true"
          const lines = text.split('\n').filter(l => l.trim().startsWith('data: '));
          const lastLine = lines[lines.length - 1];
          if (lastLine && lastLine.includes('"done":true')) {
            const jsonStr = lastLine.replace(/^data:\s*/, '');
            const payload = JSON.parse(jsonStr);
            debugLogs.push({
              source: 'network',
              timestamp: new Date().toISOString(),
              url: response.url(),
              payload
            });
            console.log(`[QuickActionDebug] Stored network log for ${response.url()}`);
          } else {
            console.log(`[QuickActionDebug] Response finish line not found or doesn't have "done:true". Line count: ${lines.length}`);
          }
        } catch (e) {
          console.log(`[QuickActionDebug] Failed to parse response text: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    });

    // Step 3: Navigate to the public widget
    await anonPage.goto(`/public/${practiceSlug}?v=widget`, { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });

    // Step 4: Trigger consultation
    const consultationCta = anonPage.locator('button:visible, a:visible').filter({ hasText: /request consultation/i }).first();
    await consultationCta.waitFor({ state: 'visible', timeout: 30000 });
    await consultationCta.click();

    // Step 5: Fill slim form
    const uniqueId = randomUUID().slice(0, 8);
    await anonPage.locator('input[placeholder*="full name" i]:visible').fill(`Diagnose E2E ${uniqueId}`);
    await anonPage.locator('input[type="email"]:visible').fill(`diagnose-${uniqueId}@example.com`);
    await anonPage.locator('input[type="tel"]:visible').fill('5551234567');
    
    console.log('Step 5: Clicking slim form continue...');
    await anonPage.locator('button:visible').filter({ hasText: /^continue$/i }).click();

    // Step 6: Explicitly handle the "contact_form_decision" step
    console.log('Step 6: Waiting for decision CTA...');
    const decisionPrompt = anonPage.locator('[data-testid="decision-prompt"]:visible, button:visible >> text=/Continue/i').first();
    try {
      await decisionPrompt.waitFor({ state: 'visible', timeout: 10000 });
      console.log('Decision CTA found, clicking...');
      await decisionPrompt.click();
    } catch (e) {
      console.log('Decision CTA not found (or skipped), proceeding to chat...');
    }

    // Step 7: Wait for the bot's first message and reply (Turn 1)
    const messageInput = anonPage.locator('[data-testid="message-input"]:visible').first();
    await expect(messageInput).toBeEnabled({ timeout: 30000 });

    // Turn 1: Specify a practice area
    console.log('Step 7 (Turn 1): Sending practice area...');
    const response1Promise = anonPage.waitForResponse(r => r.url().includes('/api/ai/chat') && r.request().method() === 'POST');
    await messageInput.fill('I need help with a personal injury case');
    await anonPage.keyboard.press('Enter');
    await response1Promise;
    await anonPage.waitForTimeout(5000); 

    // Turn 2: Provide more details
    console.log('Step 8 (Turn 2): Sending details...');
    const response2Promise = anonPage.waitForResponse(r => r.url().includes('/api/ai/chat') && r.request().method() === 'POST');
    await messageInput.fill('A car hit my bicycle yesterday in Nashville.');
    await anonPage.keyboard.press('Enter');
    await response2Promise;
    await anonPage.waitForTimeout(5000);

    // Turn 3: Challenge with something that should trigger chips
    console.log('Step 9 (Turn 3): Sending urgency...');
    const response3Promise = anonPage.waitForResponse(r => r.url().includes('/api/ai/chat') && r.request().method() === 'POST');
    await messageInput.fill('It is quite urgent since I am in the hospital.');
    await anonPage.keyboard.press('Enter');
    await response3Promise;
    await anonPage.waitForTimeout(5000);

    // Step 10: Write collected logs to file for runner script
    const resultsPath = path.join(process.cwd(), 'intake-debug-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(debugLogs, null, 2));
    
    console.log(`Captured ${debugLogs.length} debug logs to ${resultsPath}`);
  });
});
