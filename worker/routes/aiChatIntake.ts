import {
  readAnyString,
  LEGAL_INTENT_REGEX,
} from './aiChatShared.js';
import {
  isIntakeReadyForSubmission as isSharedIntakeReadyForSubmission,
  isIntakeSubmittable as isSharedIntakeSubmittable,
} from '../../src/shared/utils/consultationState';
import type { ChatMessageAction } from '../../src/shared/types/conversation';
import { createSubmitAction } from '../../src/shared/utils/chatActions';
import type { IntakeFieldDefinition, IntakeTemplate } from '../../src/shared/types/intake.js';
import { STANDARD_FIELD_KEYS, DEFAULT_INTAKE_TEMPLATE } from '../../src/shared/constants/intakeTemplates.js';
import {
  resolveNextField,
  isFieldCollected,
  isIntakeCompleteForTemplate,
  getRequiredFieldProgress,
} from '../../src/shared/utils/intakeOrchestration.js';
import { Logger } from '../utils/logger.js';

const MAX_SERVICES_IN_PROMPT = 20;
const MAX_SERVICES_IN_CONVERSATION_PROMPT = 8;
type IntakePromptService = { name: string; uuid: string };

const US_STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC',
};

// ---------------------------------------------------------------------------
// Tool definitions — three discrete tools the model calls naturally
// ---------------------------------------------------------------------------

/**
 * Builds the save_case_details tool schema dynamically from the resolved
 * IntakeTemplate fields. Falls back to the default template if fields are empty.
 */
export function buildSaveCaseDetailsTool(fields: IntakeFieldDefinition[]) {
  const activeFields = fields.length > 0 ? fields : DEFAULT_INTAKE_TEMPLATE.fields;
  const properties: Record<string, object> = {};

  for (const field of activeFields) {
    if (field.type === 'select' && Array.isArray(field.options) && field.options.length > 0) {
      properties[field.key] = {
        type: 'string',
        enum: field.options,
        description: field.label,
      };
    } else if (field.type === 'boolean') {
      properties[field.key] = {
        type: 'boolean',
        description: field.label,
      };
    } else if (field.type === 'date') {
      properties[field.key] = {
        type: 'string',
        description: `Date in ISO 8601 format (YYYY-MM-DD) for: ${field.label}. Omit if not explicitly stated.`,
      };
    } else if (field.type === 'number') {
      properties[field.key] = {
        type: 'number',
        description: field.label,
      };
    } else {
      // 'text' and any other type
      properties[field.key] = {
        type: 'string',
        description: field.label,
      };
    }
  }

  // Always include practiceServiceUuid even if not in a custom template
  // so the model can still call save with a service UUID.
  if (!properties.practiceServiceUuid) {
    properties.practiceServiceUuid = {
      type: 'string',
      description: 'Service UUID from the firm services list provided in context',
    };
  }

  return {
    type: 'function',
    function: {
      name: 'save_case_details',
      description: 'Save case information collected in the conversation. Call when you have the required fields at minimum. Can be called incrementally as more information is gathered.',
      parameters: {
        type: 'object',
        properties,
        required: [],
      },
    },
  } as const;
}

/** Convenience constant: the default tool schema using the default template. */
export const SAVE_CASE_DETAILS_TOOL = buildSaveCaseDetailsTool(DEFAULT_INTAKE_TEMPLATE.fields);

/**
 * Generates the field instruction block injected into the system prompt.
 * Incorporates Phase 2 (promptHint) and Phase 3 (validationHint, condition).
 */
export function buildFieldInstructions(fields: IntakeFieldDefinition[]): string {
  const activeFields = fields.length > 0 ? fields : DEFAULT_INTAKE_TEMPLATE.fields;
  return activeFields.map((f) => {
    const req = f.required ? '(required)' : '(optional)';
    const questionText = f.isStandard ? (f.previewQuestion?.trim() || f.label) : f.label;
    const opts =
      f.type === 'select' && Array.isArray(f.options) && f.options.length > 0
        ? ` Options: ${f.options.join(', ')}.`
        : '';
    const validation = f.validationHint ? ` Valid answer: ${f.validationHint}` : '';
    const cond = f.condition
      ? ` Only ask if ${f.condition.dependsOn} is "${f.condition.value}".`
      : '';
    return `- ${questionText} ${req}${opts}${validation}${cond}`;
  }).join('\n');
}


export const REQUEST_PAYMENT_TOOL = {
  type: 'function',
  function: {
    name: 'request_payment',
    description: 'Trigger the payment flow when the practice requires a consultation fee and intake is complete. Call only when all required case details are collected.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Brief explanation shown to the user about why payment is required',
        },
      },
      required: ['reason'],
    },
  },
} as const;

