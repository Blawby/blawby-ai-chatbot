# Blawby AI Chatbot - Coding Standards

## Core Principles
- **Use npm** (not pnpm/yarn)
- **No `any` types** - use proper TypeScript
- **Legal compliance first** - PII protection, attorney-client privilege
- **Error handling everywhere** - never let errors bubble up unhandled
- **Structured logging** - correlation IDs, PII sanitization
- **Iterate on existing patterns** - don't create new patterns without good reason

## Project Architecture

### Frontend (Preact)
```typescript
// Component structure
interface ComponentProps {
  // Required props first
  requiredProp: string;
  // Optional props with defaults
  optionalProp?: boolean;
  // Event handlers
  onSubmit?: (data: any) => void | Promise<void>;
  // Children last
  children?: preact.ComponentChildren;
}

// Always use FunctionComponent with explicit return type
const MyComponent: FunctionComponent<ComponentProps> = ({ requiredProp, optionalProp = false, onSubmit, children }) => {
  // State management
  const [state, setState] = useState<StateType>(initialValue);
  
  // Event handlers with proper typing
  const handleSubmit = useCallback(async (data: FormData) => {
    if (!onSubmit) return;
    try {
      await onSubmit(data);
    } catch (error) {
      console.error('Submit error:', error);
    }
  }, [onSubmit]);

  return (
    <div class="component-wrapper">
      {children}
    </div>
  );
};
```

### Backend (Cloudflare Workers)
```typescript
// Route handler pattern
export async function handleRoute(request: Request, env: Env): Promise<Response> {
  try {
    // Input validation first
    const body = await parseJsonBody(request);
    if (!isValidInput(body)) {
      throw HttpErrors.badRequest('Invalid input');
    }

    // Business logic
    const result = await processRequest(body, env);
    
    // Success response
    return createSuccessResponse(result);
  } catch (error) {
    return handleError(error);
  }
}

// Service class pattern
export class MyService {
  private env: Env;
  
  constructor(env: Env) {
    this.env = env;
  }

  async processData(data: InputType): Promise<ServiceResult> {
    try {
      // Validation
      this.validateInput(data);
      
      // Processing
      const result = await this.performOperation(data);
      
      // Logging
      Logger.info('Operation completed', { resultId: result.id });
      
      return result;
    } catch (error) {
      Logger.error('Operation failed', { error: error.message });
      throw error;
    }
  }
}
```

## Error Handling

### Frontend Error Boundaries
```typescript
// Always wrap components in ErrorBoundary
<ErrorBoundary>
  <MyComponent />
</ErrorBoundary>

// Component error handling
const handleError = (error: Error) => {
  console.error('Component error:', error);
  // Show user-friendly message
  setError('Something went wrong. Please try again.');
};
```

### Backend Error Handling
```typescript
// Use existing error types
throw HttpErrors.badRequest('Invalid input');
throw HttpErrors.notFound('Resource not found');
throw HttpErrors.internalServerError('Processing failed');

// Custom errors with context
throw new LegalIntakeError('Invalid matter type', { matterType, sessionId }, false);

// Always use handleError for responses
return handleError(error);
```

## Logging Standards

### Structured Logging
```typescript
// Use LegalIntakeLogger for business operations
LegalIntakeLogger.logBusinessOperation(
  correlationId,
  sessionId,
  organizationId,
  'matter_created',
  { matterType, matterId }
);

// Use Logger for technical operations
Logger.info('API request received', { 
  endpoint: '/api/chat',
  method: 'POST',
  correlationId 
});

// Always sanitize PII
const sanitizedData = sanitizeForLogging(userData);
Logger.info('User action', sanitizedData);
```

### Log Levels
- **ERROR**: Exceptions, failures that affect functionality
- **WARN**: Unexpected but recoverable situations
- **INFO**: Business operations, state changes
- **DEBUG**: Detailed troubleshooting (development only)

## Type Safety

### Domain Types
```typescript
// Use existing domain types
type MatterType = 'personal_injury' | 'family_law' | 'criminal_defense';
type MessageRole = 'user' | 'assistant' | 'system';
type PaymentStatus = 'pending' | 'completed' | 'failed';

// Component prop interfaces
interface MessageProps {
  content: string;
  isUser: boolean;
  files?: FileAttachment[];
  matterCanvas?: MatterCanvas;
  paymentEmbed?: PaymentEmbed;
  // ... other specific props
}
```

### Validation
```typescript
// Input validation with proper error messages
function validateContactForm(data: unknown): ContactData {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('Invalid form data');
  }
  
  const { name, email, phone } = data as any;
  
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError('Name is required');
  }
  
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError('Valid email is required');
  }
  
  return { name: name.trim(), email: email.trim(), phone: phone?.trim() };
}
```

