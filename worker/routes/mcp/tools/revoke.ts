import { MCPRevocationCache } from '../../../services/MCPRevocationCache.js';
import { MCPSessionStore } from '../../../services/MCPSessionStore.js';
import type { McpToolContext, JsonRpcOutcome } from './dispatch.js';
import { toolOk } from './dispatch.js';

/**
 * revoke_my_session — R20.
 *
 * Plan: "Use case: Claude detects prompt injection in its own context,
 * or the lawyer says 'stop using MCP.' The tool triggers the same
 * revocation epoch increment + denylist add as the web UI revoke."
 *
 * Worker-only implementation — no backend dependency. The token's jti
 * is added to the denylist immediately so the next tool call (even
 * within the JWKS cache window) is rejected by U7's withMCPAuth.
 * Per-practice epoch is bumped so any *other* session for the same
 * practice also picks up the revocation within ≤30s on its next call.
 *
 * The DO row in D1 is dropped so settings UIs don't surface this
 * session as live, and the McpSession DO is asked to terminate its
 * own state (mirrors DELETE /api/mcp).
 *
 * Notes the `reason` argument in the response so an audit trail exists
 * even though the per-practice audit log is on backend U2.
 */

export const handleRevokeMySession = async (
  args: Record<string, unknown>,
  context: McpToolContext,
): Promise<JsonRpcOutcome> => {
  const reason = typeof args.reason === 'string' ? args.reason : null;
  const revocation = new MCPRevocationCache(context.env);
  const sessions = new MCPSessionStore(context.env);

  await Promise.all([
    revocation.revokeJti(context.jti),
    revocation.incrementPracticeEpoch(context.practice_id),
    sessions.deleteSession(context.session_id),
  ]);

  // Ask the DO to terminate. Best-effort — if the DO is already gone
  // (the session_id row was the only handle), terminating itself isn't
  // strictly needed. Any in-flight WebSocket gets closed when the DO
  // wakes for its next message.
  try {
    const stub = context.env.MCP_SESSION.get(
      context.env.MCP_SESSION.idFromName(context.session_id),
    );
    await stub.fetch('https://mcp-do/terminate', { method: 'DELETE' });
  } catch {
    // DO was already cold or unreachable; KV revocation alone is
    // authoritative for U7 to reject subsequent calls.
  }

  return toolOk({
    content: [
      {
        type: 'text',
        text: `Session revoked. Subsequent tool calls from this session will return SESSION_REVOKED within 30 seconds.${reason ? ` Reason recorded: ${reason}` : ''}`,
      },
    ],
    structuredContent: {
      revoked: true,
      session_id: context.session_id,
      reason: reason ?? null,
      propagation_ms: 30_000,
    },
  });
};
