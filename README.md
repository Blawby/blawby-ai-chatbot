# Legal Intake Chatbot - Cloudflare Workers AI

A production-ready legal intake chatbot built with Cloudflare Workers AI, featuring intelligent conversation handling, step-by-step information collection, and automated matter creation with payment integration.

## 🚀 **Quick Start**

### Prerequisites
- Node.js 18+ and npm
- Cloudflare account with Workers, D1, KV, and R2 access
- Wrangler CLI installed globally

### Installation

1. **Clone and install**
   ```bash
   git clone <repository-url>
   cd preact-chat-gpt-interface
   npm install
   ```

2. **Set up environment**
   ```bash
   cp dev.vars.example .dev.vars
   # Edit .dev.vars with your API keys
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
   # Option 1: Start both frontend and worker
   npm run dev:full
   
   # Option 2: Start worker only
   wrangler dev --port 8787
   
   # Option 3: Start frontend only
   npm run dev
   ```

5. **Deploy to Cloudflare**
   ```bash
   wrangler deploy
   ```

## 🎯 **Key Features**

- **🤖 AI-Powered Legal Intake**: Intelligent conversation handling with Cloudflare Workers AI
- **🌍 Global Language Support**: 18 languages covering 5+ billion speakers — ~90%+ of global internet users — with full RTL support for Arabic
- **📋 Lead Qualification**: Smart filtering to ensure quality leads before contact collection
- **⚖️ Matter Classification**: Automatic legal issue categorization (Employment, Family, Personal Injury, etc.)
- **💰 Payment Integration**: Automated consultation fee collection with organization configuration
- **👨‍💼 Human Review Queue**: Lawyer oversight for urgent/complex matters
- **📱 Mobile-First Design**: Responsive interface with modern UI/UX
- **📎 File Upload Support**: Photos, videos, audio, documents (25MB max) with camera capture
- **🔐 Authentication**: Google OAuth and email/password with Better Auth
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
- **Auth**: Better Auth with Google OAuth & Email/Password
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
Copy `.dev.vars.example` to `.dev.vars` and add your API keys:
- `BLAWBY_API_TOKEN` - Blawby services API key
- `LAWYER_SEARCH_API_KEY` - Lawyer search API key
- `CLOUDFLARE_API_TOKEN` - Cloudflare operations API key
- `RESEND_API_KEY` - Email notifications API key

**Note:** Wrangler automatically loads `.dev.vars` during local development - no additional setup required.

#### Frontend Environment Variables
Create a `.env` file in the project root for frontend environment variables:

- `VITE_AUTH_SERVER_URL` - **Required in production** - URL of your Better Auth server
  - Example: `https://auth.yourdomain.com` or `http://localhost:8787` for local development
  - In development, this is optional and will fall back to a default ngrok URL for testing
  - In production, the application will fail to start if this is not set

**Note:** Frontend environment variables (prefixed with `VITE_`) are different from Worker secrets. They are bundled into the frontend code at build time and should be set in your deployment environment (e.g., Cloudflare Pages environment variables).

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
Organizations are managed via REST API:
```bash
# List organizations
curl -X GET http://localhost:8787/api/organizations

# Create organization (requires admin token)
curl -X POST http://localhost:8787/api/organizations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"slug": "new-organization", "name": "New Organization", "config": {"aiModel": "@cf/openai/gpt-oss-20b"}}'
```

### Authentication & User Management
User authentication and organization membership is handled by Better Auth:
- Users sign up/sign in through the `/auth` page
- Organization membership and roles are managed through Better Auth
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
- Ensure `.dev.vars` exists and contains your API keys
- Wrangler automatically loads `.dev.vars` - no custom scripts needed

**Database connection issues:**
```bash
# Reset local database
npm run db:reset
```

**Worker not starting:**
```bash
# Check wrangler installation
wrangler --version

# Start with verbose logging
wrangler dev --port 8787 --log-level debug
```

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

*Last updated: $(date)*
