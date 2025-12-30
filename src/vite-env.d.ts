/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEBUG_OVERLAY?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_BETTER_AUTH_URL?: string;
  readonly VITE_AUTH_SERVER_URL?: string;
  readonly VITE_REMOTE_API_URL?: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_DEFAULT_PRACTICE_PHONE?: string;
  readonly [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
  readonly glob: (pattern: string) => Record<string, () => Promise<unknown>>;
}
