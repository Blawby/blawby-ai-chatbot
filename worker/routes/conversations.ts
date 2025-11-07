import { Env } from '../types';
import { createSuccessResponse, handleError, HttpErrors } from '../errorHandler';
import { parseJsonBody } from '../utils.js';
import {
  requireConversationParticipant,
  requireOrgMember,
  userIsAdminOrOwner
} from '../middleware/auth';
import { ConversationService } from '../services/ConversationService.js';
import { ConversationMessageService } from '../services/ConversationMessageService.js';
import { NotificationService } from '../services/NotificationService.js';
import { MatterService } from '../services/MatterService.js';
import {
  getConversation,
  listParticipants,
  getMessage
} from '../services/ConversationRepository.js';

interface CreateConversationPayload {
  organizationId: string;
  matterId?: string | null;
  type: 'ai' | 'human' | 'mixed';
  title?: string | null;
  participantUserIds: Array<{ userId: string; role: 'client' | 'paralegal' | 'attorney' | 'admin' | 'owner' }>;
}

interface SendMessagePayload {
  content: string;
  replyToMessageId?: string | null;
  messageType?: 'text' | 'file' | 'system' | 'matter_update';
  clientNonce?: string;
}

interface MessageActionPayload {
  action: 'edit' | 'delete';
  content?: string;
  reason?: string | null;
}

interface MarkReadPayload {
  lastMessageId: string;
}

async function loadConversation(env: Env, conversationId: string) {
  const conversation = await getConversation(env, conversationId);
  if (!conversation) {
    throw HttpErrors.notFound('Conversation not found');
  }
  return conversation;
}

async function listConversationParticipants(env: Env, conversationId: string) {
  return listParticipants(env, conversationId);
}

async function getConversationMessage(env: Env, messageId: string) {
  return getMessage(env, messageId);
}

export async function handleConversations(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const basePath = '/api/conversations';
    const subPath = url.pathname.startsWith(basePath)
      ? url.pathname.slice(basePath.length)
      : '';
    const segments = subPath.split('/').filter(Boolean);

    if (segments.length === 0) {
      if (request.method === 'POST') {
        return await createConversation(request, env);
      }
      if (request.method === 'GET') {
        return await listConversations(request, env, url);
      }
      throw HttpErrors.methodNotAllowed('Unsupported method for /api/conversations');
    }

    const conversationId = segments[0];
    if (!conversationId) {
      throw HttpErrors.badRequest('Conversation id is required');
    }

    if (segments.length === 1) {
      if (request.method === 'GET') {
        return await getConversation(request, env, conversationId);
      }
      throw HttpErrors.methodNotAllowed('Unsupported method');
    }

    const action = segments[1];

    if (action === 'participants') {
      if (segments.length === 2 && request.method === 'POST') {
        return await addParticipant(request, env, conversationId);
      }
      if (segments.length === 3 && request.method === 'DELETE') {
        return await removeParticipant(request, env, conversationId, segments[2]);
      }
      throw HttpErrors.methodNotAllowed('Unsupported participants operation');
    }

    if (action === 'messages') {
      if (segments.length === 2 && request.method === 'POST') {
        return await sendMessage(request, env, conversationId);
      }
      if (segments.length === 2 && request.method === 'GET') {
        return await listMessages(request, env, conversationId, url);
      }
      if (segments.length === 3 && request.method === 'PATCH') {
        return await modifyMessage(request, env, conversationId, segments[2]);
      }
      throw HttpErrors.methodNotAllowed('Unsupported messages operation');
    }

    if (action === 'accept' && request.method === 'POST') {
      return await acceptConversation(request, env, conversationId);
    }

    if (action === 'reject' && request.method === 'POST') {
      return await rejectConversation(request, env, conversationId);
    }

    if (action === 'read' && request.method === 'POST') {
      return await markConversationRead(request, env, conversationId);
    }

    if (action === 'stream' && request.method === 'GET') {
      return await openConversationStream(request, env, conversationId);
    }

    throw HttpErrors.notFound('Unknown conversations endpoint');
  } catch (error) {
    return handleError(error);
  }
}

