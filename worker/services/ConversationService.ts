import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { RemoteApiService } from './RemoteApiService.js';
import { Logger } from '../utils/logger.js';

export interface Conversation {
  id: string;
  practice_id: string;
  // Only populated by aggregate routes (e.g., /api/conversations?scope=all).
  // Most service methods return null for practice to avoid extra remote lookups.
  practice?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  user_id: string | null;
  matter_id: string | null;
  participants: string[]; // Array of user IDs
  user_info: Record<string, unknown> | null;
  status: 'active' | 'archived' | 'closed';
  assigned_to?: string | null; // User ID of assigned practice member
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  tags?: string[]; // Array of tag strings
  internal_notes?: string | null; // Internal notes for practice members
  last_message_at?: string | null; // Timestamp of last message
  first_response_at?: string | null; // Timestamp of first practice member response
  closed_at?: string | null; // Timestamp when conversation was closed
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
  userId: string | null; // Null for anonymous users
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
  async createConversation(options: CreateConversationOptions, request?: Request): Promise<Conversation> {
    // Validate practice exists in remote API to prevent orphaned records
    const practiceExists = await RemoteApiService.validatePractice(this.env, options.practiceId, request);
    if (!practiceExists) {
      Logger.error('Attempted to create conversation with invalid practice_id', {
        practiceId: options.practiceId,
        userId: options.userId,
        anomaly: 'invalid_practice_id_on_conversation_create',
        severity: 'high'
      });
      throw HttpErrors.notFound(`Practice not found: ${options.practiceId}`);
    }

    // Validate that we have at least one participant
    if (!options.userId && options.participantUserIds.length === 0) {
      throw HttpErrors.badRequest('At least one participant is required for anonymous conversations');
    }

    const conversationId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    // Ensure creator is in participants (only if userId is not null)
    const participants = options.userId 
      ? Array.from(new Set([options.userId, ...options.participantUserIds]))
      : options.participantUserIds;
    const participantsJson = JSON.stringify(participants);
    const userInfoJson = options.metadata ? JSON.stringify(options.metadata) : null;

    await this.env.DB.prepare(`
      INSERT INTO conversations (
        id, practice_id, user_id, matter_id, participants, user_info, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      conversationId,
      options.practiceId,
      options.userId, // Can be null for anonymous users
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
        id, practice_id, user_id, matter_id, participants, user_info, status,
        assigned_to, priority, tags, internal_notes, last_message_at, first_response_at,
        closed_at, created_at, updated_at
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
      assigned_to: string | null;
      priority: string | null;
      tags: string | null;
      internal_notes: string | null;
      last_message_at: string | null;
      first_response_at: string | null;
      closed_at: string | null;
      created_at: string;
      updated_at: string;
    } | null>();

    if (!record) {
      throw HttpErrors.notFound('Conversation not found');
    }

    return {
      id: record.id,
      practice_id: record.practice_id,
      practice: null,
      user_id: record.user_id,
      matter_id: record.matter_id,
      participants: JSON.parse(record.participants || '[]') as string[],
      user_info: record.user_info ? JSON.parse(record.user_info) : null,
      status: record.status as Conversation['status'],
      assigned_to: record.assigned_to || null,
      priority: (record.priority || 'normal') as Conversation['priority'],
      tags: record.tags ? JSON.parse(record.tags) as string[] : undefined,
      internal_notes: record.internal_notes || null,
      last_message_at: record.last_message_at || null,
      first_response_at: record.first_response_at || null,
      closed_at: record.closed_at || null,
      created_at: record.created_at,
      updated_at: record.updated_at
    };
  }

  /**
   * Get a single conversation by ID without scoping to a practice.
   * Use with participant checks before returning sensitive data.
   */
  async getConversationById(conversationId: string): Promise<Conversation> {
    const record = await this.env.DB.prepare(`
      SELECT 
        id, practice_id, user_id, matter_id, participants, user_info, status,
        assigned_to, priority, tags, internal_notes, last_message_at, first_response_at,
        closed_at, created_at, updated_at
      FROM conversations
      WHERE id = ?
    `).bind(conversationId).first<{
      id: string;
      practice_id: string;
      user_id: string | null;
      matter_id: string | null;
      participants: string;
      user_info: string | null;
      status: string;
      assigned_to: string | null;
      priority: string | null;
      tags: string | null;
      internal_notes: string | null;
      last_message_at: string | null;
      first_response_at: string | null;
      closed_at: string | null;
      created_at: string;
      updated_at: string;
    } | null>();

    if (!record) {
      throw HttpErrors.notFound('Conversation not found');
    }

    return {
      id: record.id,
      practice_id: record.practice_id,
      practice: null,
      user_id: record.user_id,
      matter_id: record.matter_id,
      participants: JSON.parse(record.participants || '[]') as string[],
      user_info: record.user_info ? JSON.parse(record.user_info) : null,
      status: record.status as Conversation['status'],
      assigned_to: record.assigned_to || null,
      priority: (record.priority || 'normal') as Conversation['priority'],
      tags: record.tags ? JSON.parse(record.tags) as string[] : undefined,
      internal_notes: record.internal_notes || null,
      last_message_at: record.last_message_at || null,
      first_response_at: record.first_response_at || null,
      closed_at: record.closed_at || null,
      created_at: record.created_at,
      updated_at: record.updated_at
    };
  }

  /**
   * Get or create current conversation for a user with a practice
   * For anonymous users: Gets most recent active conversation or creates new
   * For signed-in clients: Gets most recent active conversation or creates new
   */
  async getOrCreateCurrentConversation(
    userId: string,
    practiceId: string,
    request?: Request,
    isAnonymous?: boolean
  ): Promise<Conversation> {
    // Validate practice exists (pass request for auth token)
    const practiceExists = await RemoteApiService.validatePractice(this.env, practiceId, request);
    if (!practiceExists) {
      throw HttpErrors.notFound(`Practice not found: ${practiceId}`);
    }

    // Try to get most recent active conversation
    // Build WHERE clause conditionally to avoid SQL keyword interpolation
    const userIdCondition = isAnonymous ? 'AND user_id IS NULL' : 'AND user_id IS NOT NULL';
    const query = `
      SELECT 
        id, practice_id, user_id, matter_id, participants, user_info, status,
        assigned_to, priority, tags, internal_notes, last_message_at, first_response_at,
        closed_at, created_at, updated_at
      FROM conversations
      WHERE practice_id = ? 
        AND EXISTS (SELECT 1 FROM json_each(participants) WHERE json_each.value = ?)
        ${userIdCondition}
        AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    const existing = await this.env.DB.prepare(query).bind(practiceId, userId).first<{
      id: string;
      practice_id: string;
      user_id: string | null;
      matter_id: string | null;
      participants: string;
      user_info: string | null;
      status: string;
      assigned_to: string | null;
      priority: string | null;
      tags: string | null;
      internal_notes: string | null;
      last_message_at: string | null;
      first_response_at: string | null;
      closed_at: string | null;
      created_at: string;
      updated_at: string;
    } | null>();

    if (existing) {
      return {
        id: existing.id,
        practice_id: existing.practice_id,
        practice: null,
        user_id: existing.user_id,
        matter_id: existing.matter_id,
        participants: JSON.parse(existing.participants || '[]') as string[],
        user_info: existing.user_info ? JSON.parse(existing.user_info) : null,
        status: existing.status as Conversation['status'],
        assigned_to: existing.assigned_to || null,
        priority: (existing.priority || 'normal') as Conversation['priority'],
        tags: existing.tags ? JSON.parse(existing.tags) as string[] : undefined,
        internal_notes: existing.internal_notes || null,
        last_message_at: existing.last_message_at || null,
        first_response_at: existing.first_response_at || null,
        closed_at: existing.closed_at || null,
        created_at: existing.created_at,
        updated_at: existing.updated_at
      };
    }

    // No existing conversation, create new one
    // For anonymous users, user_id will be null but they still have a userId for participants
    return this.createConversation({
      practiceId,
      userId: isAnonymous ? null : userId, // Store actual userId for authenticated users, null for anonymous
      matterId: null,
      participantUserIds: isAnonymous ? [userId] : [], // userId will be added automatically by createConversation for authenticated users
      metadata: null
    }, request);
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
        id, practice_id, user_id, matter_id, participants, user_info, status, closed_at, created_at, updated_at
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
      query += ' AND EXISTS (SELECT 1 FROM json_each(participants) WHERE json_each.value = ?)';
      bindings.push(options.userId);
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
      closed_at: string | null;
      created_at: string;
      updated_at: string;
    }>();

    return records.results.map(record => ({
      id: record.id,
      practice_id: record.practice_id,
      practice: null,
      user_id: record.user_id,
      matter_id: record.matter_id,
      participants: JSON.parse(record.participants || '[]') as string[],
      user_info: record.user_info ? JSON.parse(record.user_info) : null,
      status: record.status as Conversation['status'],
      closed_at: record.closed_at || null,
      created_at: record.created_at,
      updated_at: record.updated_at
    }));
  }

