import type { Env } from '../../types.js';
import type { AuthContext } from '../../middleware/auth.js';
import { createWorkersAiClient, resolveWorkersAiModel } from '../../utils/workersAiClient.js';
import { consumeAiStream, DEFAULT_AI_MODEL } from '../../routes/aiChatShared.js';
import { executePracticeAssistantTools } from './toolExecutor.js';
import { toOpenAiTools } from './toolRegistry.js';
import { PracticeAssistantAuditService } from './auditService.js';
import { buildTurnMetadata, persistAssistantMessage } from './messageAdapter.js';
import { ConversationService } from '../ConversationService.js';
import { Logger } from '../../utils/logger.js';
import type {
  PracticeAssistantProgress,
  PracticeAssistantToolCall,
  PracticeAssistantToolResult,
  PracticeAssistantTurnMetadata,
} from './types.js';

type PracticeAssistantModelMessage = { role: 'user' | 'assistant'; content: string };

class PracticeAssistantEngineError extends Error {
  readonly engineCode: string;
  readonly context: Record<string, unknown>;
  constructor(code: string, context: Record<string, unknown>) {
    super(code);
    this.engineCode = code;
    this.context = context;
  }
}

export type PracticeAssistantEvent =
  | { type: 'token'; token: string }
  | { type: 'tool_progress'; progress: PracticeAssistantProgress }
  | {
      type: 'done';
      reply: string;
      persistedMessageId: string;
      metadata: PracticeAssistantTurnMetadata;
      actions: PracticeAssistantTurnMetadata['actions'];
    }
  | { type: 'error'; code: 'practice_assistant_failed'; message: string };

export interface PracticeAssistantQueryEngineConfig {
  conversationId: string;
  practiceId: string;
  practiceSlug: string | null;
  userId: string;
  auth: AuthContext & { memberRole: string };
  env: Env;
  request: Request;
  initialMessages?: PracticeAssistantModelMessage[];
}

const systemPrompt = [
  'You are Blawby Practice Assistant, an authenticated internal assistant for a law practice.',
  'You answer only from tool results and explicit user-provided context.',
  'Never infer from frontend state. If a source fails, name the failing source clearly.',
  'Any create, update, send, delete, or lifecycle action must be represented as an approval action before execution.',
  'For billing-plan or hour estimates, show assumptions, confidence, and source records. Treat them as advisory.',
  '',
  'Use capability-oriented practice tools, not scripted intent routing.',
  '- Use search_practice for discovery across records.',
  '- Use get_entity for one known record by type and ID. The current practice is always get_entity({ entityType: "practice", id: "current" }).',
  '- Use list_entities for typed record lists with filters, sorting, pagination, and limits.',
  '- Use get_related_entities for relationship traversal between records.',
  '- Use query_practice for broad analytical questions requiring multiple sources, joins, aggregation, prioritization, or partial results.',
  '- Use create_entity to propose creating a new record. Always requires approval.',
  '- Use update_entity to propose changing fields on an existing record. Read current state first with get_entity to avoid overwriting values not intended to change. Always requires approval.',
  '- Use delete_entity to propose deleting a record. Always requires approval.',
  '- Use run_entity_action to propose a lifecycle action such as sending an invoice or converting an intake. Always requires approval.',
  '',
  'Child entity types require parent: { entityType, id } on every read and write:',
  '- Tasks under a matter → entityType: "matter_task", parent: { entityType: "matter", id: "<matterId>" }',
  '- Notes under a matter → entityType: "matter_note", parent: { entityType: "matter", id: "<matterId>" }',
  '- Time entries under a matter → entityType: "time_entry", parent: { entityType: "matter", id: "<matterId>" }',
  '- Expenses under a matter → entityType: "matter_expense", parent: { entityType: "matter", id: "<matterId>" }',
  '- Milestones under a matter → entityType: "matter_milestone", parent: { entityType: "matter", id: "<matterId>" }',
  '- Memos under a client → entityType: "client_memo", parent: { entityType: "client", id: "<clientId>" }',
  'Never use entityType "task" for write operations — that is a read-only report type.',
  '',
  'The current practice is already known from context; never use search_practice to locate it, never ask for its name or ID, and never offer to create a new practice record.',
  'Do not expose raw tool names in the final response. Explain results in practice-owner language and cite sources when useful.',
  'Never say the count is 0 unless a tool result explicitly returned an empty array for that scope.',
].join('\n');

const finalPrompt = (input: {
  userMessage: string;
  toolResults: PracticeAssistantToolResult[];
}) => [
  'Produce the final assistant response for the practice user.',
  'This is the text-only synthesis phase. Do not call tools. Do not propose another action.',
  'Use the tool results below. Include concise source references by label when useful.',
  'If a pending approval action exists in the tool results, explain what was prepared and that it will only execute if approved.',
  '',
  `USER MESSAGE:\n${input.userMessage}`,
  `\nTOOL RESULTS JSON:\n${JSON.stringify(input.toolResults).slice(0, 24000)}`,
].join('\n');

