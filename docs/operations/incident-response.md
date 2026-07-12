# Launch monitoring and incident response

## Native signal path

No third-party monitoring vendor is required for launch. Cloudflare persists production Worker logs, GitHub Actions checks the public production origin every 15 minutes, GitHub Issues is the bounded engineering notification channel, and Railway remains the source for backend process/deployment evidence.

| Surface | Signal | What it proves |
| --- | --- | --- |
| Frontend | `Production health` requests `https://ai.blawby.com/` | The same-origin Pages shell is reachable and returns HTML. |
| Worker | `/api/health` plus Cloudflare invocation/structured logs | The Worker is reachable and reports its exact Git commit and Worker version ID. |
| Backend/database | `https://api.blawby.com/api/health` | Railway API routing and the PostgreSQL connection are healthy. |
| Auth | Anonymous `/api/auth/get-session` bootstrap | The safe session bootstrap path responds without creating a session. |
| AI | Anonymous `/api/ai/practice-assistant` rejection, release-correlated `/api/ai` errors, and launch smoke | The route/auth boundary is reachable continuously; an authenticated harmless provider query is proven during launch. |
| Billing | Anonymous `/api/subscriptions` rejection, backend health, and Railway/Stripe evidence | The billing route/auth boundary is reachable; Stripe and webhook processing remain backend-owned signals. |
| Background jobs | Structured `background_job` Worker events, Cloudflare queue/DLQ state, and Railway Graphile Worker logs | Each queue/cron invocation records started, succeeded, or failed against a release. |

The scheduled check retries each read-only probe at most three times. A single failed workflow is evidence, not an outage notification. Two consecutive failed workflows open one fixed-title GitHub issue. Further failures do not create duplicate issues or comments. The next healthy run comments once and closes that incident.

## Safe event contract

Operational Worker events contain only:

- timestamp, level, and bounded event/outcome names;
- environment, exact Git release tag, and Worker deployment ID;
- a generated correlation ID;
- a non-identifying route family such as `/api/auth` or `queue:notification-events`;
- bounded failure class, HTTP status, and duration when relevant.

Do not add request/response bodies, names, email addresses, practice/client/matter identifiers, URLs containing identifiers, tokens, raw exception messages, or stack traces. Client 4xx responses are isolated user/request errors unless broader evidence says otherwise. A repeated public check failure, a 5xx cluster across requests, or a failed background invocation is actionable.

## First five minutes

1. Open the monitor run and its `production-health.json` artifact. Do not paste response bodies into the incident.
2. Record the failing component, first observed time, and the exact release markers from `/api/health`, the last production launch artifact, Cloudflare, and Railway.
3. Decide whether the failure began with a deployment. If yes, prefer the repository's proven rollback path for the owning surface.
4. Check whether the failure is isolated (one 4xx/correlation ID) or systemic (two scheduled failures, repeated 5xx, failed queue invocation, or multiple components).
5. Keep ownership boundaries: this repository may restore Worker/Pages; Railway/backend deployment and database actions require a human backend operator.

## Runbooks

### Auth outage

Confirm `auth_bootstrap` and backend health, then compare `/api/auth` structured failures by release and correlation ID. If the failure began with Pages/Worker, restore the prior exact Cloudflare deployments through the production launch workflow. If Railway session handling is failing, preserve evidence and hand the backend deployment to a human; do not weaken cookies, CSRF, CORS, or session validation.

### Backend outage

Confirm `backend_database`, then inspect Railway API health, deploy identity, and sanitized application logs. Do not add a frontend fallback or route around the backend contract. A human restores or redeploys the backend; rerun `Production health` afterward and verify the same backend deployment identity intended by the operator.

### AI outage

Separate route/auth failure from provider failure. `ai_route` proves only the safe unauthenticated boundary; use `/api/ai` structured server errors and the launch smoke's single harmless query for provider evidence. If failures correlate with a Worker release, restore the prior Worker. If Cloudflare AI is unavailable, keep the feature fast-failing and communicate the outage—do not fabricate responses or silently switch providers.

### Stripe or webhook failure

Use Stripe's event delivery record, the backend webhook-event record, and Railway Graphile Worker logs. Determine whether the event is pending, retrying, processed, or terminally failed before acting. Never submit a valid webhook from monitoring, replay blindly, create a charge, or mutate invoices as a health check. Backend retry/code/deployment actions require human review and execution.

### Queue or scheduled-job failure

For Cloudflare jobs, filter structured events by `background_job`, route, release, and correlation ID; then inspect the matching queue and DLQ. For backend jobs, inspect the Railway event/email worker and Graphile Worker job state. Retry only idempotent jobs and only after the source fault is fixed. A caught error must still fail its invocation so the platform records it.

### Bad frontend release

Compare the canonical Pages deployment ID with the production launch artifact. Run the production workflow from the exact known-good Git commit so it captures current state, deploys, verifies the origin, and automatically restores both Cloudflare surfaces if the smoke fails. Do not use a mutable branch name as release evidence.

### Bad Worker release

Compare `/api/health` commit/version with the production launch artifact and structured errors. Use the exact known-good Git commit through the production workflow. Verify both the restored Worker version and canonical Pages ID because the public application is a same-origin pair.

### Migration failure

Stop further deploys and preserve the failed migration output. Durable Object migration tags are append-only history: never delete, reorder, or reuse a deployed tag when removing a class. Database migrations remain backend/human-owned. Restore the last known-good application deployments, repair the migration source of truth in a focused PR, and rehearse it on staging before another production attempt.

## Backend and Railway gaps

The public backend health endpoint currently proves API uptime and PostgreSQL connectivity, but it does not report Stripe reachability, webhook backlog/age, Graphile Worker heartbeat, failed-job count, or the Railway deployment identifier. Backend task logs also need one consistent sanitized release/correlation/failure contract. [Backend PR #371](https://github.com/Blawby/blawby-backend/pull/371) adds native Railway release identity and a sanitized database-health failure event; it is left for human review and merge. The remaining backend signals stay explicit gaps, and that review does not block the frontend/Worker monitoring and runbooks delivered here.
