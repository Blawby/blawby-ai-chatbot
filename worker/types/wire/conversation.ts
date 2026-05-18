/**
 * Wire types for chat / conversation API responses.
 *
 * Canonical declarations of ChatMessage / ChatSession live here. The
 * legacy `worker/types.ts` re-exports from this module so old imports
 * continue to work; new code should import from `@/shared/types/wire`
 * (frontend) or `worker/types/wire/conversation.js` (worker).
 */

// MessageReaction is defined frontend-side (the worker doesn't own its shape);
// re-exported here for parity with the rest of the wire module.
import type { MessageReaction } from '../../../src/shared/types/conversation.js';
export type { MessageReaction };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  reply_to_message_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ChatSession {
  id: string;
  /** Practice ID (workspaces are ephemeral practices). */
  practiceId: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

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

// Note: ChatMessageUI (= ChatMessage + UIMessageExtras) is composed in
// worker/types.ts because UIMessageExtras is worker-internal. Importing
// ChatMessageUI here would create a circular re-export with types.ts;
// frontend consumers import it via @/shared/types/wire instead.