export const SUBMIT_INTAKE_TOOL = {
  type: 'function',
  function: {
    name: 'submit_intake',
    description: 'Submit the intake to the firm. Call only after the user has explicitly confirmed they are ready to submit.',
    parameters: {
      type: 'object',
      properties: {
        confirmed: {
          type: 'boolean',
          description: 'Must be true — the user confirmed they are ready',
        },
      },
      required: ['confirmed'],
    },
  },
} as const;

export const ASK_USER_QUESTION_TOOL = {
  type: 'function',
  function: {
    name: 'ask_user_question',
    description: 'Ask a structured question with answer options. Use this when the answer shape is known (yes/no, fixed choices, state selection).',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The exact question to ask the user.',
        },
        options: {
          type: 'array',
          description: 'Selectable answer options shown as quick replies.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'User-facing option label.' },
              value: { type: 'string', description: 'Reply text sent when this option is selected.' },
            },
            required: ['label'],
          },
          minItems: 1,
        },
      },
      required: ['question', 'options'],
    },
  },
} as const;

/** Builds the full intake tools array for a given template's field list. */
export function buildIntakeTools(fields: IntakeFieldDefinition[]) {
  return [
    buildSaveCaseDetailsTool(fields),
    REQUEST_PAYMENT_TOOL,
    SUBMIT_INTAKE_TOOL,
    ASK_USER_QUESTION_TOOL,
  ] as const;
}

/** Default tools using the default template. */
export const INTAKE_TOOLS = buildIntakeTools(DEFAULT_INTAKE_TEMPLATE.fields);

// ---------------------------------------------------------------------------
// Tool result types
// ---------------------------------------------------------------------------

export interface ToolResult {
  success: boolean;
  message?: string;
  actions?: ChatMessageAction[];
  question?: {
    text: string;
    options: Array<{ label: string; value: string }>;
  };
  intakeFields?: Record<string, unknown>;
  triggerPayment?: boolean;
  triggerSubmit?: boolean;
  submittable?: boolean;
}

// ---------------------------------------------------------------------------
// Tool handlers — persist to DB, return structured results
// ---------------------------------------------------------------------------

