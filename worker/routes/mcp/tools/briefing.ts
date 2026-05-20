import type { McpToolContext, JsonRpcOutcome } from './dispatch.js';
import { toolOk, toolErr, isOk } from './dispatch.js';
import { findToolByName, type McpToolDefinition } from '../toolDefinitions.js';
import { handleReadTool } from './read.js';

/**
 * get_practice_briefing — synthesis tool.
 *
 * Plan R8: "Returns a categorized digest of unread state changes since
 * a caller-provided cursor." Per the plan's freshness note, this always
 * returns live state at call time (no cursor-based cache); each item
 * carries a `state_at` ISO timestamp; the tool description instructs
 * Claude to re-call before acting on items older than 5 minutes.
 *
 * Categories:
 *   - intakes: list_intakes(triage_status=untriaged)
 *   - payments: list_payments
 *   - invoices: list_invoices(status=overdue) + list_invoices(status=draft)
 *   - messages: list_conversations (unread filter applied at backend)
 *   - retainers: derived from list_matters (filter retainer < threshold)
 *
 * Sub-calls run in parallel; partial failures are surfaced in a
 * `partial_failures` array so Claude can decide whether to retry the
 * whole briefing or work with what arrived.
 */

const DEFAULT_CATEGORIES = ['intakes', 'payments', 'invoices', 'messages', 'retainers'] as const;
type BriefingCategory = (typeof DEFAULT_CATEGORIES)[number];

const isCategory = (v: unknown): v is BriefingCategory =>
  typeof v === 'string' && (DEFAULT_CATEGORIES as readonly string[]).includes(v);

interface SubCallSpec {
  category: BriefingCategory;
  toolName: string;
  args: Record<string, unknown>;
}

const buildSubCalls = (categories: ReadonlyArray<BriefingCategory>): SubCallSpec[] => {
  const calls: SubCallSpec[] = [];
  for (const category of categories) {
    switch (category) {
      case 'intakes':
        calls.push({
          category,
          toolName: 'list_intakes',
          args: { triage_status: 'untriaged', limit: 25 },
        });
        break;
      case 'payments':
        calls.push({ category, toolName: 'list_payments', args: { limit: 25 } });
        break;
      case 'invoices':
        calls.push({
          category,
          toolName: 'list_invoices',
          args: { status: 'overdue', limit: 25 },
        });
        break;
      case 'messages':
        calls.push({
          category,
          toolName: 'list_conversations',
          args: { limit: 25 },
        });
        break;
      case 'retainers':
        calls.push({
          category,
          toolName: 'list_matters',
          args: { status: 'active', limit: 50 },
        });
        break;
    }
  }
  return calls;
};

const callSubTool = async (
  spec: SubCallSpec,
  context: McpToolContext,
): Promise<{ category: BriefingCategory; outcome: JsonRpcOutcome; required_scope: string | null }> => {
  const tool: McpToolDefinition | null = findToolByName(spec.toolName);
  if (!tool) {
    return {
      category: spec.category,
      outcome: toolErr(-32603, `Briefing sub-tool ${spec.toolName} missing`, {
        code: 'INTERNAL_ERROR',
      }),
      required_scope: null,
    };
  }
  // Skip silently when the session doesn't have the sub-tool's scope.
  // The briefing umbrella scope (events:subscribe) is granted to every
  // session, but the underlying reads may require scopes not granted.
  if (!context.scopes.has(tool.requiredScope)) {
    return {
      category: spec.category,
      outcome: toolErr(-32002, `Skipped: missing ${tool.requiredScope}`, {
        code: 'SCOPE_INSUFFICIENT',
        retryable: false,
        required_scope: tool.requiredScope,
      }),
      required_scope: tool.requiredScope,
    };
  }
  const outcome = await handleReadTool(tool, spec.args, context);
  return { category: spec.category, outcome, required_scope: tool.requiredScope };
};

export const handleBriefingTool = async (
  args: Record<string, unknown>,
  context: McpToolContext,
): Promise<JsonRpcOutcome> => {
  const requestedCategories: BriefingCategory[] =
    Array.isArray(args.categories) && args.categories.every(isCategory)
      ? (args.categories as BriefingCategory[])
      : [...DEFAULT_CATEGORIES];

  const subCalls = buildSubCalls(requestedCategories);
  const stateAt = new Date().toISOString();
  const results = await Promise.all(subCalls.map((spec) => callSubTool(spec, context)));

  const byCategory: Record<string, unknown> = {};
  const partialFailures: Array<Record<string, unknown>> = [];

  for (const { category, outcome, required_scope } of results) {
    if (isOk(outcome)) {
      byCategory[category] = outcome.result;
    } else {
      partialFailures.push({
        category,
        required_scope,
        error: outcome.error,
      });
      byCategory[category] = null;
    }
  }

  return toolOk({
    content: [
      {
        type: 'text',
        text: JSON.stringify({ state_at: stateAt, ...byCategory, partial_failures: partialFailures }, null, 2),
      },
    ],
    structuredContent: {
      state_at: stateAt,
      categories: byCategory,
      partial_failures: partialFailures,
    },
    _meta: {
      tool: 'get_practice_briefing',
      categories_requested: requestedCategories,
      partial_failure_count: partialFailures.length,
    },
  });
};
