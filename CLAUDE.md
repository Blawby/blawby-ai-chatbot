# CLAUDE.md

**Never merge without explicit human approval.** Do not run `git merge`, `gh pr merge`, or any equivalent that combines branches — including fast-forward merges and merges into your own working branch — unless the human has approved that specific merge in this conversation. Approval of one merge is not approval of the next. Rebases, cherry-picks, and pushes that would land merged history are covered by this rule.

When an internal API returns errors, nulls, or malformed data, fix the API contract/source of truth first; do not add frontend fallbacks, guards, or workaround logic unless the API behavior is intentionally nullable and documented.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Local Browser Verification

Always verify browser/auth/signup flows through `https://local.blawby.com`, not raw Vite or Wrangler localhost URLs. Auth cookies, Worker proxying, and app routing all depend on the same origin/path shape as real deployments.

### Mode A — Staging backend (default, no local backend needed)

Most frontend contributors use this. Auth, preferences, and API calls all go to the staging backend.

```bash
npm install
npm run dev:full
```

Open `https://local.blawby.com`. Done.

#### Wrangler auth — if `dev:full` fails to start the worker

If you see:

```text
✘ [ERROR] A request to the Cloudflare API (/accounts/<id>/workers/subdomain/edge-preview) failed.
  notes: Authentication error [code: 10000]
```

…the worker is dying because wrangler's stored OAuth token (`~/.config/.wrangler/config/default.toml` on macOS/Linux, `%APPDATA%/xdg.config/.wrangler/config/default.toml` on Windows) doesn't have the right scopes for the AI binding's remote-proxy session, and wrangler prefers the OAuth token over `CLOUDFLARE_API_TOKEN` in `worker/.dev.vars`. `.dev.vars` is loaded into the worker *runtime*, not consumed by the wrangler *CLI*.

Workaround — export the API token in your shell so wrangler picks it up:

```bash
export CLOUDFLARE_API_TOKEN=<value-from-worker/.dev.vars>
npm run dev:full
```

PowerShell:

```powershell
$env:CLOUDFLARE_API_TOKEN = "<value-from-worker/.dev.vars>"
npm run dev:full
```

You can verify a token has the right scope with:

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/<account-id>/workers/subdomain/edge-preview" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

A correct response returns `{ "result": { "exchange_url": ..., "token": ... } }`. A 403 here means the token's permissions are wrong — generate a new one with "Workers Scripts:Edit" scope.

### Mode B — Local backend

Use this when your change touches the backend, or you need to test the full stack locally.

Recommended layout:

```text
your-workspace/
  blawby-ai-chatbot/   ← this repo
  blawby-backend/      ← backend repo
```

**Terminal 1** — backend API:

```bash
cd ../blawby-backend
pnpm install
pnpm run dev
```

**Terminal 2** — event worker (required — without this, new-user preferences are never initialized and onboarding always fails):

```bash
cd ../blawby-backend
pnpm run event-worker:dev
```

**Terminal 3** — frontend + Worker pointing at local backend:

```bash
npm install
npm run dev:full:local
```

Open `https://local.blawby.com`.

> **Why `dev:full:local`?** The default `dev:full` uses `dev:worker`, which reads `BACKEND_API_URL` from `[env.dev.vars]` in `wrangler.toml` (staging). `dev:full:local` uses `dev:worker:local`, which passes `--var BACKEND_API_URL:http://127.0.0.1:3000` to override it. `.dev.vars` alone does not override `[env.dev.vars]`.

If a Worker feature adds a D1 table, apply the migration locally before browser testing:

```bash
npx wrangler d1 execute DB --local --config worker/wrangler.toml --env dev --file worker/migrations/<migration-file>.sql
```

If a feature adds a new Worker-owned `/api/*` prefix, add it to `workerEndpoints` in `vite.config.ts`; otherwise Vite may proxy that path to the backend fallback and produce misleading local 404s.

## 6. Browser-Agent And Playwright

Use browser-agent for exploratory smoke tests:

```bash
npx agent-browser open https://local.blawby.com/auth
npx agent-browser wait --load networkidle
npx agent-browser snapshot -i
npx agent-browser fill @e1 "user@example.com"
npx agent-browser fill @e2 "password"
npx agent-browser click @e3
```

After navigation, modal open/close, or dynamic content updates, run `npx agent-browser snapshot -i` again before using element refs. Refs like `@e1` are only valid for the latest snapshot.

Use Playwright for repeatable test suites:

```bash
npm run test:e2e
npm run test:e2e:auth
```

Playwright auth setup reads E2E credentials from environment variables or `tests/e2e/fixtures/e2e-credentials.json`. Keep docs and tests path-agnostic: do not use machine-specific absolute paths for this repo or the backend repo.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
