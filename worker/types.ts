import type { KVNamespace, R2Bucket, D1Database, Queue, DurableObjectNamespace } from '@cloudflare/workers-types';

export type NotificationCategory = 'message' | 'payment' | 'intake' | 'matter' | 'system';
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export interface NotificationRecipientSnapshot {
  userId: string;
  email?: string | null;
  preferences?: {
    pushEnabled?: boolean;
    emailEnabled?: boolean;
    desktopPushEnabled?: boolean;
    mentionsOnly?: boolean;
  };
}

export interface NotificationQueueMessage {
  eventId: string;
  dedupeKey?: string | null;
  practiceId?: string | null;
  category: NotificationCategory;
  entityType?: string | null;
  entityId?: string | null;
  title: string;
  body?: string | null;
  link?: string | null;
  senderName?: string | null;
  senderAvatarUrl?: string | null;
  severity?: NotificationSeverity | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  recipients: NotificationRecipientSnapshot[];
}

// Environment interface with proper Cloudflare Workers types
export interface Env {
  DB: D1Database;
  CHAT_SESSIONS: KVNamespace;
  NOTIFICATION_EVENTS: Queue<NotificationQueueMessage>;
  NOTIFICATION_HUB: DurableObjectNamespace;
  FILES_BUCKET?: R2Bucket;
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

  // ENV VAR: REMOTE_API_URL (worker/.dev.vars or wrangler.toml)
  // Points to Better Auth backend for token validation (e.g., http://localhost:3000 or https://staging-api.blawby.com)
  REMOTE_API_URL?: string;

  REQUIRE_EMAIL_VERIFICATION?: string | boolean;

  IDEMPOTENCY_SALT?: string;
  LAWYER_SEARCH_API_KEY?: string;
  LAWYER_SEARCH_API_URL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_PUBLIC_URL?: string;
  DOMAIN?: string;
  BETTER_AUTH_URL?: string;

  // Environment flags
  NODE_ENV?: string;
  DEBUG?: string;
  ENV_TEST?: string;
  IS_PRODUCTION?: string;

  DEFAULT_PLATFORM_SLUG?: string;
  // SSE Configuration
  SSE_POLL_INTERVAL?: string;

  // OneSignal configuration
  ONESIGNAL_APP_ID?: string;
  ONESIGNAL_REST_API_KEY?: string;
  ONESIGNAL_API_BASE?: string;

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
  practiceId: string; // Practice ID (workspaces are ephemeral practices)
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

// Matter types
export interface Matter {
  id: string;
  practiceId: string; // Practice ID (workspaces are ephemeral practices)
  title: string;
  description: string;
  status: 'draft' | 'active' | 'closed';
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

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

// Conversation configuration (conversation/messaging settings, not chatbot)
export interface ConversationConfig {
  ownerEmail?: string;
  availableServices: string[];
  serviceQuestions: Record<string, string[]>;
  domain: string;
  description: string;
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
  blawbyApi?: {
    enabled: boolean;
    apiKey?: string | null;
    apiKeyHash?: string;
    apiUrl?: string;
  };
  testMode?: boolean;
  metadata?: Record<string, unknown>;
  betterAuthOrgId?: string;
  tools?: {
    [toolName: string]: {
      enabled: boolean;
      requiredRole?: 'owner' | 'admin' | 'attorney' | 'paralegal' | null;
      allowAnonymous?: boolean;
    };
  };
  agentMember?: {
    enabled: boolean;
    userId?: string;
    autoInvoke?: boolean;
    tagRequired?: boolean;
  };
  isPublic?: boolean;
}

// Practice configuration extends conversation config
// Currently identical to ConversationConfig, kept for future extensibility
// Using type alias instead of interface to avoid empty interface lint error
// If extension is needed in the future, convert to interface with additional properties
export type PracticeConfig = ConversationConfig;

// Practice type (business practice - law firm)
export interface Practice {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  metadata?: Record<string, unknown>;
  conversationConfig: ConversationConfig; // Extracted from practice.metadata.conversationConfig in remote API
  betterAuthOrgId?: string;
  stripeCustomerId?: string | null;
  subscriptionTier?: 'free' | 'plus' | 'business' | 'enterprise' | null;
  seats?: number | null;
  kind: 'practice';
  subscriptionStatus: SubscriptionLifecycleStatus;
  subscriptionPeriodEnd?: number | null;
  createdAt: number;
  updatedAt: number;
  businessOnboardingCompletedAt?: number | null;
  businessOnboardingSkipped?: boolean;
  businessOnboardingData?: Record<string, unknown> | null;
}

// Workspace type (personal/ephemeral - no storage needed)
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  metadata?: Record<string, unknown>;
  conversationConfig: ConversationConfig; // Hardcoded defaults
  betterAuthOrgId?: string;
  stripeCustomerId: null;
  subscriptionTier: 'free';
  seats: 1;
  kind: 'workspace';
  subscriptionStatus: 'none';
  subscriptionPeriodEnd: null;
  createdAt: number;
  updatedAt: number;
  businessOnboardingCompletedAt: null;
  businessOnboardingSkipped: false;
  businessOnboardingData: null;
}

// Union type for practice or workspace
export type PracticeOrWorkspace = Practice | Workspace;

// Form types
export interface ContactForm {
  id: string;
  practiceId: string;
  name: string;
  email: string;
  phone?: string;
  message: string;
  service?: string;
  createdAt: number;
}


export interface Appointment {
  id: string;
  practiceId: string;
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
  practiceId: string;
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
  practiceId: string;
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

// UI-specific types that extend base types

export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  storageKey?: string;
}

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
  paymentRequest?: {
    intakeUuid?: string;
    clientSecret?: string;
    amount?: number;
    currency?: string;
    practiceName?: string;
    practiceLogo?: string;
    practiceSlug?: string;
    returnTo?: string;
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
