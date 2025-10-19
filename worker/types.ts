import type { Ai, KVNamespace, R2Bucket, D1Database, Queue } from '@cloudflare/workers-types';

// Environment interface with proper Cloudflare Workers types
export interface Env {
  AI: Ai;
  DB: D1Database;
  CHAT_SESSIONS: KVNamespace;
  USAGE_QUOTAS: KVNamespace;
  RESEND_API_KEY: string;
  FILES_BUCKET?: R2Bucket;
  DOC_EVENTS: Queue;
  PARALEGAL_TASKS: Queue;
  PAYMENT_API_KEY?: string;
  PAYMENT_API_URL?: string;
  ADOBE_CLIENT_ID?: string;
  ADOBE_CLIENT_SECRET?: string;
  ADOBE_TECHNICAL_ACCOUNT_ID?: string;
  ADOBE_TECHNICAL_ACCOUNT_EMAIL?: string;
  ADOBE_ORGANIZATION_ID?: string;
  ADOBE_IMS_BASE_URL?: string;
  ADOBE_PDF_SERVICES_BASE_URL?: string;
  ADOBE_SCOPE?: string;
  ENABLE_ADOBE_EXTRACT?: string | boolean;
  ADOBE_EXTRACTOR_SERVICE?: import('./services/AdobeDocumentService.js').IAdobeExtractor; // Optional mock extractor for testing
  
  // Better Auth Configuration
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ENABLE_AUTH_GEOLOCATION?: string;
  ENABLE_AUTH_IP_DETECTION?: string;
  REQUIRE_EMAIL_VERIFICATION?: string | boolean;
  
  // Stripe Configuration
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_CONNECT_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  STRIPE_ANNUAL_PRICE_ID?: string;
  ENABLE_STRIPE_SUBSCRIPTIONS?: string | boolean;
  
  // Cloudflare AI Configuration
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_PUBLIC_URL?: string;

  BLAWBY_API_URL?: string;
  BLAWBY_API_TOKEN?: string;
  BLAWBY_ORGANIZATION_ULID?: string;
  IDEMPOTENCY_SALT?: string;
  PAYMENT_IDEMPOTENCY_SECRET?: string;
  LAWYER_SEARCH_API_KEY?: string;
  // AI provider defaults / feature flags
  AI_PROVIDER_DEFAULT?: string;
  AI_MODEL_DEFAULT?: string;
  AI_MODEL_FALLBACK?: string[];  // Align with Organization.config.aiModelFallback type
  ENABLE_WORKERS_AI?: boolean;   // Use boolean for feature flags
  ENABLE_GATEWAY_OPENAI?: boolean;
  
  // AI processing limits (configurable)
  AI_MAX_TEXT_LENGTH?: string;
  AI_MAX_TABLES?: string;
  AI_MAX_ELEMENTS?: string;
  AI_MAX_STRUCTURED_PAYLOAD_LENGTH?: string;
  
  // Environment flags
  NODE_ENV?: string;
  DEBUG?: string;
  ENV_TEST?: string;
  IS_PRODUCTION?: string;
  
  // Domain configuration
  DOMAIN?: string;
  
  // SSE Configuration
  SSE_POLL_INTERVAL?: string;
  
}