## Security & Legal Compliance

### PII Protection
```typescript
// Always sanitize before logging
const sanitizedContent = await sanitizeForLogging(content);

// Use correlation IDs instead of user identifiers in logs
Logger.info('User action', { 
  correlationId, 
  action: 'file_upload',
  // Never log: userId, email, phone, etc.
});

// Encrypt sensitive data
const encryptedData = await encryptSensitiveData(clientInfo);
```

### Input Validation
```typescript
// Validate all inputs at boundaries
function validateFileUpload(file: File): void {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  
  if (file.size > maxSize) {
    throw new ValidationError('File too large');
  }
  
  if (!allowedTypes.includes(file.type)) {
    throw new ValidationError('Invalid file type');
  }
}
```

## File Organization

### Component Structure
```
src/components/
├── ui/                    # Reusable UI components
│   ├── Button.tsx
│   └── Modal.tsx
├── AppLayout.tsx          # Main layout
├── ChatContainer.tsx      # Chat functionality
├── Message.tsx           # Message display
└── ContactForm.tsx       # Form components
```

### Worker Structure
```
worker/
├── routes/               # API endpoints
│   ├── agent.ts
│   ├── payment.ts
│   └── analyze.ts
├── services/             # Business logic
│   ├── PaymentService.ts
│   └── LawyerSearchService.ts
├── agents/               # AI agents
│   └── legal-intake/
├── middleware/           # Cross-cutting concerns
└── utils/               # Utilities
```

## Testing Patterns

### Component Testing
```typescript
// Use existing test patterns
describe('ContactForm', () => {
  it('should validate required fields', () => {
    render(<ContactForm onSubmit={mockSubmit} />);
    
    fireEvent.click(screen.getByText('Submit'));
    
    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });
});
```

### Service Testing
```typescript
// Mock external dependencies
describe('PaymentService', () => {
  it('should create invoice successfully', async () => {
    const mockEnv = createMockEnv();
    const service = new PaymentService(mockEnv);
    
    const result = await service.createInvoice(validRequest);
    
    expect(result.success).toBe(true);
    expect(result.invoiceUrl).toBeDefined();
  });
});
```

## Common Patterns

### State Management
```typescript
// Use existing hooks
const { messages, addMessage, isLoading } = useMessageHandling();
const { showToast } = useToast();
const { isDark } = useTheme();

// Local state with proper typing
const [formData, setFormData] = useState<FormData>({
  name: '',
  email: '',
  phone: ''
});
```

### API Integration
```typescript
// Use existing service patterns
const result = await PaymentServiceFactory.processPayment(
  env,
  paymentRequest,
  organizationConfig
);

// Handle responses consistently
if (result.success) {
  showToast('Payment created successfully', 'success');
} else {
  showToast(result.error, 'error');
}
```

## Code Quality Rules

1. **Keep files under 500 lines** - split into multiple files if needed
2. **Use existing patterns** - don't reinvent the wheel
3. **Validate all inputs** - especially user-provided data
4. **Handle all errors** - never let them bubble up unhandled
5. **Log with context** - include correlation IDs and relevant metadata
6. **Protect PII** - sanitize before logging, encrypt when storing
7. **Use TypeScript strictly** - no `any` types, explicit return types
8. **Test critical paths** - especially payment and legal data handling
9. **Follow naming conventions** - camelCase for variables, PascalCase for components
10. **Document complex logic** - explain the "why", not the "what"

## Environment-Specific Rules

### Development
- Use mock services for external APIs
- Enable debug logging
- Use localhost URLs for testing

### Production
- Use real services
- Sanitize all logs
- Enable error monitoring
- Use production URLs and keys

## Critical Integration Patterns

### File Analysis Middleware Environment Binding

**CRITICAL**: When creating environment adapters for middleware, ensure ALL required bindings are included.

