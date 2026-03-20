import type { Env } from '../types.js';

type Fetcher = typeof fetch;

type AiClientEnv = Pick<
  Env,
  'CLOUDFLARE_ACCOUNT_ID' | 'CF_AIG_TOKEN'
>;

interface AiClientOptions {
  fetcher?: Fetcher;
}

interface AiClient {
  baseUrl: string;
  chatCompletionsUrl: string;
  requestChatCompletions: (payload: Record<string, unknown>) => Promise<Response>;
}

const getMissingEnvVars = (entries: Array<[string, string | undefined]>): string[] =>
  entries.filter(([, value]) => !value).map(([key]) => key);

const getWorkersAiBaseUrl = (env: AiClientEnv): string => {
  const missing = getMissingEnvVars([
    ['CLOUDFLARE_ACCOUNT_ID', env.CLOUDFLARE_ACCOUNT_ID]
  ]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`;
};

export const createAiClient = (env: AiClientEnv, options: AiClientOptions = {}): AiClient => {
  const fetcher = options.fetcher ?? fetch;

  if (!env.CF_AIG_TOKEN) {
    throw new Error('Missing required environment variable: CF_AIG_TOKEN');
  }

  const baseUrl = getWorkersAiBaseUrl(env);
  const chatCompletionsUrl = `${baseUrl}/chat/completions`;

  return {
    baseUrl,
    chatCompletionsUrl,
    requestChatCompletions: async (payload: Record<string, unknown>) => {
      return fetcher(chatCompletionsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.CF_AIG_TOKEN}`,
        },
        body: JSON.stringify(payload),
      });
    },
  };
};

export type { AiClient, AiClientEnv };