# Repository Agent Instructions

When an internal API returns errors, nulls, or malformed data, fix the API contract/source of truth first; do not add frontend fallbacks, guards, or workaround logic unless the API behavior is intentionally nullable and documented.

## Autonomous delivery

Agents may investigate, implement, test, push, open pull requests, resolve automated review findings, and merge pull requests into `staging` without waiting for human approval when all of the following are true:

- the work is authorized by the active issue or user request;
- the pull request is non-draft and targets `staging`;
- required local checks and repository CI are green on the current head SHA;
- actionable review findings are resolved or answered with evidence;
- the pull request is mergeable and has no unresolved blocking review threads;
- no secrets, credentials, session state, or production data are exposed or committed.

Use the repository's normal merge method. Do not bypass branch protection, required checks, or explicit issue constraints. Do not merge into production or release branches unless the active issue or user request explicitly authorizes that target.

Do not wait indefinitely for CI or automated review. Poll at bounded intervals, perform only remaining scoped work while checks run, and stop repeated polling after the limit defined by the active issue. Report an external blocker once with evidence instead of emitting duplicate status messages or inventing unrelated work.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, investigate repository code, tests, documentation, and runtime evidence first.
- If multiple interpretations exist, choose the interpretation best supported by the issue, existing architecture, and acceptance criteria.
- If a simpler approach exists, use it.
- Ask for clarification only when a genuinely external product decision, unavailable credential, or irreversible production action blocks correctness.

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
- If you notice unrelated dead code, mention it or open a follow-up issue; don't delete it unless the active issue authorizes cleanup.

When your changes create orphans:
- Remove imports, variables, functions, styles, fixtures, and files that your changes made unused.
- Don't remove pre-existing dead code unless asked or it is directly made obsolete by the authorized work.

The test: Every changed line should trace directly to the user's request or an acceptance criterion.

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

Always verify browser/auth/signup flows through the developer-specific tunnel hostname, not raw Vite or Wrangler localhost URLs. Auth cookies, Worker proxying, and app routing all depend on the same origin/path shape as real deployments.

Each developer has their own Cloudflare tunnel hostname (Vite's `server.allowedHosts` / `hmr.host` must match whichever tunnel is in use):

| Developer | Tunnel hostname |
|-----------|----------------|
| `paulchrisluke` | `https://local.blawby.com` |
| `DarkSkyXD` | `https://dev.blawby.com` |

The tunnel hostname is determined by the `CLOUDFLARE_TUNNEL_TOKEN` configured in `.env` / `worker/.dev.vars` — `scripts/run-tunnel.ts` reads it and `cloudflared` connects to whichever hostname that token owns. If you switch machines, update `vite.config.ts`'s `server.allowedHosts` and `server.hmr.host` to match, or Vite will reject the request with "Blocked request (… ) is not allowed."

For E2E tests, set `E2E_BASE_URL` to your tunnel hostname. Defaults in the Playwright configs assume `local.blawby.com`.

Always use the staging backend — auth, preferences, and API calls all proxy to `https://staging-api.blawby.com`.

```bash
npm install
npm run dev:full
```

Open your tunnel hostname in the browser.

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

Never commit or disclose passwords, API tokens, cookies, storage state, private keys, `.env` contents, or ignored credential fixtures. Redact secrets from logs, screenshots, pull requests, and issue comments.

---

**These guidelines are working if:** agents complete bounded goals autonomously, diffs remain focused, tests prove behavior, review findings are resolved, and blocked states are reported once with actionable evidence.
