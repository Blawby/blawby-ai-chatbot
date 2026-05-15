# Legal Intake Chatbot - Cloudflare Workers AI

A legal intake chatbot built with Cloudflare Workers AI, featuring intelligent conversation handling, step-by-step information collection, and automated matter creation with payment integration.

## 🚀 **Quick Start**

### Prerequisites
- Node.js 18+ and npm
- Cloudflare account with Workers, D1, KV, and R2 access

### Installation

1. **Clone and install**
   ```bash
   git clone <repository-url>
   cd preact-chat-gpt-interface
   npm install
   ```

2. **Set up environment**
   ```bash
   cp dev.vars.example worker/.dev.vars
   # Edit worker/.dev.vars with your API keys
   # Note: .dev.vars must be in worker/ directory (same as wrangler.toml)
   ```

3. **Set up local database**
   ```bash
   # Reset database with consolidated schema (recommended for development)
   npm run db:reset
   
   # OR apply schema only (if database is empty)
   npm run db:init
   ```

4. **Start development**
   ```bash
   # Option 1: Start both frontend and worker (recommended)
   npm run dev:full
   # Browser verification URL: local.blawby.com
   # Auth/signup flows must use this host so requests go through the Worker proxy.
   
   # Option 2: Start worker only
   npm run dev:worker
   # OR manually:
   # npx wrangler dev --port 8787 --config worker/wrangler.toml
   
   # Option 3: Start frontend only
   npm run dev
   ```

5. **Deploy to Cloudflare**
   ```bash
   npx wrangler deploy --config worker/wrangler.toml
   ```
   This deploys the Cloudflare Worker only (Pages is configured separately).

## 🎯 **Key Features**

- **🤖 AI-Powered Legal Intake**: Intelligent conversation handling with Cloudflare Workers AI
- **🌍 Global Language Support**: 18 languages covering 5+ billion speakers — ~90%+ of global internet users — with full RTL support for Arabic
- **📋 Lead Qualification**: Smart filtering to ensure quality leads before contact collection
- **⚖️ Matter Classification**: Automatic legal issue categorization (Employment, Family, Personal Injury, etc.)
- **💰 Payment Integration**: Automated consultation fee collection with organization configuration
- **👨‍💼 Human Review Queue**: Lawyer oversight for urgent/complex matters
- **📱 Mobile-First Design**: Responsive interface with modern UI/UX
- **📎 File Upload Support**: Photos, videos, audio, documents (25MB max) with camera capture
- **🔐 Authentication**: Handled by remote Better Auth server at staging-api.blawby.com
- **🔒 Production Security**: OWASP-compliant headers and validation

## 🏗️ **Architecture**

```
Frontend (Preact) → Cloudflare Workers → AI Agent → Tool Handlers → Actions
```

**Core Components:**
- **Legal Intake Agent**: Self-contained AI with built-in memory and tool execution
- **Tool Handlers**: Modular functions for contact collection, matter creation, lawyer review
- **organization Configuration**: Dynamic payment and service configuration per organization
- **Review Queue**: Human-in-the-loop system for lawyer oversight

## 🛠️ **Technology Stack**

- **Frontend**: Preact, TypeScript, Tailwind CSS
- **Backend**: Cloudflare Workers, D1 Database, KV Storage, R2 Object Storage
- **AI**: Cloudflare Workers AI (GPT-OSS 20B)
- **Auth**: Remote Better Auth server (staging-api.blawby.com)
- **Deployment**: Cloudflare Workers

## 🧪 **Testing**

```bash
# Start development servers (required for tests)
npm run dev:full

# Run tests
npm run test:conversation  # Core AI functionality tests
npm test                   # All unit/integration tests
npm run test:watch         # Watch mode
npm run test:i18n          # Smoke test to confirm translations switch correctly
npm run lint:i18n          # Validate locale files stay in sync
```

## 📁 **Project Structure**

```
├── src/                    # Frontend (Preact + TypeScript)
│   ├── components/        # UI components
│   ├── hooks/            # Custom React hooks
│   └── utils/            # Utility functions
├── worker/               # Backend (Cloudflare Workers)
│   ├── agents/          # AI agent definitions
│   ├── routes/          # API endpoints
│   ├── services/        # Business logic
│   └── utils/           # Worker utilities
├── tests/               # Test files
└── public/              # Static assets
```

## 🔧 **Configuration**

### Environment Variables

#### Worker Secrets (`.dev.vars`)
Copy `dev.vars.example` to `worker/.dev.vars` and add your API keys:
- `LAWYER_SEARCH_API_KEY` - Lawyer search API key
- `CLOUDFLARE_API_TOKEN` - Cloudflare operations API key
- `ONESIGNAL_APP_ID` - OneSignal app id
- `ONESIGNAL_REST_API_KEY` - OneSignal REST API key

**Note:** Wrangler reads `.dev.vars` from the same directory as `wrangler.toml`. Since `wrangler.toml` is in the `worker/` directory, create `worker/.dev.vars` directly.

#### Frontend Environment Variables

