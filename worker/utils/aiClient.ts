import type { Env } from '../types.js';

type AiProvider = 'cloudflare_gateway' | 'openai_direct';

type Fetcher = typeof fetch;

type AiClientEnv = Pick<
  Env,
  'CLOUDFLARE_ACCOUNT_ID' | 'CF_AIG_GATEWAY_NAME' | 'CF_AIG_TOKEN' | 'OPENAI_TOKEN' | 'AI_PROVIDER'
>;

interface AiClientOptions {
  fetcher?: Fetcher;
}

interface AiClient {
  provider: AiProvider;
  baseUrl: string;
  chatCompletionsUrl: string;
  requestChatCompletions: (payload: Record<string, unknown>) => Promise<Response>;
}

const OPENAI_DIRECT_BASE_URL = 'https://api.openai.com/v1';

const normalizeProvider = (provider?: string): AiProvider => {
  if (!provider) {
    return 'cloudflare_gateway';
  }
  const normalized = provider.toLowerCase();
  if (normalized === 'openai_direct') {
    return 'openai_direct';
  }
  if (normalized === 'cloudflare_gateway') {
    return 'cloudflare_gateway';
  }
  throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
};

const getMissingEnvVars = (entries: Array<[string, string | undefined]>): string[] =>
  entries.filter(([, value]) => !value).map(([key]) => key);

const getCloudflareGatewayBaseUrl = (env: AiClientEnv): string => {
  const missing = getMissingEnvVars([
    ['CLOUDFLARE_ACCOUNT_ID', env.CLOUDFLARE_ACCOUNT_ID],
    ['CF_AIG_GATEWAY_NAME', env.CF_AIG_GATEWAY_NAME]
  ]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.CF_AIG_GATEWAY_NAME}/compat`;
};

const shouldUseGatewayTokenOnly = (provider: AiProvider, model?: unknown): boolean =>
  provider === 'cloudflare_gateway' &&
  typeof model === 'string' &&
  (model.startsWith('workers-ai/') || model.startsWith('dynamic/'));

const getOpenAiHeaders = (
  env: AiClientEnv,
  provider: AiProvider,
  model?: unknown
): Headers => {
  const headers = new Headers({
    'Content-Type': 'application/json'
  });

  if (provider === 'cloudflare_gateway') {
    if (!env.CF_AIG_TOKEN) {
      throw new Error('Missing required environment variable: CF_AIG_TOKEN');
    }
    headers.set('cf-aig-authorization', `Bearer ${env.CF_AIG_TOKEN}`);
    if (!shouldUseGatewayTokenOnly(provider, model)) {
      if (!env.OPENAI_TOKEN) {
        throw new Error('Missing required environment variable: OPENAI_TOKEN');
      }
      headers.set('Authorization', `Bearer ${env.OPENAI_TOKEN}`);
    }
    return headers;
  }

  if (!env.OPENAI_TOKEN) {
    throw new Error('Missing required environment variable: OPENAI_TOKEN');
  }
  headers.set('Authorization', `Bearer ${env.OPENAI_TOKEN}`);
  return headers;
};

export const createAiClient = (env: AiClientEnv, options: AiClientOptions = {}): AiClient => {
  const provider = normalizeProvider(env.AI_PROVIDER);
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = provider === 'cloudflare_gateway'
    ? getCloudflareGatewayBaseUrl(env)
    : OPENAI_DIRECT_BASE_URL;
  const chatCompletionsUrl = `${baseUrl}/chat/completions`;

  if (provider === 'cloudflare_gateway') {
    const missing = getMissingEnvVars([
      ['CF_AIG_TOKEN', env.CF_AIG_TOKEN]
    ]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  } else if (!env.OPENAI_TOKEN) {
    throw new Error('Missing required environment variable: OPENAI_TOKEN');
  }

  return {
    provider,
    baseUrl,
    chatCompletionsUrl,
    requestChatCompletions: async (payload: Record<string, unknown>) => {
      const headers = getOpenAiHeaders(env, provider, payload.model);
      return fetcher(chatCompletionsUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
    }
  };
};

export type { AiClient, AiClientEnv, AiProvider };
