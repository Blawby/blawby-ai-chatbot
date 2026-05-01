import type { KVNamespace, R2Bucket, D1Database, Queue, DurableObjectNamespace } from '@cloudflare/workers-types';

export type NotificationCategory = 'message' | 'payment' | 'intake' | 'matter' | 'system';
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';
export type NotificationPolicyCategoryKey = 'messages' | 'system' | 'payments' | 'intakes' | 'matters';
export type InAppNotificationFrequency = 'all' | 'summaries_only';
export type MinorAmount = number & { readonly __brand: 'MinorAmount' };

export interface NotificationPolicyChannel {
  push: boolean;
  email: boolean;
}

export interface NotificationPolicy {
  defaults: Record<NotificationPolicyCategoryKey, NotificationPolicyChannel>;
  allowed: Record<NotificationPolicyCategoryKey, NotificationPolicyChannel>;
}

export const DEFAULT_ALLOWED_POLICY: Record<NotificationPolicyCategoryKey, NotificationPolicyChannel> = {
  messages: { push: true, email: true },
  system: { push: true, email: true },
  payments: { push: true, email: true },
  intakes: { push: true, email: true },
  matters: { push: true, email: true }
};

export const DEFAULT_NOTIFICATION_POLICY: NotificationPolicy = {
  defaults: {
    messages: { ...DEFAULT_ALLOWED_POLICY.messages },
    system: { ...DEFAULT_ALLOWED_POLICY.system },
    payments: { ...DEFAULT_ALLOWED_POLICY.payments },
    intakes: { ...DEFAULT_ALLOWED_POLICY.intakes },
    matters: { ...DEFAULT_ALLOWED_POLICY.matters }
  },
  allowed: {
    messages: { ...DEFAULT_ALLOWED_POLICY.messages },
    system: { ...DEFAULT_ALLOWED_POLICY.system },
    payments: { ...DEFAULT_ALLOWED_POLICY.payments },
    intakes: { ...DEFAULT_ALLOWED_POLICY.intakes },
    matters: { ...DEFAULT_ALLOWED_POLICY.matters }
  }
};

export const normalizePolicyChannel = (
  raw: unknown,
  fallback: NotificationPolicyChannel
): NotificationPolicyChannel => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fallback;
  }
  const record = raw as Record<string, unknown>;
  return {
    push: typeof record.push === 'boolean' ? record.push : fallback.push,
    email: typeof record.email === 'boolean' ? record.email : fallback.email
  };
};

export const normalizeNotificationPolicy = (raw: unknown): NotificationPolicy => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_NOTIFICATION_POLICY;
  }
  const record = raw as Record<string, unknown>;
  const defaultsRaw = record.defaults as Record<string, unknown> | undefined;
  const allowedRaw = record.allowed as Record<string, unknown> | undefined;

  const defaults: NotificationPolicy['defaults'] = {
    messages: normalizePolicyChannel(defaultsRaw?.messages, DEFAULT_NOTIFICATION_POLICY.defaults.messages),
    system: DEFAULT_NOTIFICATION_POLICY.defaults.system,
    payments: normalizePolicyChannel(defaultsRaw?.payments, DEFAULT_NOTIFICATION_POLICY.defaults.payments),
    intakes: normalizePolicyChannel(defaultsRaw?.intakes, DEFAULT_NOTIFICATION_POLICY.defaults.intakes),
    matters: normalizePolicyChannel(defaultsRaw?.matters, DEFAULT_NOTIFICATION_POLICY.defaults.matters)
  };

  const allowed: NotificationPolicy['allowed'] = {
    messages: normalizePolicyChannel(allowedRaw?.messages, DEFAULT_NOTIFICATION_POLICY.allowed.messages),
    system: DEFAULT_NOTIFICATION_POLICY.allowed.system,
    payments: normalizePolicyChannel(allowedRaw?.payments, DEFAULT_NOTIFICATION_POLICY.allowed.payments),
    intakes: normalizePolicyChannel(allowedRaw?.intakes, DEFAULT_NOTIFICATION_POLICY.allowed.intakes),
    matters: normalizePolicyChannel(allowedRaw?.matters, DEFAULT_NOTIFICATION_POLICY.allowed.matters)
  };

  // System notifications are always enabled and cannot be disabled by users.
  // This ensures critical system messages are always delivered.
  defaults.system = { push: true, email: true };
  allowed.system = { push: true, email: true };

  return { defaults, allowed };
};