export const handleSaveCaseDetails = (
  args: Record<string, unknown>,
  storedIntakeState: Record<string, unknown> | null,
  submissionGate: IntakeSubmissionGate,
): ToolResult => {
  const patch: Record<string, unknown> = {};
  const customFieldsPatch: Record<string, string | boolean | number> = {};

  const description = typeof args.description === 'string' ? args.description.trim().slice(0, 300) : (typeof storedIntakeState?.description === 'string' ? (storedIntakeState.description as string) : '');
  const city = typeof args.city === 'string' ? args.city.trim() : (typeof storedIntakeState?.city === 'string' ? (storedIntakeState.city as string) : '');
  const rawState = typeof args.state === 'string' ? args.state.trim() : (typeof storedIntakeState?.state === 'string' ? (storedIntakeState.state as string) : '');
  const state = normalizeStateCode(rawState);

  // Field routing: description/city/state are normalized separately for backward compat.
  // The save handler accepts any partial save — the orchestration layer owns "what's required".

  // Only include fields in the patch if they were provided in this specific tool call (delta)
  if (typeof args.description === 'string') patch.description = description;
  if (typeof args.city === 'string') patch.city = city;
  if (typeof args.state === 'string' && state) patch.state = state;

  // Route each arg to the correct bucket based on whether it is a standard field
  for (const [key, value] of Object.entries(args)) {
    if (key === 'description' || key === 'city' || key === 'state') continue; // already handled above

    if (STANDARD_FIELD_KEYS.has(key)) {
      // Standard field — goes directly onto the intake state patch
      if (key === 'opposingParty' && typeof value === 'string' && value.trim()) {
        patch.opposingParty = value.trim();
      } else if (key === 'practiceServiceUuid' && typeof value === 'string' && value.trim()) {
        patch.practiceServiceUuid = value.trim();
      } else if (key === 'urgency' && (value === 'routine' || value === 'time_sensitive' || value === 'emergency')) {
        patch.urgency = value;
      } else if (key === 'desiredOutcome' && typeof value === 'string' && value.trim()) {
        patch.desiredOutcome = value.trim().slice(0, 150);
      } else if (key === 'courtDate' && typeof value === 'string' && value.trim()) {
        patch.courtDate = value.trim();
      } else if (key === 'hasDocuments' && typeof value === 'boolean') {
        patch.hasDocuments = value;
      } else if (key === 'householdSize' && Number.isFinite(value)) {
        patch.householdSize = Math.max(0, Math.floor(value as number));
      }
    } else {
      // Non-standard field — goes into customFields
      if (typeof value === 'string' && value.trim()) {
        customFieldsPatch[key] = value.trim();
      } else if (typeof value === 'boolean') {
        customFieldsPatch[key] = value;
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        customFieldsPatch[key] = value;
      }
    }
  }

  // Merge customFields with any existing ones
  if (Object.keys(customFieldsPatch).length > 0) {
    const existingCustom = (storedIntakeState?.customFields as Record<string, string | boolean | number> | undefined) ?? {};
    patch.customFields = { ...existingCustom, ...customFieldsPatch };
  }

  const merged = mergeIntakeState(storedIntakeState, patch);
  const isSubmittable = isIntakeSubmittable(merged, submissionGate);
  const isEnrichmentMode = merged?.enrichmentMode === true;

  // Recompute nextEnrichmentField from the POST-merge state so that
  // the field that was just answered is correctly skipped. The pre-save
  // value on the gate is stale the moment a field is answered.
  // Only call resolveNextField when we are in enrichment mode AND
  // an active template is available AND the merged state is non-null.
  // If the template is missing or merged is null, set `undefined` to
  // indicate a template/missing-state sentinel and log a warning.
  let postSaveNextEnrichmentField: IntakeFieldDefinition | null | undefined;
  if (isEnrichmentMode) {
    if (!submissionGate.activeTemplate) {
      postSaveNextEnrichmentField = undefined;
      Logger.warn('[aiChatIntake] Enrichment mode active but submissionGate.activeTemplate is missing', { submissionGate });
    } else if (!merged) {
      postSaveNextEnrichmentField = undefined;
      Logger.warn('[aiChatIntake] Enrichment mode active but merged intake state is null', { submissionGate });
    } else {
      postSaveNextEnrichmentField = resolveNextField(submissionGate.activeTemplate, merged as Record<string, unknown>, 'enrichment');
    }
  } else {
    postSaveNextEnrichmentField = null;
  }

  // Template fee presence takes precedence over practice details — allow zero values.
  const templatePaymentConfigured = typeof submissionGate.templateConsultationFee === 'number';
  const consultationFee = templatePaymentConfigured
    ? submissionGate.templateConsultationFee
    : readFiniteNumberField(submissionGate.details, ['consultationFee', 'consultation_fee']);
  const actions = deriveNextActions(merged, submissionGate, consultationFee, postSaveNextEnrichmentField);
  if (actions.length > 0) {
    patch.ctaShown = true;
  }

  return {
    success: true,
    message: isEnrichmentMode && postSaveNextEnrichmentField === null
      ? 'Enrichment complete. All optional fields collected. Summarize what you have and invite the user to submit.'
      : isSubmittable
        ? 'Case details saved. All required fields collected.'
        : 'Case details saved. Continue collecting remaining fields.',
    intakeFields: patch,
    actions: actions.length > 0 ? actions : undefined,
    submittable: isSubmittable,
  };
};

export const handleRequestPayment = (
  args: Record<string, unknown>,
): ToolResult => {
  const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
  return {
    success: true,
    message: reason ? `Payment requested: ${reason}` : 'Payment requested.',
    triggerPayment: true,
    actions: [createSubmitAction('Continue')],
  };
};

export const handleSubmitIntake = (
  args: Record<string, unknown>,
): ToolResult => {
  const confirmed = args.confirmed === true;
  if (!confirmed) {
    return {
      success: false,
      message: 'Submit not confirmed by user.',
    };
  }
  return {
    success: true,
    message: 'Intake submission confirmed.',
    triggerSubmit: true,
    actions: [createSubmitAction('Submit request')],
  };
};

export const handleAskUserQuestion = (
  args: Record<string, unknown>,
): ToolResult => {
  const question = typeof args.question === 'string' ? args.question.trim() : '';
  const rawOptions = Array.isArray(args.options) ? args.options : [];
  const options = rawOptions
    .map((option) => {
      if (!option || typeof option !== 'object') return null;
      const record = option as Record<string, unknown>;
      const label = typeof record.label === 'string' ? record.label.trim() : '';
      if (!label) return null;
      const value = typeof record.value === 'string' && record.value.trim()
        ? record.value.trim()
        : label;
      return { label, value };
    })
    .filter((option): option is { label: string; value: string } => Boolean(option));

  if (!question || options.length === 0) {
    return {
      success: false,
      message: 'ask_user_question requires a question and at least one valid option.',
    };
  }

  return {
    success: true,
    message: question,
    question: { text: question, options },
    actions: options.map((option) => ({
      type: 'reply',
      label: option.label,
      value: option.value,
    })),
  };
};

