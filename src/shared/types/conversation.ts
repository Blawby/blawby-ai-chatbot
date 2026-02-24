// TypeScript types for user-to-user conversations and messages

/**
 * Conversation status
 */
export type ConversationStatus = 'active' | 'archived' | 'completed' | 'closed';

/**
 * Message role in conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system';

export type ConversationMode = 'ASK_QUESTION' | 'REQUEST_CONSULTATION' | 'PRACTICE_ONBOARDING';

export interface FirstMessageIntent {
  intent: ConversationMode | 'UNCLEAR';
  confidence: number;
  reason: string;
}

/**
 * Conversation participant info
 */
export interface ConversationParticipant {
  userId: string;
  name?: string;
  email?: string;
  image?: string | null;
}

/**
 * Conversation metadata stored in user_info JSON field
 */
export interface ConversationMetadata {
  title?: string;
  mode?: ConversationMode;
  first_message_intent?: FirstMessageIntent;
  system_conversation?: boolean;
  intakeConversationState?: import('./intake').IntakeConversationState;
  intakeSlimContactDraft?: import('./intake').SlimContactDraft | null;
  intakeAiBriefActive?: boolean;
  intakeUuid?: string | null;
  intakePaymentRequired?: boolean;
  intakePaymentReceived?: boolean;
  intakeSubmitted?: boolean;
  intakeCompleted?: boolean;
  intakeDecision?: string | null;
  practiceName?: string;
  practiceSlug?: string;
  [key: string]: unknown;
}

/**
 * Conversation object from API
 */
export interface Conversation {
  id: string;
  practice_id: string;
  practice?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  user_id: string | null; // Creator/owner of the conversation (nullable for anonymous users)
  matter_id: string | null; // Optional: link to specific matter
  participants: string[]; // Array of user IDs
  user_info: ConversationMetadata | null;
  status: ConversationStatus;
  // Triage fields (optional, practice workflows only)
  assigned_to?: string | null; // User ID of assigned practice member
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  tags?: string[]; // Array of tag strings
  internal_notes?: string | null; // Internal notes for practice members
  last_message_at?: string | null; // ISO timestamp of last message
  unread_count?: number | null;
  latest_seq?: number;
  first_response_at?: string | null; // ISO timestamp of first practice member response
  closed_at?: string | null; // ISO timestamp when conversation was closed
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
  lead?: {
    is_lead: boolean;
    lead_id?: string;
    matter_id?: string;
    lead_source?: string | null;
    created_at?: string | null;
  };
}

/**
 * Message object from API
 */
export interface ConversationMessage {
  id: string;
  conversation_id: string;
  practice_id: string;
  user_id: string; // Sender of the message
  role: MessageRole;
  content: string;
  reply_to_message_id?: string | null;
  metadata: Record<string, unknown> | null;
  client_id: string;
  seq: number;
  server_ts: string;
  token_count: number | null;
  created_at: string; // ISO timestamp
}

export interface MessageReactionSummary {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
}

/**
 * UI-friendly message type that extends ConversationMessage
 */
export interface ConversationMessageUI extends ConversationMessage {
  isUser: boolean; // Derived from sender user_id matching the current session user
  timestamp: number; // Converted from created_at ISO string to milliseconds
  files?: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
    url: string;
  }>;
}

/**
 * Create conversation request payload
 */
export interface CreateConversationRequest {
  matterId?: string;
  participantUserIds?: string[];
  metadata?: Record<string, unknown>;
  title?: string;
}

/**
 * Add participants request payload
 */
export interface AddParticipantsRequest {
  participantUserIds: string[];
}

/**
 * Update conversation request payload
 */
export interface UpdateConversationRequest {
  status?: ConversationStatus;
  metadata?: Record<string, unknown>;
}

/**
 * Send message request payload
 */
export interface SendMessageRequest {
  conversationId: string;
  content: string;
  attachments?: string[]; // Array of file IDs
  metadata?: Record<string, unknown>;
  reply_to_message_id?: string | null;
}

/**
 * Get messages response with pagination
 */
export interface GetMessagesResponse {
  messages: ConversationMessage[];
  hasMore?: boolean;
  cursor?: string | null;
  latest_seq?: number;
  // undefined when sequence pagination not requested; null when no more pages.
  next_from_seq?: number | null;
  warning?: string;
}

/**
 * Get messages query parameters
 */
export interface GetMessagesOptions {
  conversationId: string;
  limit?: number;
  cursor?: string;
  from_seq?: number;
}
