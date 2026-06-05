/**
 * GET  /api/admin/intake-events/:conversationId           — list timeline turns
 * POST /api/admin/intake-events/:conversationId/clear-failure — unbrick a
 *      conversation post-incident (engineer escape hatch from U6).
 *
 * Gated by `withEngineerAllowlist(withAuth(..., { required: true }))`.
 * snake_case at the wire boundary per docs/engineering/AUTHENTICATION_ARCHITECTURE.md.
 * Every successful hit fires `admin.intake_inspector.access` for forensic audit.
 *
 * See U9 of docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md.
 */

import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { HttpError } from '../types.js';
import { Logger } from '../utils/logger.js';
import { IntakeEventService } from '../services/IntakeEventService.js';
import { ConversationService } from '../services/ConversationService.js';
import { getAuthenticatedEngineerEmail } from '../middleware/withEngineerAllowlist.js';

const CONVERSATION_ID_PATTERN = /^\/api\/admin\/intake-events\/([^/]+)(?:\/(clear-failure))?\/?$/;

function parsePath(pathname: string): { conversationId: string; action: 'list' | 'clear_failure' } | null {
  const match = CONVERSATION_ID_PATTERN.exec(pathname);
  if (!match) return null;
  const conversationId = decodeURIComponent(match[1] ?? '').trim();
  if (!conversationId) return null;
  return {
    conversationId,
    action: match[2] === 'clear-failure' ? 'clear_failure' : 'list',
  };
}

async function loadConversationOr404(
  service: ConversationService,
  conversationId: string,
): Promise<{ id: string; practice_id: string; ai_failed_at: string | null; intake_mode_activated_at: string | null } | null> {
  try {
    const conv = await service.getConversationById(conversationId);
    return {
      id: conv.id,
      practice_id: conv.practice_id,
      ai_failed_at: conv.ai_failed_at ?? null,
      intake_mode_activated_at: conv.intake_mode_activated_at ?? null,
    };
  } catch (error) {
    // ConversationService.getConversationById throws HttpErrors.notFound (status 404)
    // when the row is missing. Match on status, not message text, so the check
    // doesn't drift if the message is reworded.
    if (error instanceof HttpError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Single entry point for both routes. Dispatches by HTTP method + path suffix.
 */
export async function handleAdminIntakeInspector(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parsed = parsePath(url.pathname);
  if (!parsed) {
    throw HttpErrors.notFound('Invalid intake-inspector path');
  }
  const engineerEmail = getAuthenticatedEngineerEmail(request);

  const conversationService = new ConversationService(env);
  const conversation = await loadConversationOr404(conversationService, parsed.conversationId);
  if (!conversation) {
    return jsonResponse({ error: 'not_found', conversation_id: parsed.conversationId }, 404);
  }

  if (parsed.action === 'list') {
    if (request.method !== 'GET') {
      throw HttpErrors.methodNotAllowed('Method not allowed');
    }
    const intakeEventService = new IntakeEventService(env);
    const turns = await intakeEventService.listByConversation(parsed.conversationId);

    Logger.info('admin.intake_inspector.access', {
      action: 'list',
      engineerEmail,
      conversationId: parsed.conversationId,
      practiceId: conversation.practice_id,
      turnCount: turns.length,
    });

    return jsonResponse(
      {
        conversation_id: parsed.conversationId,
        practice_id: conversation.practice_id,
        ai_failed_at: conversation.ai_failed_at,
        intake_mode_activated_at: conversation.intake_mode_activated_at,
        turns,
      },
      200,
    );
  }

  // clear_failure
  if (request.method !== 'POST') {
    throw HttpErrors.methodNotAllowed('Method not allowed');
  }
  await conversationService.clearAiFailed(parsed.conversationId, conversation.practice_id);

  Logger.info('admin.intake_inspector.access', {
    action: 'clear_failure',
    engineerEmail,
    conversationId: parsed.conversationId,
    practiceId: conversation.practice_id,
  });

  return jsonResponse(
    {
      conversation_id: parsed.conversationId,
      practice_id: conversation.practice_id,
      ai_failed_at: null,
    },
    200,
  );
}