// ---------------------------------------------------------------------------
// Execute a tool call by name
// ---------------------------------------------------------------------------

export const executeIntakeTool = (
  toolName: string,
  rawArgs: string,
  storedIntakeState: Record<string, unknown> | null,
  submissionGate: IntakeSubmissionGate,
): ToolResult => {
  let args: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawArgs);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { success: false, message: `Failed to parse tool arguments for ${toolName}` };
    }
    args = parsed as Record<string, unknown>;
  } catch {
    return { success: false, message: `Failed to parse tool arguments for ${toolName}` };
  }

  switch (toolName) {
    case 'save_case_details':
      return handleSaveCaseDetails(args, storedIntakeState, submissionGate);
    case 'request_payment':
      return handleRequestPayment(args);
    case 'submit_intake':
      return handleSubmitIntake(args);
    case 'ask_user_question':
      return handleAskUserQuestion(args);
    default:
      return { success: false, message: `Unknown tool: ${toolName}` };
  }
};

// ---------------------------------------------------------------------------
// Suggested replies derived from tool results (not from model output)
// ---------------------------------------------------------------------------

const deriveNextActions = (
  mergedState: Record<string, unknown> | null,
  submissionGate: IntakeSubmissionGate,
  consultationFee?: number | null,
  /** Next enrichment field from the orchestration layer — replaces resolveNextEnrichmentField */
  nextEnrichmentField?: IntakeFieldDefinition | null,
): ChatMessageAction[] => {
  if (!mergedState) return [];

  const formattedFee = typeof consultationFee === 'number' && consultationFee > 0 ? formatCurrency(consultationFee / 100) : null;
  const payLabel = formattedFee ? `Pay ${formattedFee}` : 'Pay and submit';
  const isEnrichmentMode = mergedState.enrichmentMode === true;

  if (isEnrichmentMode) {
    // During enrichment, do not show the Submit button until enrichment is complete.
    // If there is an outstanding enrichment field, return no actions (hide submit/quick-replies).
    if (nextEnrichmentField) {
      return [];
    }
    const submitAction = createSubmitAction(
      submissionGate.paymentRequiredBeforeSubmit && !submissionGate.paymentCompleted
        ? payLabel
        : 'Submit request'
    );
    return [submitAction];
  }

  // All required fields collected — either payment or submit
  if (isIntakeSubmittable(mergedState, submissionGate)) {
    return [
      createSubmitAction(submissionGate.paymentRequiredBeforeSubmit && !submissionGate.paymentCompleted ? payLabel : 'Submit request'),
      { type: 'strengthen_case', label: 'Strengthen my case first' } as ChatMessageAction,
    ];
  }

  // Payment required (case info complete, payment pending)
  if (
    submissionGate.paymentRequiredBeforeSubmit &&
    !submissionGate.paymentCompleted &&
    isIntakeReadyForSubmission(mergedState)
  ) {
    return [
      createSubmitAction(payLabel),
      { type: 'strengthen_case', label: 'Strengthen my case first' } as ChatMessageAction,
    ];
  }

  return [];
};

// deriveFieldQuickReplies removed — not currently used. Reintroduce
// and export if quick-reply suggestions are needed in the future.

// ---------------------------------------------------------------------------
// Orchestration helpers re-exported for use in aiChat.ts
// ---------------------------------------------------------------------------
export { resolveNextField, isFieldCollected, isIntakeCompleteForTemplate, getRequiredFieldProgress };

// ---------------------------------------------------------------------------
// The unified system prompt — surgical single-field focus per turn
// ---------------------------------------------------------------------------

/**
 * Builds the system prompt for a single intake turn.
 *
 * With the orchestration layer in place, the AI is told EXACTLY which field
 * to ask about this turn (`nextField`). It does not decide what comes next.
 * When `nextField` is null, all required fields are done — the prompt shifts
 * to asking the user if they're ready to submit or want enrichment.
 *
 * For enrichment turns, pass `nextEnrichmentField` alongside `nextField: null`.
 */
