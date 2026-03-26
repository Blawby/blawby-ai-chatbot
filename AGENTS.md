Run lint/TS checks only when the user explicitly says we are preparing to commit; do not run lint/TS after each chat message or intermediate change. Before creating a commit request, run lint/TS and resolve issues.
Don’t use useEffect for React-internal logic (derived state, data transforms, “when X changes set Y”, or user events). Use it only for external synchronization (DOM/Browser APIs, subscriptions, timers, fetch with cleanup).
System boundaries and sources of truth:
Frontend (Cloudflare Pages): Preact app in src/ built by Vite. Use src/config/urls.ts for API routing rules and env variable behavior.
Worker API (Cloudflare Workers): Handles edge-local features and proxying:
- **Chat & Real-time**: Conversations (D1/Durable Objects), AI interactions, WebSockets, and Matter Progress tracking.
- **Media & Files**: R2 storage proxying, PDF extraction, and document analysis.
- **Proxying & Bridges**: Routes like auth, subscriptions, core practice management, and intakes are proxied to the remote backend (see `worker/index.ts` and `worker/routes/authProxy.ts`).
*Always check `worker/index.ts` and `worker/routes/*.ts` to confirm if a route is handled locally or proxied.*
Remote backend API (staging/production): Use `https://staging-api.blawby.com/llms.txt` for the schema and source of truth.
- Handles core relational data: Auth, full practice management, client-intakes (management/status), matters, subscriptions/payments, user preferences, and user details.
*If an endpoint's logic is not explicitly defined in the worker's source code, it's a remote backend concern. Check `llms.txt` for the remote API contract.*
Routing rules:
Cloudflare Pages `public/_redirects` must include:
```text
/api/*              /api/:splat        200
/__better-auth__/*  /__better-auth__/:splat 200
/*                  /index.html        200
```
No internal <a href="/..."> for in-app routes. Use preact-iso Link or location.route()/navigate().
Only use hard navigations for cross-origin URLs, Stripe checkout, or external auth redirects.
Avoid manual path parsing in MainApp; prefer Router routes for /practice/* and /client/*.
Keep Workbox/PWA navigation denylist for /api/*; index.html fallback only for document navigations.
Greenfield app: no backward-compat/legacy support. Do not add other fallbacks or shims. Frontend + Worker proxy must speak directly to the Railway backend; surface backend errors rather than masking them.
Fail fast: do not add fallback paths, silent catches, default substitutions, or retry-on-unknown-error logic unless explicitly requested by the user; propagate backend/runtime errors verbatim.
For accent-colored surfaces (`bg-accent-*` / accent overlays), never hardcode foreground text colors (`text-white`, `text-gray-*`, `text-input-text`); use `text-[rgb(var(--accent-foreground))]` so contrast stays WCAG-safe across dynamic accent themes.
Matter detail editing UX is inline-only: do not add `/edit` routes or modal edit forms; use section-level inline editing within the detail view.
Never write .md files unless requested by the user.