
const DEFAULT_AI_MODEL = 'gpt-4o-mini';
const LEGAL_DISCLAIMER = 'I\'m not a lawyer and can\'t provide legal advice, but I can help you request a consultation with this practice.';
const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TOTAL_LENGTH = 12000;
const AI_TIMEOUT_MS = 8000;
const AI_STREAM_READ_TIMEOUT_MS = 15000;
const CONSULTATION_CTA_REGEX = /\b(request(?:ing)?|schedule|book)\s+(a\s+)?consultation\b/i;
const SERVICE_QUESTION_REGEX = /(?:\b(?:do you|are you|can you|what|which)\b.*\b(services?|practice (?:area|areas)|specializ(?:e|es) in|personal injury)\b|\b(services?|practice (?:area|areas)|specializ(?:e|es) in|personal injury)\b.*\?)/i;
const HOURS_QUESTION_REGEX = /\b(hours?|opening hours|business hours|office hours|when are you open)\b/i;
const LEGAL_INTENT_REGEX = /\b(?:legal advice|what are my rights|is it legal|do i need (?:a )?lawyer|(?:should|can|could|would)\s+i\b.*\b(?:sue|lawsuit|liable|liability|contract dispute|charged|settlement|custody|divorce|immigration|criminal)\b)/i;

// Canonical hard-error constants live in src/shared/constants/intakeErrors.ts
// so the worker SSE event, the conversation envelope, and the widget composer
// all reference one copy. Re-exported below so existing worker imports from
// this module continue to resolve. See U6/U8 of
// docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md.
import {
  INTAKE_HARD_ERROR_CODE as HARD_ERROR_CODE,
  INTAKE_HARD_ERROR_MESSAGE as HARD_ERROR_MESSAGE,
} from '../../src/shared/constants/intakeErrors';
const AI_RETRY_BACKOFF_MS = 500;

const encoder = new TextEncoder();

function looksLikeToolLeak(content: string): boolean {
  return content.includes('update_practice_fields');
}

function sseEvent(payload: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function createSseResponse(): {
  response: Response;
  write: (payload: Record<string, unknown>) => void;
  close: () => void;
} {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  return {
    response: new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    }),
    write(payload) {
      writer.write(sseEvent(payload)).catch(() => {});
    },
    close() {
      writer.close().catch(() => {});
    },
  };
}

