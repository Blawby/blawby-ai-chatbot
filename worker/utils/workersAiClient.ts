import type { Env } from '../types.js';

/**
 * Shared chat-completion client for the Worker.
 *
 * Calls the Cloudflare **Workers AI** OpenAI-compatible REST endpoint:
 *
 *   https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions
 *
 * Notes on what this endpoint accepts:
 *  - Models MUST be Workers AI model IDs (e.g. `@cf/zai-org/glm-4.7-flash`).
 *    Provider names (`gpt-4o`, `gpt-4o-mini`) and AI Gateway dynamic routes
 *    (`dynamic/blawby-chat-failover`) are NOT valid here and fail with
 *    Cloudflare error 2002.
 *  - Auth is `Authorization: Bearer ${CF_AIG_TOKEN}`. Despite the legacy
 *    `CF_AIG_` ("AI Gateway") prefix, this is a Cloudflare API token with
 *    Workers AI access — the Worker does not route through AI Gateway.
 *
 * This is the single routing abstraction for chat completions. It is separate
 * from direct `env.AI.run(...)` calls, which are used for embeddings
 * (`worker/services/SearchVectorService.ts`) and reranking
 * (`worker/routes/search.ts`) and intentionally bypass this client.
 */

type Fetcher = typeof fetch;

type WorkersAiClientEnv = Pick<
  Env,
  'CLOUDFLARE_ACCOUNT_ID' | 'CF_AIG_TOKEN'
>;

interface WorkersAiClientOptions {
  fetcher?: Fetcher;
}

interface WorkersAiClient {
  baseUrl: string;
  chatCompletionsUrl: string;
  requestChatCompletions: (
    payload: Record<string, unknown>,
    signal?: AbortSignal,
    options?: { headers?: Record<string, string> }
  ) => Promise<Response>;
}

const getMissingEnvVars = (entries: Array<[string, string | undefined]>): string[] =>
  entries.filter(([, value]) => !value).map(([key]) => key);

const getWorkersAiBaseUrl = (env: WorkersAiClientEnv): string => {
  const missing = getMissingEnvVars([
    ['CLOUDFLARE_ACCOUNT_ID', env.CLOUDFLARE_ACCOUNT_ID]
  ]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`;
};

export const createWorkersAiClient = (env: WorkersAiClientEnv, options: WorkersAiClientOptions = {}): WorkersAiClient => {
  const fetcher = options.fetcher ?? fetch;

  if (!env.CF_AIG_TOKEN) {
    throw new Error('Missing required environment variable: CF_AIG_TOKEN');
  }

  const baseUrl = getWorkersAiBaseUrl(env);
  const chatCompletionsUrl = `${baseUrl}/chat/completions`;

  return {
    baseUrl,
    chatCompletionsUrl,
    requestChatCompletions: async (
      payload: Record<string, unknown>,
      signal?: AbortSignal,
      requestOptions?: { headers?: Record<string, string> }
    ) => {
      return fetcher(chatCompletionsUrl, {
        method: 'POST',
        headers: {
          ...(requestOptions?.headers ?? {}),
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.CF_AIG_TOKEN}`,
        },
        body: JSON.stringify(payload),
        signal,
      });
    },
  };
};

export const resolveWorkersAiModel = (
  env: Pick<Env, 'AI_MODEL'>,
  fallbackModel: string,
): string => {
  const configured = env.AI_MODEL?.trim();
  if (!configured) return fallbackModel;
  return configured.startsWith('@cf/') ? configured : fallbackModel;
};

export type { WorkersAiClient, WorkersAiClientEnv };
