Run lint/TS checks only when the user explicitly says we are preparing to commit; do not run lint/TS after each chat message or intermediate change. Before creating a commit request, run lint/TS and resolve issues.
Don’t use useEffect for React-internal logic (derived state, data transforms, “when X changes set Y”, or user events). Use it only for external synchronization (DOM/Browser APIs, subscriptions, timers, fetch with cleanup).
System boundaries and sources of truth:
Frontend (Cloudflare Pages): Preact app in src/ built by Vite. Use src/config/urls.ts for API routing rules and env variable behavior.
Worker API (Cloudflare Workers): Handles edge-local features and proxying:
- **Chat & Real-time**: Conversations (D1/Durable Objects), AI interactions, WebSockets, and Matter Progress tracking.
- **Media & Files**: R2 storage proxying, PDF extraction, and document analysis.
- **Proxying & Bridges**: Routes like auth, subscriptions, core practice management, and intakes are proxied to the remote backend (see `worker/index.ts` and `worker/routes/authProxy.ts`).
*Always check `worker/index.ts` and `worker/routes/*.ts` to confirm if a route is handled locally or proxied.*
Local browser verification:
- For auth, signup, practice workspace, reports, and any feature that depends on backend proxying, run the backend API and the frontend/Worker stack together. From a checkout where this repo and the backend repo are siblings, start the backend in one terminal:
```bash
cd ../blawby-backend
pnpm install
pnpm run dev
```
- In this repo, start the frontend, Worker, and `local.blawby.com` tunnel in another terminal:
```bash
npm install
npm run dev:full
```
- Open `https://local.blawby.com`. Do not verify auth/signup flows on raw Vite or Wrangler localhost URLs, because those bypass the same host/proxy/cookie path the app depends on.
- To use a local backend, run `npm run dev:full:local` (not `dev:full`). This passes `--var BACKEND_API_URL:http://127.0.0.1:3000` to Wrangler, overriding the staging URL in `[env.dev.vars]`. Setting `BACKEND_API_URL` in `worker/.dev.vars` alone does NOT work — `[env.dev.vars]` takes precedence when using `--env dev`.
- If a Worker feature adds a new D1 table, apply its migration locally before testing the flow:
```bash
npx wrangler d1 execute DB --local --config worker/wrangler.toml --env dev --file worker/migrations/<migration-file>.sql
```
- If a new Worker-owned API prefix is added, make sure `vite.config.ts` includes that prefix in `workerEndpoints`; otherwise local browser requests will fall through to the backend proxy and may 404.
Browser automation:
- Use browser-agent via the local npm package:
```bash
npx agent-browser open https://local.blawby.com/auth
npx agent-browser wait --load networkidle
npx agent-browser snapshot -i
npx agent-browser fill @e1 "user@example.com"
npx agent-browser fill @e2 "password"
npx agent-browser click @e3
```
- Re-run `npx agent-browser snapshot -i` after navigation or modal changes, because element refs are refreshed after the page changes.
- Prefer browser-agent for exploratory smoke tests and debugging. Use Playwright for repeatable suites:
```bash
npm run test:e2e
npm run test:e2e:auth
```
- Playwright auth tests read E2E credentials from environment variables or `tests/e2e/fixtures/e2e-credentials.json`. Do not hardcode contributor-specific absolute paths in tests or docs.
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
Never write .md files unless requested by the user.
Before creating any new component, hook, or utility, search for an existing one that serves the same purpose. Extend existing abstractions rather than creating parallel ones. Canonical systems that must not be duplicated:
- Conversation state: `useIntakeFlow` / `useSetupFlow` (patch/apply via conversation metadata)
- Inspector UI: `InspectorPanel` + mode branch (add a branch, never a parallel panel)
- Pre-send enrichment: `usePreSendEnrichment`
- Conversation list filtering: `ConversationListView` / `WidgetConversationListView`
If you create something that parallels an existing system, explain why in a comment at the top of the file.

At the end of every feature branch, before flagging work as complete, audit for: orphaned files with no imports, props threaded through but not consumed, and new abstractions that duplicate existing ones. Report findings before closing the branch.
