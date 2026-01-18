Check for lint/ts errors and resolve before commit request (only when writing code, not documentation)
Don’t use useEffect for React-internal logic (derived state, data transforms, “when X changes set Y”, or user events). Use it only for external synchronization (DOM/Browser APIs, subscriptions, timers, fetch with cleanup).
System boundaries and sources of truth:
Frontend (Cloudflare Pages): Preact app in src/ built by Vite. Use src/config/urls.ts for API routing rules and env variable behavior.
Worker API (Cloudflare Workers): see worker/index.ts and worker/routes/*.ts for local endpoints. Current worker routes include:
- /api/conversations, /api/chat, /api/ai/chat, /api/ai/intent
- /api/inbox
- /api/notifications
- /api/files, /api/analyze, /api/pdf
- /api/activity, /api/status, /api/health
- /api/intakes
- /api/practices/*/workspace (chatbot workspace data only; worker/routes/practices.ts returns 404 for non-workspace practice management)
- /api/practice/details/:slug (proxy to remote via RemoteApiService)
- /api/lawyers, /api/config, /api/debug, /api/test
Remote backend API (staging/production): use https://staging-api.blawby.com/llms.txt for schema/source of truth. Auth, practice management (non-workspace), subscriptions/payments/Stripe, onboarding, preferences, uploads, and user management are remote per worker/routes/index.ts and README.md.
If an endpoint is not defined in worker/routes or the root worker route list, treat it as remote and confirm in llms.txt.

URLs and env variables (don’t guess; follow src/config/urls.ts, README.md, and docs/engineering/URL_CONFIG_MIGRATION_COMPLETE.md):
Frontend (local dev): .env in repo root for VITE_* vars. Production: Cloudflare Pages env vars.
- Worker API base: VITE_WORKER_API_URL; defaults to http://localhost:8787 in dev and https://ai.blawby.com in prod (base URL should NOT include /api; callers append /api/*).
- Backend API base: VITE_BACKEND_API_URL (required in production); dev fallback to https://staging-api.blawby.com unless VITE_ENABLE_MSW=true.
- Frontend host validation uses VITE_APP_BASE_URL / VITE_PUBLIC_APP_URL / VITE_APP_URL when window.location is unavailable.
Worker (local dev): worker/.dev.vars for secrets (see dev.vars.example). Worker non-secrets live in worker/wrangler.toml [env.*.vars].
- REMOTE_API_URL determines which remote backend the worker calls (RemoteApiService); defaults to https://staging-api.blawby.com if unset.
- Production worker route: ai.blawby.com/api/* (worker/wrangler.toml).
