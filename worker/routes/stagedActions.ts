import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { requirePracticeMember } from '../middleware/auth.js';

interface StagedActionRow {
  id: string;
  tool_name: string;
  status: string;
  approval_summary_json: string;
  created_at: string;
  conversation_id: string;
}

export interface StagedActionItem {
  id: string;
  toolName: string;
  title: string;
  description: string;
  createdAt: string;
  conversationId: string;
}

export async function handleStagedActions(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/practice\/([^/]+)\/staged-actions$/);
  if (!match) throw HttpErrors.notFound('Route not found');

  const practiceId = decodeURIComponent(match[1] ?? '');
  if (!practiceId) throw HttpErrors.badRequest('Practice ID required');

  await requirePracticeMember(request, env, practiceId, 'paralegal');

  if (request.method !== 'GET') throw HttpErrors.methodNotAllowed('Method not allowed');

  const rows = await env.DB.prepare(`
    SELECT id, tool_name, status, approval_summary_json, created_at, conversation_id
    FROM practice_assistant_actions
    WHERE practice_id = ? AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 5
  `).bind(practiceId).all<StagedActionRow>();

  const actions: StagedActionItem[] = (rows.results ?? []).map((row) => {
    let title = row.tool_name;
    let description = '';
    try {
      const summary = JSON.parse(row.approval_summary_json) as { title?: string; description?: string };
      title = summary.title ?? title;
      description = summary.description ?? '';
    } catch { /* use defaults */ }
    return {
      id: row.id,
      toolName: row.tool_name,
      title,
      description,
      createdAt: row.created_at,
      conversationId: row.conversation_id,
    };
  });

  return new Response(JSON.stringify({ actions }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
