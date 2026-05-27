import { HttpErrors } from '../../errorHandler.js';
import type {
  PracticeAssistantContext,
  PracticeAssistantRole,
  PracticeAssistantToolCall,
  PracticeAssistantToolResult,
} from './types.js';
import { practiceAssistantToolByName } from './toolRegistry.js';
import { PracticeAssistantAuditService } from './auditService.js';

const ROLE_LEVEL: Record<PracticeAssistantRole, number> = {
  paralegal: 1,
  attorney: 2,
  admin: 3,
  owner: 4,
};

const canUseRole = (actual: string, required: PracticeAssistantRole): boolean => {
  const actualLevel = ROLE_LEVEL[actual as PracticeAssistantRole] ?? 0;
  return actualLevel >= ROLE_LEVEL[required];
};

const parseArguments = (raw: string): unknown => {
  if (!raw.trim()) return {};
  return JSON.parse(raw);
};

const runTool = async (
  call: PracticeAssistantToolCall,
  context: PracticeAssistantContext,
): Promise<PracticeAssistantToolResult> => {
  const tool = practiceAssistantToolByName.get(call.name);
  if (!tool) {
    return { toolUseId: call.id, toolName: call.name, ok: false, error: `Unknown tool: ${call.name}` };
  }
  if (!tool.isEnabled()) {
    return { toolUseId: call.id, toolName: tool.name, ok: false, error: `Tool is disabled: ${tool.name}` };
  }
  if (!canUseRole(context.auth.memberRole, tool.requiredRole)) {
    return {
      toolUseId: call.id,
      toolName: tool.name,
      ok: false,
      error: `Insufficient permissions for ${tool.name}; requires ${tool.requiredRole}`,
    };
  }
  if (context.signal?.aborted) {
    context.emitProgress({ toolUseId: call.id, toolName: tool.name, label: `${tool.name} cancelled`, status: 'cancelled' });
    return { toolUseId: call.id, toolName: tool.name, ok: false, error: 'Tool execution cancelled' };
  }

  try {
    const input = tool.inputSchema.parse(parseArguments(call.arguments));
    const validation = await tool.validateInput?.(input, context);
    if (validation?.result === false) {
      return { toolUseId: call.id, toolName: tool.name, ok: false, error: validation.message };
    }
    const permission = await tool.checkPermissions(input, context);
    if (permission.decision === 'deny') {
      return { toolUseId: call.id, toolName: tool.name, ok: false, error: permission.reason ?? `Permission denied for ${tool.name}` };
    }
    if (permission.decision === 'requires_approval' && !tool.renderApprovalSummary) {
      return {
        toolUseId: call.id,
        toolName: tool.name,
        ok: false,
        error: permission.reason ?? `${tool.name} requires approval but does not produce an approval action`,
      };
    }
    const readOnly = tool.isReadOnly(input);
    const destructive = tool.isDestructive(input);
    context.emitProgress({
      toolUseId: call.id,
      toolName: tool.name,
      label: tool.getActivityDescription?.(input) ?? tool.description,
      status: 'running',
    });
    const audit = new PracticeAssistantAuditService(context.env);
    await audit.record({
      conversationId: context.conversationId,
      practiceId: context.practiceId,
      eventType: 'practice_assistant.permission_decision',
      actorType: 'system',
      payload: {
        toolName: tool.name,
        toolUseId: call.id,
        decision: permission.decision,
      },
    });
    await audit.record({
      conversationId: context.conversationId,
      practiceId: context.practiceId,
      eventType: 'practice_assistant.tool_called',
      actorType: 'lawyer',
      actorId: context.userId,
      payload: {
        toolName: tool.name,
        toolUseId: call.id,
        isReadOnly: readOnly,
        isDestructive: destructive,
      },
    });
    const result = await tool.call(input, context, call.id, (progress) => {
      context.emitProgress({
        toolUseId: call.id,
        toolName: tool.name,
        label: progress.label,
        status: progress.status ?? 'running',
      });
    });
    context.emitProgress({
      toolUseId: call.id,
      toolName: tool.name,
      label: result.progressLabel ?? tool.description,
      status: result.ok ? 'completed' : 'failed',
    });
    await audit.record({
      conversationId: context.conversationId,
      practiceId: context.practiceId,
      eventType: 'practice_assistant.tool_result',
      actorType: 'system',
      payload: { toolName: tool.name, toolUseId: call.id, ok: result.ok, actionId: result.action?.actionId ?? null },
    });
    return { toolUseId: call.id, toolName: tool.name, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.emitProgress({ toolUseId: call.id, toolName: tool.name, label: message, status: 'failed' });
    return { toolUseId: call.id, toolName: tool.name, ok: false, error: message };
  }
};

const makeBatches = (calls: PracticeAssistantToolCall[]): PracticeAssistantToolCall[][] => {
  const batches: PracticeAssistantToolCall[][] = [];
  let concurrent: PracticeAssistantToolCall[] = [];
  const flush = () => {
    if (concurrent.length) {
      batches.push(concurrent);
      concurrent = [];
    }
  };
  for (const call of calls) {
    const tool = practiceAssistantToolByName.get(call.name);
    let parsed: { success: boolean; data?: unknown } | null = null;
    if (tool) {
      try {
        parsed = tool.inputSchema.safeParse(parseArguments(call.arguments));
      } catch {
        parsed = null;
      }
    }
    if (tool && parsed?.success && tool.isReadOnly(parsed.data as never) && tool.isConcurrencySafe(parsed.data as never)) {
      concurrent.push(call);
      continue;
    }
    flush();
    batches.push([call]);
  }
  flush();
  return batches;
};

export const executePracticeAssistantTools = async (
  calls: PracticeAssistantToolCall[],
  context: PracticeAssistantContext,
): Promise<PracticeAssistantToolResult[]> => {
  const ordered = new Map<number, PracticeAssistantToolResult>();
  for (const batch of makeBatches(calls)) {
    const results = batch.length > 1
      ? await Promise.all(batch.map((call) => runTool(call, context)))
      : [await runTool(batch[0], context)];
    results.forEach((result, i) => {
      const originalIndex = batch[i].index;
      ordered.set(originalIndex, result);
    });
  }
  return calls.map((_, index) => ordered.get(index)).filter(Boolean) as PracticeAssistantToolResult[];
};
