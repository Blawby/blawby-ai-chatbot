
const DEFAULT_AI_MODEL = '@cf/zai-org/glm-4.7-flash';
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
  conversationId: string
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
      const { Logger } = await import('../utils/logger.js');
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

      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      if (typeof choice?.finish_reason === 'string' && choice.finish_reason.length > 0) {
        diagnostics.finishReasons.push(choice.finish_reason);
      }
      if (!delta && choice?.message && diagnostics.sampleUnexpectedChunks.length < 3) {
        diagnostics.sampleUnexpectedChunks.push(JSON.stringify(choice.message).slice(0, 240));
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
          }>;
        };
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
    practice_area: 'practiceArea',
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
    accent_color: 'accentColor',
    completion_score: 'completionScore',
    missing_fields: 'missingFields',
    quick_replies: 'quickReplies',
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
  encoder,
  sseEvent,
  createSseResponse,
  consumeAiStream,
  normalizeKeys,
  createAiDebugError,
  isRecord,
  readStringField,
  hasNonEmptyStringField,
  readAnyString,
  isDebugEnabled,
};

export type { DebuggableAiError };
