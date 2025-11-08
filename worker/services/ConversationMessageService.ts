import type { Env } from '../types';

export type ConversationMessageType = 'text' | 'system' | 'file' | 'matter_update';

interface SendUserMessageInput {
  conversationId: string;
  organizationId: string;
  senderUserId: string;
  content: string;
  replyToMessageId?: string | null;
  messageType?: ConversationMessageType;
  clientNonce?: string | null;
}

interface SendSystemMessageInput {
  conversationId: string;
  organizationId: string;
  content: string;
  messageType?: Extract<ConversationMessageType, 'system' | 'matter_update'>;
  metadata?: unknown;
}

export class ConversationMessageService {
  constructor(private readonly env: Env) {}

  async sendUserMessage(input: SendUserMessageInput): Promise<{ id: string; createdAt: string }> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const metadataPayload = input.clientNonce ? { clientNonce: input.clientNonce } : {};

    await this.env.DB.batch([
      this.env.DB.prepare(`
        INSERT INTO conversation_messages (
          id,
          conversation_id,
          organization_id,
          sender_user_id,
          role,
          content,
          message_type,
          reply_to_message_id,
          metadata,
          created_at
        )
        VALUES (?, ?, ?, ?, 'user', ?, ?, ?, ?, ?)
      `).bind(
        id,
        input.conversationId,
        input.organizationId,
        input.senderUserId,
        input.content,
        input.messageType ?? 'text',
        input.replyToMessageId ?? null,
        Object.keys(metadataPayload).length > 0 ? JSON.stringify(metadataPayload) : null,
        now
      ),
      this.env.DB.prepare(`
        UPDATE conversations
        SET last_message_at = ?, updated_at = ?
        WHERE id = ?
      `).bind(now, now, input.conversationId)
    ]);

    return { id, createdAt: now };
  }

  async sendSystemMessage(input: SendSystemMessageInput): Promise<{ id: string; createdAt: string }> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.env.DB.batch([
      this.env.DB.prepare(`
        INSERT INTO conversation_messages (
          id,
          conversation_id,
          organization_id,
          sender_user_id,
          role,
          content,
          message_type,
          metadata,
          created_at
        )
        VALUES (?, ?, ?, NULL, 'system', ?, ?, ?, ?)
      `).bind(
        id,
        input.conversationId,
        input.organizationId,
        input.content,
        input.messageType ?? 'system',
        input.metadata ? JSON.stringify(input.metadata) : null,
        now
      ),
      this.env.DB.prepare(`
        UPDATE conversations
        SET last_message_at = ?, updated_at = ?
        WHERE id = ?
      `).bind(now, now, input.conversationId)
    ]);

    return { id, createdAt: now };
  }

  async editMessage(messageId: string, editorUserId: string, newContent: string): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.env.DB.prepare(`
      UPDATE conversation_messages
      SET content = ?, is_edited = 1, edited_at = ?
      WHERE id = ?
        AND sender_user_id = ?
        AND julianday('now') - julianday(created_at) <= (10.0 / 1440.0)
    `).bind(newContent, now, messageId, editorUserId).run();

    return Boolean(result.success && (result.meta?.changes ?? 0) > 0);
  }

  async softDeleteMessage(messageId: string, conversationId: string): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.env.DB.prepare(`
      UPDATE conversation_messages
      SET content = '', is_deleted = 1, deleted_at = ?
      WHERE id = ? AND conversation_id = ?
    `).bind(now, messageId, conversationId).run();

    return Boolean(result.success && (result.meta?.changes ?? 0) > 0);
  }

  async markLastRead(conversationId: string, userId: string, lastMessageId: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE conversation_participants
      SET last_read_message_id = ?
      WHERE conversation_id = ? AND user_id = ?
    `).bind(lastMessageId, conversationId, userId).run();
  }
}