const consumeAiStream = async (
  response: Response,
  emitTokens = true,
  write: (payload: Record<string, unknown>) => void,
  conversationId: string,
  requestId?: string,
  sendSseDebug?: (event: string, data: Record<string, unknown>) => void
): Promise<{
  reply: string;
  toolCalls: Array<{name: string, arguments: string}>;
  streamStalled: boolean;
  emittedToken: boolean;
  diagnostics: {
    chunkCount: number;
    parsedChunkCount: number;
    malformedChunkCount: number;
    contentChunkCount: number;
    deltaToolCallChunkCount: number;
    namedToolFragmentCount: number;
    argumentOnlyToolFragmentCount: number;
    finishReasons: string[];
    sampleToolChunks: string[];
    sampleUnexpectedChunks: string[];
    failClosedReason?: string;
  };
}> => {
  if (!response.body) {
    return {
      reply: '',
      toolCalls: [],
      streamStalled: false,
      emittedToken: false,
      diagnostics: {
        chunkCount: 0,
        parsedChunkCount: 0,
        malformedChunkCount: 0,
        contentChunkCount: 0,
        deltaToolCallChunkCount: 0,
        namedToolFragmentCount: 0,
        argumentOnlyToolFragmentCount: 0,
        finishReasons: [],
        sampleToolChunks: [],
        sampleUnexpectedChunks: [],
        failClosedReason: undefined,
      }
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const { Logger } = await import('../utils/logger.js');
  let buffer = '';
  let streamStalled = false;
  let localReply = '';
  let localToolCalls: Array<{name: string, arguments: string}> = [];
  let localToolCallsByIndex = new Map<number, {name: string, arguments: string}>();
  let localEmittedToken = false;
  const diagnostics = {
    chunkCount: 0,
    parsedChunkCount: 0,
    malformedChunkCount: 0,
    contentChunkCount: 0,
    deltaToolCallChunkCount: 0,
    namedToolFragmentCount: 0,
    argumentOnlyToolFragmentCount: 0,
    finishReasons: [] as string[],
    sampleToolChunks: [] as string[],
    sampleUnexpectedChunks: [] as string[],
    failClosedReason: undefined as string | undefined,
  };
  let blockedByPotentialToolLeak = false;

  while (true) {
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    const result = await Promise.race([
      reader.read().then((res) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        return res;
      }),
      new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(() => reject(new Error('AI_STREAM_STALL')), AI_STREAM_READ_TIMEOUT_MS);
      })
    ]).catch(async (error: unknown) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      Logger.warn('AI stream read stalled or failed', {
        conversationId,
        reason: error instanceof Error ? error.message : String(error)
      });
      await reader.cancel().catch(() => {});
      streamStalled = true;
      return { done: true, value: undefined };
    });

    const { done, value } = result as { done: boolean; value?: Uint8Array };
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (!trimmed.startsWith('data: ')) continue;
      diagnostics.chunkCount += 1;

      let chunk: {
        choices?: Array<{
          delta?: {
            content?: string | null;
            tool_calls?: Array<{
              index?: number;
              function?: { name?: string; arguments?: string };
            }>;
          };
          finish_reason?: string | null;
          message?: Record<string, unknown>;
        }>;
      };

      try {
        chunk = JSON.parse(trimmed.slice(6));
      } catch {
        diagnostics.malformedChunkCount += 1;
        if (diagnostics.sampleUnexpectedChunks.length < 3) {
          diagnostics.sampleUnexpectedChunks.push(trimmed.slice(0, 240));
        }
        continue;
      }
      diagnostics.parsedChunkCount += 1;
      
      // Log provider delta
      if (requestId && sendSseDebug) {
        sendSseDebug('debug_provider_delta', {
          requestId,
          conversationId,
          chunk,
        });
      }
      


      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      if (requestId && diagnostics.parsedChunkCount <= 12) {
        const message = choice?.message as Record<string, unknown> | undefined;
        const messageToolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
        Logger.info('ai.stream.chunk_shape', {
          requestId,
          conversationId,
          chunkIndex: diagnostics.parsedChunkCount,
          hasChoice: Boolean(choice),
          hasDelta: Boolean(delta),
          hasDeltaContent: typeof delta?.content === 'string' && delta.content.length > 0,
          deltaContentLength: typeof delta?.content === 'string' ? delta.content.length : null,
          deltaToolCallCount: Array.isArray(delta?.tool_calls) ? delta.tool_calls.length : 0,
          hasMessage: Boolean(message),
          hasMessageContent: typeof message?.content === 'string' && message.content.length > 0,
          messageContentLength: typeof message?.content === 'string' ? message.content.length : null,
          messageToolCallCount: messageToolCalls.length,
          finishReason: choice?.finish_reason ?? null,
        });
      }
      if (typeof choice?.finish_reason === 'string' && choice.finish_reason.length > 0) {
        diagnostics.finishReasons.push(choice.finish_reason);
      }
      if (!delta && choice?.message) {
        // Some Workers AI models return tool calls in choice.message (non-streaming
        // shape) even when stream:true. Extract them so the practice assistant
        // tool-calling path works regardless of model streaming format.
        const msgRecord = choice.message as Record<string, unknown>;
        const msgContent = typeof msgRecord.content === 'string' ? msgRecord.content : null;
        if (msgContent) {
          localReply += msgContent;
          if (looksLikeToolLeak(msgContent)) {
            blockedByPotentialToolLeak = true;
            streamStalled = true;
            diagnostics.failClosedReason = 'potential_tool_leak';
          }
          if (emitTokens && !blockedByPotentialToolLeak) {
            write({ token: msgContent });
            localEmittedToken = true;
          }
        }
        const msgToolCalls = Array.isArray(msgRecord.tool_calls) ? msgRecord.tool_calls as Array<{
          id?: string;
          index?: number;
          function?: { name?: string; arguments?: string };
        }> : null;
        if (msgToolCalls) {
          msgToolCalls.forEach((tc, idx) => {
            if (typeof tc.function?.name === 'string') {
              const key = typeof tc.index === 'number' ? tc.index : idx;
              const existing = localToolCallsByIndex.get(key);
              if (!existing) {
                localToolCallsByIndex.set(key, {
                  name: tc.function.name,
                  arguments: tc.function.arguments ?? '{}',
                });
              }
            }
          });
        }
        if (!msgContent && !msgToolCalls && diagnostics.sampleUnexpectedChunks.length < 3) {
          diagnostics.sampleUnexpectedChunks.push(JSON.stringify(choice.message).slice(0, 240));
        }
        continue;
      }
      if (!delta) continue;

      if (typeof delta.content === 'string' && delta.content.length > 0) {
        localReply += delta.content;
        diagnostics.contentChunkCount += 1;

        const contentLooksLikeToolLeak = looksLikeToolLeak(delta.content);
        if (contentLooksLikeToolLeak) {
          blockedByPotentialToolLeak = true;
          streamStalled = true;
          diagnostics.failClosedReason = 'potential_tool_leak';
        }

        if (emitTokens && !blockedByPotentialToolLeak) {
          write({ token: delta.content });
          localEmittedToken = true;
        }
      }

      if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
        diagnostics.deltaToolCallChunkCount += 1;
        if (diagnostics.sampleToolChunks.length < 3) {
          diagnostics.sampleToolChunks.push(JSON.stringify(delta.tool_calls).slice(0, 240));
        }
        for (const tc of delta.tool_calls) {
          if (typeof tc.function?.arguments === 'string') {
            let targetCall: {name: string, arguments: string} | undefined;
            
            // Log tool call fragments
            if (requestId && sendSseDebug) {
              sendSseDebug('debug_tool_fragment', {
                requestId,
                conversationId,
                toolName: tc.function?.name,
                toolArgs: tc.function?.arguments,
                index: tc.index,
              });
            }
            
            if (tc.function?.name) {
              diagnostics.namedToolFragmentCount += 1;
              
              // Use tc.index when available to avoid mixing fragments from concurrent tool calls
              if (typeof tc.index === 'number') {
                // Find or create tool call by index using Map
                targetCall = localToolCallsByIndex.get(tc.index);
                if (!targetCall) {
                  targetCall = {
                    name: tc.function.name,
                    arguments: tc.function.arguments
                  };
                  localToolCallsByIndex.set(tc.index, targetCall);
                } else {
                  if (!targetCall.name) {
                    targetCall.name = tc.function.name;
                  }
                  targetCall.arguments += tc.function.arguments;
                }
              } else {
                // Fallback to name-only behavior if index is absent
                targetCall = localToolCalls.find(call => call.name === tc.function.name);
                if (!targetCall) {
                  targetCall = {
                    name: tc.function.name,
                    arguments: tc.function.arguments
                  };
                  localToolCalls.push(targetCall);
                } else {
                  targetCall.arguments += tc.function.arguments;
                }
              }
            } else {
              diagnostics.argumentOnlyToolFragmentCount += 1;
              if (typeof tc.index === 'number') {
                // Use index-aware lookup for argument-only fragments
                targetCall = localToolCallsByIndex.get(tc.index);
                if (targetCall) {
                  targetCall.arguments += tc.function.arguments;
                } else {
                  // Create new entry at index if not found
                  targetCall = { name: '', arguments: tc.function.arguments };
                  localToolCallsByIndex.set(tc.index, targetCall);
                }
              } else if (localToolCalls.length > 0) {
                // Fallback to last call if index is absent
                targetCall = localToolCalls[localToolCalls.length - 1];
                targetCall.arguments += tc.function.arguments;
              }
            }
          }
        }
      }
    }
  }

  if (buffer.trim() && buffer.trim() !== 'data: [DONE]') {
    try {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data: ')) {
        const chunk = JSON.parse(trimmed.slice(6)) as {
          choices?: Array<{
            delta?: {
              content?: string | null;
              tool_calls?: Array<{ index?: number; function?: { name?: string; arguments?: string } }>;
            };
            message?: Record<string, unknown>;
            finish_reason?: string | null;
          }>;
        };
        if (requestId) {
          const choice = chunk.choices?.[0];
          const message = choice?.message as Record<string, unknown> | undefined;
          const delta = choice?.delta;
          const messageToolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
          Logger.info('ai.stream.final_buffer_shape', {
            requestId,
            conversationId,
            hasChoice: Boolean(choice),
            hasDelta: Boolean(delta),
            hasDeltaContent: typeof delta?.content === 'string' && delta.content.length > 0,
            deltaContentLength: typeof delta?.content === 'string' ? delta.content.length : null,
            deltaToolCallCount: Array.isArray(delta?.tool_calls) ? delta.tool_calls.length : 0,
            hasMessage: Boolean(message),
            hasMessageContent: typeof message?.content === 'string' && message.content.length > 0,
            messageContentLength: typeof message?.content === 'string' ? message.content.length : null,
            messageToolCallCount: messageToolCalls.length,
            finishReason: choice?.finish_reason ?? null,
          });
        }
        const token = chunk.choices?.[0]?.delta?.content;
        if (typeof token === 'string' && token.length > 0) {
          localReply += token;

          const contentLooksLikeToolLeak = looksLikeToolLeak(token);
          if (contentLooksLikeToolLeak) {
            blockedByPotentialToolLeak = true;
            streamStalled = true;
            diagnostics.failClosedReason = 'potential_tool_leak';
          }

          if (emitTokens && !blockedByPotentialToolLeak) {
            write({ token });
            localEmittedToken = true;
          }
        }
        const toolCalls = chunk.choices?.[0]?.delta?.tool_calls;
        if (Array.isArray(toolCalls)) {
          for (const tc of toolCalls) {
            if (typeof tc.function?.arguments === 'string') {
              let targetCall: {name: string, arguments: string} | undefined;
              
              if (tc.function?.name) {
                // Use tc.index when available to avoid mixing fragments from concurrent tool calls
                if (typeof tc.index === 'number') {
                  // Find or create tool call by index using Map
                  targetCall = localToolCallsByIndex.get(tc.index);
                  if (!targetCall) {
                    targetCall = {
                      name: tc.function.name,
                      arguments: tc.function.arguments
                    };
                    localToolCallsByIndex.set(tc.index, targetCall);
                  } else {
                    if (!targetCall.name) {
                      targetCall.name = tc.function.name;
                    }
                    targetCall.arguments += tc.function.arguments;
                  }
                } else {
                  // Fallback to name-only behavior if index is absent
                  targetCall = localToolCalls.find(call => call.name === tc.function.name);
                  if (!targetCall) {
                    targetCall = {
                      name: tc.function.name,
                      arguments: tc.function.arguments
                    };
                    localToolCalls.push(targetCall);
                  } else {
                    targetCall.arguments += tc.function.arguments;
                  }
                }
              } else {
                if (typeof tc.index === 'number') {
                  // Use index-aware lookup for argument-only fragments
                  targetCall = localToolCallsByIndex.get(tc.index);
                  if (targetCall) {
                    targetCall.arguments += tc.function.arguments;
                  } else {
                    // Create new entry at index if not found
                    targetCall = { name: '', arguments: tc.function.arguments };
                    localToolCallsByIndex.set(tc.index, targetCall);
                  }
                } else if (localToolCalls.length > 0) {
                  // Fallback to last call if index is absent
                  targetCall = localToolCalls[localToolCalls.length - 1];
                  targetCall.arguments += tc.function.arguments;
                }
              }
            }
          }
        }
      }
    } catch {
      // ignore malformed final chunk
    }
  }

  // Convert Map back to array for return value
  const finalToolCalls = Array.from(localToolCallsByIndex.values()).concat(localToolCalls);
  
  // Log final provider output (metrics/stats only, no text)
  if (requestId) {
    Logger.info('ai.provider.final', {
      requestId,
      conversationId,
      toolCallCount: finalToolCalls.length,
      emittedToken: localEmittedToken,
      finishReason: diagnostics.finishReasons[diagnostics.finishReasons.length - 1] || null,
    });
    
    if (sendSseDebug) {
      sendSseDebug('debug_provider_final', {
        requestId,
        conversationId,
        text: localReply,
        toolCalls: finalToolCalls,
        emittedToken: localEmittedToken,
      });
    }
  }

  const hasPotentialToolLeak = finalToolCalls.length > 0 || 
    localReply.includes('update_practice_fields');

  if (hasPotentialToolLeak && emitTokens) {
    // Block streaming until reply is explicitly parsed as safe
    diagnostics.failClosedReason = 'potential_tool_leak';
    return {
      reply: localReply,
      toolCalls: finalToolCalls,
      streamStalled,
      emittedToken: localEmittedToken,
      diagnostics: {
        ...diagnostics,
        failClosedReason: 'potential_tool_leak'
      }
    };
  }

  return {
    reply: localReply,
    toolCalls: finalToolCalls,
    streamStalled,
    emittedToken: localEmittedToken,
    diagnostics
  };
};