// HTTP Error class for centralized error handling
export class HttpError extends Error {
  constructor(
    public status: number,
    public message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

// Common response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Chat message types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ChatSession {
  id: string;
  organizationId: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

// Matter types
export interface Matter {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  status: 'draft' | 'active' | 'closed';
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

// Organization types (Better Auth compatible)
export interface Organization {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  metadata?: Record<string, unknown>;
  config: {
    aiProvider?: string;
    aiModel: string;
    aiModelFallback?: string[];
    consultationFee: number;
    requiresPayment: boolean;
    ownerEmail?: string;
    availableServices: string[];
    serviceQuestions: Record<string, string[]>;
    domain: string;
    description: string;
    paymentLink?: string;
    brandColor: string;
    accentColor: string;
    introMessage: string;
    profileImage?: string;
    voice: {
      enabled: boolean;
      provider: 'cloudflare' | 'elevenlabs' | 'custom';
      voiceId?: string | null;
      displayName?: string | null;
      previewUrl?: string | null;
    };
  };
  stripeCustomerId?: string | null;
  subscriptionTier?: 'free' | 'plus' | 'business' | 'enterprise' | null;
  seats?: number | null;
  isPersonal: boolean;
  createdAt: number;
  updatedAt: number;
}

// Stripe subscription cache type following Theo's KV-first pattern
export interface StripeSubscriptionCache {
  subscriptionId: string;
  // Maps to Organization.stripeCustomerId for cross-reference
  stripeCustomerId?: string | null;
  status: 'active' | 'trialing' | 'canceled' | 'past_due' | 'incomplete' | 'incomplete_expired' | 'unpaid';
  priceId: string;
  // Optional to match Organization interface - defaults to 1 if not specified
  seats?: number | null;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  limits: {
    aiQueries: number;
    documentAnalysis: boolean;
    customBranding: boolean;
  };
  // Cache metadata for KV invalidation
  cachedAt: number;
  expiresAt?: number;
}

// Form types
export interface ContactForm {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  phone?: string;
  message: string;
  service?: string;
  createdAt: number;
}


export interface Appointment {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  phone?: string;
  date: string;
  time: string;
  service: string;
  notes?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: number;
}

// File upload types
export interface FileUpload {
  id: string;
  organizationId: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
  uploadedAt: number;
  metadata?: Record<string, unknown>;
}

// Feedback types
export interface Feedback {
  id: string;
  organizationId: string;
  sessionId: string;
  rating: number;
  comment?: string;
  createdAt: number;
}



// Request validation types
export interface ValidatedRequest<T = unknown> {
  data: T;
  env: Env;
}

// Organization context types
export interface OrganizationContext {
  organizationId: string;
  source: 'auth' | 'session' | 'url' | 'default';
  sessionId?: string;
  isAuthenticated: boolean;
  userId?: string;
}

export interface RequestWithOrganizationContext extends Request {
  organizationContext?: OrganizationContext;
}

// UI-specific types that extend base types
export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  storageKey?: string;
}



export interface MatterCreationData {
  type: 'service-selection';
  availableServices: string[];
}

export interface WelcomeMessageData {
  showButtons: boolean;
}

export interface MatterCanvasData {
  matterId?: string;
  matterNumber?: string;
  service: string;
  matterSummary: string;
  qualityScore?: {
    score: number;
    badge: 'Excellent' | 'Good' | 'Fair' | 'Poor';
    color: 'blue' | 'green' | 'yellow' | 'red';
    inferredUrgency: string;
    breakdown: {
      followUpCompletion: number;
      requiredFields: number;
      evidence: number;
      clarity: number;
      urgency: number;
      consistency: number;
      aiConfidence: number;
    };
    suggestions: string[];
  };
  answers?: Record<string, string>;
}

export interface PaymentEmbedData {
  paymentUrl: string;
  amount?: number;
  description?: string;
  paymentId?: string;
}

/**
 * Represents the current state of AI processing for a chat message.
 * Use this to determine loading states and provide appropriate UI feedback.
 */
export type AiState = 'thinking' | 'processing' | 'generating';

/**
 * Centralized constant for AI loading states.
 * Use this for UI logic to determine when AI is actively processing.
 */
export const AI_LOADING_STATES: readonly AiState[] = ['thinking', 'processing', 'generating'] as const;

// Shared UI fields that can be attached to chat messages
export interface UIMessageExtras {
  files?: FileAttachment[];

  matterCreation?: MatterCreationData;
  welcomeMessage?: WelcomeMessageData;
  matterCanvas?: MatterCanvasData;
  documentChecklist?: {
    matterType: string;
    documents: Array<{
      id: string;
      name: string;
      description?: string;
      required: boolean;
      status: 'missing' | 'uploaded' | 'pending';
    }>;
  };
  paymentEmbed?: PaymentEmbedData;
  generatedPDF?: {
    filename: string;
    size: number;
    generatedAt: string;
    matterType: string;
    storageKey?: string;
  };
  contactForm?: {
    fields: string[];
    required: string[];
    message?: string;
    initialValues?: {
      name?: string;
      email?: string;
      phone?: string;
      location?: string;
      opposingParty?: string;
    };
  };
  /** @deprecated Prefer deriving loading from aiState. */
  isLoading?: boolean;
  /** Custom message to show during tool calls */
  toolMessage?: string;
}

// UI-specific ChatMessage interface that extends the base ChatMessage
export type ChatMessageUI = 
  | (ChatMessage & UIMessageExtras & {
      role: 'user'; // Explicitly constrain role to 'user' for user messages
      isUser: true;
      aiState?: never; // User messages cannot have aiState
    })
  | (ChatMessage & UIMessageExtras & {
      role: 'assistant'; // Explicitly constrain role to 'assistant' for assistant messages
      isUser: false;
      aiState?: AiState; // Assistant messages can have aiState
    })
  | (ChatMessage & UIMessageExtras & {
      role: 'system'; // Explicitly constrain role to 'system' for system messages
      isUser: false;
      aiState?: AiState; // System messages can have aiState
      // System messages can have UI extras but typically don't use most of them
    });

// Agent message interface that extends ChatMessage with isUser property
export interface AgentMessage {
  readonly id?: string;
  readonly role?: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly isUser?: boolean;
  readonly timestamp?: number;
  readonly metadata?: Record<string, unknown>;
}

// Agent response interface
export interface AgentResponse {
  readonly response: string;
  readonly metadata: {
    readonly conversationComplete?: boolean;
    readonly inputMessageCount: number;
    readonly lastUserMessage: string | null;
    readonly sessionId?: string;
    readonly organizationId?: string;
    readonly error?: string;
    readonly toolName?: string;
    readonly toolResult?: unknown;
    readonly allowRetry?: boolean;
    readonly rawParameters?: unknown;
  };
}