async function createConversation(request: Request, env: Env): Promise<Response> {
  const body = await parseJsonBody(request) as Partial<CreateConversationPayload>;

  if (!body.organizationId || typeof body.organizationId !== 'string') {
    throw HttpErrors.badRequest('organizationId is required');
  }
  if (!body.type || !['ai', 'human', 'mixed'].includes(body.type)) {
    throw HttpErrors.badRequest('Conversation type is required');
  }

  const auth = await requireOrgMember(request, env, body.organizationId, 'paralegal');

  const participants = Array.isArray(body.participantUserIds) ? body.participantUserIds : [];
  const participantMap = new Map<string, 'client' | 'paralegal' | 'attorney' | 'admin' | 'owner'>();

  for (const participant of participants) {
    if (!participant || typeof participant.userId !== 'string' || typeof participant.role !== 'string') {
      continue;
    }

    const normalizedRole = participant.role as 'client' | 'paralegal' | 'attorney' | 'admin' | 'owner';
    participantMap.set(participant.userId, normalizedRole);
  }

  const selfRole = (auth.memberRole as 'client' | 'paralegal' | 'attorney' | 'admin' | 'owner') ?? 'attorney';
  participantMap.set(auth.user.id, selfRole === 'client' ? 'attorney' : selfRole);

  const normalizedParticipants = Array.from(participantMap.entries()).map(([userId, role]) => ({
    userId,
    role
  }));

  const conversationService = new ConversationService(env);
  const { id } = await conversationService.createConversation({
    organizationId: body.organizationId,
    createdByUserId: auth.user.id,
    type: body.type,
    matterId: body.matterId ?? null,
    title: body.title ?? null,
    participantUserIds: normalizedParticipants
  });

  const conversation = await loadConversation(env, id);
  const participantsList = await listConversationParticipants(env, id);

  return createSuccessResponse({
    conversation,
    participants: participantsList
  });
}

async function listConversations(request: Request, env: Env, url: URL): Promise<Response> {
  const organizationId = url.searchParams.get('organizationId');
  if (!organizationId) {
    throw HttpErrors.badRequest('organizationId is required');
  }

  const { user, memberRole } = await requireOrgMember(request, env, organizationId);
  const status = url.searchParams.get('status');
  const allowedStatuses = new Set(['open', 'locked', 'archived']);
  if (status && !allowedStatuses.has(status)) {
    throw HttpErrors.badRequest('Invalid status filter');
  }
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? '20') || 20, 100));
  const cursor = url.searchParams.get('cursor');

  const params: unknown[] = [organizationId];
  let query = `SELECT id, organization_id, matter_id, type, status, title, created_by_user_id, created_at, updated_at, last_message_at
               FROM conversations WHERE organization_id = ?`;

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (!(memberRole === 'owner' || memberRole === 'admin')) {
    query += ' AND id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = ? AND organization_id = ? )';
    params.push(user.id, organizationId);
  }

  if (cursor) {
    query += ' AND datetime(updated_at) < datetime(?)';
    params.push(cursor);
  }

  query += ' ORDER BY datetime(updated_at) DESC LIMIT ?';
  params.push(limit + 1);

  const result = await env.DB.prepare(query).bind(...params).all();
  const records = result.results ?? [];

  const hasMore = records.length > limit;
  const items = hasMore ? records.slice(0, limit) : records;
  const nextCursor = hasMore && items.length > 0 ? (items[items.length - 1] as { updated_at: string }).updated_at : null;

  return createSuccessResponse({
    items,
    nextCursor
  });
}

async function getConversation(request: Request, env: Env, conversationId: string): Promise<Response> {
  const { organizationId } = await requireConversationParticipant(request, env, conversationId);
  const conversation = await loadConversation(env, conversationId);

  if (conversation.organization_id !== organizationId) {
    throw HttpErrors.forbidden('Conversation does not belong to this organization');
  }

  const participants = await listConversationParticipants(env, conversationId);
  return createSuccessResponse({
    conversation,
    participants
  });
}

