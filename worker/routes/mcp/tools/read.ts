import type { Env } from '../../../types.js';
import { wrapUntrusted } from '../../../utils/wrapUntrusted.js';
import type { McpToolDefinition } from '../toolDefinitions.js';
import type { McpToolContext, JsonRpcOutcome } from './dispatch.js';
import { toolOk, toolErr } from './dispatch.js';

/**
 * Generic read-tool handler — proxies to the backend at the path
 * declared in the tool's `_meta.backend_path`, injecting MCP identity
 * via headers the backend trusts.
 *
 * Backend trusts the Worker because:
 *   1. `Authorization: Bearer ${MCP_BACKEND_TOKEN}` is the service token
 *      shared between Worker and Backend (same factor used for the
 *      Worker→Backend events channel — separate from the user JWT)
 *   2. `X-Mcp-Practice-Id` / `X-Mcp-User-Id` / `X-Mcp-Jti` carry the
 *      validated user identity the Worker pulled from the OAuth JWT in
 *      U7's withMCPAuth
 *
 * Until Backend U1/U2 wires `Authorization: Bearer ${MCP_BACKEND_TOKEN}`
 * into its practice context resolver, calls return BACKEND_UNAVAILABLE
 * per the plan's fail-fast rule.
 */

const PATH_PARAM_PATTERN = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;

const buildPath = (
  template: string,
  args: Record<string, unknown>,
  context: McpToolContext,
): { path: string; queryArgs: Record<string, unknown> } => {
  const consumed = new Set<string>();
  const path = template.replace(PATH_PARAM_PATTERN, (_, param: string) => {
    if (param === 'practice_id') {
      consumed.add(param);
      return encodeURIComponent(context.practice_id);
    }
    const value = args[param];
    if (typeof value === 'string' && value.length > 0) {
      consumed.add(param);
      return encodeURIComponent(value);
    }
    // Path param missing or wrong type — keep the literal `:param` so the
    // call fails loudly at the backend rather than silently dropping it.
    return `:${param}`;
  });
  const queryArgs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (!consumed.has(k)) queryArgs[k] = v;
  }
  return { path, queryArgs };
};

const buildQuery = (params: Record<string, unknown>, practiceId: string): string => {
  const search = new URLSearchParams();
  // Backend filters by practice via header (X-Mcp-Practice-Id) but the
  // existing list endpoints (matters, intakes) also accept ?practice_id=.
  // Include both for compatibility; backend uses whichever it trusts.
  search.set('practice_id', practiceId);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item !== undefined && item !== null) search.append(k, String(item));
      }
    } else {
      search.set(k, String(v));
    }
  }
  return search.toString();
};

const backendCallHeaders = (env: Env, context: McpToolContext): Record<string, string> => ({
  Authorization: `Bearer ${env.MCP_BACKEND_TOKEN ?? ''}`,
  'X-Mcp-Practice-Id': context.practice_id,
  'X-Mcp-User-Id': context.user_id,
  'X-Mcp-Jti': context.jti,
  Accept: 'application/json',
});

const isBackendReachable = (env: Env): boolean =>
  Boolean(env.BACKEND_API_URL && env.MCP_BACKEND_TOKEN);

const backendUnavailableError = (toolName: string): JsonRpcOutcome =>
  toolErr(-32603, 'Backend dependency not ready', {
    code: 'BACKEND_UNAVAILABLE',
    retryable: true,
    retry_after_ms: 5000,
    tool: toolName,
    detail:
      'The backend is missing MCP_BACKEND_TOKEN bridge OR BACKEND_API_URL config. Lawyer dogfooding requires backend U1/U2.',
  });

/**
 * `list_clients` PII gate: collapse the wire shape down to the
 * identity-minimal projection per R19. Worker enforces this regardless
 * of what backend sends — defense in depth against accidental over-share.
 */
const projectClientForList = (record: Record<string, unknown>): Record<string, unknown> => ({
  client_id: record.client_id ?? record.id,
  display_name:
    typeof record.display_name === 'string'
      ? wrapUntrusted(record.display_name, 'client.display_name')
      : record.display_name,
  primary_contact_channel: record.primary_contact_channel ?? null,
  intake_status: record.intake_status ?? null,
});

