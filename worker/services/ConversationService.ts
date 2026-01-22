import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { RemoteApiService } from './RemoteApiService.js';
import { Logger } from '../utils/logger.js';
import { SessionAuditService } from './SessionAuditService.js';

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
  unread_count?: number | null;
  latest_seq?: number;
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
  client_id: string;
  seq: number;
  server_ts: string;
  token_count: number | null;
  created_at: string;
}

export interface CreateConversationOptions {
  practiceId: string;
  userId: string | null; // Null for anonymous users
  matterId?: string | null;
  participantUserIds: string[];
  metadata?: Record<string, unknown>;
  skipPracticeValidation?: boolean;
}

export interface GetMessagesOptions {
  limit?: number;
  cursor?: string;
  fromSeq?: number;
}

export interface GetMessagesResult {
  messages: ConversationMessage[];
  cursor?: string;
  hasMore?: boolean;
  latest_seq?: number;
  // undefined when sequence pagination not requested; null when no more pages.
  next_from_seq?: number | null;
  warning?: string;
}

export class ConversationService {
  constructor(private env: Env) {}

  private static readonly MAX_SYSTEM_MESSAGE_LENGTH = 4000;
  private static readonly MAX_METADATA_BYTES = 8 * 1024;

  /**
   * Create a new conversation
   * 
   * Validates practice_id exists in remote API before insert to prevent orphaned records.
   */
  async createConversation(options: CreateConversationOptions, request?: Request): Promise<Conversation> {
    if (!options.skipPracticeValidation) {
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

    const statements = [
      this.env.DB.prepare(`
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
      )
    ];

    for (const participantId of participants) {
      statements.push(
        this.env.DB.prepare(`
          INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id)
          VALUES (?, ?)
        `).bind(conversationId, participantId)
      );
    }

    await this.env.DB.batch(statements);

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
   * Get or create the Blawby System conversation for a user + practice.
   */
  async getOrCreateSystemConversation(options: {
    practiceId: string;
    userId: string;
    request?: Request;
    skipPracticeValidation?: boolean;
  }): Promise<Conversation> {
    const { practiceId, userId, request } = options;

    const record = await this.env.DB.prepare(`
      SELECT id
      FROM conversations
      WHERE practice_id = ?
        AND json_extract(user_info, '$.system_conversation') = 1
        AND EXISTS (SELECT 1 FROM json_each(participants) WHERE json_each.value = ?)
      ORDER BY created_at ASC
      LIMIT 1
    `).bind(practiceId, userId).first<{ id: string } | null>();

    if (record?.id) {
      return this.getConversation(record.id, practiceId);
    }

    return this.createConversation({
      practiceId,
      userId,
      matterId: null,
      participantUserIds: [],
      metadata: {
        title: 'Blawby System',
        system_conversation: true
      },
      skipPracticeValidation: options.skipPracticeValidation
    }, request);
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

    // Try to get most recent conversation (prefer active if present)
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
      ORDER BY (status = 'active') DESC, updated_at DESC
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
    const includeReadState = Boolean(options.userId);
    let query = includeReadState
      ? `
      SELECT 
        conversations.id,
        conversations.practice_id,
        conversations.user_id,
        conversations.matter_id,
        conversations.participants,
        conversations.user_info,
        conversations.status,
        conversations.closed_at,
        conversations.created_at,
        conversations.updated_at,
        conversations.latest_seq,
        CASE
          WHEN conversations.latest_seq > COALESCE(conversation_read_state.last_read_seq, 0)
            THEN conversations.latest_seq - COALESCE(conversation_read_state.last_read_seq, 0)
          ELSE 0
        END AS unread_count
      FROM conversations
      LEFT JOIN conversation_read_state
        ON conversation_read_state.conversation_id = conversations.id
       AND conversation_read_state.user_id = ?
      WHERE conversations.practice_id = ?
    `
      : `
      SELECT 
        id, practice_id, user_id, matter_id, participants, user_info, status, closed_at, created_at, updated_at, latest_seq
      FROM conversations
      WHERE practice_id = ?
    `;
    const bindings: unknown[] = includeReadState
      ? [options.userId, options.practiceId]
      : [options.practiceId];

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
      latest_seq?: number | null;
      unread_count?: number | null;
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
      unread_count: typeof record.unread_count === 'number' ? record.unread_count : null,
      latest_seq: typeof record.latest_seq === 'number' ? record.latest_seq : undefined,
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
        conversations.id,
        conversations.practice_id,
        conversations.user_id,
        conversations.matter_id,
        conversations.participants,
        conversations.user_info,
        conversations.status,
        conversations.closed_at,
        conversations.created_at,
        conversations.updated_at,
        conversations.latest_seq,
        CASE
          WHEN conversations.latest_seq > COALESCE(conversation_read_state.last_read_seq, 0)
            THEN conversations.latest_seq - COALESCE(conversation_read_state.last_read_seq, 0)
          ELSE 0
        END AS unread_count
      FROM conversations
      LEFT JOIN conversation_read_state
        ON conversation_read_state.conversation_id = conversations.id
       AND conversation_read_state.user_id = ?
      WHERE EXISTS (SELECT 1 FROM json_each(conversations.participants) WHERE json_each.value = ?)
    `;
    const bindings: unknown[] = [options.userId, options.userId];

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
      latest_seq?: number | null;
      unread_count?: number | null;
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
      unread_count: typeof record.unread_count === 'number' ? record.unread_count : null,
      latest_seq: typeof record.latest_seq === 'number' ? record.latest_seq : undefined,
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
    const newParticipantIds = mergedParticipants.filter(
      (participantId) => !conversation.participants.includes(participantId)
    );

    const statements = [
      this.env.DB.prepare(`
        UPDATE conversations
        SET participants = ?, updated_at = ?, membership_version = membership_version + 1
        WHERE id = ? AND practice_id = ?
      `).bind(
        JSON.stringify(mergedParticipants),
        now,
        conversationId,
        practiceId
      )
    ];

    for (const participantId of newParticipantIds) {
      statements.push(
        this.env.DB.prepare(`
          INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id)
          VALUES (?, ?)
        `).bind(conversationId, participantId)
      );
    }

    await this.env.DB.batch(statements);
    await this.notifyMembershipChanged(conversationId);

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
      SET user_id = ?, participants = ?, updated_at = ?, membership_version = membership_version + 1
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

    await this.env.DB.prepare(`
      INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id)
      VALUES (?, ?)
    `).bind(conversationId, userId).run();

    await this.notifyMembershipChanged(conversationId);

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
    await this.getConversation(conversationId, practiceId);

    const record = await this.env.DB.prepare(`
      SELECT 1
      FROM conversation_participants
      WHERE conversation_id = ? AND user_id = ?
    `).bind(conversationId, userId).first();

    if (!record) {
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
    request?: Request;
  }): Promise<ConversationMessage> {
    // Validate practice exists in remote API to prevent orphaned records
    const practiceExists = await RemoteApiService.validatePractice(
      this.env,
      options.practiceId,
      options.request
    );
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

    const role = options.role || 'user';
    if (role === 'assistant') {
      throw HttpErrors.badRequest('Assistant role is not supported for user-to-user chat');
    }

    const ack = await this.postChatRoomMessage({
      conversationId: options.conversationId,
      userId: options.senderUserId,
      role,
      content: options.content,
      metadata: options.metadata,
      clientId: crypto.randomUUID()
    });

    return this.getMessage(ack.messageId);
  }

  /**
   * Send a system message to a conversation without requiring participant access.
   */
  async sendSystemMessage(options: {
    conversationId: string;
    practiceId: string;
    content: string;
    role?: 'system';
    metadata?: Record<string, unknown>;
    recipientUserId?: string;
    auditEventType?: string;
    auditActorType?: 'user' | 'lawyer' | 'system';
    auditActorId?: string | null;
    auditPayload?: Record<string, unknown>;
    skipPracticeValidation?: boolean;
    request?: Request;
  }): Promise<ConversationMessage> {
    const trimmedContent = typeof options.content === 'string' ? options.content.trim() : '';
    if (!trimmedContent) {
      throw HttpErrors.badRequest('System message content is required');
    }
    if (trimmedContent.length > ConversationService.MAX_SYSTEM_MESSAGE_LENGTH) {
      throw HttpErrors.badRequest(`System message content exceeds ${ConversationService.MAX_SYSTEM_MESSAGE_LENGTH} characters`);
    }

    if (!options.skipPracticeValidation) {
      const practiceExists = await RemoteApiService.validatePractice(
        this.env,
        options.practiceId,
        options.request
      );
      if (!practiceExists) {
        Logger.error('Attempted to send system message with invalid practice_id', {
          practiceId: options.practiceId,
          conversationId: options.conversationId,
          anomaly: 'invalid_practice_id_on_system_message',
          severity: 'high'
        });
        throw HttpErrors.notFound(`Practice not found: ${options.practiceId}`);
      }
    }

    await this.getConversation(options.conversationId, options.practiceId);
    if (options.recipientUserId) {
      await this.validateParticipantAccess(options.conversationId, options.practiceId, options.recipientUserId);
    }

    const role = options.role || 'system';
    if (role !== 'system') {
      throw HttpErrors.badRequest('System messages must use system role');
    }

    const metadata = options.metadata ?? null;
    if (metadata !== null) {
      if (typeof metadata !== 'object' || Array.isArray(metadata)) {
        throw HttpErrors.badRequest('System message metadata must be an object');
      }
      let encoded: string;
      try {
        encoded = JSON.stringify(metadata);
      } catch {
        throw HttpErrors.badRequest('System message metadata must be serializable');
      }
      const metadataBytes = new TextEncoder().encode(encoded).length;
      if (metadataBytes > ConversationService.MAX_METADATA_BYTES) {
        throw HttpErrors.badRequest('System message metadata exceeds size limit');
      }
    }

    const ack = await this.postChatRoomMessage({
      conversationId: options.conversationId,
      userId: null,
      role,
      content: trimmedContent,
      metadata: metadata ?? undefined,
      clientId: crypto.randomUUID()
    });

    const message = await this.getMessage(ack.messageId);

    if (options.auditEventType) {
      const auditService = new SessionAuditService(this.env);
      await auditService.createEvent({
        conversationId: options.conversationId,
        practiceId: options.practiceId,
        eventType: options.auditEventType,
        actorType: options.auditActorType ?? 'system',
        actorId: options.auditActorId ?? null,
        payload: options.auditPayload ?? { conversationId: options.conversationId }
      });
    }

    return message;
  }

  /**
   * Prune conversation messages by age and count.
   */
  async pruneConversationMessages(options: {
    conversationId: string;
    retentionDays: number;
    maxMessages: number;
  }): Promise<void> {
    const cutoff = new Date(Date.now() - options.retentionDays * 24 * 60 * 60 * 1000).toISOString();
    await this.env.DB.prepare(`
      DELETE FROM chat_messages
      WHERE conversation_id = ?
        AND created_at < ?
    `).bind(options.conversationId, cutoff).run();

    await this.env.DB.prepare(`
      DELETE FROM chat_messages
      WHERE conversation_id = ?
        AND id IN (
          SELECT id
          FROM chat_messages
          WHERE conversation_id = ?
          ORDER BY created_at DESC
          LIMIT -1 OFFSET ?
        )
    `).bind(options.conversationId, options.conversationId, options.maxMessages).run();
  }

  private async postChatRoomMessage(options: {
    conversationId: string;
    userId: string | null;
    role: 'user' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
    clientId: string;
  }): Promise<{ messageId: string; seq: number; serverTs: string }> {
    const stub = this.env.CHAT_ROOM.get(this.env.CHAT_ROOM.idFromName(options.conversationId));
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const response = await stub.fetch('https://chat-room/internal/message', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        conversation_id: options.conversationId,
        user_id: options.userId,
        role: options.role,
        content: options.content,
        metadata: options.metadata ?? null,
        client_id: options.clientId
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      throw HttpErrors.internalServerError(`ChatRoom message failed: ${text}`);
    }

    const payload = await response.json().catch(() => null) as {
      data?: {
        message_id?: string;
        seq?: number;
        server_ts?: string;
      };
    } | null;

    if (!payload?.data?.message_id || payload.data.seq === undefined || !payload.data.server_ts) {
      throw HttpErrors.internalServerError('ChatRoom message response invalid');
    }

    return {
      messageId: payload.data.message_id,
      seq: payload.data.seq,
      serverTs: payload.data.server_ts
    };
  }

  /**
   * Get a single message by ID
   */
  async getMessage(messageId: string): Promise<ConversationMessage> {
    const record = await this.env.DB.prepare(`
      SELECT 
        id,
        conversation_id,
        practice_id,
        user_id,
        role,
        content,
        metadata,
        client_id,
        seq,
        server_ts,
        token_count,
        created_at
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
      client_id: string;
      seq: number;
      server_ts: string;
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
      client_id: record.client_id,
      seq: record.seq,
      server_ts: record.server_ts,
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

    if (options.fromSeq !== undefined) {
      const latestRecord = await this.env.DB.prepare(`
        SELECT latest_seq
        FROM conversations
        WHERE id = ? AND practice_id = ?
      `).bind(conversationId, practiceId).first<{ latest_seq: number } | null>();

      if (!latestRecord || latestRecord.latest_seq === null || latestRecord.latest_seq === undefined) {
        return {
          messages: [],
          latest_seq: undefined,
          next_from_seq: null,
          warning: 'latest_seq unavailable - migrations required'
        };
      }

      const records = await this.env.DB.prepare(`
        SELECT
          id,
          conversation_id,
          practice_id,
          user_id,
          role,
          content,
          metadata,
          client_id,
          seq,
          server_ts,
          token_count,
          created_at
        FROM chat_messages
        WHERE conversation_id = ? AND practice_id = ? AND seq >= ?
        ORDER BY seq ASC
        LIMIT ?
      `).bind(
        conversationId,
        practiceId,
        options.fromSeq,
        limit
      ).all<{
        id: string;
        conversation_id: string;
        practice_id: string;
        user_id: string | null;
        role: string;
        content: string;
        metadata: string | null;
        client_id: string;
        seq: number;
        server_ts: string;
        token_count: number | null;
        created_at: string;
      }>();

      const messages = records.results.map(record => ({
        id: record.id,
        conversation_id: record.conversation_id,
        practice_id: record.practice_id,
        user_id: record.user_id,
        role: record.role as ConversationMessage['role'],
        content: record.content,
        metadata: record.metadata ? JSON.parse(record.metadata) : null,
        client_id: record.client_id,
        seq: record.seq,
        server_ts: record.server_ts,
        token_count: record.token_count,
        created_at: record.created_at
      }));

      const latestSeq = Number(latestRecord.latest_seq);
      let nextFromSeq: number | null = null;
      if (messages.length > 0) {
        const lastSeq = messages[messages.length - 1].seq;
        if (lastSeq < latestSeq) {
          nextFromSeq = lastSeq + 1;
        }
      }

      return {
        messages,
        latest_seq: latestSeq,
        next_from_seq: nextFromSeq
      };
    }

    let query = `
      SELECT 
        id,
        conversation_id,
        practice_id,
        user_id,
        role,
        content,
        metadata,
        client_id,
        seq,
        server_ts,
        token_count,
        created_at
      FROM chat_messages
      WHERE conversation_id = ? AND practice_id = ?
    `;
    const bindings: unknown[] = [conversationId, practiceId];

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
      client_id: string;
      seq: number;
      server_ts: string;
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
      client_id: record.client_id,
      seq: record.seq,
      server_ts: record.server_ts,
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
   * List conversations for a practice workspace (all practice conversations).
   */
  async getPracticeConversations(options: {
    practiceId: string;
    userId?: string;
    status?: 'active' | 'archived' | 'closed';
    limit?: number;
    offset?: number;
    sortBy?: 'last_message_at' | 'created_at' | 'priority';
    sortOrder?: 'asc' | 'desc';
  }): Promise<Conversation[]> {
    const limit = Math.min(options.limit || 50, 100);
    const offset = options.offset || 0;
    const sortBy = options.sortBy || 'last_message_at';
    const sortOrder = options.sortOrder || 'desc';

    const includeReadState = Boolean(options.userId);
    let query = includeReadState
      ? `
      SELECT 
        conversations.id,
        conversations.practice_id,
        conversations.user_id,
        conversations.matter_id,
        conversations.participants,
        conversations.user_info,
        conversations.status,
        conversations.assigned_to,
        conversations.priority,
        conversations.tags,
        conversations.internal_notes,
        conversations.last_message_at,
        conversations.first_response_at,
        conversations.closed_at,
        conversations.created_at,
        conversations.updated_at,
        conversations.latest_seq,
        CASE
          WHEN conversations.latest_seq > COALESCE(conversation_read_state.last_read_seq, 0)
            THEN conversations.latest_seq - COALESCE(conversation_read_state.last_read_seq, 0)
          ELSE 0
        END AS unread_count
      FROM conversations
      LEFT JOIN conversation_read_state
        ON conversation_read_state.conversation_id = conversations.id
       AND conversation_read_state.user_id = ?
      WHERE conversations.practice_id = ?
    `
      : `
      SELECT 
        id, practice_id, user_id, matter_id, participants, user_info, status,
        assigned_to, priority, tags, internal_notes, last_message_at, first_response_at,
        closed_at, created_at, updated_at, latest_seq
      FROM conversations
      WHERE practice_id = ?
    `;
    const bindings: unknown[] = includeReadState
      ? [options.userId, options.practiceId]
      : [options.practiceId];

    if (options.status) {
      query += ' AND conversations.status = ?';
      bindings.push(options.status);
    }

    const sortColumnMap: Record<string, string> = {
      'last_message_at': 'COALESCE(last_message_at, created_at)',
      'created_at': 'created_at',
      'priority': 'priority'
    };
    const validSortColumn = sortColumnMap[sortBy] || sortColumnMap['last_message_at'];
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
      latest_seq?: number | null;
      unread_count?: number | null;
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
      assigned_to: record.assigned_to || null,
      priority: (record.priority || 'normal') as Conversation['priority'],
      tags: record.tags ? JSON.parse(record.tags) as string[] : undefined,
      internal_notes: record.internal_notes || null,
      last_message_at: record.last_message_at || null,
      first_response_at: record.first_response_at || null,
      closed_at: record.closed_at || null,
      unread_count: typeof record.unread_count === 'number' ? record.unread_count : null,
      latest_seq: typeof record.latest_seq === 'number' ? record.latest_seq : undefined,
      created_at: record.created_at,
      updated_at: record.updated_at
    }));
  }

  private async notifyMembershipChanged(conversationId: string, removedUserId?: string): Promise<void> {
    if (!this.env.CHAT_ROOM) {
      return;
    }

    const record = await this.env.DB.prepare(`
      SELECT membership_version
      FROM conversations
      WHERE id = ?
    `).bind(conversationId).first<{ membership_version: number } | null>();

    if (!record || record.membership_version === null || record.membership_version === undefined) {
      return;
    }

    const payload: Record<string, unknown> = {
      conversation_id: conversationId,
      membership_version: record.membership_version
    };
    if (removedUserId) {
      payload.removed_user_id = removedUserId;
    }

    try {
      const stub = this.env.CHAT_ROOM.get(this.env.CHAT_ROOM.idFromName(conversationId));
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      await stub.fetch('https://chat-room/internal/membership-revoked', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
    } catch (error) {
      Logger.warn('Failed to notify ChatRoom membership change', {
        conversationId,
        removedUserId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
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