async function addParticipant(request: Request, env: Env, conversationId: string): Promise<Response> {
  const conversation = await loadConversation(env, conversationId);
  const auth = await requireOrgMember(request, env, conversation.organization_id, 'paralegal');
  const body = await parseJsonBody(request) as Partial<{ userId: string; role: string }>;

  if (!body.userId || typeof body.userId !== 'string') {
    throw HttpErrors.badRequest('userId is required');
  }

  const role = (body.role ?? 'client') as 'client' | 'paralegal' | 'attorney' | 'admin' | 'owner';

  const memberCheck = await env.DB.prepare(
    'SELECT 1 FROM members WHERE organization_id = ? AND user_id = ?'
  ).bind(conversation.organization_id, body.userId).first();

  if (!memberCheck && role !== 'client') {
    throw HttpErrors.badRequest('User must be an organization member to be assigned this role');
  }

  const conversationService = new ConversationService(env);
  await conversationService.addParticipant(conversationId, conversation.organization_id, body.userId, role);

  await conversationService.broadcastEvent(conversationId, 'participant_added', {
    userId: body.userId,
    role,
    addedBy: auth.user.id
  });

  return createSuccessResponse({ success: true });
}

async function removeParticipant(request: Request, env: Env, conversationId: string, userId: string): Promise<Response> {
  const conversation = await loadConversation(env, conversationId);
  await requireOrgMember(request, env, conversation.organization_id, 'paralegal');

  const conversationService = new ConversationService(env);
  await conversationService.removeParticipant(conversationId, userId);

  await conversationService.broadcastEvent(conversationId, 'participant_removed', {
    userId
  });

  return createSuccessResponse({ success: true });
}

async function sendMessage(request: Request, env: Env, conversationId: string): Promise<Response> {
  const auth = await requireConversationParticipant(request, env, conversationId);
  const body = await parseJsonBody(request) as Partial<SendMessagePayload>;

  if (!body.content || typeof body.content !== 'string') {
    throw HttpErrors.badRequest('Message content is required');
  }

  const conversation = await loadConversation(env, conversationId);
  const conversationService = new ConversationService(env);
  const messageService = new ConversationMessageService(env);

  const { id } = await messageService.sendUserMessage({
    conversationId,
    organizationId: conversation.organization_id,
    senderUserId: auth.user.id,
    content: body.content,
    replyToMessageId: body.replyToMessageId ?? null,
    messageType: body.messageType ?? 'text',
    clientNonce: body.clientNonce
  });

  const message = await getConversationMessage(env, id);

  if (message) {
    await conversationService.broadcastEvent(conversationId, 'message', message);
  }

  const participants = await listConversationParticipants(env, conversationId);
  const recipientIds = participants
    .map(p => p.user_id)
    .filter(userId => userId !== auth.user.id);

  if (recipientIds.length > 0) {
    const notificationService = new NotificationService(env);
    await notificationService.sendConversationMessageNotification({
      organizationId: conversation.organization_id,
      conversationId,
      senderName: auth.user.name,
      messagePreview: body.content,
      recipientUserIds: recipientIds
    });
  }

  return createSuccessResponse({ message });
}

async function listMessages(request: Request, env: Env, conversationId: string, url: URL): Promise<Response> {
  const { organizationId } = await requireConversationParticipant(request, env, conversationId);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? '50') || 50, 200));
  const before = url.searchParams.get('before');

  const params: unknown[] = [conversationId, organizationId];
  let query = `SELECT id, conversation_id, organization_id, sender_user_id, role, content, message_type, reply_to_message_id,
                     metadata, is_edited, edited_at, is_deleted, deleted_at, created_at
              FROM conversation_messages
              WHERE conversation_id = ? AND organization_id = ?`;

  if (before) {
    query += ' AND datetime(created_at) < datetime(?)';
    params.push(before);
  }

  query += ' ORDER BY datetime(created_at) DESC LIMIT ?';
  params.push(limit + 1);

  const result = await env.DB.prepare(query).bind(...params).all();
  const records = result.results ?? [];

  const hasMore = records.length > limit;
  const messages = hasMore ? records.slice(0, limit) : records;
  const nextCursor = hasMore && messages.length > 0 ? (messages[messages.length - 1] as { created_at: string }).created_at : null;

  return createSuccessResponse({
    items: [...messages].reverse(),
    nextCursor
  });
}