/**
 * Walk known free-text fields and wrap them with the untrusted-input
 * marker. Conservative — better to over-wrap than under-wrap.
 */
const sanitizeFreeTextFields = (toolName: string, body: unknown): unknown => {
  if (!body || typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map((item) => sanitizeFreeTextFields(toolName, item));

  // Special-case list_clients to enforce the identity-minimal projection
  // before wrapping fires.
  if (toolName === 'list_clients') {
    const r = body as Record<string, unknown>;
    if (Array.isArray(r.results)) {
      return {
        ...r,
        results: r.results.map((c) =>
          c && typeof c === 'object' && !Array.isArray(c)
            ? projectClientForList(c as Record<string, unknown>)
            : c,
        ),
      };
    }
    return r;
  }

  const record = body as Record<string, unknown>;
  const out: Record<string, unknown> = { ...record };

  // Wrap text fields by name. Source attribute tells Claude where this
  // text originated so prompt-injection attempts can be ignored.
  const WRAP_FIELDS: Record<string, string> = {
    description: 'intake.description',
    body: 'note.body',
    content: 'message.content',
    note: 'matter.note',
    summary: 'intake.summary',
    matter_summary: 'matter.summary',
  };
  for (const [key, source] of Object.entries(WRAP_FIELDS)) {
    if (typeof out[key] === 'string') {
      out[key] = wrapUntrusted(out[key] as string, source);
    }
  }
  // Recurse into common collection shapes.
  for (const key of ['notes', 'messages', 'time_entries', 'milestones', 'tasks', 'results']) {
    if (Array.isArray(out[key])) {
      out[key] = sanitizeFreeTextFields(toolName, out[key]);
    }
  }
  return out;
};

export const handleReadTool = async (
  tool: McpToolDefinition,
  args: Record<string, unknown>,
  context: McpToolContext,
): Promise<JsonRpcOutcome> => {
  if (!tool._meta.backend_path) {
    return toolErr(-32603, `Tool ${tool.name} has no backend_path configured`, {
      code: 'CONFIG_ERROR',
      retryable: false,
    });
  }

  if (!isBackendReachable(context.env)) {
    return backendUnavailableError(tool.name);
  }

  const { path, queryArgs } = buildPath(tool._meta.backend_path, args, context);
  const query = buildQuery(queryArgs, context.practice_id);
  const url = `${context.env.BACKEND_API_URL!.replace(/\/$/, '')}${path}${query ? `?${query}` : ''}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: tool._meta.backend_method ?? 'GET',
      headers: backendCallHeaders(context.env, context),
    });
  } catch (error) {
    return toolErr(-32603, 'Backend fetch failed', {
      code: 'BACKEND_UNAVAILABLE',
      retryable: true,
      retry_after_ms: 5000,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  if (response.status === 401 || response.status === 403) {
    return toolErr(-32603, `Backend rejected: ${response.status}`, {
      code: 'BACKEND_AUTH_FAILED',
      retryable: false,
      http_status: response.status,
      detail:
        'Backend did not accept the MCP service token + identity headers. Likely Backend U1/U2 not yet shipped.',
    });
  }

  if (response.status === 404) {
    return toolErr(-32603, 'Resource not found', {
      code: 'NOT_FOUND',
      retryable: false,
      http_status: 404,
    });
  }

  if (response.status >= 400) {
    return toolErr(-32603, `Backend error ${response.status}`, {
      code: 'BACKEND_ERROR',
      retryable: response.status >= 500,
      retry_after_ms: response.status >= 500 ? 5000 : undefined,
      http_status: response.status,
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

  const sanitized = sanitizeFreeTextFields(tool.name, payload);
  return toolOk({
    content: [{ type: 'text', text: JSON.stringify(sanitized, null, 2) }],
    structuredContent: sanitized,
    _meta: { tool: tool.name, source: 'backend' },
  });
};
