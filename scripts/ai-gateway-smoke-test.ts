import { createAiClient } from '../worker/utils/aiClient.js';
import type { AiClientEnv } from '../worker/utils/aiClient.js';

const truncate = (value: string, maxLength = 300): string =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

const env: AiClientEnv = {
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  CF_AIG_GATEWAY_NAME: process.env.CF_AIG_GATEWAY_NAME,
  CF_AIG_TOKEN: process.env.CF_AIG_TOKEN,
  OPENAI_TOKEN: process.env.OPENAI_TOKEN,
  AI_PROVIDER: process.env.AI_PROVIDER
};

const model = process.env.AI_MODEL ?? 'gpt-4o-mini';

const run = async (): Promise<void> => {
  try {
    const client = createAiClient(env);
    const response = await client.requestChatCompletions({
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 20
    });
    const rawBody = await response.text();
    const summary = response.ok
      ? 'OK'
      : `HTTP ${response.status}`;

    let bodyPreview = rawBody;
    try {
      const parsed = JSON.parse(rawBody) as { choices?: Array<{ message?: { content?: string } }> };
      const firstMessage = parsed.choices?.[0]?.message?.content;
      if (firstMessage) {
        bodyPreview = firstMessage;
      }
    } catch {
      // Ignore JSON parse errors, just use raw body text.
    }

    console.log(`[ai-gateway-smoke-test] provider=${client.provider} status=${summary}`);
    console.log(`[ai-gateway-smoke-test] response=${truncate(bodyPreview)}`);

    if (!response.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ai-gateway-smoke-test] failed: ${message}`);
    process.exitCode = 1;
  }
};

await run();
