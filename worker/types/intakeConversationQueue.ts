/**
 * Queue message types for intake-conversation-events queue.
 * These must match the backend's intakeConversationEventSchema discriminated union
 * in src/modules/worker-events/types/worker-events.types.ts.
 */

export interface ConversationCreatedEvent {
  type: 'conversation.created';
  id: string;
  organization_id: string;
  client_user_id: string;
  is_anonymous: boolean;
  status: 'draft' | 'active' | 'submitted' | 'closed' | 'archived';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  created_at: string;
}

export interface MessageCompletedEvent {
  type: 'message.completed';
  id: string;
  conversation_id: string;
  organization_id: string;
  user_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  seq: number;
  client_id: string;
  token_count: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ConversationStatusChangedEvent {
  type: 'conversation.status_changed';
  id: string;
  organization_id: string;
  status: 'draft' | 'active' | 'submitted' | 'closed' | 'archived';
  intake_mode_activated_at: string | null;
  ai_failed_at: string | null;
  closed_at: string | null;
  updated_at: string;
}

export interface ConversationMatterLinkedEvent {
  type: 'conversation.matter_linked';
  id: string;
  organization_id: string;
  matter_id: string | null;
  updated_at: string;
}

export type IntakeConversationQueueMessage =
  | ConversationCreatedEvent
  | MessageCompletedEvent
  | ConversationStatusChangedEvent
  | ConversationMatterLinkedEvent;
