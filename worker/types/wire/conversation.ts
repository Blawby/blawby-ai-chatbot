/**
 * Wire types for chat / conversation API responses.
 *
 * ChatMessage and ChatSession are the worker's persistence shapes; the
 * frontend's `Conversation` (in src/shared/types/conversation.ts) layers
 * over them with extra metadata. This module is the canonical re-export
 * point for backend-shaped conversation types.
 */

export type { ChatMessage, ChatSession, ChatMessageUI } from '../../types';

export type { MessageReaction } from '../../types';

/**
 * Server-shaped conversation envelope returned by /api/conversations.
 * Snake_case fields preserved verbatim from the backend.
 */
export interface BackendConversation {
  id: string;
  practice_id: string;
  user_id?: string | null;
  status?: string;
  title?: string | null;
  last_message_at?: string | null;
  last_message_content?: string | null;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown> | null;
  participants?: Array<{
    user_id: string;
    role?: string | null;
    joined_at?: string | null;
  }>;
  [key: string]: unknown;
}
