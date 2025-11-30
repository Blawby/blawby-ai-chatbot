import type { KVNamespace, R2Bucket, D1Database } from '@cloudflare/workers-types';

// Environment interface with proper Cloudflare Workers types
export interface Env {
  DB: D1Database;
  CHAT_SESSIONS: KVNamespace;
  RESEND_API_KEY: string;
  FILES_BUCKET?: R2Bucket;
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
  
  // Remote Auth Server Configuration
  AUTH_SERVER_URL?: string; // URL of remote Better Auth server (e.g., https://staging-api.blawby.com)
  
  // Remote API Configuration
  REMOTE_API_URL?: string; // URL of remote API server (e.g., https://staging-api.blawby.com)
  
  REQUIRE_EMAIL_VERIFICATION?: string | boolean;
  
  BLAWBY_API_URL?: string;
  BLAWBY_API_TOKEN?: string;
  BLAWBY_ORGANIZATION_ULID?: string;
  IDEMPOTENCY_SALT?: string;
  PAYMENT_IDEMPOTENCY_SECRET?: string;
  LAWYER_SEARCH_API_KEY?: string;
  
  // Environment flags
  NODE_ENV?: string;
  DEBUG?: string;
  ENV_TEST?: string;
  IS_PRODUCTION?: string;
  
  // Domain configuration
  DOMAIN?: string;
  DEFAULT_PLATFORM_SLUG?: string;
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
  errorCode?: string; // Add errorCode property
  details?: unknown;
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

export type OrganizationKind = 'personal' | 'business';

export type SubscriptionLifecycleStatus =
  | 'none'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused';

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
  kind: OrganizationKind;
  subscriptionStatus: SubscriptionLifecycleStatus;
  createdAt: number;
  updatedAt: number;
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
// Re-export OrganizationConfig from OrganizationService for convenience
export type { OrganizationConfig } from './services/OrganizationService.js';

export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  storageKey?: string;
}

// Alias for backward compatibility
export type DocumentIconAttachment = FileAttachment;



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
 * Analysis result from document processing
 * Currently only supports raw extraction (extraction_only: true)
 * AI analysis has been removed - this interface is kept for backward compatibility
 */
export interface AnalysisResult {
  summary: string;
  key_facts: string[]; // Empty array for extraction-only results
  entities: {
    people: string[];
    orgs: string[];
    dates: string[];
  }; // Empty object for extraction-only results
  action_items: string[]; // Empty array for extraction-only results
  confidence: number; // 1.0 for successful extraction, 0 for failures
  error?: string;
  // Raw Adobe extraction data (optional)
  adobeExtract?: {
    text?: string;
    tables?: unknown[];
    elements?: unknown[];
  };
  // Flag to distinguish raw extraction from AI analysis
  extraction_only?: boolean;
  // State indicator: 'extracted' for successful raw extraction, 'failed' for extraction failures, 'unsupported' for unsupported file types
  // Note: 'analyzed' was removed as AI analysis is no longer supported
  extraction_state?: 'extracted' | 'failed' | 'unsupported';
}

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
    })
  | (ChatMessage & UIMessageExtras & {
      role: 'assistant'; // Explicitly constrain role to 'assistant' for assistant messages
      isUser: false;
    })
  | (ChatMessage & UIMessageExtras & {
      role: 'system'; // Explicitly constrain role to 'system' for system messages
      isUser: false;
      // System messages can have UI extras but typically don't use most of them
    });
