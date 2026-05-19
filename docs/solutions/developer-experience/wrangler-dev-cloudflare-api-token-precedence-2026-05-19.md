---
title: "Wrangler dev fails edge-preview auth when CLOUDFLARE_API_TOKEN is only in worker/.dev.vars"
date: 2026-05-19
category: developer-experience
module: "Worker dev environment"
problem_type: developer_experience
component: tooling
severity: high
applies_when:
  - "Running `npm run dev:full` (or `dev:worker`) on a fresh checkout of blawby-ai-chatbot"
  - "wrangler CLI 4.x has an OAuth token cached from a prior `wrangler login` (Windows: `%APPDATA%/xdg.config/.wrangler/config/default.toml`)"
  - "The worker declares an `[ai]` binding — the only binding marked `remote` in dev mode and the one that triggers a Cloudflare API call at wrangler startup"
  - "`/api/*` returns 500 with an empty body because the worker never finished booting"
symptoms:
  - "wrangler dev exits with `A request to the Cloudflare API (/accounts/<id>/workers/subdomain/edge-preview) failed`"
  - "wrangler log shows `APIError ... Authentication error [code: 10000]` despite a valid token in `worker/.dev.vars`"
  - "`curl https://api.cloudflare.com/client/v4/user/tokens/verify` reports the token as active, AND direct curl to `/workers/subdomain/edge-preview` returns an `exchange_url` + preview `token` successfully"
  - "Frontend hits `/api/*` and receives 500 with an empty response body"
root_cause: incomplete_setup
resolution_type: environment_setup
related_components: ["development_workflow", "authentication"]
tags: ["wrangler", "cloudflare-api-token", "dev-vars", "workers-ai", "edge-preview", "local-dev", "oauth-precedence", "dev-full"]
---

# Wrangler dev fails edge-preview auth when CLOUDFLARE_API_TOKEN is only in worker/.dev.vars

## Context

The blawby-ai-chatbot frontend at `https://local.blawby.com` depends on a three-process local stack: Vite, a Cloudflare Workers dev server bound to `localhost:8787`, and a tunnel that routes `local.blawby.com` to Vite. The Worker is what serves `/api/*`. Contributors start the whole stack with `npm run dev:full`.

The friction this doc addresses: `npm run dev:full` can fail to start the Worker even though Vite + tunnel come up fine, leaving `https://local.blawby.com` loading the UI but every `/api/*` call returning HTTP 500 with an empty body (auto memory [claude]: "local dev stack — /api/* 500 with empty body usually means worker is down, not a code bug"). The failure surfaces with this exact wrangler output during startup:

```
✘ [ERROR] A request to the Cloudflare API (/accounts/<id>/workers/subdomain/edge-preview) failed.
✘ [ERROR] Failed to start the remote proxy session.
npm run dev:worker exited with code 1
```

The wrangler debug log (`~/.config/.wrangler/logs/wrangler-*.log`) confirms it's an auth failure, not a network or config error:

```
notes: [{ text: 'Authentication error [code: 10000]' }]
code: 10000
```

This is misleading because `worker/.dev.vars` already contains a valid `CLOUDFLARE_API_TOKEN` — and that token, when tested directly with curl, has the right scope. The fix is unintuitive because nothing about wrangler's error message points at where it actually reads its auth from.

CLAUDE.md (added in commit `aa7ebe6d`) carries the procedural workaround. This doc is the root-cause companion that explains *why* the workaround is necessary, so future contributors can diagnose similar credential-precedence issues independently.

## Guidance

Export `CLOUDFLARE_API_TOKEN` in the shell **before** invoking `npm run dev:full`. The wrangler CLI does not read `worker/.dev.vars` for its own API calls during `dev` startup — only the Worker runtime does. You must put the same token in the shell environment.

```bash
# Bash / WSL
export CLOUDFLARE_API_TOKEN=<value-from-worker/.dev.vars>
npm run dev:full
```

```powershell
# PowerShell
$env:CLOUDFLARE_API_TOKEN = "<value-from-worker/.dev.vars>"
npm run dev:full
```

After this, wrangler's startup bindings table shows `env.AI ... remote` (instead of erroring), the remote proxy session establishes, and the worker logs `Ready on http://localhost:8787`. `/api/*` requests start succeeding.

If a previous `wrangler login` left a stored OAuth token whose account doesn't have `Workers Scripts:Edit` (or equivalent edge-preview scope) on the team's Cloudflare account, wrangler will silently fall back to that OAuth token and fail. The export above forces wrangler to use the token you actually want.

## Why This Matters

Without this fix, the symptom looks like a backend code bug — `https://local.blawby.com` loads, the UI renders, and then every API call 500s with no body. Contributors waste time hunting in worker code, when the Worker process never actually started.

