/**
 * Smoke test for the Worker's chat-completion path.
 *
 * Exercises the exact runtime path the Worker uses: the shared
 * `createWorkersAiClient` against Cloudflare's Workers AI OpenAI-compatible
 * endpoint. It deliberately uses the same model the Worker defaults to
 * (`AI_MODEL`, falling back to the Worker's `DEFAULT_AI_MODEL`) so a pass here
 * means production chat completions resolve too.
 *
 * Requires `CLOUDFLARE_ACCOUNT_ID` and `CF_AIG_TOKEN` in the environment.
 * Run with: `npm run smoke:ai-gateway`
 */
import { createWorkersAiClient } from '../worker/utils/workersAiClient.js';
import type { WorkersAiClientEnv } from '../worker/utils/workersAiClient.js';

// Keep in sync with DEFAULT_AI_MODEL in the Worker (worker/routes/aiChatShared.ts).
const DEFAULT_AI_MODEL = '@cf/zai-org/glm-4.7-flash';

const truncate = (value: string, maxLength = 300): string =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

const env: WorkersAiClientEnv = {
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  CF_AIG_TOKEN: process.env.CF_AIG_TOKEN,
};

const model = process.env.AI_MODEL ?? DEFAULT_AI_MODEL;

const run = async (): Promise<void> => {
  try {
    const client = createWorkersAiClient(env);
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

    console.log(`[ai-gateway-smoke-test] baseUrl=${client.baseUrl} model=${model} status=${summary}`);
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
