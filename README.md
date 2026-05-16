# Blawby AI Chatbot

AI-powered legal intake and practice management interface built on Cloudflare Workers, Preact, and Better Auth.

## Quick Start

### Prerequisites

- Node.js 18+
- A Cloudflare account (Workers, D1, KV, R2)

### Installation

```bash
git clone <repository-url>
cd blawby-ai-chatbot
npm install
```

### Development

**Option A — staging backend (recommended for most contributors, no local backend needed):**

```bash
npm run dev:full
```

Open `https://local.blawby.com`. Auth and all API calls go to the staging backend automatically.

**Option B — local backend (for full-stack work):**

Requires the [blawby-backend](https://github.com/blawby/blawby-backend) repo checked out as a sibling directory. See [CLAUDE.md](CLAUDE.md) for the full setup.

```bash
# Terminal 1 — backend API
cd ../blawby-backend && pnpm run dev

# Terminal 2 — event worker (required for new-user onboarding)
cd ../blawby-backend && pnpm run event-worker:dev

# Terminal 3 — frontend + worker pointing at local backend
npm run dev:full:local
```

> See [CLAUDE.md](CLAUDE.md) for why `dev:full:local` exists and what it overrides.

### Deploy

```bash
npx wrangler deploy --config worker/wrangler.toml
```

## Features

- **AI legal intake** — conversational intake with step-by-step lead qualification
- **Practice management** — matters, invoices, client conversations, trust accounting
- **Multi-language** — 18 languages, full RTL support for Arabic
- **File attachments** — photos, video, audio, documents (25 MB max)
- **Auth** — Better Auth via remote backend, same-origin cookie proxying through the Worker

## Architecture

```
Browser → Cloudflare Tunnel → Vite (5137)
                                └→ /api/* → Wrangler Worker (8787)
                                              └→ remote backend (staging or local)
                                              └→ local D1/KV/R2 (chat, AI, files)
```

- **`src/`** — Preact frontend (features/, shared/, pages/)
- **`worker/`** — Cloudflare Worker (routes/, services/, durable-objects/)
- **`tests/`** — E2E (Playwright), integration (Miniflare), unit (Vitest)

## Testing

```bash
npm run test:e2e       # Full user workflows via Playwright
npm run test:worker    # Worker integration tests via Miniflare
npm run test:unit      # Pure logic, no Cloudflare bindings
npm run test           # All non-E2E tests
```

See [docs/engineering/testing-guide.md](docs/engineering/testing-guide.md) for the full testing strategy.

## Troubleshooting

**Port 8787 in use:**
```bash
npm run dev:worker:clean
```

**Worker not starting / Cloudflare auth error:**
```bash
npx wrangler login
```

**New signups hit staging instead of local backend:**  
Use `npm run dev:full:local`, not `npm run dev:full`. The `[env.dev.vars]` section in `worker/wrangler.toml` hardcodes the staging URL and `.dev.vars` alone cannot override it.

**New user onboarding always shows "Save failed":**  
The event worker is not running. Start it in the backend repo:
```bash
cd ../blawby-backend && pnpm run event-worker:dev
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CLAUDE.md](CLAUDE.md).

## License

MIT — see [LICENSE](LICENSE).
