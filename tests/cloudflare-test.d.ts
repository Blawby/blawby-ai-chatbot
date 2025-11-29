// Type declarations for cloudflare:test virtual module
// Provided by @cloudflare/vitest-pool-workers

declare module 'cloudflare:test' {
  import type { D1Database, KVNamespace, R2Bucket, DurableObjectNamespace } from '@cloudflare/workers-types';

  export interface ProvidedEnv {
    DB?: D1Database;
    CHAT_SESSIONS?: KVNamespace;
    FILES_BUCKET?: R2Bucket;
    [key: string]: unknown;
  }

  export const env: ProvidedEnv;
}