The mechanism:

- **wrangler CLI 4.x auth precedence:** shell `CLOUDFLARE_API_TOKEN` env var beats stored OAuth in `~/.config/.wrangler/config/default.toml` (macOS/Linux) or `%APPDATA%/xdg.config/.wrangler/config/default.toml` (Windows). `.dev.vars` is **not** consulted for the CLI's own API calls.
- **`.dev.vars` is for the Worker runtime only.** Variables in that file are injected into `env.*` for the worker code at request time — they do not affect how the wrangler CLI authenticates to Cloudflare during `dev` startup.
- **The `[ai]` binding is the only binding marked `remote` in dev mode.** Workers AI has no local emulator, so wrangler must set up a remote proxy session by calling `/accounts/<id>/workers/subdomain/edge-preview`. That's the endpoint returning 403, and that's where `code: 10000` originates.
- The stored OAuth token from `wrangler login` is tied to whichever account the contributor authenticated with personally — it may not have the scopes required for the team's account, hence the 403 even though "auth" is technically configured.

A common false lead: `wrangler dev --local` makes the auth error go away by disabling the remote AI proxy, but the bindings table then shows `env.AI ... not supported`, so any AI call fails at runtime. That's not a real fix — it defeats the point of running the worker locally for this project.

The fix is also not a system-level install, version downgrade, or wrangler reinstall (auto memory [claude]: "don't install system-level deps for environment issues"). It's just one shell export.

## When to Apply

- `npm run dev:full` exits with `Authentication error [code: 10000]` or `Failed to start the remote proxy session` during the worker startup phase.
- The frontend at `https://local.blawby.com` loads, but `/api/*` calls return HTTP 500 with an empty body, and `netstat` shows nothing actually listening on `localhost:8787` (or it binds but never logs `Ready on http://localhost:8787`).
- You've confirmed the token in `worker/.dev.vars` is active (e.g. via `/user/tokens/verify`) but wrangler still 403s.
- A contributor has previously run `wrangler login` with a personal Cloudflare account and is now working against a team account whose scope their OAuth token doesn't cover.

Do **not** apply this if the worker starts fine and `/api/*` is still failing — that's a real code-path bug, not this environment issue.

## Examples

### Preventive diagnostic — verify your token has the right scope before starting

Hit the exact endpoint wrangler will hit during `dev:full` startup:

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/<account-id>/workers/subdomain/edge-preview" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | head -c 200
```

A correct response looks like:

```json
{ "result": { "exchange_url": "...", "token": "..." }, "success": true }
```

A 403 means the token is missing scope. Generate a fresh token at https://dash.cloudflare.com/profile/api-tokens using the "Edit Cloudflare Workers" template (or a custom token with `Workers Scripts:Edit`).

### Confirming the token isn't simply expired

Before assuming permissions, rule out expiry:

```bash
curl -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  https://api.cloudflare.com/client/v4/user/tokens/verify
```

A response with `"status": "active"` proves the token is live — at which point the 403 from `edge-preview` is a scope issue, not an expiry issue.

### The actual fix invocation

```bash
# Bash / WSL
export CLOUDFLARE_API_TOKEN=<value-from-worker/.dev.vars>
npm run dev:full
```

```powershell
# PowerShell
$env:CLOUDFLARE_API_TOKEN = "<value-from-worker/.dev.vars>"
npm run dev:full
```

Expected post-fix verification:

- wrangler startup output includes the bindings table with `env.AI ... remote` and logs `Ready on http://localhost:8787`.
- `curl https://local.blawby.com/api/widget/bootstrap?slug=<practice>` returns the bootstrap JSON instead of an empty-body 500.
- The widget loads, conversations work, AI calls fire.

## Related

- [CLAUDE.md](../../../CLAUDE.md) section "Wrangler auth — if `dev:full` fails to start the worker" — the procedural workaround (added in commit `aa7ebe6d`). This doc is the root-cause companion.
- Auto memory [claude] — **Local dev stack**: `local.blawby.com` needs `npm run dev:full` (vite + worker:8787 + tunnel); `/api/*` 500 with empty body usually means worker is down, not a code bug.
- Auto memory [claude] — **No system installs**: contributors hitting this should resist the urge to reinstall wrangler, downgrade Node, or `winget`/`choco`/`docker` anything. The fix is a shell env export.
- `worker/.dev.vars` — the source of truth for the token value to export. The file the CLI doesn't read but the runtime does.
- `worker/wrangler.toml` — declares the `[ai]` binding that triggers the `edge-preview` remote-proxy session.
- `vite.config.ts` — `workerEndpoints` controls which `/api/*` prefixes Vite proxies to the worker; unrelated to this auth issue but the same neighborhood for "why is /api/* broken locally" investigations.