export interface NotificationRecipientSnapshot {
  userId: string;
  email?: string | null;
  preferences?: {
    pushEnabled?: boolean;
    emailEnabled?: boolean;
    desktopPushEnabled?: boolean;
    mentionsOnly?: boolean;
    inAppEnabled?: boolean;
    inAppFrequency?: InAppNotificationFrequency;
  };
}

export interface NotificationQueueMessage {
  eventId: string;
  dedupeKey?: string | null;
  dedupeWindow?: 'permanent' | '24h';
  practiceId?: string | null;
  conversationId?: string | null;
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
  CHAT_ROOM: DurableObjectNamespace;
  MATTER_PROGRESS: DurableObjectNamespace;
  CHAT_COUNTER: DurableObjectNamespace;
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
  ALLOW_DEBUG?: string;

  // ENV VAR: BACKEND_API_URL (worker/.dev.vars or wrangler.toml)
  // Points to Better Auth backend for session validation (e.g., http://localhost:3000 or https://staging-api.blawby.com)
  BACKEND_API_URL?: string;

  REQUIRE_EMAIL_VERIFICATION?: string | boolean;
  ENABLE_EMAIL_NOTIFICATIONS?: string | boolean;
  ENABLE_PUSH_NOTIFICATIONS?: string | boolean;

  IDEMPOTENCY_SALT?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_PUBLIC_URL?: string;
  CF_AIG_TOKEN?: string;
  CF_AIG_GATEWAY_NAME?: string;
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  DOMAIN?: string;
  BETTER_AUTH_URL?: string;
  WIDGET_AUTH_TOKEN_SECRET?: string;

  // Environment flags
  NODE_ENV?: string;
  DEBUG?: string;
  ENV_TEST?: string;
  IS_PRODUCTION?: string;

  DEFAULT_PLATFORM_SLUG?: string;
  ALLOWED_WS_ORIGINS?: string;

  // OneSignal configuration
  ONESIGNAL_APP_ID?: string;
  ONESIGNAL_REST_API_KEY?: string;
  ONESIGNAL_API_BASE?: string;

  // Geoapify configuration for address autocomplete
  GEOAPIFY_API_KEY?: string;
  GEOAPIFY_DAILY_LIMIT?: string;
  GEOAPIFY_RPM_PER_IP?: string;
  GEOAPIFY_MIN_CHARS?: string;
  DEBUG_GEO?: string;

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

// Common response envelope — discriminated union so consumers narrow on `success`.
export type ApiResponse<T = unknown> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string; errorCode?: string; details?: unknown; message?: string };

// Conversation wire types — canonical declarations live in
// worker/types/wire/conversation.ts. Re-exported here so legacy imports
// (`from '../types'` etc.) keep resolving to the same shapes; we also
// `import type` so this file can extend ChatMessage in ChatMessageUI.
import type {
  ChatMessage,
  ChatSession,
  MessageReaction,
  BackendConversation,
} from './types/wire/conversation';
export type { ChatMessage, ChatSession, MessageReaction, BackendConversation };

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

// Practice/workspace wire types — canonical declarations live in
// worker/types/wire/practice.ts. Re-exported here so legacy imports
// keep working (`import type { Practice } from '../types'` etc.).
export type {
  Practice,
  Workspace,
  PracticeOrWorkspace,
  ConversationConfig,
  PracticeConfig,
  SubscriptionLifecycleStatus,
} from './types/wire/practice';

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
  // Sender ID for alignment and avatar selection in the UI.
  userId?: string | null;
  files?: FileAttachment[];
  reactions?: MessageReaction[];

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
  paymentRequest?: {
    intakeUuid?: string;
    clientSecret?: string;
    paymentLinkUrl?: string;
    amount?: MinorAmount;
    currency?: string;
    practiceName?: string;
    practiceLogo?: string;
    practiceSlug?: string;
    practiceId?: string;
    conversationId?: string;
    returnTo?: string;
  };
  /** @deprecated Prefer deriving loading from aiState. */
  isLoading?: boolean;
  /** Custom message to show during tool calls */
  toolMessage?: string;
  assistantRetry?: {
    label?: string;
    status?: 'error' | 'retrying';
    onRetry?: () => void;
  };
}

// UI-specific ChatMessage interface that extends the base ChatMessage.
// isUser reflects the current session user, not the message role alone.
export interface ChatMessageUI extends ChatMessage, UIMessageExtras {
  isUser: boolean;
  seq?: number;
}