export const buildIntakeSystemPrompt = (
  services: IntakePromptService[],
  practiceContext: Record<string, unknown> | null,
  storedIntakeState: Record<string, unknown> | null,
  userName?: string | null,
  /** The single field to collect this turn (required phase), or null if done */
  nextField?: IntakeFieldDefinition | null,
  /** The single enrichment field to collect this turn, or null */
  nextEnrichmentField?: IntakeFieldDefinition | null,
): string => {
  const cappedServices = services.slice(0, MAX_SERVICES_IN_CONVERSATION_PROMPT);
  const serviceList = cappedServices.length > 0
    ? cappedServices.map((s) => `- ${s.name} (practice_service_uuid: ${s.uuid})`).join('\n')
    : '- General legal matters';

  const practiceName = typeof practiceContext?.practiceName === 'string'
    ? practiceContext.practiceName.trim()
    : 'this law firm';
  const intakeContext = buildIntakeContextSummary(storedIntakeState, services);
  const firstName = userName ? getFirstName(userName) : null;
  const userSalutationSnippet = firstName ? `The user's first name is ${firstName}. ` : '';
  const userNamingInstruction = firstName ? ` Address them as ${firstName}.` : '';

  const licensedJurisdictions = typeof practiceContext?.licensedJurisdictions === 'string' && practiceContext.licensedJurisdictions.trim()
    ? practiceContext.licensedJurisdictions.trim()
    : '';
  const licensedStatesSnippet = licensedJurisdictions
    ? `\nThis firm is licensed in: ${licensedJurisdictions}.`
    : '';

  const isEnrichmentMode = storedIntakeState?.enrichmentMode === true;

  // --- Build the per-field instruction block ---
  // Determine which field the AI should focus on this turn.
  const activeField = isEnrichmentMode ? nextEnrichmentField : nextField;

  const fieldBlock = activeField ? (() => {
    const typeHint = activeField.type === 'select' && activeField.options?.length
      ? `\n  Accepted values: ${activeField.options.join(', ')}`
      : activeField.type === 'date'
        ? '\n  Accept any common date format (month/day/year, natural language, etc.)'
        : activeField.type === 'boolean'
          ? '\n  Accept yes/no. Ask a simple yes/no question.'
          : activeField.type === 'number'
            ? '\n  Expect a numeric answer.'
            : '';
    const validation = activeField.validationHint ? `\n  Valid answer: ${activeField.validationHint}` : '';
    const condNote = activeField.condition
      ? `\n  Context: only relevant when ${activeField.condition.dependsOn} is "${activeField.condition.value}"` 
      : '';
    return `Your ONLY job this turn is to ask about ONE field:
  Field: ${activeField.label}
  Key: ${activeField.key}
  Type: ${activeField.type}${typeHint}${validation}${condNote}

Ask about this field naturally in one or two sentences.${userNamingInstruction}
When the user answers, call save_case_details with the answered field. If the user provides multiple field values in one response (e.g. city and state together), include all of them in the same save_case_details call.
If the answer is unclear or invalid, ask exactly ONE clarifying follow-up.
Never ask about any other field this turn.`;
  })() : isEnrichmentMode
    ? `All enrichment questions have been answered. Thank the user and confirm their case is as strong as possible. The submit action is available.`
    : `All required information has been collected.${userNamingInstruction}
${storedIntakeState ? `Warmly acknowledge what you have:` : ''}
${intakeContext ? intakeContext : ''}

Ask if they are ready to submit, or if they would like to add more detail to strengthen their case.
Do NOT ask any more intake questions.`;

  // --- Tool usage rules (always included) ---
  const toolRules = `Tool usage rules:
- Call save_case_details to persist any field value the user provides.
- Call request_payment when all required case details are gathered AND the practice requires payment.
- Call submit_intake only when the user explicitly says they are ready to submit.
- Use ask_user_question for known-answer-shape questions (yes/no, fixed choices, state selection).
- Never call a tool without also writing a conversational response.`;

  // --- Conversation rules (always included) ---
  const convRules = `Conversation rules:
- Be warm and human — like a knowledgeable friend, not a form
- Never give legal advice
- Never ask for contact info (name, email, phone) — already collected
- Never output raw JSON, field keys, or tool names in your reply text${licensedJurisdictions ? `\n- Licensed jurisdiction guidance: If the user's matter involves a location outside (${licensedJurisdictions}), acknowledge warmly without hard rejection — frame as a fit question for the attorney.` : ''}`;

  const consultationFeeNote = `- If a consultation fee is required: Mention the fee softly as the next step. Max 2 sentences.
- If no fee is required: Ask if they are ready to send it over for review.`;

  const contextBlock = intakeContext && activeField
    ? `What has been collected so far:\n${intakeContext}`
    : '';

  return `${userSalutationSnippet}You are a warm, helpful legal intake assistant for ${practiceName}.${licensedStatesSnippet}

This firm handles the following practice areas:
${serviceList}

${fieldBlock}

${toolRules}

${convRules}

${consultationFeeNote}
${contextBlock ? `\n${contextBlock}` : ''}`.trim();
};


