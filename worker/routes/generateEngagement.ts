/**
 * POST /api/ai/generate-engagement
 *
 * AI-generates an engagement letter body by resolving placeholders from intake
 * enrichment data and polishing the result with GLM-4 Flash.
 *
 * The caller (practice member UI) provides:
 *   - enrichedData: IntakeEnrichedData parsed from intake custom_fields._enriched_data
 *   - template: EngagementLetterTemplate from practice metadata
 *   - intakeFields: known intake field values (client name, email, etc.)
 *
 * Returns: { contractBody: string }
 */

import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import { withPracticeContext, getPracticeId } from '../middleware/practiceContext.js';
import { requirePracticeMember } from '../middleware/auth.js';
import { createWorkersAiClient } from '../utils/workersAiClient.js';
import { Logger } from '../utils/logger.js';
import type { Env } from '../types.js';
import type { IntakeEnrichedData } from '../../src/shared/types/intake.js';

// ---------------------------------------------------------------------------
// Types mirrored from EngagementTemplatesPage.tsx — kept in sync manually
// ---------------------------------------------------------------------------

type EngagementFeeType = 'hourly' | 'flat' | 'contingency' | 'pro_bono';

type EngagementLetterTemplate = {
  id: string;
  name: string;
  practiceArea: string;
  feeType: EngagementFeeType;
  hourlyRateCents: number | null;
  flatFeeCents: number | null;
  contingencyPct: number | null;
  retainerCents: number | null;
  scopeTemplate: string;
  body: string;
};

const SUPPORTED_FEE_TYPES = ['hourly', 'flat', 'contingency', 'pro_bono'] as const;

type IntakeFields = {
  clientName: string;
  clientEmail: string;
  opposingParty?: string | null;
  description?: string | null;
  courtDate?: string | null;
  jurisdiction?: string | null;
  practiceName?: string | null;
};

export type GenerateEngagementDraftInput = {
  enrichedData?: unknown;
  template?: unknown;
  intakeFields?: unknown;
};

// ---------------------------------------------------------------------------
// Placeholder resolution
// ---------------------------------------------------------------------------

