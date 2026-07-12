# Production topology and configuration ownership

This inventory is the source-of-truth checklist for the production configuration gate. It names systems and configuration fields, never secret values. `npm run validate:production-config` verifies the repository-owned entries against `worker/wrangler.toml`, `public/_headers`, and `public/_redirects`. The manual production launch also verifies Cloudflare Worker **secret names** and the three Pages build URLs without printing their values. Its ordered procedure and release record are documented in `docs/operations/production-launch.md`.

## Runtime topology

| Dependency | Production identity / contract | Owner and validation boundary |
| --- | --- | --- |
| Cloudflare Pages | Project `blawby-ai-chatbot-frontend`; public origin `https://ai.blawby.com` | Frontend repository and explicit deploy workflow. Build URLs are validated before build. |
| Cloudflare Worker | Worker `blawby-ai-chatbot`; route `ai.blawby.com/api/*` | Frontend repository. Wrangler config, dry-run, and live bindings are validated before deploy. |
| Backend API | `https://api.blawby.com` on Railway | Backend repository and human-owned backend deployment. Frontend validates the URL shape; it does not deploy or roll back the backend. |
| PostgreSQL | Railway-managed backend database | Backend repository / Railway. Schema migration and recovery are human-owned backend gates. |
| D1 | Binding `DB`, database `blawby-ai-chatbot` | Worker. Durable conversations, messages, approvals, assistant actions, intake diagnostics, report schedules, saved search pins, and report-delivery metadata currently live here. |
| KV | Binding `CHAT_SESSIONS` | Worker. Rebuildable TTL caches, subscriptions, and counters only; never a durable business-record store. |
| Durable Objects | `CHAT_ROOM`, `CHAT_COUNTER`, `MATTER_PROGRESS`, `PRESENCE_ROOM` | Worker. Realtime coordination, atomic rate limits, and presence. |
| R2 | Binding `FILES_BUCKET`, bucket `blawby-ai-files` | Worker. Uploaded file objects are durable and require 30-day bucket-lock retention plus the #723 rehearsal. |
| Notification queue | `NOTIFICATION_EVENTS` / `notification-events` plus DLQ | Worker. In-app/push notification processing. |
| Search queue | `SEARCH_INDEX_EVENTS` / `search-index-events` plus DLQ | Worker. Search indexing; Vectorize binding is `SEARCH_VECTORS`. |
| Intake event queue | `INTAKE_CONVERSATION_EVENTS` / `intake-conversation-events` plus DLQ | Worker producer/consumer. Consumer authenticates backend delivery with the named Worker secret `WORKER_EVENT_SECRET`. |
| Workers AI | Binding `AI`; AI Gateway token is a named Worker secret | Worker. AI requests fail if the gateway credential is absent. |
| Stripe | Hosted invoice/payment URLs and webhook reconciliation are backend-owned | Backend repository / Stripe. Frontend consumes persisted backend state and never verifies webhook signatures itself. |
| OAuth / MCP | Canonical backend `/mcp` and OAuth endpoints | Backend repository. Frontend only initiates/handles the browser connection flow. |
| Email | Delivery credentials and provider webhooks are backend-owned; Worker notification preferences/events are Worker-owned | Backend + Worker. Provider credentials remain secrets and are never emitted by the validator. |
| Push | OneSignal app ID and API key are named Worker secrets | Worker / OneSignal. Browser service-worker scripts are allowed by the Pages CSP. |
| Adobe extraction | Adobe credential names plus IMS/PDF HTTPS endpoints | Worker / Adobe. Enabled production extraction requires all named credentials. |
| Geo autocomplete | `GEOAPIFY_API_KEY` named Worker secret | Worker / Geoapify. |
| Version identity | `CF_VERSION_METADATA` binding; deployment tag is the exact Git commit | Worker deploy workflow. `/api/health` returns environment, commit tag, and Cloudflare Worker version ID. |

## Browser security and routing

- Pages API redirects preserve same-origin `/api/*` requests for the Worker; the SPA fallback remains last.
- Production CORS/WebSocket origins are the HTTPS Blawby production origins in `ALLOWED_WS_ORIGINS`. Staging, developer tunnel, loopback, and localhost origins are rejected by the production validator.
- Better Auth owns session cookie creation. The Worker proxy only normalizes cookie domain to the request host; production requests therefore remain on the Blawby origin.
- OAuth redirect registration is backend-owned. Frontend callback URLs are derived from the validated production app origin rather than a committed redirect secret.
- Pages CSP targets are declared in `public/_headers`. The default policy is same-origin, blocks plugins, restricts frames/forms, and explicitly names Google Fonts, OneSignal, Stripe, and the production API/Worker connections. `/public/*?v=widget` deliberately overrides only `frame-ancestors` so a practice widget can be embedded.

## Named production Worker secrets

The deploy gate checks that these names exist in Cloudflare without reading or printing their values:

- Adobe: `ADOBE_CLIENT_ID`, `ADOBE_CLIENT_SECRET`, `ADOBE_ORGANIZATION_ID`, `ADOBE_TECHNICAL_ACCOUNT_EMAIL`, `ADOBE_TECHNICAL_ACCOUNT_ID`
- AI: `CF_AIG_TOKEN`
- Geo: `GEOAPIFY_API_KEY`
- Signing/authentication: `IDEMPOTENCY_SALT`, `WIDGET_AUTH_TOKEN_SECRET`, `WORKER_EVENT_SECRET`
- Push: `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`

GitHub deployment credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) are separately presence-checked by the workflow. Backend, Stripe, OAuth, database, and email secret inventories stay in their owning backend/platform systems and are not copied into this repository.

Production monitoring, thresholds, signal ownership, and incident actions are defined in [Launch monitoring and incident response](./incident-response.md).
