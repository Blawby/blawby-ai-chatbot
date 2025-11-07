import type { Env } from '../types';

export type ConversationType = 'ai' | 'human' | 'mixed';
export type ConversationStatus = 'open' | 'locked' | 'archived';
export type ConversationParticipantRole = 'client' | 'paralegal' | 'attorney' | 'admin' | 'owner';

interface CreateConversationParticipantInput {
  userId: string;
  role: ConversationParticipantRole;
}

interface CreateConversationInput {
  organizationId: string;
  createdByUserId: string;
  type: ConversationType;
  matterId?: string | null;
  title?: string | null;
  participantUserIds: CreateConversationParticipantInput[];
}

export class ConversationService {
  constructor(private readonly env: Env) {}

  async createConversation(input: CreateConversationInput): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const statements = [
      this.env.DB.prepare(`
        INSERT INTO conversations (
          id,
          organization_id,
          matter_id,
          type,
          status,
          title,
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?)
      `).bind(
        id,
        input.organizationId,
        input.matterId ?? null,
        input.type,
        input.title ?? null,
        input.createdByUserId,
        now,
        now
      ),
      ...input.participantUserIds.map(participant =>
        this.env.DB.prepare(`
          INSERT OR IGNORE INTO conversation_participants (
            conversation_id,
            user_id,
            organization_id,
            role,
            joined_at
          )
          VALUES (?, ?, ?, ?, ?)
        `).bind(id, participant.userId, input.organizationId, participant.role, now)
      )
    ];

    await this.env.DB.batch(statements);

    return { id };
  }

  async addParticipant(
    conversationId: string,
    organizationId: string,
    userId: string,
    role: ConversationParticipantRole
  ): Promise<void> {
    await this.env.DB.prepare(`
      INSERT OR IGNORE INTO conversation_participants (
        conversation_id,
        user_id,
        organization_id,
        role
      )
      VALUES (?, ?, ?, ?)
    `).bind(conversationId, userId, organizationId, role).run();
  }

  async removeParticipant(conversationId: string, userId: string): Promise<void> {
    await this.env.DB.prepare(`
      DELETE FROM conversation_participants
      WHERE conversation_id = ? AND user_id = ?
    `).bind(conversationId, userId).run();
  }

  async linkMatter(conversationId: string, matterId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.env.DB.prepare(`
      UPDATE conversations
      SET matter_id = ?, updated_at = ?
      WHERE id = ?
    `).bind(matterId, now, conversationId).run();
  }

  async setType(conversationId: string, type: ConversationType): Promise<void> {
    const now = new Date().toISOString();
    await this.env.DB.prepare(`
      UPDATE conversations
      SET type = ?, updated_at = ?
      WHERE id = ?
    `).bind(type, now, conversationId).run();
  }

  async setStatus(conversationId: string, status: ConversationStatus): Promise<void> {
    const now = new Date().toISOString();
    await this.env.DB.prepare(`
      UPDATE conversations
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).bind(status, now, conversationId).run();
  }

  async touchLastMessage(conversationId: string, timestamp: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE conversations
      SET last_message_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(timestamp, timestamp, conversationId).run();
  }

  async broadcastEvent(conversationId: string, event: string, data: unknown): Promise<void> {
    try {
      const id = this.env.CONVERSATION_ROOM.idFromName(conversationId);
      const stub = this.env.CONVERSATION_ROOM.get(id);
      await stub.fetch(`https://conversations/${conversationId}/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, data })
      });
    } catch (error) {
      console.warn('Conversation broadcast failed', { conversationId, event, error });
    }
  }
}
