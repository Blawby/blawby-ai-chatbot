import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { RemoteApiService } from './RemoteApiService.js';
import { Logger } from '../utils/logger.js';

export interface Conversation {
  id: string;
  practice_id: string;
  user_id: string | null;
  matter_id: string | null;
  participants: string[]; // Array of user IDs
  user_info: Record<string, unknown> | null;
  status: 'active' | 'archived' | 'closed';
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  practice_id: string;
  user_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, unknown> | null;
  token_count: number | null;
  created_at: string;
}

export interface CreateConversationOptions {
  practiceId: string;
  userId: string;
  matterId?: string | null;
  participantUserIds: string[];
  metadata?: Record<string, unknown>;
}

export interface GetMessagesOptions {
  limit?: number;
  cursor?: string;
  since?: number; // Timestamp in milliseconds
}

export interface GetMessagesResult {
  messages: ConversationMessage[];
  cursor?: string;
  hasMore: boolean;
}

export class ConversationService {
  constructor(private env: Env) {}

  /**
   * Create a new conversation
   * 
   * Validates practice_id exists in remote API before insert to prevent orphaned records.
   */
  async createConversation(options: CreateConversationOptions): Promise<Conversation> {
    // Validate practice exists in remote API to prevent orphaned records
    const practiceExists = await RemoteApiService.validatePractice(this.env, options.practiceId);
    if (!practiceExists) {
      Logger.error('Attempted to create conversation with invalid practice_id', {
        practiceId: options.practiceId,
        userId: options.userId,
        anomaly: 'invalid_practice_id_on_conversation_create',
        severity: 'high'
      });
      throw HttpErrors.notFound(`Practice not found: ${options.practiceId}`);
    }

    const conversationId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    // Ensure creator is in participants
    const participants = Array.from(new Set([options.userId, ...options.participantUserIds]));
    const participantsJson = JSON.stringify(participants);
    const userInfoJson = options.metadata ? JSON.stringify(options.metadata) : null;

    await this.env.DB.prepare(`
      INSERT INTO conversations (
        id, practice_id, user_id, matter_id, participants, user_info, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      conversationId,
      options.practiceId,
      options.userId,
      options.matterId || null,
      participantsJson,
      userInfoJson,
      now,
      now
    ).run();

    return this.getConversation(conversationId, options.practiceId);
  }

  /**
   * Get a single conversation by ID
   */
  async getConversation(conversationId: string, practiceId: string): Promise<Conversation> {
    const record = await this.env.DB.prepare(`
      SELECT 
        id, practice_id, user_id, matter_id, participants, user_info, status, created_at, updated_at
      FROM conversations
      WHERE id = ? AND practice_id = ?
    `).bind(conversationId, practiceId).first<{
      id: string;
      practice_id: string;
      user_id: string | null;
      matter_id: string | null;
      participants: string;
      user_info: string | null;
      status: string;
      created_at: string;
      updated_at: string;
    } | null>();

    if (!record) {
      throw HttpErrors.notFound('Conversation not found');
    }

    return {
      id: record.id,
      practice_id: record.practice_id,
      user_id: record.user_id,
      matter_id: record.matter_id,
      participants: JSON.parse(record.participants || '[]') as string[],
      user_info: record.user_info ? JSON.parse(record.user_info) : null,
      status: record.status as Conversation['status'],
      created_at: record.created_at,
      updated_at: record.updated_at
    };
  }

  /**
   * List conversations with optional filters
   */
  async getConversations(options: {
    practiceId: string;
    matterId?: string | null;
    userId?: string | null;
    status?: 'active' | 'archived' | 'closed';
    limit?: number;
  }): Promise<Conversation[]> {
    const limit = Math.min(options.limit || 50, 100); // Max 100
    let query = `
      SELECT 
        id, practice_id, user_id, matter_id, participants, user_info, status, created_at, updated_at
      FROM conversations
      WHERE practice_id = ?
    `;
    const bindings: unknown[] = [options.practiceId];

    if (options.matterId) {
      query += ' AND matter_id = ?';
      bindings.push(options.matterId);
    }

    if (options.userId) {
      // User must be in participants array
      query += ' AND JSON_EXTRACT(participants, "$") LIKE ?';
      bindings.push(`%"${options.userId}"%`);
    }

    if (options.status) {
      query += ' AND status = ?';
      bindings.push(options.status);
    }

    query += ' ORDER BY updated_at DESC LIMIT ?';
    bindings.push(limit);

    const records = await this.env.DB.prepare(query).bind(...bindings).all<{
      id: string;
      practice_id: string;
      user_id: string | null;
      matter_id: string | null;
      participants: string;
      user_info: string | null;
      status: string;
      created_at: string;
      updated_at: string;
    }>();

    return records.results.map(record => ({
      id: record.id,
      practice_id: record.practice_id,
      user_id: record.user_id,
      matter_id: record.matter_id,
      participants: JSON.parse(record.participants || '[]') as string[],
      user_info: record.user_info ? JSON.parse(record.user_info) : null,
      status: record.status as Conversation['status'],
      created_at: record.created_at,
      updated_at: record.updated_at
    }));
  }

  /**
   * Update conversation (status, metadata)
   */
  async updateConversation(
    conversationId: string,
    practiceId: string,
    updates: {
      status?: 'active' | 'archived' | 'closed';
      metadata?: Record<string, unknown>;
    }
  ): Promise<Conversation> {
    // Verify conversation exists and belongs to practice
    await this.getConversation(conversationId, practiceId);

    const now = new Date().toISOString();
    const updatesList: string[] = [];
    const bindings: unknown[] = [];

    if (updates.status) {
      updatesList.push('status = ?');
      bindings.push(updates.status);
    }

    if (updates.metadata !== undefined) {
      updatesList.push('user_info = ?');
      bindings.push(JSON.stringify(updates.metadata));
    }

    if (updatesList.length === 0) {
      return this.getConversation(conversationId, practiceId);
    }

    updatesList.push('updated_at = ?');
    bindings.push(now);
    bindings.push(conversationId, practiceId);

    await this.env.DB.prepare(`
      UPDATE conversations
      SET ${updatesList.join(', ')}
      WHERE id = ? AND practice_id = ?
    `).bind(...bindings).run();

    return this.getConversation(conversationId, practiceId);
  }

  /**
   * Add a participant to a conversation
   */
  async addParticipant(
    conversationId: string,
    practiceId: string,
    userId: string
  ): Promise<Conversation> {
    const conversation = await this.getConversation(conversationId, practiceId);

    // Check if user is already a participant
    if (conversation.participants.includes(userId)) {
      return conversation; // Already a participant
    }

    const updatedParticipants = [...conversation.participants, userId];
    const now = new Date().toISOString();

    await this.env.DB.prepare(`
      UPDATE conversations
      SET participants = ?, updated_at = ?
      WHERE id = ? AND practice_id = ?
    `).bind(
      JSON.stringify(updatedParticipants),
      now,
      conversationId,
      practiceId
    ).run();

    return this.getConversation(conversationId, practiceId);
  }

  /**
   * Validate that a user has access to a conversation
   */
  async validateParticipantAccess(
    conversationId: string,
    practiceId: string,
    userId: string
  ): Promise<void> {
    const conversation = await this.getConversation(conversationId, practiceId);

    if (!conversation.participants.includes(userId)) {
      throw HttpErrors.forbidden('User is not a participant in this conversation');
    }
  }

  /**
   * Send a message to a conversation
   * 
   * Validates practice_id exists in remote API before insert to prevent orphaned records.
   */
  async sendMessage(options: {
    conversationId: string;
    practiceId: string;
    senderUserId: string;
    content: string;
    role?: 'user' | 'assistant' | 'system';
    metadata?: Record<string, unknown>;
  }): Promise<ConversationMessage> {
    // Validate practice exists in remote API to prevent orphaned records
    const practiceExists = await RemoteApiService.validatePractice(this.env, options.practiceId);
    if (!practiceExists) {
      Logger.error('Attempted to send message with invalid practice_id', {
        practiceId: options.practiceId,
        conversationId: options.conversationId,
        userId: options.senderUserId,
        anomaly: 'invalid_practice_id_on_message_send',
        severity: 'high'
      });
      throw HttpErrors.notFound(`Practice not found: ${options.practiceId}`);
    }

    // Validate participant access
    await this.validateParticipantAccess(
      options.conversationId,
      options.practiceId,
      options.senderUserId
    );

    const messageId = crypto.randomUUID();
    const now = new Date().toISOString();
    const role = options.role || 'user';
    const metadataJson = options.metadata ? JSON.stringify(options.metadata) : null;

    await this.env.DB.prepare(`
      INSERT INTO chat_messages (
        id, conversation_id, practice_id, user_id, role, content, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      messageId,
      options.conversationId,
      options.practiceId,
      options.senderUserId,
      role,
      options.content,
      metadataJson,
      now
    ).run();

    // Update conversation's updated_at timestamp
    await this.env.DB.prepare(`
      UPDATE conversations
      SET updated_at = ?
      WHERE id = ? AND practice_id = ?
    `).bind(now, options.conversationId, options.practiceId).run();

    return this.getMessage(messageId);
  }

  /**
   * Get a single message by ID
   */
  async getMessage(messageId: string): Promise<ConversationMessage> {
    const record = await this.env.DB.prepare(`
      SELECT 
        id, conversation_id, practice_id, user_id, role, content, metadata, token_count, created_at
      FROM chat_messages
      WHERE id = ?
    `).bind(messageId).first<{
      id: string;
      conversation_id: string;
      practice_id: string;
      user_id: string | null;
      role: string;
      content: string;
      metadata: string | null;
      token_count: number | null;
      created_at: string;
    } | null>();

    if (!record) {
      throw HttpErrors.notFound('Message not found');
    }

    return {
      id: record.id,
      conversation_id: record.conversation_id,
      practice_id: record.practice_id,
      user_id: record.user_id,
      role: record.role as ConversationMessage['role'],
      content: record.content,
      metadata: record.metadata ? JSON.parse(record.metadata) : null,
      token_count: record.token_count,
      created_at: record.created_at
    };
  }

  /**
   * Get messages for a conversation with pagination
   */
  async getMessages(
    conversationId: string,
    practiceId: string,
    options: GetMessagesOptions = {}
  ): Promise<GetMessagesResult> {
    // Verify conversation exists
    await this.getConversation(conversationId, practiceId);

    const limit = Math.min(options.limit || 50, 100); // Max 100
    let query = `
      SELECT 
        id, conversation_id, practice_id, user_id, role, content, metadata, token_count, created_at
      FROM chat_messages
      WHERE conversation_id = ? AND practice_id = ?
    `;
    const bindings: unknown[] = [conversationId, practiceId];

    // Support 'since' parameter for polling new messages
    if (options.since) {
      const sinceDate = new Date(options.since).toISOString();
      query += ' AND created_at > ?';
      bindings.push(sinceDate);
    }

    // Cursor-based pagination (for loading older messages)
    if (options.cursor) {
      query += ' AND created_at < ?';
      bindings.push(options.cursor);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    bindings.push(limit + 1); // Fetch one extra to check if there are more

    const records = await this.env.DB.prepare(query).bind(...bindings).all<{
      id: string;
      conversation_id: string;
      practice_id: string;
      user_id: string | null;
      role: string;
      content: string;
      metadata: string | null;
      token_count: number | null;
      created_at: string;
    }>();

    const hasMore = records.results.length > limit;
    const messages = records.results.slice(0, limit).map(record => ({
      id: record.id,
      conversation_id: record.conversation_id,
      practice_id: record.practice_id,
      user_id: record.user_id,
      role: record.role as ConversationMessage['role'],
      content: record.content,
      metadata: record.metadata ? JSON.parse(record.metadata) : null,
      token_count: record.token_count,
      created_at: record.created_at
    }));

    // Reverse to return oldest first (for display)
    messages.reverse();

    // Generate cursor from last message's created_at if there are more
    const cursor = hasMore && messages.length > 0 
      ? messages[messages.length - 1].created_at 
      : undefined;

    return {
      messages,
      cursor,
      hasMore
    };
  }

  /**
   * Mark messages as read (store in conversation metadata)
   */
  async markAsRead(conversationId: string, practiceId: string, userId: string): Promise<void> {
    await this.validateParticipantAccess(conversationId, practiceId, userId);

    const conversation = await this.getConversation(conversationId, practiceId);
    const userInfo = conversation.user_info || {};
    const readStatus = (userInfo.read_status as Record<string, string>) || {};
    
    readStatus[userId] = new Date().toISOString();

    await this.updateConversation(conversationId, practiceId, {
      metadata: {
        ...userInfo,
        read_status: readStatus
      }
    });
  }
}

