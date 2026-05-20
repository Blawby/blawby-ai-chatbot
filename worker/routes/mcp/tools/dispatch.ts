import type { Env } from '../../../types.js';
import {
  ALL_TOOL_DEFINITIONS,
  findToolByName,
  projectToolForList,
  type McpToolDefinition,
} from '../toolDefinitions.js';
import { handleReadTool } from './read.js';
import { handleBriefingTool } from './briefing.js';
import { handleRevokeMySession } from './revoke.js';
import { handleDirectWriteTool } from './writes-direct.js';

/**
 * Tool dispatch — entry point the McpSession DO calls for tools/list
 * and tools/call. Handles scope enforcement, returns JSON-RPC shaped
 * responses (results or errors).
 *
 * The dispatcher knows three tool families:
 *   * Read tools — proxied to backend with X-Mcp-* identity headers
 *     (worker/routes/mcp/tools/read.ts)
 *   * Briefing — synthesis across multiple reads (worker/routes/mcp/tools/briefing.ts)
 *   * revoke_my_session — Worker-only, mutates revocation epoch
 *     (worker/routes/mcp/tools/revoke.ts)
 *
 * U10 adds direct-write tools; U11 adds high-risk tools — both register
 * with this dispatcher.
 */

export interface McpToolContext {
  session_id: string;
  practice_id: string;
  user_id: string;
  jti: string;
  scopes: ReadonlySet<string>;
  env: Env;
  /**
   * Set by the DO when invoking via tools/call — the JSON-RPC request
   * id. Write tools combine this with practice + tool + params to derive
   * a deterministic Idempotency-Key (plan R14). Optional because read
   * tools and the briefing don't need it.
   */
  tool_call_seq?: string | number;
}

export type JsonRpcOk = { ok: true; result: unknown };
export type JsonRpcErr = {
  ok: false;
  error: { code: number; message: string; data?: Record<string, unknown> };
};
export type JsonRpcOutcome = JsonRpcOk | JsonRpcErr;

export const isOk = (outcome: JsonRpcOutcome): outcome is JsonRpcOk => outcome.ok === true;
export const isErr = (outcome: JsonRpcOutcome): outcome is JsonRpcErr => outcome.ok === false;

const ok = (result: unknown): JsonRpcOk => ({ ok: true, result });

const err = (code: number, message: string, data?: Record<string, unknown>): JsonRpcErr => ({
  ok: false,
  error: { code, message, ...(data !== undefined ? { data } : {}) },
});

export const listTools = (): JsonRpcOk =>
  ok({ tools: ALL_TOOL_DEFINITIONS.map(projectToolForList) });

const checkScope = (
  tool: McpToolDefinition,
  context: McpToolContext,
): JsonRpcErr | null => {
  if (context.scopes.has(tool.requiredScope)) return null;
  return err(-32002, `Insufficient scope: ${tool.requiredScope}`, {
    code: 'SCOPE_INSUFFICIENT',
    retryable: false,
    required_scope: tool.requiredScope,
    granted_scopes: Array.from(context.scopes),
  });
};

export const dispatchToolCall = async (
  toolName: string,
  args: Record<string, unknown>,
  context: McpToolContext,
): Promise<JsonRpcOutcome> => {
  const tool = findToolByName(toolName);
  if (!tool) {
    return err(-32601, `Unknown tool: ${toolName}`, {
      code: 'UNKNOWN_TOOL',
      retryable: false,
    });
  }

  const scopeError = checkScope(tool, context);
  if (scopeError) return scopeError;

  try {
    // Synthesis + Worker-only tools dispatched by name.
    if (tool.name === 'get_practice_briefing') return await handleBriefingTool(args, context);
    if (tool.name === 'revoke_my_session') return await handleRevokeMySession(args, context);

    // Risk-tier dispatch: direct writes need tool_call_seq for idempotency
    // derivation (U10), reads don't.
    if (tool._meta.risk_tier === 'direct_write') {
      return await handleDirectWriteTool(tool, args, {
        ...context,
        tool_call_seq: context.tool_call_seq ?? 'unknown',
      });
    }
    return await handleReadTool(tool, args, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool execution failed';
    return err(-32603, message, {
      code: 'INTERNAL_ERROR',
      retryable: true,
    });
  }
};

export { ok as toolOk, err as toolErr };
