import type { Env } from '../types';

export interface ConversationRecord {
  id: string;
  organization_id: string;
  matter_id: string | null;
  type: 'ai' | 'human' | 'mixed';
  status: 'open' | 'locked' | 'archived';
  title: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

export interface ConversationParticipantRecord {
  conversation_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  left_at: string | null;
  is_muted: number;
  last_read_message_id: string | null;
}

export interface ConversationMessageRecord {
  id: string;
  conversation_id: string;
  organization_id: string;
  sender_user_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  message_type: 'text' | 'system' | 'file' | 'matter_update';
  reply_to_message_id: string | null;
  metadata: string | null;
  is_edited: number;
  edited_at: string | null;
  is_deleted: number;
  deleted_at: string | null;
  created_at: string;
}

export async function getConversation(env: Env, conversationId: string): Promise<ConversationRecord | null> {
  const conversation = await env.DB.prepare(
    `SELECT id, organization_id, matter_id, type, status, title, created_by_user_id, created_at, updated_at, last_message_at
     FROM conversations WHERE id = ?`
  ).bind(conversationId).first<ConversationRecord>();

  return conversation ?? null;
}

export async function requireConversation(env: Env, conversationId: string): Promise<ConversationRecord> {
  const conversation = await getConversation(env, conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }
  return conversation;
}

export async function listParticipants(env: Env, conversationId: string): Promise<ConversationParticipantRecord[]> {
  const results = await env.DB.prepare(
    `SELECT conversation_id, user_id, role, joined_at, left_at, is_muted, last_read_message_id
     FROM conversation_participants WHERE conversation_id = ?`
  ).bind(conversationId).all<ConversationParticipantRecord>();

  return results.results ?? [];
}

export async function getMessage(env: Env, messageId: string): Promise<ConversationMessageRecord | null> {
  const record = await env.DB.prepare(
    `SELECT id, conversation_id, organization_id, sender_user_id, role, content, message_type, reply_to_message_id,
            metadata, is_edited, edited_at, is_deleted, deleted_at, created_at
     FROM conversation_messages WHERE id = ?`
  ).bind(messageId).first<ConversationMessageRecord>();

  return record ?? null;
}

export async function listConversationIdsForMatter(env: Env, organizationId: string, matterId: string): Promise<string[]> {
  const result = await env.DB.prepare(
    `SELECT id FROM conversations WHERE organization_id = ? AND matter_id = ?`
  ).bind(organizationId, matterId).all<{ id: string }>();

  return (result.results ?? []).map(row => row.id);
}