const normalizeToolCalls = (toolCalls: Array<{ name: string; arguments: string }>): PracticeAssistantToolCall[] =>
  toolCalls.map((call, index) => ({
    id: `toolu_${crypto.randomUUID()}`,
    name: call.name,
    arguments: call.arguments,
    index,
  }));

export class PracticeAssistantQueryEngine {
  private readonly audit: PracticeAssistantAuditService;
  private readonly abortController = new AbortController();
  private messages: PracticeAssistantModelMessage[] = [];

  constructor(private readonly config: PracticeAssistantQueryEngineConfig) {
    this.audit = new PracticeAssistantAuditService(config.env);
    if (config.request.signal.aborted) {
      this.abortController.abort(config.request.signal.reason);
    } else {
      config.request.signal.addEventListener('abort', () => {
        this.abortController.abort(config.request.signal.reason);
      }, { once: true });
    }
  }

  getMessages(): readonly PracticeAssistantModelMessage[] {
    return this.messages;
  }

  interrupt(): void {
    this.abortController.abort('Practice Assistant turn interrupted');
  }

  private async *consumeModelStream(
    response: Response,
    emitTokens: boolean,
    requestId: string,
    pass: 'tool_selection' | 'final_response',
  ): AsyncGenerator<PracticeAssistantEvent, { reply: string; toolCalls: Array<{ name: string; arguments: string }> }, unknown> {
    const events: PracticeAssistantEvent[] = [];
    let notify: (() => void) | null = null;
    const wake = () => {
      notify?.();
      notify = null;
    };
    const waitForEvent = () => new Promise<void>((resolve) => {
      notify = resolve;
    });
    const emitToken = (payload: Record<string, unknown>) => {
      if (typeof payload.token === 'string') {
        events.push({ type: 'token', token: payload.token });
        wake();
      }
    };

    Logger.info('practice_assistant.model_stream.consume_started', {
      requestId,
      pass,
      conversationId: this.config.conversationId,
      emitTokens,
      status: response.status,
      contentType: response.headers.get('content-type'),
    });

    const streamResult = consumeAiStream(response, emitTokens, emitToken, this.config.conversationId, requestId)
      .finally(wake);
    while (true) {
      while (events.length > 0) {
        yield events.shift()!;
      }
      const settled = await Promise.race([
        streamResult.then(
          (value) => ({ type: 'done' as const, value }),
          (error) => ({ type: 'error' as const, error }),
        ),
        waitForEvent().then(() => ({ type: 'event' as const })),
      ]);
      if (settled.type === 'event') continue;
      while (events.length > 0) {
        yield events.shift()!;
      }
      if (settled.type === 'error') {
        Logger.warn('practice_assistant.model_stream.consume_error', {
          requestId,
          pass,
          conversationId: this.config.conversationId,
          error: settled.error instanceof Error ? settled.error.message : String(settled.error),
        });
        throw settled.error;
      }
      Logger.info('practice_assistant.model_stream.consume_finished', {
        requestId,
        pass,
        conversationId: this.config.conversationId,
        replyLength: settled.value.reply.length,
        toolCallCount: settled.value.toolCalls.length,
        toolNames: settled.value.toolCalls.map((call) => call.name),
        diagnostics: settled.value.diagnostics,
      });
      return settled.value;
    }
  }

  private async loadMessages(userMessage: string): Promise<PracticeAssistantModelMessage[]> {
    const sourceMessages = this.config.initialMessages?.length
      ? this.config.initialMessages
      : (await new ConversationService(this.config.env).getMessages(this.config.conversationId, this.config.practiceId, { limit: 20 }))
        .messages
        .map((message) => ({ role: message.role, content: message.content }));
    const normalized = sourceMessages
      .filter((message): message is PracticeAssistantModelMessage =>
        (message.role === 'user' || message.role === 'assistant') && message.content.trim().length > 0)
      .slice(-20)
      .map((message) => ({ role: message.role, content: message.content.trim() }));
    const last = normalized[normalized.length - 1];
    if (!last || last.role !== 'user' || last.content !== userMessage.trim()) {
      normalized.push({ role: 'user', content: userMessage.trim() });
    }
    this.messages = normalized;
    return normalized;
  }