async function modifyMessage(request: Request, env: Env, conversationId: string, messageId: string): Promise<Response> {
  const auth = await requireConversationParticipant(request, env, conversationId);
  const body = await parseJsonBody(request) as Partial<MessageActionPayload>;

  const message = await getConversationMessage(env, messageId);
  if (!message || message.conversation_id !== conversationId) {
    throw HttpErrors.notFound('Message not found');
  }

  if (body.action === 'edit') {
    if (!body.content || typeof body.content !== 'string') {
      throw HttpErrors.badRequest('Updated content is required');
    }

    if (message.sender_user_id !== auth.user.id) {
      throw HttpErrors.forbidden('Only the original sender may edit the message');
    }

    const messageService = new ConversationMessageService(env);
    const updated = await messageService.editMessage(messageId, auth.user.id, body.content);
    if (!updated) {
      throw HttpErrors.forbidden('Message can no longer be edited');
    }
    const refreshed = await getConversationMessage(env, messageId);
    if (refreshed) {
      const conversationService = new ConversationService(env);
      await conversationService.broadcastEvent(conversationId, 'message_updated', refreshed);
    }
    return createSuccessResponse({ message: refreshed });
  }

  if (body.action === 'delete') {
    const isPrivileged = await userIsAdminOrOwner(env, auth.user.id, message.organization_id);
    if (!isPrivileged && message.sender_user_id !== auth.user.id) {
      throw HttpErrors.forbidden('Insufficient permissions to delete this message');
    }

    const messageService = new ConversationMessageService(env);
    const deleted = await messageService.softDeleteMessage(messageId, conversationId);
    if (!deleted) {
      throw HttpErrors.badRequest('Message could not be deleted');
    }
    const refreshed = await getConversationMessage(env, messageId);
    if (refreshed) {
      const conversationService = new ConversationService(env);
      await conversationService.broadcastEvent(conversationId, 'message_deleted', refreshed);
    }
    return createSuccessResponse({ message: refreshed });
  }

  throw HttpErrors.badRequest('Unsupported message action');
}

async function markConversationRead(request: Request, env: Env, conversationId: string): Promise<Response> {
  const auth = await requireConversationParticipant(request, env, conversationId);
  const body = await parseJsonBody(request) as Partial<MarkReadPayload>;

  if (!body.lastMessageId || typeof body.lastMessageId !== 'string') {
    throw HttpErrors.badRequest('lastMessageId is required');
  }

  const message = await getConversationMessage(env, body.lastMessageId);
  if (!message || message.conversation_id !== conversationId) {
    throw HttpErrors.notFound('Message not found in conversation');
  }

  const messageService = new ConversationMessageService(env);
  await messageService.markLastRead(conversationId, auth.user.id, body.lastMessageId);

  const conversationService = new ConversationService(env);
  await conversationService.broadcastEvent(conversationId, 'read_receipt', {
    userId: auth.user.id,
    lastMessageId: body.lastMessageId
  });

  return createSuccessResponse({ success: true });
}

