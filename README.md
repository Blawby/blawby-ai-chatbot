Here’s a cleaned-up version of your README with redundancy removed, sections reorganized slightly for clarity, and improved brevity while preserving all critical details:

---

# 🤖 Preact Cloudflare Intake Chatbot

A full-featured, open-source **ChatGPT-like legal assistant**, built with Preact and powered by Cloudflare Workers AI, D1, and KV. Designed for self-hosting, extensibility, and privacy-first deployments.

**Live Demo:** [ai.blawby.com](https://ai.blawby.com)  
**Repo:** [GitHub](https://github.com/Blawby/preact-cloudflare-intake-chatbot)

---

## ✨ Features

* **Lightweight Preact Chat UI** - Fast, responsive interface with ~40KB gzipped bundle
* **Cloudflare Workers AI Backend** - Llama 3.1 8B for conversational AI
* **Intelligent Matter Building** - Guided conversation flow for legal intake
* **AI-Powered Quality Assessment** - Comprehensive content analysis and scoring
* **Team-Based Configuration** - Multi-tenant support with custom branding
* **Practice Area-Specific Questions** - Tailored intake forms per legal service
* **D1 Database** - Persistent storage for conversations and matter data
* **KV Namespace** - Session management and caching
* **API-First Design** - RESTful endpoints for easy integration
* **Self-Hostable** - Complete ownership of your data and infrastructure
* **Privacy-First** - GDPR-compliant with no external tracking
* **Enhanced Security** - OWASP-compliant headers and request validation
* **Production Ready** - Comprehensive error handling and monitoring

---

## 🎯 Core Workflow

Your chatbot follows a **structured intake process** that maximizes lead quality:

1. **🤖 AI Conversation** - Natural language interaction to understand client needs
2. **📋 Matter Building** - Guided service selection and practice area-specific questions
3. **📝 Matter Details** - Comprehensive matter description and situation analysis
4. **✅ AI Quality Assessment** - Real-time content analysis and completeness scoring
5. **📞 Contact Collection** - Seamless transition to attorney connection
6. **💳 Payment Processing** - Optional consultation fee collection
7. **📅 Scheduling** - Automated appointment booking system

---

## 🏗️ Architecture

* **Frontend**: Preact SPA (`src/`) — Embeddable widget with media & scheduling
* **Backend**: Cloudflare Worker (`worker/`) — AI, D1, KV, email integration
* **Storage**: D1 Database (conversations, teams, matters), KV (sessions, cache)
* **AI**: Cloudflare Workers AI with Llama 3.1 8B model
* **Email**: Resend API for notifications and confirmations
* **Security**: OWASP-compliant headers, request validation, structured logging
* **Optional**: R2 for file uploads (planned)

---

## 🚀 Getting Started

### 1. Prerequisites

* Node.js v18+
* Cloudflare account with Workers AI access
* Wrangler CLI: `npm install -g wrangler`

### 2. Clone & Install

```bash
git clone https://github.com/Blawby/preact-cloudflare-intake-chatbot.git
cd preact-cloudflare-intake-chatbot
npm install
```

### 3. Configure Cloudflare

```bash
cp wrangler.template.toml wrangler.toml
wrangler d1 create your-ai-chatbot
wrangler kv namespace create "YOUR_AI_CHAT_SESSIONS"
wrangler kv namespace create "YOUR_AI_CHAT_SESSIONS" --preview
wrangler d1 execute your-ai-chatbot --file worker/schema.sql
```

### 4. Environment Variables

```bash
cp env.example .env
```

Set these variables:
* `CLOUDFLARE_API_TOKEN` - For deployments
* `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID
* `RESEND_API_KEY` - For email notifications
* `VITE_API_BASE_URL` - Frontend API endpoint

### 5. Development

---

## 🛡️ Security & Best Practices

### Enhanced Security Headers
The application now includes comprehensive security headers following OWASP guidelines:

- **X-Content-Type-Options**: `nosniff` - Prevents MIME type sniffing
- **X-Frame-Options**: `DENY` - Prevents clickjacking attacks
- **X-XSS-Protection**: `1; mode=block` - XSS protection
- **Referrer-Policy**: `strict-origin-when-cross-origin` - Controls referrer information
- **Permissions-Policy**: `camera=(), microphone=(), geolocation=()` - Restricts permissions
- **Strict-Transport-Security**: `max-age=31536000; includeSubDomains` - Enforces HTTPS

### Request Validation
- **Size Limits**: 10MB maximum request size
- **Content Type Validation**: Ensures proper JSON for POST requests
- **Input Sanitization**: Comprehensive validation with Zod schemas

### Error Handling & Monitoring
- **Structured Logging**: JSON-formatted error logs with context
- **Error Categorization**: Proper HTTP status codes and error codes
- **Rate Limiting**: Built-in protection against abuse
- **Security Monitoring**: Comprehensive audit trails

---

Enable remote bindings for local development:

```toml
# In wrangler.toml
[[d1_databases]]
binding = "DB"
experimental_remote = true

[[kv_namespaces]]
binding = "CHAT_SESSIONS"
experimental_remote = true
```

Start both backend and frontend:

```bash
# Terminal 1: Backend
wrangler dev --x-remote-bindings

# Terminal 2: Frontend
npm run dev
```

* Frontend: [http://localhost:5173](http://localhost:5173)
* Backend API: [http://localhost:8787](http://localhost:8787)

---

## 🧠 Team Configuration

Configure your law firm teams via `teams.json`:

- The `sync-teams.js` script now performs a **true sync**:
  - All teams in `teams.json` are upserted (inserted or updated) into the D1 database.
  - Any team in the database not present in `teams.json` is deleted, along with all related records in dependent tables (cascading deletes).
  - This ensures your D1 database always matches your `teams.json` source of truth.

- **Remote vs Local DB:**
  - Use `node sync-teams.js --remote` to sync the remote D1 database (used by your deployed worker).
  - Use `node sync-teams.js` (no flag) to sync your local D1 database (used by local dev).
  - To verify which teams are present in D1, run:
    - `wrangler d1 execute blawby-ai-chatbot --remote --command "SELECT id, slug, name FROM teams;"` (remote)
    - `wrangler d1 execute blawby-ai-chatbot --local --command "SELECT id, slug, name FROM teams;"` (local)

- After syncing, both local and remote environments will have the correct teams and IDs for all lookups and webhooks.

```json
{
  "id": "family-law-firm",
  "name": "Smith & Associates Family Law",
  "config": {
    "consultationFee": 150,
    "requiresPayment": true,
    "paymentLink": "https://buy.stripe.com/your-payment-link",
    "ownerEmail": "admin@smithlaw.com",
    "introMessage": "Hello! I'm here to help with your family law matter.",
    "profileImage": "https://example.com/logo.png",
    "availableServices": ["Family Law", "Divorce", "Child Custody", "Adoption"],
    "serviceQuestions": {
      "Family Law": [
        "What specific family law issue are you dealing with?",
        "Are there any children involved in this situation?",
        "Have you already filed any legal documents?",
        "What is your current relationship status?"
      ],
      "Divorce": [
        "How long have you been married?",
        "Do you have children together?",
        "Have you discussed divorce with your spouse?",
        "What are the main issues you need to resolve?"
      ]
    }
  }
}
```

### Key Configuration Options

| Field | Type | Description |
|-------|------|-------------|
| `availableServices` | array | Practice areas for service selection |
| `serviceQuestions` | object | Practice area-specific intake questions |
| `requiresPayment` | boolean | Enable consultation fee collection |
| `consultationFee` | number | Fee amount in USD |
| `paymentLink` | string | Stripe or other payment processor URL |
| `ownerEmail` | string | Admin email for new lead notifications |
| `introMessage` | string | Custom welcome message |
| `profileImage` | string | Team logo URL |

Sync teams to database:

```bash
node sync-teams.js
```

---

## 🤖 Matter Creation Flow

The system provides an **intelligent matter building process** that guides users through structured data collection with AI-powered quality assessment:

### Step-by-Step Process

1. **Service Selection** → User chooses practice area
2. **Practice Area Questions** → Tailored questions for the selected service
3. **Matter Details** → Comprehensive situation description
4. **AI Quality Assessment** → Real-time content analysis and scoring
5. **Contact Collection** → Seamless transition to attorney connection

### AI Quality Assessment

The system includes **comprehensive content analysis** that evaluates matter quality across multiple dimensions:

#### Quality Metrics

- **Answer Quality** (25%) - Meaningfulness and responsiveness of answers
- **Answer Length** (20%) - Adequacy of detail provided
- **Service Specificity** (15%) - Specificity of legal service area
- **Urgency Indication** (10%) - Presence of urgency indicators
- **Evidence Mentioned** (10%) - Documentation and evidence references
- **Timeline Provided** (10%) - Temporal context and dates
- **Answer Completeness** (10%) - Number of questions answered

#### Quality Scoring

```json
{
  "qualityScore": {
    "score": 76,
    "readyForLawyer": true,
    "breakdown": {
      "answerQuality": 100,
      "answerLength": 32,
      "serviceSpecificity": 100,
      "urgencyIndication": 0,
      "evidenceMentioned": 100,
      "timelineProvided": 100
    },
    "issues": [],
    "suggestions": [],
    "confidence": "medium"
  }
}
```

#### Quality Thresholds

- **Ready for Lawyer**: Score ≥ 70 AND Answer Quality ≥ 60%
- **Needs Improvement**: Score < 70 OR Answer Quality < 60%
- **High Confidence**: Score ≥ 80 AND ≥ 3 meaningful answers
- **Medium Confidence**: Score ≥ 60 AND ≥ 2 meaningful answers
- **Low Confidence**: Score < 60 OR < 2 meaningful answers

#### Smart Feedback

The system provides **intelligent follow-up messages** based on quality assessment:

- **Poor Quality**: "I noticed some of your answers were quite brief. To help you get the best legal assistance, could you provide more details?"
- **Good Quality**: "Great! Your matter summary looks comprehensive. You've provided strong information to connect you with the right attorney."
- **Excellent Quality**: "Excellent! Your matter summary is comprehensive and well-detailed. You've provided everything we need."

### API Endpoints

#### Matter Creation Flow
```bash
POST /api/matter-creation
```

**Service Selection:**
```json
{
  "teamId": "family-law-firm",
  "step": "service-selection"
}
```

**Practice Area Questions:**
```json
{
  "teamId": "family-law-firm",
  "step": "questions",
  "service": "Family Law",
  "currentQuestionIndex": 0,
  "answers": {
    "What specific family law issue are you dealing with?": "Child custody dispute"
  }
}
```

**Matter Details:**
```json
{
  "teamId": "family-law-firm",
  "step": "matter-details",
  "service": "Family Law",
  "description": "I need help with a custody modification...",
  "answers": {...}
}
```

---

## 📊 API Reference

### Chat Endpoint
```bash
POST /api/chat
```

**Request:**
```json
{
  "messages": [
    {"role": "user", "content": "I need help with a business contract"}
  ],
  "teamId": "business-law-firm",
  "sessionId": "optional-session-id"
}
```

**Response:**
```json
{
  "response": "I can help you with contract review...",
  "intent": "new_matter",
  "shouldStartMatterCreation": true,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Forms Endpoint
```bash
POST /api/forms
```

**Request:**
```json
{
  "email": "client@example.com",
  "phoneNumber": "555-0123",
  "matterDetails": "Contract review needed for vendor agreement",
  "teamId": "business-law-firm"
}
```

### Teams Endpoint
```bash
GET /api/teams
```

Returns all configured teams with their settings.

### Scheduling Endpoint
```bash
POST /api/scheduling
```

**Request:**
```json
{
  "teamId": "family-law-firm",
  "email": "client@example.com",
  "preferredDate": "2024-01-20",
  "preferredTime": "10:00 AM",
  "matterType": "Family Law",
  "notes": "Child custody consultation"
}
```

---

## 🔗 Webhook Integration

The system includes a comprehensive webhook system for integrating with external CRMs, case management systems, and other tools. Webhooks are automatically triggered during key events in the matter creation process.

### Webhook Configuration

Add webhook settings to your team configuration in `teams.json`:

```json
{
  "id": "your-law-firm",
  "name": "Your Law Firm",
  "config": {
    "webhooks": {
      "enabled": true,
      "url": "https://your-crm.com/webhook",
      "secret": "your-webhook-secret",
      "events": {
        "matterCreation": true,
        "matterDetails": true,
        "contactForm": true,
        "appointment": true
      },
      "retryConfig": {
        "maxRetries": 3,
        "retryDelay": 60
      }
    }
  }
}
```

### Webhook Events

#### 1. Matter Creation (`matter_creation`)
Triggered when a client completes all required intake fields and the summary is shown.

```json
{
  "event": "matter_creation",
  "timestamp": "2025-01-17T23:47:26.000Z",
  "teamId": "your-law-firm",
  "sessionId": "abc123",
  "matter": {
    "service": "Family Law",
    "full_name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "555-123-4567",
    "opposing_party": "John Doe",
    "description": "I need help with a custody modification...",
    "summary": "# Legal Intake Summary – Family Law\n\n## Contact Details\n- **Full Name**: Jane Doe\n- **Email**: jane@example.com\n- **Phone**: 555-123-4567\n- **Opposing Party**: John Doe\n\n## Description of Legal Matter\nI need help with a custody modification...",
    "answers": {
      "full_name": { "answer": "Jane Doe" },
      "email": { "answer": "jane@example.com" },
      "phone": { "answer": "555-123-4567" },
      "opposing_party": { "answer": "John Doe" },
      "matter_details": { "answer": "I need help with a custody modification..." }
    },
    "step": "service-selected",
    "totalQuestions": 5,
    "hasQuestions": true
  }
}
```

#### 2. Matter Details (`matter_details`)
Triggered when the user confirms and submits the intake (or after final review).

```json
{
  "event": "matter_details",
  "timestamp": "2025-01-17T23:47:26.000Z",
  "teamId": "your-law-firm",
  "sessionId": "abc123",
  "matter": {
    "service": "Family Law",
    "full_name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "555-123-4567",
    "opposing_party": "John Doe",
    "description": "I need help with a custody modification...",
    "summary": "# Legal Intake Summary – Family Law\n\n## Contact Details\n- **Full Name**: Jane Doe\n- **Email**: jane@example.com\n- **Phone**: 555-123-4567\n- **Opposing Party**: John Doe\n\n## Description of Legal Matter\nI need help with a custody modification...",
    "answers": {
      "full_name": { "answer": "Jane Doe" },
      "email": { "answer": "jane@example.com" },
      "phone": { "answer": "555-123-4567" },
      "opposing_party": { "answer": "John Doe" },
      "matter_details": { "answer": "I need help with a custody modification..." }
    },
    "step": "intake-complete",
    "totalQuestions": 5,
    "hasQuestions": true
  }
}
```

---

### Follow-Up Message

After the summary is shown, the API always returns a follow-up message:

> "I've sent your info to our team, we will be in contact with you shortly. Would you like to add any more details to your request?"

This ensures the user is prompted to provide any additional information after the main intake is complete.

#### 3. Contact Form (`contact_form`)
Triggered when clients submit contact information.

```json
{
  "event": "contact_form",
  "timestamp": "2025-01-17T23:47:26.000Z",
  "teamId": "your-law-firm",
  "formId": "form-uuid",
  "contactForm": {
    "email": "client@example.com",
    "phoneNumber": "555-0123",
    "matterDetails": "Need help with custody modification",
    "urgency": "normal",
    "status": "pending"
  }
}
```

#### 4. Appointment (`appointment`)
Triggered when consultations are scheduled.

```json
{
  "event": "appointment",
  "timestamp": "2025-01-17T23:47:26.000Z",
  "teamId": "your-law-firm",
  "appointmentId": "appointment-uuid",
  "appointment": {
    "clientEmail": "client@example.com",
    "clientPhone": "555-0123",
    "preferredDate": "2025-01-20",
    "preferredTime": "10:00 AM",
    "matterType": "Family Law",
    "notes": "Child custody consultation",
    "status": "pending"
  }
}
```

### Webhook Security

All webhooks include security headers:

- **X-Webhook-Signature**: HMAC-SHA256 signature in Stripe-like format (`t=timestamp,v1=signature`)
- **X-Webhook-ID**: Unique identifier for the webhook delivery
- **X-Webhook-Event**: Event type (matter_creation, matter_details, etc.)
- **X-Webhook-Timestamp**: ISO timestamp of webhook delivery

### Webhook Management API

#### View Webhook Logs
```bash
GET /api/webhooks/logs?teamId=your-law-firm&limit=50&status=failed
```

#### Webhook Statistics
```bash
GET /api/webhooks/stats?teamId=your-law-firm
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "pending": 2,
    "success": 45,
    "failed": 3,
    "retry": 1,
    "total": 51
  }
}
```

#### Retry Failed Webhooks
```bash
POST /api/webhooks/retry
```

**Request:**
```json
{
  "webhookId": "specific-webhook-id"
}
```

Or retry all failed webhooks for a team:
```json
{
  "teamId": "your-law-firm"
}
```

#### Test Webhook Delivery
```bash
POST /api/webhooks/test
```

**Request:**
```json
{
  "teamId": "your-law-firm",
  "webhookType": "matter_creation",
  "testPayload": {
    "custom": "test data"
  }
}
```

### Webhook Features

- **🔐 Security**: HMAC-SHA256 signature verification
- **🔄 Retry Logic**: Exponential backoff with configurable retries
- **📊 Logging**: Comprehensive delivery tracking in database
- **📈 Statistics**: Real-time delivery metrics
- **🎯 Event Filtering**: Configure which events to receive
- **⚡ Performance**: Fire-and-forget delivery (non-blocking)
- **🛠️ Management**: API endpoints for monitoring and retry

### Webhook Verification

To verify webhook authenticity in your endpoint (Stripe-like format):

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  // Parse signature header (format: "t=timestamp,v1=signature")
  const signatureParts = signature.split(',');
  const timestamp = signatureParts[0].split('=')[1];
  const receivedSignature = signatureParts[1].split('=')[1];
  
  // Create signed payload (timestamp.payload)
  const signedPayload = `${timestamp}.${payload}`;
  
  // Generate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  
  return receivedSignature === expectedSignature;
}

// Express.js example
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body);
  
  if (!verifyWebhook(payload, signature, 'your-webhook-secret')) {
    return res.status(401).send('Unauthorized');
  }
  
  // Process webhook...
  res.status(200).send('OK');
});
```

---

## 🌐 Deployment

### GitHub Actions (Recommended)

Set repository secrets:
* `CLOUDFLARE_API_TOKEN`
* `CLOUDFLARE_ACCOUNT_ID`
* `CLOUDFLARE_PAGES_PROJECT_NAME`

### Manual Deployment

**Backend:**
```bash
wrangler deploy
```

**Frontend:**
```bash
npm run build
wrangler pages deploy dist
```

### Custom Domain

Add to `wrangler.toml`:
```toml
[env.production]
routes = [
  { pattern = "yourdomain.com/api/*", zone_name = "yourdomain.com" }
]
```

---

## 🔧 Production Status

| Component | Status |
|-----------|---------|
| **Backend** | ✅ Production Ready |
| **AI Integration** | ✅ Llama 3.1 8B |
| **Matter Creation** | ✅ Fully Functional |
| **AI Quality Assessment** | ✅ Comprehensive Content Analysis |
| **Team Configuration** | ✅ Multi-tenant |
| **Email Notifications** | ✅ Resend Integration |
| **Scheduling** | ✅ Appointment Booking |
| **Webhook Integration** | ✅ Comprehensive System |
| **Security Headers** | ✅ OWASP Compliant |
| **Error Handling** | ✅ Structured Logging |
| **Request Validation** | ✅ Size & Content Type Checks |
| **File Uploads** | ⏳ Planned (R2 integration) |
| **Payment Processing** | ⏳ External links only |

---

## 📈 Suggested Improvements

Based on code analysis, here are recommended enhancements:

### 🎯 High Priority

1. **File Upload Integration**
   - R2 bucket configuration for document storage
   - Drag-and-drop file upload in chat interface
   - Document preview and management

2. **Advanced Payment Processing**
   - Stripe integration for direct payment collection
   - Payment verification before attorney connection
   - Automated payment status tracking

### 🔧 Medium Priority

3. **Session Management**
   - Persistent conversation history
   - Resume interrupted matter creation flows
   - Better session timeout handling

4. **Email Template System**
   - Customizable email templates per team
   - Rich HTML email formatting
   - Automated follow-up sequences

5. **Analytics Dashboard**
   - Matter completion rates
   - Lead quality metrics
   - Team performance insights

### 🌟 Long-term Enhancements

6. **Enhanced CRM Integration**
   - ✅ Custom API webhooks (implemented)
   - Zapier webhook endpoints
   - Salesforce/HubSpot connectors

7. **Advanced AI Features**
   - Document analysis with AI
   - Legal research integration
   - Automated matter categorization

8. **Mobile Optimization**
   - Progressive Web App (PWA)
   - Native mobile app integration
   - Push notifications

---

## 🧪 Testing

This project uses [Vitest](https://vitest.dev/) and [@testing-library/preact](https://testing-library.com/docs/preact-testing-library/intro/) for all unit and integration tests.

### Test Organization
- **Unit tests**: Located in `src/__tests__/` for components and utilities
- **Integration tests**: Located in `tests/integration/` for API and flow tests
- All tests use modern mocking and do not require any shell scripts

### Running Tests

To run all tests:

```sh
npm test
```

To run tests in watch mode:

```sh
npm run test:watch
```

To run the interactive UI:

```sh
npm run test:ui
```

To run a specific test file:

```sh
npm run test:run -- path/to/file.test.ts
```

To view coverage:

```sh
npm run test:coverage
```

### Notes
- All legacy shell script tests have been removed in favor of this unified, maintainable test suite.
- See the `vitest.config.ts` for configuration details.

---

## 📚 Resources

* [Cloudflare Workers AI Docs](https://developers.cloudflare.com/workers-ai/)
* [Preact Documentation](https://preactjs.com/)
* [D1 Database Guide](https://developers.cloudflare.com/d1/)
* [KV Storage Guide](https://developers.cloudflare.com/kv/)
* [Architecture Plan](./intake_form_chatbot_plan.md)

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

## 🛡️ License

MIT License - see [LICENSE](./LICENSE) for details.

---

## 🧑‍💻 Maintainers

* [@Blawby](https://github.com/Blawby)
* [@paulchrisluke](https://github.com/paulchrisluke)

---

*Built with ❤️ using Cloudflare's edge computing platform*