```typescript
// ❌ WRONG - Missing AI binding causes crashes
type FileAnalysisEnv = {
  FILES_BUCKET: Env['FILES_BUCKET'];
  DB: Env['DB'];
  // Missing AI binding!
};

// ✅ CORRECT - Include all required bindings
type FileAnalysisEnv = {
  FILES_BUCKET: Env['FILES_BUCKET'];
  DB: Env['DB'];
  AI: Env['AI'];  // Required for AI model execution
  ENABLE_ADOBE_EXTRACT: Env['ENABLE_ADOBE_EXTRACT'];
  ADOBE_CLIENT_ID: Env['ADOBE_CLIENT_ID'];
  ADOBE_CLIENT_SECRET: Env['ADOBE_CLIENT_SECRET'];
  ADOBE_TECHNICAL_ACCOUNT_ID: Env['ADOBE_TECHNICAL_ACCOUNT_ID'];
  ADOBE_TECHNICAL_ACCOUNT_EMAIL: Env['ADOBE_TECHNICAL_ACCOUNT_EMAIL'];
  ADOBE_ORGANIZATION_ID: Env['ADOBE_ORGANIZATION_ID'];
  ADOBE_IMS_BASE_URL: Env['ADOBE_IMS_BASE_URL'];
  ADOBE_PDF_SERVICES_BASE_URL: Env['ADOBE_PDF_SERVICES_BASE_URL'];
  ADOBE_SCOPE: Env['ADOBE_SCOPE'];
  CLOUDFLARE_ACCOUNT_ID: Env['CLOUDFLARE_ACCOUNT_ID'];
  CLOUDFLARE_API_TOKEN: Env['CLOUDFLARE_API_TOKEN'];
  CLOUDFLARE_PUBLIC_URL: Env['CLOUDFLARE_PUBLIC_URL'];
  AI_MODEL_DEFAULT: Env['AI_MODEL_DEFAULT'];
  AI_MAX_TEXT_LENGTH: Env['AI_MAX_TEXT_LENGTH'];
  AI_MAX_TABLES: Env['AI_MAX_TABLES'];
  AI_MAX_ELEMENTS: Env['AI_MAX_ELEMENTS'];
  AI_MAX_STRUCTURED_PAYLOAD_LENGTH: Env['AI_MAX_STRUCTURED_PAYLOAD_LENGTH'];
  DEBUG: Env['DEBUG'];
};

// ✅ CORRECT - Pass all bindings in adapter creation
const fileAnalysisEnv: FileAnalysisEnv = {
  FILES_BUCKET: env.FILES_BUCKET,
  DB: env.DB,
  AI: env.AI,  // Critical for AI operations
  ENABLE_ADOBE_EXTRACT: env.ENABLE_ADOBE_EXTRACT,
  ADOBE_CLIENT_ID: env.ADOBE_CLIENT_ID,
  ADOBE_CLIENT_SECRET: env.ADOBE_CLIENT_SECRET,
  // ... include ALL required bindings
};
```

**Common Error**: `"Cannot read properties of undefined (reading 'run')"` when `env.AI` is missing from adapter.

### Adobe PDF Analysis Setup

**Required Environment Variables**:
```typescript
// Adobe API Configuration
ENABLE_ADOBE_EXTRACT: boolean
ADOBE_CLIENT_ID: string
ADOBE_CLIENT_SECRET: string
ADOBE_TECHNICAL_ACCOUNT_ID: string
ADOBE_TECHNICAL_ACCOUNT_EMAIL: string
ADOBE_ORGANIZATION_ID: string
ADOBE_IMS_BASE_URL: string
ADOBE_PDF_SERVICES_BASE_URL: string
ADOBE_SCOPE: string

// Cloudflare AI Configuration
AI: CloudflareAI  // Binding object
AI_MODEL_DEFAULT: string
AI_MAX_TEXT_LENGTH: string
AI_MAX_TABLES: string
AI_MAX_ELEMENTS: string
AI_MAX_STRUCTURED_PAYLOAD_LENGTH: string

// Cloudflare Configuration
CLOUDFLARE_ACCOUNT_ID: string
CLOUDFLARE_API_TOKEN: string
CLOUDFLARE_PUBLIC_URL: string
```

**Wrangler Dev Mode Requirements**:
```bash
# ✅ CORRECT - AI binding available
wrangler dev --port 8787

# ❌ WRONG - AI binding NOT available in local mode
wrangler dev --local --port 8787
```

**Testing Adobe Integration**:
```bash
# Test file upload
curl -X POST http://localhost:8787/api/files/upload \
  -F "file=@document.pdf" \
  -F "organizationId=test-org" \
  -F "sessionId=test-session"

# Test streaming analysis
curl -X POST http://localhost:8787/api/agent/stream \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Analyze this document"}],
    "organizationId": "test-org",
    "sessionId": "test-session",
    "attachments": [{"id": "file-id", "name": "document.pdf", "type": "application/pdf", "size": 12345, "url": "/api/files/file-id"}]
  }'
```

**Debugging Adobe Issues**:
1. Check logs for `"Adobe extraction successful"` vs `"adobe_extraction_failed_or_ineligible"`
2. Verify all Adobe environment variables are set in `worker/.dev.vars`
3. Ensure `ENABLE_ADOBE_EXTRACT=true` is set
4. Test with real PDF files (not text files with PDF content-type)
5. Check that `env.AI` binding is available (not running in `--local` mode)

---

**Remember**: These standards are based on your existing codebase patterns. When in doubt, look at similar existing code and follow those patterns.