const formatCentsAsDollars = (cents: number | null | undefined): string => {
  if (cents == null || !Number.isFinite(cents) || cents <= 0) return '';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const resolveStaticPlaceholders = (
  body: string,
  template: EngagementLetterTemplate,
  enriched: IntakeEnrichedData | null,
  intake: IntakeFields,
): string => {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const feeText = (() => {
    switch (template.feeType) {
      case 'hourly': return formatCentsAsDollars(template.hourlyRateCents);
      case 'flat': return formatCentsAsDollars(template.flatFeeCents);
      case 'contingency': return template.contingencyPct != null ? `${template.contingencyPct}%` : '';
      case 'pro_bono': return 'pro bono';
    }
  })();

  const replacements: Record<string, string> = {
    '{{clientName}}': intake.clientName ?? '',
    '{{clientEmail}}': intake.clientEmail ?? '',
    '{{date}}': today,
    '{{practiceName}}': intake.practiceName ?? '',
    '{{practiceArea}}': enriched?.practice_area ?? template.practiceArea ?? '',
    '{{opposingParty}}': intake.opposingParty ?? '',
    '{{courtDate}}': intake.courtDate ?? '',
    '{{jurisdiction}}': intake.jurisdiction ?? '',
    '{{matterDescription}}': enriched?.ai_matter_description ?? intake.description ?? '',
    '{{scope}}': enriched?.ai_scope_suggestion ?? template.scopeTemplate ?? '',
    '{{hourlyRate}}': template.feeType === 'hourly' ? feeText : '',
    '{{flatFee}}': template.feeType === 'flat' ? feeText : '',
    '{{retainer}}': formatCentsAsDollars(template.retainerCents),
    '{{contingencyPct}}': template.feeType === 'contingency' ? feeText : '',
  };

  return Object.entries(replacements).reduce(
    (text, [placeholder, value]) => text.replaceAll(placeholder, value),
    body,
  );
};

// ---------------------------------------------------------------------------
// AI generation
// ---------------------------------------------------------------------------

const DEFAULT_AI_MODEL = '@cf/zai-org/glm-4.7-flash';
const ENGAGEMENT_MAX_TOKENS = 1200;

const generateContractBody = async (
  env: Env,
  partialBody: string,
  enriched: IntakeEnrichedData | null,
  intake: IntakeFields,
  template: EngagementLetterTemplate,
): Promise<string> => {
  let aiClient;
  try {
    aiClient = createWorkersAiClient(env);
  } catch (error) {
    Logger.warn('[generateEngagement] AI client unavailable', {
      error: error instanceof Error ? error.message : String(error),
    });
    return partialBody;
  }

  const contextFacts = [
    `Client: ${intake.clientName}`,
    enriched?.practice_area ? `Practice area: ${enriched.practice_area}` : null,
    enriched?.sub_type ? `Matter type: ${enriched.sub_type}` : null,
    enriched?.matter_stage ? `Stage: ${enriched.matter_stage}` : null,
    enriched?.complexity ? `Complexity: ${enriched.complexity}` : null,
    enriched?.ai_matter_description ? `Matter description: ${enriched.ai_matter_description}` : null,
    enriched?.ai_scope_suggestion ? `Suggested scope: ${enriched.ai_scope_suggestion}` : null,
    intake.opposingParty ? `Opposing party: ${intake.opposingParty}` : null,
    intake.jurisdiction ? `Jurisdiction: ${intake.jurisdiction}` : null,
    intake.courtDate ? `Court date: ${intake.courtDate}` : null,
    `Fee arrangement: ${template.feeType}`,
  ].filter(Boolean).join('\n');

  const systemPrompt = [
    'You are a legal professional drafting an engagement letter.',
    'You will be given a partially-filled engagement letter template and context about the matter.',
    'Your task:',
    '1. Fill in any remaining {{placeholder}} tokens that were not already substituted.',
    '2. Remove any placeholder tokens for which there is no available information (replace with a professional placeholder like "[to be determined]" if appropriate).',
    '3. Polish the letter to read naturally and professionally.',
    '4. Do NOT add legal advice, change fee amounts, or alter the scope beyond what is provided.',
    '5. Return ONLY the final letter body text — no commentary, no markdown fences.',
  ].join('\n');

  const userContent = [
    'MATTER CONTEXT:',
    contextFacts,
    '',
    'TEMPLATE (partially filled):',
    partialBody,
  ].join('\n');

  let response: Response;
  try {
    response = await aiClient.requestChatCompletions({
      model: env.AI_MODEL || DEFAULT_AI_MODEL,
      temperature: 0.3,
      max_tokens: ENGAGEMENT_MAX_TOKENS,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });
  } catch (error) {
    Logger.warn('[generateEngagement] AI request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return partialBody;
  }

  if (!response.ok) {
    Logger.warn('[generateEngagement] AI response not ok', { status: response.status });
    return partialBody;
  }

  const payload = await response.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  } | null;

  const content = payload?.choices?.[0]?.message?.content;
  return typeof content === 'string' && content.trim() ? content.trim() : partialBody;
};

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const isValidIntakeFields = (v: unknown): v is IntakeFields => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.clientName === 'string' && o.clientName.trim().length > 0
    && typeof o.clientEmail === 'string' && o.clientEmail.trim().length > 0;
};

const isValidTemplate = (v: unknown): v is EngagementLetterTemplate => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string'
    && typeof o.body === 'string'
    && typeof o.feeType === 'string'
    && SUPPORTED_FEE_TYPES.includes(o.feeType as EngagementFeeType);
};

export const generateEngagementDraft = async (
  env: Env,
  input: GenerateEngagementDraftInput,
): Promise<{ contractBody: string; partialBody: string }> => {
  if (!isValidTemplate(input.template)) {
    throw HttpErrors.badRequest('template is required and must include id, body, and feeType');
  }
  if (!isValidIntakeFields(input.intakeFields)) {
    throw HttpErrors.badRequest('intakeFields must include clientName and clientEmail');
  }

  const enriched = (input.enrichedData && typeof input.enrichedData === 'object' && !Array.isArray(input.enrichedData))
    ? input.enrichedData as IntakeEnrichedData
    : null;

  const partialBody = resolveStaticPlaceholders(
    input.template.body,
    input.template,
    enriched,
    input.intakeFields,
  );

  const contractBody = await generateContractBody(env, partialBody, enriched, input.intakeFields, input.template);
  return { contractBody, partialBody };
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const handleGenerateEngagement = async (request: Request, env: Env): Promise<Response> => {
  if (request.method !== 'POST') {
    throw HttpErrors.methodNotAllowed('Only POST is supported');
  }

  const requestWithContext = await withPracticeContext(request, env, { requirePractice: true });
  const practiceId = getPracticeId(requestWithContext);

  await requirePracticeMember(requestWithContext, env, practiceId, 'paralegal');

  const body = await parseJsonBody(request) as {
    enrichedData?: unknown;
    template?: unknown;
    intakeFields?: unknown;
  };

  const { contractBody } = await generateEngagementDraft(env, body);

  return new Response(JSON.stringify({ contractBody }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
