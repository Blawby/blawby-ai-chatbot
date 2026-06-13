import type { Env } from '../types.js';

type Fetcher = typeof fetch;

type WorkersAiClientEnv = Pick<
  Env,
  'CLOUDFLARE_ACCOUNT_ID' | 'CF_AIG_TOKEN' | 'AI_GATEWAY_SLUG'
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

const getGatewayUrl = (env: WorkersAiClientEnv, provider: string, path: string): string => {
  const slug = env.AI_GATEWAY_SLUG ?? 'blawby-ai';
  return `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${slug}/${provider}${path}`;
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
      const model = typeof payload.model === 'string' ? payload.model : '';

      if (model.startsWith('claude-')) {
        return fetcher(getGatewayUrl(env, 'anthropic', '/v1/messages'), {
          method: 'POST',
          headers: {
            ...(requestOptions?.headers ?? {}),
            'Content-Type': 'application/json',
            'cf-aig-authorization': `Bearer ${env.CF_AIG_TOKEN}`,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(payload),
          signal,
        });
      }

      if (!model.startsWith('@cf/')) {
        return fetcher(getGatewayUrl(env, 'openai', '/chat/completions'), {
          method: 'POST',
          headers: {
            ...(requestOptions?.headers ?? {}),
            'Content-Type': 'application/json',
            'cf-aig-authorization': `Bearer ${env.CF_AIG_TOKEN}`,
          },
          body: JSON.stringify(payload),
          signal,
        });
      }

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
  return configured || fallbackModel;
};

export type { WorkersAiClient, WorkersAiClientEnv };
