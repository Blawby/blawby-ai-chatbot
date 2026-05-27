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
import { handleHighRiskTool } from './writes-high-risk.js';

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

interface SchemaValidationError {
  field: string;
  message: string;
}

const validateInputSchema = (
  schema: Record<string, unknown>,
  args: Record<string, unknown>,
): SchemaValidationError[] => {
  const errors: SchemaValidationError[] = [];
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  const required = (schema.required as string[] | undefined) ?? [];

  for (const field of required) {
    if (
      args[field] === undefined
      || args[field] === null
      || (typeof args[field] === 'string' && args[field].trim() === '')
    ) {
      errors.push({ field, message: 'required' });
    }
  }

  if (!properties) return errors;

  for (const [field, fieldSchema] of Object.entries(properties)) {
    const value = args[field];
    if (value === undefined || value === null) continue;

    const type = fieldSchema.type as string | undefined;
    const enumValues = fieldSchema.enum as unknown[] | undefined;
    const minimum = typeof fieldSchema.minimum === 'number' ? fieldSchema.minimum : undefined;
    const maximum = typeof fieldSchema.maximum === 'number' ? fieldSchema.maximum : undefined;
    const exclusiveMinimum =
      typeof fieldSchema.exclusiveMinimum === 'number' ? fieldSchema.exclusiveMinimum : undefined;
    const exclusiveMaximum =
      typeof fieldSchema.exclusiveMaximum === 'number' ? fieldSchema.exclusiveMaximum : undefined;
    const minLength = typeof fieldSchema.minLength === 'number' ? fieldSchema.minLength : undefined;
    const maxLength = typeof fieldSchema.maxLength === 'number' ? fieldSchema.maxLength : undefined;
    const minItems = typeof fieldSchema.minItems === 'number' ? fieldSchema.minItems : undefined;
    const maxItems = typeof fieldSchema.maxItems === 'number' ? fieldSchema.maxItems : undefined;

    if (type === 'string' && typeof value !== 'string') {
      errors.push({ field, message: 'must be a string' });
    } else if (type === 'integer' && !Number.isInteger(value)) {
      errors.push({ field, message: 'must be an integer' });
    } else if (type === 'number' && (typeof value !== 'number' || Number.isNaN(value))) {
      errors.push({ field, message: 'must be a number' });
    } else if (type === 'boolean' && typeof value !== 'boolean') {
      errors.push({ field, message: 'must be a boolean' });
    } else if (type === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
      errors.push({ field, message: 'must be an object' });
    } else if (type === 'array' && !Array.isArray(value)) {
      errors.push({ field, message: 'must be an array' });
    }

    if (typeof value === 'number' && !Number.isNaN(value)) {
      if (minimum !== undefined && value < minimum) {
        errors.push({ field, message: `must be >= ${minimum}` });
      }
      if (maximum !== undefined && value > maximum) {
        errors.push({ field, message: `must be <= ${maximum}` });
      }
      if (exclusiveMinimum !== undefined && value <= exclusiveMinimum) {
        errors.push({ field, message: `must be > ${exclusiveMinimum}` });
      }
      if (exclusiveMaximum !== undefined && value >= exclusiveMaximum) {
        errors.push({ field, message: `must be < ${exclusiveMaximum}` });
      }
    }

    if (typeof value === 'string') {
      if (minLength !== undefined && value.length < minLength) {
        errors.push({ field, message: `must have length >= ${minLength}` });
      }
      if (maxLength !== undefined && value.length > maxLength) {
        errors.push({ field, message: `must have length <= ${maxLength}` });
      }
    }

    if (Array.isArray(value)) {
      if (minItems !== undefined && value.length < minItems) {
        errors.push({ field, message: `must contain at least ${minItems} item(s)` });
      }
      if (maxItems !== undefined && value.length > maxItems) {
        errors.push({ field, message: `must contain at most ${maxItems} item(s)` });
      }
    }

    if (enumValues && !enumValues.includes(value)) {
      errors.push({ field, message: `must be one of: ${enumValues.join(', ')}` });
    }
  }

  return errors;
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

  const schemaErrors = validateInputSchema(tool.inputSchema, args);
  if (schemaErrors.length > 0) {
    return err(-32602, 'Invalid params', {
      details: schemaErrors,
      code: 'INVALID_PARAMS',
      retryable: false,
    });
  }

  try {
    // Synthesis + Worker-only tools dispatched by name.
    if (tool.name === 'get_practice_briefing') return await handleBriefingTool(args, context);
    if (tool.name === 'revoke_my_session') return await handleRevokeMySession(args, context);

    // Risk-tier dispatch: direct writes (U10) and high-risk writes (U11)
    // both require tool_call_seq for idempotency derivation; reads don't.
    if (tool._meta.risk_tier === 'direct_write') {
      if (context.tool_call_seq === undefined || context.tool_call_seq === null) {
        return err(-32603, `tool_call_seq is required for write tool: ${tool.name}`, {
          code: 'MISSING_TOOL_CALL_SEQ',
          retryable: false,
        });
      }
      return await handleDirectWriteTool(tool, args, {
        ...context,
        tool_call_seq: context.tool_call_seq,
      });
    }
    if (tool._meta.risk_tier === 'high_risk') {
      if (context.tool_call_seq === undefined || context.tool_call_seq === null) {
        return err(-32603, `tool_call_seq is required for write tool: ${tool.name}`, {
          code: 'MISSING_TOOL_CALL_SEQ',
          retryable: false,
        });
      }
      return await handleHighRiskTool(tool, args, {
        ...context,
        tool_call_seq: context.tool_call_seq,
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