  /**
   * List conversations for a user across all practices
   */
  async getConversationsForUser(options: {
    userId: string;
    status?: 'active' | 'archived' | 'closed';
    limit?: number;
    offset?: number;
  }): Promise<Conversation[]> {
    const limit = Math.min(options.limit || 50, 100);
    const offset = Math.max(options.offset || 0, 0);
    let query = `
      SELECT 
        id, practice_id, user_id, matter_id, participants, user_info, status, closed_at, created_at, updated_at
      FROM conversations
      WHERE EXISTS (SELECT 1 FROM json_each(participants) WHERE json_each.value = ?)
    `;
    const bindings: unknown[] = [options.userId];

    if (options.status) {
      query += ' AND status = ?';
      bindings.push(options.status);
    }

    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    bindings.push(limit, offset);

    const records = await this.env.DB.prepare(query).bind(...bindings).all<{
      id: string;
      practice_id: string;
      user_id: string | null;
      matter_id: string | null;
      participants: string;
      user_info: string | null;
      status: string;
      closed_at: string | null;
      created_at: string;
      updated_at: string;
    }>();

    return records.results.map(record => ({
      id: record.id,
      practice_id: record.practice_id,
      practice: null,
      user_id: record.user_id,
      matter_id: record.matter_id,
      participants: JSON.parse(record.participants || '[]') as string[],
      user_info: record.user_info ? JSON.parse(record.user_info) : null,
      status: record.status as Conversation['status'],
      closed_at: record.closed_at || null,
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
    const currentConversation = await this.getConversation(conversationId, practiceId);

    const now = new Date().toISOString();
    const updatesList: string[] = [];
    const bindings: unknown[] = [];

    if (updates.status) {
      updatesList.push('status = ?');
      bindings.push(updates.status);
      
      // Set closed_at when transitioning to 'closed' status
      if (updates.status === 'closed' && currentConversation.status !== 'closed') {
        updatesList.push('closed_at = ?');
        bindings.push(now);
      }
      // Clear closed_at when transitioning away from 'closed' status
      else if (updates.status !== 'closed' && currentConversation.status === 'closed') {
        updatesList.push('closed_at = NULL');
      }
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
   * Attach a matter to a conversation
   */
  async attachMatter(
    conversationId: string,
    practiceId: string,
    matterId: string
  ): Promise<Conversation> {
    const conversation = await this.getConversation(conversationId, practiceId);
    if (conversation.matter_id === matterId) {
      return conversation;
    }

    const now = new Date().toISOString();
    await this.env.DB.prepare(`
      UPDATE conversations
      SET matter_id = ?, updated_at = ?
      WHERE id = ? AND practice_id = ?
    `).bind(matterId, now, conversationId, practiceId).run();

    return this.getConversation(conversationId, practiceId);
  }

  /**
   * Add one or more participants to a conversation
   *
   * Ensures uniqueness, preserves existing participants, and updates the
   * conversation's updated_at timestamp.
   */
  async addParticipants(
    conversationId: string,
    practiceId: string,
    userIds: string[]
  ): Promise<Conversation> {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw HttpErrors.badRequest('participantUserIds must be a non-empty array');
    }

    const conversation = await this.getConversation(conversationId, practiceId);

    // Merge and de-duplicate participants
    const mergedParticipants = Array.from(
      new Set([...conversation.participants, ...userIds.filter(Boolean)])
    );

    // If no changes, return existing conversation
    if (mergedParticipants.length === conversation.participants.length) {
      return conversation;
    }

    const now = new Date().toISOString();

    await this.env.DB.prepare(`
      UPDATE conversations
      SET participants = ?, updated_at = ?
      WHERE id = ? AND practice_id = ?
    `).bind(
      JSON.stringify(mergedParticipants),
      now,
      conversationId,
      practiceId
    ).run();

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
    return this.addParticipants(conversationId, practiceId, [userId]);
  }

  /**
   * Link an anonymous conversation to an authenticated user account.
   * Updates user_id from null to userId and ensures user is in participants.
   */
  async linkConversationToUser(
    conversationId: string,
    practiceId: string,
    userId: string
  ): Promise<Conversation> {
    const conversation = await this.getConversation(conversationId, practiceId);

    if (conversation.practice_id !== practiceId) {
      throw HttpErrors.forbidden('Conversation does not belong to this practice');
    }

    if (conversation.user_id && conversation.user_id !== userId) {
      throw HttpErrors.conflict('Conversation already linked to a different user');
    }

    // If already linked to this user and participant list already contains them, return early
    const participantSet = new Set(conversation.participants);
    const alreadyLinkedToUser = conversation.user_id === userId;
    if (alreadyLinkedToUser && participantSet.has(userId)) {
      return conversation;
    }

    participantSet.add(userId);
    const updatedParticipants = Array.from(participantSet);
    const now = new Date().toISOString();

    const updateResult = await this.env.DB.prepare(`
      UPDATE conversations
      SET user_id = ?, participants = ?, updated_at = ?
      WHERE id = ? AND practice_id = ? AND (user_id IS NULL OR user_id = ?)
    `).bind(
      userId,
      JSON.stringify(updatedParticipants),
      now,
      conversationId,
      practiceId,
      userId
    ).run();

    const changes = updateResult.meta?.changes ?? updateResult.meta?.rows_written ?? 0;
    if (changes === 0) {
      const refreshedConversation = await this.getConversation(conversationId, practiceId);
      if (refreshedConversation.user_id === userId) {
        return refreshedConversation;
      }

      throw HttpErrors.conflict('Conversation already linked to a different user');
    }

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

    // Update conversation's updated_at and last_message_at timestamps
    await this.updateLastMessageAt(options.conversationId, options.practiceId);

    return this.getMessage(messageId);
  }

  /**
   * Send a system message to a conversation without requiring participant access.
   */
  async sendSystemMessage(options: {
    conversationId: string;
    practiceId: string;
    content: string;
    role?: 'system' | 'assistant';
    metadata?: Record<string, unknown>;
  }): Promise<ConversationMessage> {
    const practiceExists = await RemoteApiService.validatePractice(this.env, options.practiceId);
    if (!practiceExists) {
      Logger.error('Attempted to send system message with invalid practice_id', {
        practiceId: options.practiceId,
        conversationId: options.conversationId,
        anomaly: 'invalid_practice_id_on_system_message',
        severity: 'high'
      });
      throw HttpErrors.notFound(`Practice not found: ${options.practiceId}`);
    }

    await this.getConversation(options.conversationId, options.practiceId);

    const messageId = crypto.randomUUID();
    const now = new Date().toISOString();
    const role = options.role || 'system';
    const metadataJson = options.metadata ? JSON.stringify(options.metadata) : null;

    await this.env.DB.prepare(`
      INSERT INTO chat_messages (
        id, conversation_id, practice_id, user_id, role, content, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      messageId,
      options.conversationId,
      options.practiceId,
      null,
      role,
      options.content,
      metadataJson,
      now
    ).run();

    await this.updateLastMessageAt(options.conversationId, options.practiceId);

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

  /**
   * Build WHERE clause and bindings for inbox filters
   */
  private buildInboxFilters(options: {
    assignedTo?: string | null;
    status?: 'active' | 'archived' | 'closed';
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    tags?: string[];
  }): { whereClause: string; bindings: unknown[] } {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (options.assignedTo === 'unassigned') {
      conditions.push('(assigned_to IS NULL OR assigned_to = \'\')');
    } else if (options.assignedTo === 'me') {
      throw new Error("'me' should be resolved to userId by caller before calling getInboxConversations");
    } else if (options.assignedTo) {
      conditions.push('assigned_to = ?');
      bindings.push(options.assignedTo);
    }

    if (options.status) {
      conditions.push('status = ?');
      bindings.push(options.status);
    }

    if (options.priority) {
      conditions.push('priority = ?');
      bindings.push(options.priority);
    }

    if (options.tags && options.tags.length > 0) {
      const tagConditions = options.tags.map(() => 
        'EXISTS (SELECT 1 FROM json_each(conversations.tags) WHERE json_each.value = ?)'
      );
      conditions.push(`(${tagConditions.join(' OR ')})`);
      options.tags.forEach(tag => bindings.push(tag));
    }

    return {
      whereClause: conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '',
      bindings
    };
  }

  /**
   * Get conversations for team inbox with filters
   */
  async getInboxConversations(options: {
    practiceId: string;
    assignedTo?: string | null; // 'me', 'unassigned', or specific user ID
    status?: 'active' | 'archived' | 'closed';
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    tags?: string[];
    limit?: number;
    offset?: number;
    sortBy?: 'last_message_at' | 'created_at' | 'priority';
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ conversations: Conversation[]; total: number }> {
    const limit = Math.min(options.limit || 50, 100);
    const offset = options.offset || 0;
    const sortBy = options.sortBy || 'last_message_at';
    const sortOrder = options.sortOrder || 'desc';

    // Build filters using helper method
    const filters = this.buildInboxFilters({
      assignedTo: options.assignedTo,
      status: options.status,
      priority: options.priority,
      tags: options.tags
    });

    let query = `
      SELECT 
        id, practice_id, user_id, matter_id, participants, user_info, status,
        assigned_to, priority, tags, internal_notes, last_message_at, first_response_at,
        closed_at, created_at, updated_at
      FROM conversations
      WHERE practice_id = ?${filters.whereClause}
    `;
    const bindings: unknown[] = [options.practiceId, ...filters.bindings];

    // Build separate count query with same WHERE conditions
    let countQuery = `SELECT COUNT(*) as total FROM conversations WHERE practice_id = ?${filters.whereClause}`;
    const countBindings: unknown[] = [options.practiceId, ...filters.bindings];

    const countResult = await this.env.DB.prepare(countQuery).bind(...countBindings).first<{ total: number }>();
    const total = countResult?.total || 0;

    // Add sorting with whitelist to prevent SQL injection
    const sortColumnMap: Record<string, string> = {
      'last_message_at': 'COALESCE(last_message_at, created_at)',
      'created_at': 'created_at',
      'priority': 'priority'
    };
    const validSortColumn = sortColumnMap[sortBy] || sortColumnMap['last_message_at'];
    
    // Validate sortOrder to prevent SQL injection
    const validSortOrder = (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder.toUpperCase() : 'DESC';
    
    query += ` ORDER BY ${validSortColumn} ${validSortOrder} LIMIT ? OFFSET ?`;
    bindings.push(limit, offset);

    const records = await this.env.DB.prepare(query).bind(...bindings).all<{
      id: string;
      practice_id: string;
      user_id: string | null;
      matter_id: string | null;
      participants: string;
      user_info: string | null;
      status: string;
      assigned_to: string | null;
      priority: string | null;
      tags: string | null;
      internal_notes: string | null;
      last_message_at: string | null;
      first_response_at: string | null;
      closed_at: string | null;
      created_at: string;
      updated_at: string;
    }>();

    const conversations = records.results.map(record => ({
      id: record.id,
      practice_id: record.practice_id,
      user_id: record.user_id,
      matter_id: record.matter_id,
      participants: JSON.parse(record.participants || '[]') as string[],
      user_info: record.user_info ? JSON.parse(record.user_info) : null,
      status: record.status as Conversation['status'],
      assigned_to: record.assigned_to || null,
      priority: (record.priority || 'normal') as Conversation['priority'],
      tags: record.tags ? JSON.parse(record.tags) as string[] : undefined,
      internal_notes: record.internal_notes || null,
      last_message_at: record.last_message_at || null,
      first_response_at: record.first_response_at || null,
      closed_at: record.closed_at || null,
      created_at: record.created_at,
      updated_at: record.updated_at
    }));

    return { conversations, total };
  }

  /**
   * Assign conversation to a practice member
   */
  async assignConversation(
    conversationId: string,
    practiceId: string,
    assignedTo: string | null
  ): Promise<Conversation> {
    const now = new Date().toISOString();

    await this.env.DB.prepare(`
      UPDATE conversations
      SET assigned_to = ?, updated_at = ?
      WHERE id = ? AND practice_id = ?
    `).bind(assignedTo, now, conversationId, practiceId).run();

    return this.getConversation(conversationId, practiceId);
  }

  /**
   * Update inbox conversation fields
   */
  async updateInboxConversation(
    conversationId: string,
    practiceId: string,
    updates: {
      assigned_to?: string | null;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      tags?: string[];
      internal_notes?: string | null;
      status?: 'active' | 'archived' | 'closed';
    }
  ): Promise<Conversation> {
    const currentConversation = await this.getConversation(conversationId, practiceId);

    const now = new Date().toISOString();
    const updatesList: string[] = [];
    const bindings: unknown[] = [];

    if (updates.assigned_to !== undefined) {
      updatesList.push('assigned_to = ?');
      bindings.push(updates.assigned_to);
    }

    if (updates.priority) {
      updatesList.push('priority = ?');
      bindings.push(updates.priority);
    }

    if (updates.tags !== undefined) {
      updatesList.push('tags = ?');
      bindings.push(JSON.stringify(updates.tags));
    }

    if (updates.internal_notes !== undefined) {
      updatesList.push('internal_notes = ?');
      bindings.push(updates.internal_notes);
    }

    if (updates.status) {
      updatesList.push('status = ?');
      bindings.push(updates.status);
      
      // Set closed_at when transitioning to 'closed' status
      if (updates.status === 'closed' && currentConversation.status !== 'closed') {
        updatesList.push('closed_at = ?');
        bindings.push(now);
      }
      // Clear closed_at when transitioning away from 'closed' status
      else if (updates.status !== 'closed' && currentConversation.status === 'closed') {
        updatesList.push('closed_at = NULL');
      }
    }

    if (updatesList.length === 0) {
      return this.getConversation(conversationId, practiceId);
    }

    updatesList.push('updated_at = ?');
    bindings.push(now, conversationId, practiceId);

    await this.env.DB.prepare(`
      UPDATE conversations
      SET ${updatesList.join(', ')}
      WHERE id = ? AND practice_id = ?
    `).bind(...bindings).run();

    return this.getConversation(conversationId, practiceId);
  }

  /**
   * Get inbox statistics for a practice
   */
  async getInboxStats(practiceId: string, userId?: string): Promise<{
    total: number;
    active: number;
    unassigned: number;
    assignedToMe: number;
    highPriority: number;
    archived: number;
    closed: number;
  }> {
    const stats = await this.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN (assigned_to IS NULL OR assigned_to = '') AND status = 'active' THEN 1 ELSE 0 END) as unassigned,
        SUM(CASE WHEN assigned_to = ? AND status = 'active' THEN 1 ELSE 0 END) as assignedToMe,
        SUM(CASE WHEN priority IN ('high', 'urgent') AND status = 'active' THEN 1 ELSE 0 END) as highPriority,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
      FROM conversations
      WHERE practice_id = ?
    `).bind(userId || null, practiceId).first<{
      total: number;
      active: number;
      unassigned: number;
      assignedToMe: number;
      highPriority: number;
      archived: number;
      closed: number;
    }>();

    return {
      total: stats?.total || 0,
      active: stats?.active || 0,
      unassigned: stats?.unassigned || 0,
      assignedToMe: stats?.assignedToMe || 0,
      highPriority: stats?.highPriority || 0,
      archived: stats?.archived || 0,
      closed: stats?.closed || 0
    };
  }

  /**
   * Update the last_message_at and updated_at timestamps for a conversation.
   * 
   * This method is called automatically by sendMessage when a message is sent.
   * It can also be called directly if you need to update the timestamp without
   * sending a message (e.g., when importing historical messages or syncing from
   * external systems).
   * 
   * @param conversationId - The ID of the conversation to update
   * @param practiceId - The practice ID that owns the conversation
   * @throws {HttpErrors.notFound} If the conversation doesn't exist (though this method
   *   doesn't validate existence for performance - validation should be done by the caller)
   */
  async updateLastMessageAt(conversationId: string, practiceId: string): Promise<void> {
    const now = new Date().toISOString();
    // SQL placeholders: last_message_at, updated_at, id, practice_id
    await this.env.DB.prepare(`
      UPDATE conversations
      SET last_message_at = ?, updated_at = ?
      WHERE id = ? AND practice_id = ?
    `).bind(now, now, conversationId, practiceId).run();
  }

  /**
   * Update first_response_at when a practice member sends first message
   */
  async updateFirstResponseAt(conversationId: string, practiceId: string): Promise<void> {
    const conversation = await this.getConversation(conversationId, practiceId);
    
    // Only set if not already set
    if (!conversation.first_response_at) {
      const now = new Date().toISOString();
      await this.env.DB.prepare(`
        UPDATE conversations
        SET first_response_at = ?, updated_at = ?
        WHERE id = ? AND practice_id = ?
      `).bind(now, now, conversationId, practiceId).run();
    }
  }
}