const normalizeKeys = (obj: unknown): unknown => {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map((item) => normalizeKeys(item));

  const record = obj as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  const mapping: Record<string, string> = {
    practice_service_uuid: 'practiceServiceUuid',
    opposing_party: 'opposingParty',
    desired_outcome: 'desiredOutcome',
    postal_code: 'postalCode',
    address_line1: 'addressLine1',
    address_line_1: 'addressLine1',
    address_line2: 'addressLine2',
    address_line_2: 'addressLine2',
    court_date: 'courtDate',
    household_size: 'householdSize',
    has_documents: 'hasDocuments',
    eligibility_signals: 'eligibilitySignals',
    contact_phone: 'contactPhone',
    business_email: 'businessEmail',
    completion_score: 'completionScore',
    missing_fields: 'missingFields',
    trigger_edit_modal: 'triggerEditModal',
  };

  for (const key of Object.keys(record)) {
    const mapped = mapping[key] || key;
    next[mapped] = normalizeKeys(record[key]);
  }

  return next;
};

type DebuggableAiError = Error & {
  code?: string;
  details?: Record<string, unknown>;
};

const createAiDebugError = (
  message: string,
  code: string,
  details?: Record<string, unknown>
): DebuggableAiError => {
  const error = new Error(message) as DebuggableAiError;
  error.code = code;
  if (details) error.details = details;
  return error;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readStringField = (record: Record<string, unknown> | null, key: string): string | null => {
  if (!record) return null;
  const value = record[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const hasNonEmptyStringField = (record: Record<string, unknown> | null | undefined, key: string): boolean => {
  if (!record) return false;
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0;
};

const readAnyString = (record: Record<string, unknown> | null | undefined, keys: string[]): string | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
};

const isDebugEnabled = (value: unknown): boolean => value === '1' || value === 'true' || value === true;

// ---------------------------------------------------------------------------
// Anthropic SSE stream parser
// ---------------------------------------------------------------------------
// Anthropic streaming uses a different SSE format than OpenAI:
//   event: content_block_start  → opens a text or tool_use block (has index, type, name/id for tools)
//   event: content_block_delta  → text_delta or input_json_delta fragments
//   event: content_block_stop   → closes a block
//   event: message_delta        → carries stop_reason
//   event: message_stop         → stream finished
// Returns the same shape as consumeAiStream so callers are provider-agnostic.
const consumeAnthropicStream = async (
  response: Response,
  emitTokens = true,
  write: (payload: Record<string, unknown>) => void,
  conversationId: string,
  _requestId?: string,
  _sendSseDebug?: (event: string, data: Record<string, unknown>) => void,
): Promise<{
  reply: string;
  toolCalls: Array<{ name: string; arguments: string }>;
  streamStalled: boolean;
  emittedToken: boolean;
  diagnostics: {
    chunkCount: number;
    parsedChunkCount: number;
    malformedChunkCount: number;
    contentChunkCount: number;
    deltaToolCallChunkCount: number;
    namedToolFragmentCount: number;
    argumentOnlyToolFragmentCount: number;
    finishReasons: string[];
    sampleToolChunks: string[];
    sampleUnexpectedChunks: string[];
    failClosedReason?: string;
  };
}> => {
  const empty = () => ({
    reply: '',
    toolCalls: [] as Array<{ name: string; arguments: string }>,
    streamStalled: false,
    emittedToken: false,
    diagnostics: {
      chunkCount: 0, parsedChunkCount: 0, malformedChunkCount: 0,
      contentChunkCount: 0, deltaToolCallChunkCount: 0,
      namedToolFragmentCount: 0, argumentOnlyToolFragmentCount: 0,
      finishReasons: [] as string[], sampleToolChunks: [] as string[],
      sampleUnexpectedChunks: [] as string[],
    },
  });

  if (!response.body) return empty();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const { Logger } = await import('../utils/logger.js');

  let buffer = '';
  let streamStalled = false;
  let localReply = '';
  let localEmittedToken = false;
  let blockedByPotentialToolLeak = false;

  // Tracks open content blocks by index
  const blocks = new Map<number, { type: 'text' | 'tool_use'; name?: string; args: string }>();

  const diagnostics = {
    chunkCount: 0, parsedChunkCount: 0, malformedChunkCount: 0,
    contentChunkCount: 0, deltaToolCallChunkCount: 0,
    namedToolFragmentCount: 0, argumentOnlyToolFragmentCount: 0,
    finishReasons: [] as string[], sampleToolChunks: [] as string[],
    sampleUnexpectedChunks: [] as string[],
    failClosedReason: undefined as string | undefined,
  };

  while (true) {
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    const result = await Promise.race([
      reader.read().then((res) => { if (timeoutTimer) clearTimeout(timeoutTimer); return res; }),
      new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(() => reject(new Error('AI_STREAM_STALL')), AI_STREAM_READ_TIMEOUT_MS);
      }),
    ]).catch(async (error: unknown) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      Logger.warn('Anthropic stream stalled', {
        conversationId,
        reason: error instanceof Error ? error.message : String(error),
      });
      await reader.cancel().catch(() => {});
      streamStalled = true;
      return { done: true, value: undefined };
    });

    const { done, value } = result as { done: boolean; value?: Uint8Array };
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('event:')) continue;
      if (!trimmed.startsWith('data: ')) continue;

      diagnostics.chunkCount += 1;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(trimmed.slice(6));
        diagnostics.parsedChunkCount += 1;
      } catch {
        diagnostics.malformedChunkCount += 1;
        continue;
      }

      const type = event.type as string | undefined;

      if (type === 'content_block_start') {
        const index = event.index as number;
        const block = event.content_block as Record<string, unknown> | undefined;
        if (!block) continue;
        if (block.type === 'text') {
          blocks.set(index, { type: 'text', args: '' });
        } else if (block.type === 'tool_use') {
          blocks.set(index, { type: 'tool_use', name: block.name as string, args: '' });
          diagnostics.namedToolFragmentCount += 1;
        }
        continue;
      }

      if (type === 'content_block_delta') {
        const index = event.index as number;
        const delta = event.delta as Record<string, unknown> | undefined;
        if (!delta) continue;
        const block = blocks.get(index);
        if (!block) continue;

        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          localReply += delta.text;
          diagnostics.contentChunkCount += 1;

          const contentLooksLikeToolLeak = looksLikeToolLeak(delta.text);
          if (contentLooksLikeToolLeak) {
            blockedByPotentialToolLeak = true;
            streamStalled = true;
            diagnostics.failClosedReason = 'potential_tool_leak';
          }

          if (emitTokens && !blockedByPotentialToolLeak) {
            write({ token: delta.text });
            localEmittedToken = true;
          }
        } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          block.args += delta.partial_json;
          diagnostics.deltaToolCallChunkCount += 1;
        }
        continue;
      }

      if (type === 'message_delta') {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (delta?.stop_reason && typeof delta.stop_reason === 'string') {
          diagnostics.finishReasons.push(delta.stop_reason);
        }
        continue;
      }
    }
  }

  const toolCalls: Array<{ name: string; arguments: string }> = [];
  for (const block of blocks.values()) {
    if (block.type === 'tool_use' && block.name) {
      toolCalls.push({ name: block.name, arguments: block.args || '{}' });
    }
  }

  return {
    reply: localReply,
    toolCalls,
    streamStalled,
    emittedToken: localEmittedToken,
    diagnostics,
  };
};

export {
  DEFAULT_AI_MODEL,
  LEGAL_DISCLAIMER,
  MAX_MESSAGES,
  MAX_MESSAGE_LENGTH,
  MAX_TOTAL_LENGTH,
  AI_TIMEOUT_MS,
  AI_STREAM_READ_TIMEOUT_MS,
  CONSULTATION_CTA_REGEX,
  SERVICE_QUESTION_REGEX,
  HOURS_QUESTION_REGEX,
  LEGAL_INTENT_REGEX,
  HARD_ERROR_CODE,
  HARD_ERROR_MESSAGE,
  AI_RETRY_BACKOFF_MS,
  encoder,
  sseEvent,
  createSseResponse,
  consumeAiStream,
  consumeAnthropicStream,
  normalizeKeys,
  createAiDebugError,
  isRecord,
  readStringField,
  hasNonEmptyStringField,
  readAnyString,
  isDebugEnabled,
};

export type { DebuggableAiError };
