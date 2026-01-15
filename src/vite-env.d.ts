/// <reference types="vite/client" />

/**
 * Frontend Environment Variables
 * 
 * IMPORTANT: Variables prefixed with VITE_
 * are bundled into the frontend code at build time. They are NOT available
 * at runtime via process.env.
 * 
 * See .env.example for documentation on each variable.
 */
interface ImportMetaEnv {
  // Feature flags
  readonly VITE_DEBUG_OVERLAY?: string;
  readonly VITE_ENABLE_MSW?: string;

  // API URLs
  /** Cloudflare Worker API URL (optional - auto-detected) */
  readonly VITE_WORKER_API_URL?: string;
  /** Backend API URL (REQUIRED in production) */
  readonly VITE_BACKEND_API_URL?: string;
  readonly VITE_API_URL?: string;
  // Other configuration
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_DEFAULT_PRACTICE_PHONE?: string;
  readonly VITE_ONESIGNAL_APP_ID?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;

  // Frontend base URL (for SSR/fallback scenarios)
  readonly VITE_APP_BASE_URL?: string;
  readonly VITE_PUBLIC_APP_URL?: string;
  readonly VITE_APP_URL?: string;

  readonly [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
  readonly glob: (pattern: string) => Record<string, () => Promise<unknown>>;
}