  async *submitMessage(userMessage: string): AsyncGenerator<PracticeAssistantEvent, void, unknown> {
    const { conversationId, practiceId, practiceSlug, userId, auth, env, request } = this.config;
    const requestId = crypto.randomUUID();
    const progress: PracticeAssistantProgress[] = [];
    const events: PracticeAssistantEvent[] = [];
    const emitProgress = (progressEvent: PracticeAssistantProgress) => {
      progress.push(progressEvent);
      events.push({ type: 'tool_progress', progress: progressEvent });
    };
    try {
      const conversationMessages = await this.loadMessages(userMessage);
      Logger.info('practice_assistant.turn.started', {
        requestId,
        conversationId,
        practiceId,
        userMessageLength: userMessage.length,
        conversationMessageCount: conversationMessages.length,
        lastRole: conversationMessages[conversationMessages.length - 1]?.role ?? null,
      });
      await this.audit.record({
        conversationId, practiceId,
        eventType: 'practice_assistant.message_sent',
        actorType: 'lawyer', actorId: userId,
        payload: { source: 'practice_assistant', mode: 'PRACTICE_ASSISTANT' },
      });

      const aiClient = createWorkersAiClient(env);
      const model = resolveWorkersAiModel(env, DEFAULT_AI_MODEL);
      Logger.info('practice_assistant.first_pass.request_started', {
        requestId,
        conversationId,
        model,
        messageCount: conversationMessages.length,
        toolCount: toOpenAiTools().length,
      });
      const firstPass = await aiClient.requestChatCompletions({
        model, temperature: 0.1, max_tokens: 1200, stream: true,
        tools: toOpenAiTools(), tool_choice: 'auto',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationMessages,
        ],
      }, this.abortController.signal);
      Logger.info('practice_assistant.first_pass.response_headers', {
        requestId,
        conversationId,
        status: firstPass.status,
        ok: firstPass.ok,
        contentType: firstPass.headers.get('content-type'),
      });
      if (!firstPass.ok) throw new Error(`Workers AI tool-selection failed with HTTP ${firstPass.status}`);

      const planned = await (yield* this.consumeModelStream(firstPass, false, requestId, 'tool_selection'));

      const toolCalls = normalizeToolCalls(planned.toolCalls);
      Logger.info('practice_assistant.first_pass.parsed', {
        requestId,
        conversationId,
        plannedReplyLength: planned.reply.length,
        toolCallCount: toolCalls.length,
        toolNames: toolCalls.map((call) => call.name),
      });
      const toolResults = await executePracticeAssistantTools(toolCalls, {
        env, request, auth, practiceId, practiceSlug, conversationId,
        userId, signal: this.abortController.signal, emitProgress,
      });
      Logger.info('practice_assistant.tools.finished', {
        requestId,
        conversationId,
        toolResultCount: toolResults.length,
        toolResults: toolResults.map((result) => ({
          toolName: result.toolName,
          ok: result.ok,
          hasData: result.data !== undefined,
          error: result.error ?? null,
          sourceCount: result.sources?.length ?? 0,
          hasAction: Boolean(result.action),
        })),
      });
      while (events.length) yield events.shift()!;

      const finalUserPrompt = finalPrompt({ userMessage, toolResults });
      Logger.info('practice_assistant.final_pass.request_started', {
        requestId,
        conversationId,
        model,
        toolResultCount: toolResults.length,
        finalPromptLength: finalUserPrompt.length,
      });
      const finalResponse = await aiClient.requestChatCompletions({
        model, temperature: 0.2, max_tokens: 1600, stream: true,
        tool_choice: 'none',
        tools: [],
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: finalUserPrompt },
        ],
      }, this.abortController.signal);
      Logger.info('practice_assistant.final_pass.response_headers', {
        requestId,
        conversationId,
        status: finalResponse.status,
        ok: finalResponse.ok,
        contentType: finalResponse.headers.get('content-type'),
      });
      if (!finalResponse.ok) throw new Error(`Workers AI final response failed with HTTP ${finalResponse.status}`);

      const final = await (yield* this.consumeModelStream(finalResponse, true, requestId, 'final_response'));

      if (final.toolCalls.length > 0) {
        throw new PracticeAssistantEngineError('FINAL_PASS_PROTOCOL_VIOLATION', {
          phase: 'final_response',
          model,
          toolCallNames: final.toolCalls.map(tc => tc.name),
          replyLength: final.reply.length,
        });
      }

      const reply = final.reply.trim();
      Logger.info('practice_assistant.reply.resolved', {
        requestId,
        conversationId,
        finalReplyLength: final.reply.length,
        plannedReplyLength: planned.reply.length,
        resolvedReplyLength: reply.length,
        toolCallCount: toolCalls.length,
      });
      if (!reply) {
        throw new PracticeAssistantEngineError('EMPTY_FINAL_RESPONSE', {
          phase: 'final_response',
          model,
          toolResultCount: toolResults.length,
          firstPassToolCallCount: toolCalls.length,
        });
      }
      this.messages = [...conversationMessages, { role: 'assistant', content: reply }];

      const metadata = buildTurnMetadata(toolResults, progress);
      const persistedMessageId = await persistAssistantMessage(env, {
        conversationId, practiceId, content: reply, metadata,
      });

      await this.audit.record({
        conversationId, practiceId,
        eventType: 'practice_assistant.turn_completed',
        actorType: 'system',
        payload: { toolCount: toolResults.length, actionCount: metadata.assistantActions.length, sourceCount: metadata.sources.length },
      });
      yield { type: 'done', reply, persistedMessageId, metadata, actions: metadata.actions };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.warn('practice_assistant.turn.error', {
        requestId,
        conversationId: this.config.conversationId,
        practiceId: this.config.practiceId,
        message,
        ...(error instanceof PracticeAssistantEngineError ? { engineCode: error.engineCode, context: error.context } : {}),
      });
      await this.audit.record({
        conversationId: this.config.conversationId,
        practiceId: this.config.practiceId,
        eventType: 'practice_assistant.error',
        actorType: 'system',
        payload: { message },
      });
      yield { type: 'error', code: 'practice_assistant_failed', message };
    }
  }
}