async function acceptConversation(request: Request, env: Env, conversationId: string): Promise<Response> {
  const conversation = await loadConversation(env, conversationId);
  const auth = await requireOrgMember(request, env, conversation.organization_id, 'attorney');

  if (!conversation.matter_id) {
    throw HttpErrors.badRequest('Conversation is not linked to a lead');
  }

  const matterService = new MatterService(env);
  const conversationService = new ConversationService(env);
  const messageService = new ConversationMessageService(env);
  const notificationService = new NotificationService(env);

  const transition = await matterService.acceptLead({
    organizationId: conversation.organization_id,
    matterId: conversation.matter_id,
    actorUserId: auth.user.id
  });

  await conversationService.setType(conversationId, 'human');
  await conversationService.addParticipant(conversationId, conversation.organization_id, auth.user.id, 'attorney');
  const systemMessage = await messageService.sendSystemMessage({
    conversationId,
    organizationId: conversation.organization_id,
    content: `${auth.user.name} accepted this matter`,
    messageType: 'system'
  });

  const systemRecord = await getConversationMessage(env, systemMessage.id);
  if (systemRecord) {
    await conversationService.broadcastEvent(conversationId, 'message', systemRecord);
  }

  const participants = await listConversationParticipants(env, conversationId);
  const clientParticipant = participants.find(participant => participant.role === 'client');
  const matterRecord = await env.DB.prepare(
    'SELECT matter_number FROM matters WHERE id = ? AND organization_id = ?'
  ).bind(conversation.matter_id, conversation.organization_id).first<{ matter_number: string | null }>();
  const matterNumber = matterRecord?.matter_number ?? undefined;
  if (clientParticipant) {
    await notificationService.sendConversationAcceptedNotification({
      organizationId: conversation.organization_id,
      conversationId,
      clientUserId: clientParticipant.user_id,
      actorName: auth.user.name,
      matterNumber
    });
  }

  return createSuccessResponse({
    status: 'accepted',
    matter: transition
  });
}

async function rejectConversation(request: Request, env: Env, conversationId: string): Promise<Response> {
  const conversation = await loadConversation(env, conversationId);
  const auth = await requireOrgMember(request, env, conversation.organization_id, 'attorney');
  const body = await parseJsonBody(request) as Partial<{ reason?: string | null }>;

  if (!conversation.matter_id) {
    throw HttpErrors.badRequest('Conversation is not linked to a lead');
  }

  const matterService = new MatterService(env);
  const conversationService = new ConversationService(env);
  const messageService = new ConversationMessageService(env);
  const notificationService = new NotificationService(env);

  const transition = await matterService.rejectLead({
    organizationId: conversation.organization_id,
    matterId: conversation.matter_id,
    actorUserId: auth.user.id,
    reason: body.reason ?? null
  });

  await conversationService.setStatus(conversationId, 'locked');
  const systemMessage = await messageService.sendSystemMessage({
    conversationId,
    organizationId: conversation.organization_id,
    content: `${auth.user.name} was unable to accept this matter`,
    messageType: 'matter_update',
    metadata: body.reason ? { reason: body.reason } : undefined
  });

  const systemRecord = await getConversationMessage(env, systemMessage.id);
  if (systemRecord) {
    await conversationService.broadcastEvent(conversationId, 'message', systemRecord);
  }

  const participants = await listConversationParticipants(env, conversationId);
  const clientParticipant = participants.find(participant => participant.role === 'client');
  const matterRecord = await env.DB.prepare(
    'SELECT matter_number FROM matters WHERE id = ? AND organization_id = ?'
  ).bind(conversation.matter_id, conversation.organization_id).first<{ matter_number: string | null }>();
  const matterNumber = matterRecord?.matter_number ?? undefined;
  if (clientParticipant) {
    await notificationService.sendConversationRejectedNotification({
      organizationId: conversation.organization_id,
      conversationId,
      clientUserId: clientParticipant.user_id,
      actorName: auth.user.name,
      reason: body.reason ?? undefined,
      matterNumber
    });
  }

  return createSuccessResponse({
    status: 'rejected',
    matter: transition
  });
}

async function openConversationStream(request: Request, env: Env, conversationId: string): Promise<Response> {
  await requireConversationParticipant(request, env, conversationId);
  const id = env.CONVERSATION_ROOM.idFromName(conversationId);
  const stub = env.CONVERSATION_ROOM.get(id);
  const response = await stub.fetch(`https://conversations/${conversationId}/stream`, { method: 'GET' });

  return new Response(response.body, {
    headers: response.headers,
    status: response.status
  });
}
