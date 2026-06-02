/**
 * POST /api/ai/draft-engagement-template
 *
 * Generates a new engagement letter template from a natural language prompt.
 * Returns a populated EngagementLetterTemplate shape ready to open in the editor.
 *
 * Body: { prompt: string, practiceArea?: string, feeType?: EngagementFeeType }
 * Returns: { template: Partial<EngagementLetterTemplate> }
 */

import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import { withPracticeContext, getPracticeId } from '../middleware/practiceContext.js';
import { requirePracticeMember } from '../middleware/auth.js';
import { createWorkersAiClient } from '../utils/workersAiClient.js';
import { Logger } from '../utils/logger.js';
import type { Env } from '../types.js';

type EngagementFeeType = 'hourly' | 'flat' | 'contingency' | 'pro_bono';

const SUPPORTED_FEE_TYPES: readonly string[] = ['hourly', 'flat', 'contingency', 'pro_bono'];

type DraftTemplateInput = {
  prompt: string;
  practiceArea?: string;
  feeType?: EngagementFeeType;
};

type DraftedTemplate = {
  name: string;
  practiceArea: string;
  feeType: EngagementFeeType;
  scopeTemplate: string;
  body: string;
};

const DEFAULT_AI_MODEL = '@cf/zai-org/glm-4.7-flash';
const DRAFT_MAX_TOKENS = 1800;

const draftTemplate = async (
  env: Env,
  input: DraftTemplateInput,
): Promise<DraftedTemplate> => {
  const { prompt, practiceArea = '', feeType = 'hourly' } = input;

  let aiClient;
  try {
    aiClient = createWorkersAiClient(env);
  } catch {
    throw HttpErrors.serviceUnavailable('AI service is not available');
  }

  const systemPrompt = [
    'You are a legal professional drafting engagement letter templates for a law practice management app.',
    'The user will describe the kind of engagement letter template they want.',
    'You must respond with valid JSON only — no markdown, no commentary.',
    '',
    'Required JSON shape:',
    '{',
    '  "name": "short descriptive template name (e.g. \\"Family Law – Hourly Engagement\\")",',
    '  "practiceArea": "the practice area (e.g. \\"Family\\", \\"Estate\\", \\"Litigation\\")",',
    '  "feeType": "one of: hourly | flat | contingency | pro_bono",',
    '  "scopeTemplate": "2-4 sentences describing the default scope of representation",',
    '  "body": "the full engagement letter body using {{placeholder}} tokens"',
    '}',
    '',
    'Available {{placeholder}} tokens for the body:',
    '{{clientName}}, {{clientEmail}}, {{date}}, {{practiceName}},',
    '{{practiceArea}}, {{opposingParty}}, {{courtDate}}, {{jurisdiction}},',
    '{{matterDescription}}, {{scope}}, {{hourlyRate}}, {{flatFee}},',
    '{{retainer}}, {{contingencyPct}}',
    '',
    'Use placeholder tokens liberally so the assistant can fill them per matter.',
    'The letter should be professional, complete, and 300-600 words.',
  ].join('\n');

  const userContent = [
    prompt,
    practiceArea ? `Practice area: ${practiceArea}` : null,
    feeType ? `Fee type: ${feeType}` : null,
  ].filter(Boolean).join('\n');

  let response: Response;
  try {
    response = await aiClient.requestChatCompletions({
      model: env.AI_MODEL || DEFAULT_AI_MODEL,
      temperature: 0.4,
      max_tokens: DRAFT_MAX_TOKENS,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });
  } catch (error) {
    Logger.warn('[draftEngagementTemplate] AI request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw HttpErrors.serviceUnavailable('AI draft failed');
  }

  if (!response.ok) {
    Logger.warn('[draftEngagementTemplate] AI response not ok', { status: response.status });
    throw HttpErrors.serviceUnavailable('AI draft failed');
  }

  const payload = await response.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  } | null;

  const raw = payload?.choices?.[0]?.message?.content?.trim() ?? '';

  // Strip markdown fences if the model wraps in ```json ... ```
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    Logger.warn('[draftEngagementTemplate] Failed to parse AI JSON', { raw: raw.slice(0, 200) });
    throw HttpErrors.internalServerError('AI returned unparseable response');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw HttpErrors.internalServerError('AI returned unexpected shape');
  }

  const obj = parsed as Record<string, unknown>;
  const resolvedFeeType = SUPPORTED_FEE_TYPES.includes(String(obj.feeType))
    ? (obj.feeType as EngagementFeeType)
    : feeType;
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  const body = typeof obj.body === 'string' ? obj.body.trim() : '';

  if (!name || !body) {
    const diagnostics = {
      name,
      bodyLength: body.length,
      resolvedFeeType,
      modelOutput: obj,
    };
    Logger.warn('[draftEngagementTemplate] AI returned incomplete draft fields', diagnostics);
    throw HttpErrors.internalServerError(`AI returned incomplete draft fields: ${JSON.stringify(diagnostics)}`);
  }

  return {
    name,
    practiceArea: typeof obj.practiceArea === 'string' ? obj.practiceArea.trim() : practiceArea,
    feeType: resolvedFeeType,
    scopeTemplate: typeof obj.scopeTemplate === 'string' ? obj.scopeTemplate.trim() : '',
    body,
  };
};

export const handleDraftEngagementTemplate = async (request: Request, env: Env): Promise<Response> => {
  if (request.method !== 'POST') {
    throw HttpErrors.methodNotAllowed('Only POST is supported');
  }

  const requestWithContext = await withPracticeContext(request, env, { requirePractice: true });
  const practiceId = getPracticeId(requestWithContext);

  await requirePracticeMember(requestWithContext, env, practiceId, 'paralegal');

  const body = await parseJsonBody(requestWithContext) as Record<string, unknown>;

  if (typeof body?.prompt !== 'string' || !body.prompt.trim()) {
    throw HttpErrors.badRequest('prompt is required');
  }

  const feeType = SUPPORTED_FEE_TYPES.includes(String(body.feeType))
    ? (body.feeType as EngagementFeeType)
    : undefined;

  const template = await draftTemplate(env, {
    prompt: body.prompt.trim(),
    practiceArea: typeof body.practiceArea === 'string' ? body.practiceArea : undefined,
    feeType,
  });

  return new Response(JSON.stringify({ template }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
