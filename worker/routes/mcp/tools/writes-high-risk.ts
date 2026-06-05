import type { Env } from '../../../types.js';
import type { McpToolDefinition } from '../toolDefinitions.js';
import { deriveHighRiskIdempotencyKey } from '../../../services/MCPIdempotency.js';
import type { McpToolContext, JsonRpcOutcome } from './dispatch.js';
import { toolOk, toolErr } from './dispatch.js';

/**
 * High-risk write tools (U11) — `send_invoice`, `record_payment`,
 * `refund_payment`.
 *
 * These tools NEVER execute the money-moving action directly. They
 * POST to the backend's "create pending action" endpoint, which mints
 * an approval JWT and a browser-confirm URL the lawyer must visit
 * (backend U3). The tool returns `{pending_action_id, approval_url,
 * expires_at}` immediately and the actual execution happens after
 * lawyer approval — Claude learns the outcome via the
 * `pending_action.completed` event class (U8's fan-out routes it back).
 *
 * Idempotency on the create-pending step is bucketed to 60 seconds:
 * Claude immediately re-asking after a transport error within the
 * same minute gets the SAME pending_action_id (cached create-pending
 * response); after the bucket rolls, a fresh pending action is minted.
 * This is the only non-deterministic aspect of MCP idempotency (plan
 * U12 calls this out).
 *
 * Trust-account / IOLTA refusal lands at the backend boundary per R16
 * (re-checked at execute time so a flag-flipped-during-approval-window
 * race is closed). Backend returns 422 with
 * `data.code: TRUST_ACCOUNT_NOT_SUPPORTED` which we propagate verbatim.
 *
 * Tool description tells Claude not to auto-retry on rejection — the
 * audit log records all decisions so a rejection is informative, not
 * a retryable failure.
 */

const isBackendReachable = (env: Env): boolean =>
  Boolean(env.BACKEND_API_URL && env.MCP_BACKEND_TOKEN);

interface HighRiskContext extends McpToolContext {
  tool_call_seq: string | number;
}

interface PendingActionResponse {
  pending_action_id?: string;
  approval_url?: string;
  expires_at?: string;
}

export const handleHighRiskTool = async (
  tool: McpToolDefinition,
  args: Record<string, unknown>,
  context: HighRiskContext,
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
      detail: 'Backend U3 pending — high-risk tools require the pending-actions endpoint.',
    });
  }

  if (!context.env.IDEMPOTENCY_SALT) {
    return toolErr(-32603, 'IDEMPOTENCY_SALT not configured', {
      code: 'CONFIG_MISSING',
      retryable: false,
    });
  }

  let idempotencyKey: string;
  try {
    idempotencyKey = await deriveHighRiskIdempotencyKey(context.env, {
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

  const url = `${context.env.BACKEND_API_URL!.replace(/\/$/, '')}${tool._meta.backend_path ?? ''}`;
  // The backend pending-actions endpoint receives the canonical tool
  // params plus the tool_name so the dispatcher (after lawyer approval)
  // knows which underlying action to execute.
  const requestBody = {
    tool_name: tool.name,
    tool_params: args,
  };

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
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    return toolErr(-32603, 'Backend fetch failed', {
      code: 'BACKEND_UNAVAILABLE',
      retryable: true,
      retry_after_ms: 5000,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  // Backend trust-account refusal (R16). The 422 status carries a
  // structured `data.code: TRUST_ACCOUNT_NOT_SUPPORTED`.
  if (response.status === 422) {
    let detail: PendingActionResponse | { code?: string; description?: string } = {};
    try {
      detail = (await response.json()) as typeof detail;
    } catch {
      // body unreadable; keep empty detail
    }
    const data = detail as { code?: string; description?: string; data?: { code?: string; description?: string } };
    const code = data.code ?? data.data?.code;
    const description = data.description ?? data.data?.description;
    if (code === 'TRUST_ACCOUNT_NOT_SUPPORTED') {
      return toolErr(-32603, description ?? 'Trust-account matter not supported by MCP', {
        code: 'TRUST_ACCOUNT_NOT_SUPPORTED',
        retryable: false,
        http_status: 422,
        detail: 'v1 MCP money tools refuse trust-account/IOLTA matters. Use the web UI for these.',
      });
    }
    return toolErr(-32602, 'Validation error', {
      code: 'IDEMPOTENCY_KEY_MISMATCH',
      retryable: false,
      http_status: 422,
      detail,
    });
  }

  if (response.status === 409) {
    return toolErr(-32603, 'Idempotent operation in flight', {
      code: 'IDEMPOTENCY_IN_FLIGHT',
      retryable: true,
      retry_after_ms: 2000,
      http_status: 409,
    });
  }
  if (response.status === 401 || response.status === 403) {
    return toolErr(-32603, `Backend rejected: ${response.status}`, {
      code: response.status === 403 ? 'BACKEND_FORBIDDEN' : 'BACKEND_AUTH_FAILED',
      retryable: false,
      http_status: response.status,
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
      // body unreadable
    }
    return toolErr(-32603, `Backend error ${response.status}`, {
      code: 'BACKEND_ERROR',
      retryable: response.status >= 500,
      retry_after_ms: response.status >= 500 ? 5000 : undefined,
      http_status: response.status,
      detail,
    });
  }

  let payload: PendingActionResponse;
  try {
    payload = (await response.json()) as PendingActionResponse;
  } catch {
    return toolErr(-32603, 'Backend returned non-JSON response', {
      code: 'BACKEND_MALFORMED',
      retryable: true,
    });
  }

  if (!payload.pending_action_id || !payload.approval_url) {
    return toolErr(-32603, 'Backend pending-actions response missing required fields', {
      code: 'BACKEND_MALFORMED',
      retryable: false,
      detail: 'Expected pending_action_id + approval_url',
    });
  }

  // Claude-facing text — leads with the action and the lawyer step.
  // The structured _meta surface carries the IDs Claude programmatically
  // tracks (matches the plan's tool description sketch in §High-Level
  // Technical Design).
  const text = [
    `I've prepared the ${tool.name.replace(/_/g, ' ')} request. ` +
      `Approve here: ${payload.approval_url}.`,
    payload.expires_at
      ? `The link expires at ${payload.expires_at}.`
      : 'The link expires in 10 minutes.',
    "I'll learn the outcome when the action completes and tell you.",
  ].join(' ');

  return toolOk({
    content: [{ type: 'text', text }],
    structuredContent: {
      pending_action_id: payload.pending_action_id,
      approval_url: payload.approval_url,
      expires_at: payload.expires_at ?? null,
      tool: tool.name,
    },
    _meta: {
      tool: tool.name,
      pending_action_id: payload.pending_action_id,
      approval_url: payload.approval_url,
      expires_at: payload.expires_at,
      idempotency_key: idempotencyKey,
      risk_tier: 'high_risk',
    },
  });
};