function buildIntakeContextSummary(
  state: Record<string, unknown> | null,
  services: IntakePromptService[],
): string {
  if (!state) return '';
  const serviceNameByUuid = new Map(services.map((s) => [s.uuid, s.name]));
  const lines: string[] = [];

  if (typeof state.description === 'string' && state.description.trim()) {
    lines.push(`Situation: ${state.description.trim().slice(0, 200)}`);
  }
  if (typeof state.practiceServiceUuid === 'string' && state.practiceServiceUuid.trim()) {
    const label = serviceNameByUuid.get(state.practiceServiceUuid.trim()) ?? state.practiceServiceUuid.trim();
    lines.push(`Practice area: ${label}`);
  }
  if (typeof state.city === 'string' && state.city.trim()) lines.push(`City: ${state.city.trim()}`);
  if (typeof state.state === 'string' && state.state.trim()) lines.push(`State: ${state.state.trim()}`);
  if (typeof state.opposingParty === 'string' && state.opposingParty.trim()) lines.push(`Opposing party: ${state.opposingParty.trim()}`);
  if (typeof state.urgency === 'string' && state.urgency.trim()) lines.push(`Urgency: ${state.urgency.trim()}`);
  if (typeof state.desiredOutcome === 'string' && state.desiredOutcome.trim()) lines.push(`Desired outcome: ${state.desiredOutcome.trim().slice(0, 150)}`);
  if (typeof state.hasDocuments === 'boolean') lines.push(`Has documents: ${state.hasDocuments}`);
  if (typeof state.householdSize === 'number') lines.push(`Household size: ${state.householdSize}`);
  if (typeof state.courtDate === 'string' && state.courtDate.trim()) lines.push(`Court date: ${state.courtDate.trim()}`);

  // Include any custom (non-standard) field values so the model sees them in context.
  const customFields = state.customFields;
  if (customFields && typeof customFields === 'object' && !Array.isArray(customFields)) {
    for (const [key, value] of Object.entries(customFields as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) {
        lines.push(`${key}: ${value.trim()}`);
      } else if (typeof value === 'boolean') {
        lines.push(`${key}: ${value}`);
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        lines.push(`${key}: ${String(value)}`);
      }
    }
  }

  return lines.length > 0 ? lines.map((l) => `- ${l}`).join('\n') : '';
};

// ---------------------------------------------------------------------------
// State merge
// ---------------------------------------------------------------------------

const mergeIntakeState = (
  base: Record<string, unknown> | null,
  patch: Record<string, unknown> | null,
): Record<string, unknown> | null => {
  if (!base && !patch) return null;
  return { ...(base ?? {}), ...(patch ?? {}) };
};

// ---------------------------------------------------------------------------
// Submission gate
// ---------------------------------------------------------------------------

/** Shape of a required field as passed to the submission gate */
type GateField = { key: string; isStandard: boolean; condition?: { dependsOn: string; value: string | boolean | number } | null };

export interface IntakeSubmissionGate {
  paymentRequiredBeforeSubmit: boolean;
  paymentCompleted: boolean;
  details?: Record<string, unknown> | null;
  /**
   * Required fields from the active template — gates the submit_intake tool call.
   * Phase 3: fields carry an optional condition; unmet conditions are not required.
   */
  requiredFields?: ReadonlyArray<GateField> | null;
  /**
   * The full active template, threaded down so handleSaveCaseDetails can
   * recompute nextEnrichmentField from the POST-merge state. The pre-save
   * value on nextEnrichmentField becomes stale the moment a field is answered.
   */
  activeTemplate?: IntakeTemplate | null;
  /**
   * Consultation fee from the template (minor units / cents), if configured.
   * Takes precedence over the practice-level fee in submissionGate.details.
   * Mirrors the same precedence used in aiChat.ts for deriveCaseSavedAcknowledgment.
   */
  templateConsultationFee?: number | null;
  /**
   * Pre-computed next enrichment field (pre-save turn state).
   * Use activeTemplate + merged state to get the post-save value.
   */
  nextEnrichmentField?: IntakeFieldDefinition | null;
}

function isIntakeReadyForSubmission(
  state: Record<string, unknown> | null,
  requiredFields?: IntakeSubmissionGate['requiredFields'],
): boolean {
  return isSharedIntakeReadyForSubmission(
    state as Parameters<typeof isSharedIntakeReadyForSubmission>[0],
    requiredFields,
  );
}