**For Local Development:**
Create a `.env` file in the project root for frontend environment variables:

- `VITE_BACKEND_API_URL` - URL of your remote backend API server (auth/practice/etc.)
  - Example: `http://localhost:3000` for local development
  - Optional in development - will fall back to staging API for testing if not set
- `VITE_WORKER_API_URL` - Base URL for the Cloudflare Worker API (no `/api` suffix)
  - Example: `http://localhost:8787` for local development
  - Optional: defaults to localhost in dev and same-origin in prod
  - Browser auth/signup verification should still run via `npm run dev:full` and `local.blawby.com` so requests proxy through the Worker like the deployed app.
- `VITE_ONESIGNAL_APP_ID` - OneSignal app id for the web SDK (required if using push notifications)

**For Production (Cloudflare Pages):**
Set frontend environment variables in Cloudflare Pages:

1. Go to your Cloudflare Pages project dashboard
2. Navigate to **Settings > Environment Variables**
3. Add required variables:
   - `VITE_BACKEND_API_URL` - Your production remote API URL (e.g., `https://production-api.blawby.com`)
   - `VITE_WORKER_API_URL` - Your worker base URL (e.g., `https://ai.blawby.com`, no `/api` suffix)
   - `VITE_ONESIGNAL_APP_ID` - Your OneSignal app ID (if using push notifications)

**Important:** 
- Frontend environment variables (prefixed with `VITE_`) are bundled into the frontend code at build time
- Cloudflare Pages automatically injects environment variables during the build process
- The application will fail at runtime (when auth is used) if `VITE_BACKEND_API_URL` is not set in production
- These variables should NOT be set in `worker/.dev.vars` (that's for Worker secrets only)

### Internationalization

The application supports **18 languages** covering 5+ billion speakers — ~90%+ of global internet users:

**Supported Languages:**
- 🌍 **Americas**: English, Spanish, Portuguese, French
- 🇪🇺 **Europe**: English, Spanish, French, German, Russian, Italian, Dutch, Polish, Ukrainian
- 🌏 **Asia**: Chinese, Japanese, Vietnamese, Korean, Thai, Indonesian, Hindi
- 🇸🇦 **Middle East/Africa**: Arabic (with full RTL support), French, English

**Features:**
- ✅ Seamless language switching via Settings → General
- ✅ Automatic language detection based on user location
- ✅ Complete Right-to-Left (RTL) support for Arabic
- ✅ 5 namespaces: common, settings, auth, profile, pricing
- ✅ 50+ country-to-language mappings
- ✅ Lazy-loaded translations for optimal performance

**Development:**
- Locale files: `src/locales/<locale>/<namespace>.json`
- Configuration: `src/i18n/index.ts`
- Full guide: `docs/internationalization.md`
- Run `npm run lint:i18n` to validate translation consistency
- Run `npm run test:i18n` for internationalization smoke tests

### Organization Management
Organization management (CRUD, invitations, subscriptions) is handled by the remote API at `staging-api.blawby.com`:
- Frontend calls remote API endpoints for organization operations
- Local worker only handles workspace endpoints (`/api/organizations/:id/workspace/*`) for chatbot data
- Organization metadata (config, subscription status) is fetched from remote API when needed

### Authentication & User Management
User authentication is handled by a remote Better Auth server at `staging-api.blawby.com`:
- Frontend uses Better Auth React client (`better-auth/react`) to connect to remote auth server
- Session cookies are stored by the browser and sent with authenticated requests
- Worker validates sessions by calling the remote auth server API with the cookie
- Organization membership and roles are managed through the remote Better Auth server
- Access the application with `?organizationId=<org-slug>` parameter

## 🔒 **Security**

- OWASP-compliant security headers
- File upload validation (25MB max)
- Rate limiting (60 requests/minute)
- Input sanitization
- Secure session management with Better Auth

## 🔧 **Troubleshooting**

### Common Issues

**Port 8787 already in use:**
```bash
# Kill existing processes on port 8787
npm run dev:worker:clean
```

**Environment variables not loading:**
- Ensure `worker/.dev.vars` exists and contains your API keys
- Wrangler reads `.dev.vars` from the same directory as `wrangler.toml` (which is `worker/`)

**Database connection issues:**
```bash
# Reset local database
npm run db:reset
```

**Worker not starting:**
```bash
# Check wrangler installation
npx wrangler --version

# Ensure you're using the correct config file
npm run dev:worker
# OR manually:
# npx wrangler dev --port 8787 --config worker/wrangler.toml

# Start with verbose logging
npx wrangler dev --port 8787 --config worker/wrangler.toml --log-level debug
```

**Worker shows "Pages project" error:**
- This happens when wrangler picks up the root `wrangler.toml` (configured for Pages)
- Always use `--config worker/wrangler.toml` or `npm run dev:worker` which includes this flag

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 **License**

MIT License - see [LICENSE](LICENSE) file for details.

---

**Built with ❤️ using Cloudflare Workers AI and Preact**

Sat Feb 21, 2026
