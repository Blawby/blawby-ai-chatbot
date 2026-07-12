# Explicit production launch

Production no longer deploys from a push. `.github/workflows/deploy.yml` deploys only `staging`; `.github/workflows/launch-production.yml` is the sole production launch path and must be started manually from `main`.

## Required launch evidence

The operator supplies four explicit confirmations before any production component deploys:

- `confirmation`: exactly `DEPLOY`.
- `backend_git_commit`: the exact reviewed backend commit already deployed.
- `backend_deployment_id`: the backend platform deployment identifier.
- `migrations_ready`: confirmation that required backend and Worker migrations are applied.

The preflight then runs typecheck, lint, the unit suite, production configuration validation, strict Worker dry-run, production build and bundle budget, and a bounded backend health check. The `production` GitHub environment remains the human approval boundary for production credentials and deployment.

## Ordered cutover

Only one `launch-production` run can execute at a time, and queued runs are not allowed to cancel an active cutover.

1. Deploy the Worker with the exact frontend commit as its Cloudflare tag.
2. Read the native Wrangler Worker version ID and target from structured output.
3. Poll `/api/health` with bounded attempts/timeouts until the commit and Worker version ID match.
4. Deploy the already-validated Pages artifact with `main` and the exact commit attached.
5. Read the native Pages deployment ID and URL from structured output.
6. Poll both the immutable Pages deployment URL and `https://ai.blawby.com` with bounded attempts/timeouts.
7. Run the production-origin smoke with dedicated launch-test owner/client secrets.

Before either Cloudflare deployment changes, the workflow records the current healthy Worker's exact Git commit and Worker version ID plus the canonical Pages deployment ID and URL. A failed Worker deploy, Pages deploy, propagation check, or production smoke restores both recorded deployments and verifies the restored Worker and Pages origins with bounded retries.

## Bounded production smoke

The smoke configuration accepts credentials only from the `production` GitHub environment. It does not load developer env files or the ignored E2E credential fixture. Required secrets are:

- `PRODUCTION_SMOKE_PRACTICE_ID` and `PRODUCTION_SMOKE_PRACTICE_SLUG`;
- `PRODUCTION_SMOKE_OWNER_EMAIL` and `PRODUCTION_SMOKE_OWNER_PASSWORD`;
- `PRODUCTION_SMOKE_CLIENT_EMAIL` and `PRODUCTION_SMOKE_CLIENT_PASSWORD`.

Those identities belong only to the clearly marked launch-test Practice. Setup reuses the configured client linkage or creates the single marked client record when missing. The smoke checks root assets, safe health metadata, sign-in/session/sign-out and cross-origin auth rejection, active-Practice isolation, critical owner/client/widget proxy reads, desktop/mobile shell basics, browser errors, mixed-content and non-production calls. Billing checks are GET-only. The run creates or reuses at most one active `[LAUNCH SMOKE]` conversation, sends one harmless Practice Assistant query, and archives that conversation even when an assertion fails.

The smoke contains no matter/invoice mutation, communication send, webhook acceptance, or charge path.

## Staging rollback rehearsal

Run `Deploy staging` manually with `rehearse_rollback` enabled. The workflow captures the current staging Worker and canonical Pages identities, deploys the selected staging commit, restores and verifies both previous deployments, records the measured rollback duration in `staging-rollback-rehearsal.json`, and then redeploys and verifies the selected commit so staging is not left on the old release. The artifact is retained for 90 days.

## Release record

Successful launches upload `release-evidence.json` for 90 days and append it to the workflow summary. It contains only:

- environment and timestamp;
- exact frontend/Worker Git commit;
- Cloudflare Worker version ID and target;
- Cloudflare Pages deployment ID and URL;
- exact backend Git commit and platform deployment ID;
- migration-readiness confirmation.

It never includes runtime configuration or secret values.

After launch, the scheduled native checks and component runbooks in [Launch monitoring and incident response](./incident-response.md) own bounded detection, notification, and recovery evidence.