function isIntakeSubmittable(
  state: Record<string, unknown> | null,
  submissionGate?: IntakeSubmissionGate | null,
): boolean {
  return isSharedIntakeSubmittable(
    state as Parameters<typeof isSharedIntakeSubmittable>[0],
    {
      paymentRequired: submissionGate?.paymentRequiredBeforeSubmit === true,
      paymentReceived: submissionGate?.paymentCompleted === true,
    },
    submissionGate?.requiredFields,
  );
}

// ---------------------------------------------------------------------------
// Deterministic acknowledgment for tool-only turns
// ---------------------------------------------------------------------------

const deriveCaseSavedAcknowledgment = (
  toolResult: ToolResult | null,
  submissionGate: IntakeSubmissionGate,
  mergedState: Record<string, unknown> | null,
  _services: IntakePromptService[] = [],
  consultationFee?: number | null,
  userName?: string | null,
  /** Next required field after the tool patch has been merged. */
  nextRequiredField?: IntakeFieldDefinition | null,
  /** Next enrichment field from the orchestration layer — replaces resolveNextEnrichmentField */
  nextEnrichmentField?: IntakeFieldDefinition | null,
): string => {
  if (!toolResult?.success || !mergedState) return '';

  const needsPayment = submissionGate.paymentRequiredBeforeSubmit && !submissionGate.paymentCompleted;
  const isReady = isIntakeReadyForSubmission(mergedState, submissionGate.requiredFields);
  const isEnrichmentMode = mergedState.enrichmentMode === true;

  const userPart = userName ? `, ${getFirstName(userName)}` : '';

  // Enrichment mode — use previewQuestion or fallback to generic phrasing.
  // Only used when the turn was tool-only (no model text); usually the AI handles this.
  if (isEnrichmentMode && nextEnrichmentField) {
    const questionText = nextEnrichmentField.isStandard ? (nextEnrichmentField.previewQuestion?.trim() || nextEnrichmentField.label) : nextEnrichmentField.label;
    const finalQuestion = nextEnrichmentField.previewQuestion?.trim() 
      ? questionText
      : `Can you tell me about ${nextEnrichmentField.label.toLowerCase()}?`;
    return `Thanks${userPart}. ${finalQuestion}`;
  }

  if (isEnrichmentMode && !nextEnrichmentField && isReady) {
    if (needsPayment) {
      const formattedFee = typeof consultationFee === 'number' && consultationFee > 0 ? formatCurrency(consultationFee / 100) : null;
      const feePart = formattedFee ? `a ${formattedFee}` : 'a';
      return `Thanks${userPart}. We now have the key details to strengthen your case. To move forward with a formal review and schedule your consultation, there is ${feePart} fee.`;
    }
    return `Thanks${userPart}. We now have the key details to strengthen your case. Ready to submit your request for review?`;
  }

  if (isReady) {
    if (needsPayment) {
      const formattedFee = typeof consultationFee === 'number' && consultationFee > 0 ? formatCurrency(consultationFee / 100) : null;
      const feePart = formattedFee ? `a ${formattedFee}` : 'a';
      return `I've got your case details${userPart}. To move forward with a formal review and schedule your consultation, there is ${feePart} fee.`;
    }
    return `I've got your details${userPart}. Our team is ready to review these details. Ready to send?`;
  }

  if (nextRequiredField) {
    const questionText = nextRequiredField.isStandard ? (nextRequiredField.previewQuestion?.trim() || nextRequiredField.label) : nextRequiredField.label;
    const finalQuestion = nextRequiredField.previewQuestion?.trim() 
      ? questionText
      : `Can you tell me the ${nextRequiredField.label.toLowerCase()}?`;
    return `Got it${userPart}. ${finalQuestion}`;
  }

  return `Got it${userPart}. Is there anything else you'd like to add?`;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function getFirstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0];
}

function readFiniteNumberField(record: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
};

// ---------------------------------------------------------------------------
// Utilities reused by aiChat.ts
// ---------------------------------------------------------------------------

const normalizeStateCode = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  if (/^[a-z]{2}$/i.test(trimmed)) return trimmed.toUpperCase();
  return US_STATE_NAME_TO_CODE[trimmed] ?? '';
};

const normalizeServicesForPrompt = (
  details: Record<string, unknown> | null,
): IntakePromptService[] => {
  if (!details) return [];
  const services = details.services;
  if (!Array.isArray(services)) return [];
  return services
    .map((service) => {
      if (!service || typeof service !== 'object') return null;
      const record = service as Record<string, unknown>;
      const name = typeof record.name === 'string'
        ? record.name.trim()
        : typeof record.title === 'string'
          ? record.title.trim()
          : '';
      const uuid = typeof record.id === 'string' ? record.id.trim() : '';
      if (!name || !uuid) return null;
      return { name, uuid };
    })
    .filter((service): service is IntakePromptService => Boolean(service));
};

