import type { Env } from '../../../types.js';
import type { McpToolDefinition } from '../toolDefinitions.js';
import { deriveIdempotencyKey } from '../../../services/MCPIdempotency.js';
import type { McpToolContext, JsonRpcOutcome } from './dispatch.js';
import { toolOk, toolErr } from './dispatch.js';

/**
 * Direct-execution write tools (plan R9, U10).
 *
 * These tools execute synchronously against backend (no approval gate)
 * but all are audited via backend U2's middleware and use the
 * Idempotency-Key header to dedupe retries.
 *
 * Plan R14 key shape:
 *   sha256(IDEMPOTENCY_SALT || practice_id || tool_name ||
 *          canonical_json(params) || mcp_session_id || tool_call_seq)
 *
 * `tool_call_seq` here is the JSON-RPC `id` of the calling `tools/call`
 * message. The dispatcher passes this in via the context (added in U10).
 *
 * Conversation-visibility (message_client / request_documents_from_client):
 * the plan asks for a Worker-side courtesy check via
 * worker/utils/intakeVisibility.getAcceptedIntakeConversationIds. That
 * helper expects a Request with the user's Cookie / Authorization header
 * so it can call backend's accepted-conversations endpoint. MCP calls
 * carry only the OAuth Bearer JWT (which backend won't recognize until
 * U2 wires the service-token path), so the Worker pre-check would fail
 * even for legitimate calls. We defer the courtesy check until backend
 * U2 lands; backend is authoritative regardless — the plan explicitly
 * says "Worker check is courtesy; Backend is authoritative." Backend
 * will return a 403 with CONVERSATION_NOT_VISIBLE which we propagate
 * verbatim per the AGENTS.md fail-fast rule.
 */

const isBackendReachable = (env: Env): boolean =>
  Boolean(env.BACKEND_API_URL && env.MCP_BACKEND_TOKEN);

const PATH_PARAM_PATTERN = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;

interface DirectWriteContext extends McpToolContext {
  tool_call_seq: string | number;
}

const buildPathAndBody = (
  tool: McpToolDefinition,
  args: Record<string, unknown>,
): { path: string; body: Record<string, unknown> } => {
  const consumed = new Set<string>();
  const path = (tool._meta.backend_path ?? '').replace(PATH_PARAM_PATTERN, (_, param: string) => {
    const value = args[param];
    if (typeof value === 'string' && value.length > 0) {
      consumed.add(param);
      return encodeURIComponent(value);
    }
    return `:${param}`;
  });
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (!consumed.has(k) && v !== undefined) body[k] = v;
  }
  return { path, body };
};

export const handleDirectWriteTool = async (
  tool: McpToolDefinition,
  args: Record<string, unknown>,
  context: DirectWriteContext,
): Promise<JsonRpcOutcome> => {
  if (!tool._meta.backend_path) {
    return toolErr(-32603, `Tool ${tool.name} has no backend_path configured`, {
      code: 'CONFIG_ERROR',
      retryable: false,
    });
  }

  if (!isBackendReachable(context.env)) {
    return toolErr(-32603, 'Backend dependency not ready', {
      code: 'BACKEND_UNAVAILABLE',
      retryable: true,
      retry_after_ms: 5000,
      tool: tool.name,
    });
  }

  if (!context.env.IDEMPOTENCY_SALT) {
    return toolErr(-32603, 'IDEMPOTENCY_SALT not configured', {
      code: 'CONFIG_MISSING',
      retryable: false,
      detail: 'Direct-write tools refuse to execute without a salt — set IDEMPOTENCY_SALT before MCP rollout.',
    });
  }

  const { path, body } = buildPathAndBody(tool, args);

  let idempotencyKey: string;
  try {
    idempotencyKey = await deriveIdempotencyKey(context.env, {
      toolName: tool.name,
      practiceId: context.practice_id,
      mcpSessionId: context.session_id,
      toolCallSeq: context.tool_call_seq,
      params: args,
    });
  } catch (error) {
    return toolErr(-32603, 'Failed to derive Idempotency-Key', {
      code: 'INTERNAL_ERROR',
      retryable: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const url = `${context.env.BACKEND_API_URL!.replace(/\/$/, '')}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: tool._meta.backend_method ?? 'POST',
      headers: {
        Authorization: `Bearer ${context.env.MCP_BACKEND_TOKEN ?? ''}`,
        'X-Mcp-Practice-Id': context.practice_id,
        'X-Mcp-User-Id': context.user_id,
        'X-Mcp-Jti': context.jti,
        'Idempotency-Key': idempotencyKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return toolErr(-32603, 'Backend fetch failed', {
      code: 'BACKEND_UNAVAILABLE',
      retryable: true,
      retry_after_ms: 5000,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  // Map backend error codes to MCP-shaped error envelopes per plan
  // AGENTS.md fail-fast rule — Worker is a thin pass-through.
  if (response.status === 409) {
    return toolErr(-32603, 'Idempotent operation in flight', {
      code: 'IDEMPOTENCY_IN_FLIGHT',
      retryable: true,
      retry_after_ms: 2000,
      http_status: 409,
      idempotency_key: idempotencyKey,
    });
  }
  if (response.status === 422) {
    let detail: unknown = null;
    try {
      detail = await response.json();
    } catch {
      // body unreadable — keep null
    }
    return toolErr(-32602, 'Idempotency-Key payload mismatch', {
      code: 'IDEMPOTENCY_KEY_MISMATCH',
      retryable: false,
      http_status: 422,
      detail,
    });
  }
  if (response.status === 401 || response.status === 403) {
    let detail: unknown = null;
    try {
      detail = await response.json();
    } catch {
      // body unreadable — keep null
    }
    return toolErr(-32603, `Backend rejected: ${response.status}`, {
      code: response.status === 403 ? 'BACKEND_FORBIDDEN' : 'BACKEND_AUTH_FAILED',
      retryable: false,
      http_status: response.status,
      detail,
    });
  }
  if (response.status === 404) {
    return toolErr(-32603, 'Target resource not found', {
      code: 'NOT_FOUND',
      retryable: false,
      http_status: 404,
    });
  }
  if (response.status >= 400) {
    let detail: unknown = null;
    try {
      detail = await response.json();
    } catch {
      // body unreadable — keep null
    }
    return toolErr(-32603, `Backend error ${response.status}`, {
      code: 'BACKEND_ERROR',
      retryable: response.status >= 500,
      retry_after_ms: response.status >= 500 ? 5000 : undefined,
      http_status: response.status,
      detail,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return toolErr(-32603, 'Backend returned non-JSON response', {
      code: 'BACKEND_MALFORMED',
      retryable: true,
    });
  }

  return toolOk({
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    _meta: {
      tool: tool.name,
      source: 'backend',
      idempotency_key: idempotencyKey,
    },
  });
};