const extractServiceNames = (details: Record<string, unknown> | null): string[] => {
  if (!details) return [];
  const services = details.services;
  if (!Array.isArray(services)) return [];
  return services
    .map((service) => {
      const name = typeof service?.name === 'string' ? service.name.trim() : null;
      const title = typeof service?.title === 'string' ? service.title.trim() : null;
      return name || title || '';
    })
    .filter((name) => name.length > 0);
};

const formatServiceList = (names: string[]): string => {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`;
  return `${names.slice(0, 3).join(', ')}, and ${names.length - 3} more`;
};

const shouldRequireDisclaimer = (messages: Array<{ role: 'user' | 'assistant'; content: string }>): boolean => {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUserMessage) return false;
  return LEGAL_INTENT_REGEX.test(lastUserMessage.content);
};

const normalizePracticeDetailsForAi = (details: Record<string, unknown> | null): Record<string, unknown> | null => {
  if (!details) return null;
  const normalized = { ...details };
  const normalizeMoney = (value: unknown): number | null | undefined => {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return value / 100;
  };
  if ('consultation_fee' in normalized) {
    const next = normalizeMoney(normalized.consultation_fee);
    if (next !== undefined) normalized.consultation_fee = next;
  }
  if ('consultationFee' in normalized) {
    const next = normalizeMoney(normalized.consultationFee);
    if (next !== undefined) normalized.consultationFee = next;
  }
  return normalized;
};

const buildCompactPracticeContextForPrompt = (
  details: Record<string, unknown> | null,
): Record<string, unknown> | null => {
  const normalized = normalizePracticeDetailsForAi(details);
  if (!normalized) return null;

  const compact: Record<string, unknown> = {};
  const copyIfPresent = (targetKey: string, sourceKeys: string[]) => {
    for (const key of sourceKeys) {
      if (!(key in normalized)) continue;
      const value = normalized[key];
      if (value === undefined || value === null || value === '') continue;
      compact[targetKey] = value;
      return;
    }
  };

  copyIfPresent('practiceName', ['practice_name', 'practiceName', 'name']);
  copyIfPresent('description', ['description', 'about', 'summary']);
  copyIfPresent('businessPhone', ['businessPhone', 'business_phone', 'contactPhone', 'contact_phone']);
  copyIfPresent('businessEmail', ['businessEmail', 'business_email', 'email']);
  copyIfPresent('website', ['website']);
  copyIfPresent('consultationFee', ['consultationFee', 'consultation_fee']);

  if (Array.isArray(normalized.services)) {
    compact.services = normalizeServicesForPrompt(normalized);
  }

  const rawServiceStates = normalized.service_states ?? normalized.serviceStates;
  if (Array.isArray(rawServiceStates)) {
    const states = rawServiceStates
      .filter((state): state is string => typeof state === 'string' && state.trim().length > 0)
      .map((state) => state.trim().toUpperCase());
    if (states.length > 0) {
      compact.licensedJurisdictions = `${states.join(', ')} (US)`;
    }
  }

  return compact;
};

const buildPracticeContactErrorReply = (
  practiceName: string,
  details: Record<string, unknown> | null,
): string => {
  const phone = readAnyString(details, ['businessPhone', 'business_phone', 'contactPhone', 'contact_phone']);
  const email = readAnyString(details, ['businessEmail', 'business_email', 'email']);
  const website = readAnyString(details, ['website']);
  const lines = [
    `We hit an internal error while continuing your consultation with ${practiceName}.`,
    'Please contact the practice directly so they can help you from here:',
  ];

  if (phone) lines.push(`Phone: ${phone}`);
  if (email) lines.push(`Email: ${email}`);
  if (website) lines.push(`Website: ${website}`);

  if (!phone && !email && !website) {
    lines.push(`Please reach out to ${practiceName} directly using the contact information on their website.`);
  }

  return lines.join('\n');
};

export {
  mergeIntakeState,
  isIntakeReadyForSubmission,
  isIntakeSubmittable,
  normalizeServicesForPrompt,
  extractServiceNames,
  formatServiceList,
  shouldRequireDisclaimer,
  buildPracticeContactErrorReply,
  normalizePracticeDetailsForAi,
  buildCompactPracticeContextForPrompt,
  deriveNextActions,
  MAX_SERVICES_IN_PROMPT,
  deriveCaseSavedAcknowledgment,
};
