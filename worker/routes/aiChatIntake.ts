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
import type { IntakeFieldDefinition } from '../../src/shared/types/intake.js';
import { STANDARD_FIELD_KEYS, DEFAULT_INTAKE_TEMPLATE } from '../../src/shared/constants/intakeTemplates.js';

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
  const required: string[] = [];

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

    if (field.required) {
      required.push(field.key);
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
        required: required.length > 0 ? required : ['description', 'city', 'state'],
      },
    },
  } as const;
}

/** Convenience constant: the default tool schema using the default template. */
export const SAVE_CASE_DETAILS_TOOL = buildSaveCaseDetailsTool(DEFAULT_INTAKE_TEMPLATE.fields);

/**
 * Generates the numbered field instruction block injected into the system prompt.
 * Replaces the previously hardcoded field list.
 */
export function buildFieldInstructions(fields: IntakeFieldDefinition[]): string {
  const activeFields = fields.length > 0 ? fields : DEFAULT_INTAKE_TEMPLATE.fields;
  return activeFields.map((f) => {
    const req = f.required ? '(required)' : '(optional)';
    const opts =
      f.type === 'select' && Array.isArray(f.options) && f.options.length > 0
        ? ` Options: ${f.options.join(', ')}.`
        : '';
    return `- ${f.label} ${req}${opts}`;
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
}

type EnrichmentField = 'opposingParty' | 'hasDocuments' | 'householdSize';

// ---------------------------------------------------------------------------
// Tool handlers — persist to DB, return structured results
// ---------------------------------------------------------------------------

export const handleSaveCaseDetails = (
  args: Record<string, unknown>,
  storedIntakeState: Record<string, unknown> | null,
  submissionGate: IntakeSubmissionGate,
): ToolResult => {
  const patch: Record<string, unknown> = {};
  const customFieldsPatch: Record<string, string | boolean> = {};

  const description = typeof args.description === 'string' ? args.description.trim().slice(0, 300) : (typeof storedIntakeState?.description === 'string' ? (storedIntakeState.description as string) : '');
  const city = typeof args.city === 'string' ? args.city.trim() : (typeof storedIntakeState?.city === 'string' ? (storedIntakeState.city as string) : '');
  const rawState = typeof args.state === 'string' ? args.state.trim() : (typeof storedIntakeState?.state === 'string' ? (storedIntakeState.state as string) : '');
  const state = normalizeStateCode(rawState);

  if (!description || !city || !state) {
    return {
      success: false,
      message: 'Case details incomplete — description, city, and state are required at minimum.',
    };
  }

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
      }
    }
  }

  // Merge customFields with any existing ones
  if (Object.keys(customFieldsPatch).length > 0) {
    const existingCustom = (storedIntakeState?.customFields as Record<string, string | boolean> | undefined) ?? {};
    patch.customFields = { ...existingCustom, ...customFieldsPatch };
  }

  const merged = mergeIntakeState(storedIntakeState, patch);
  const isEnrichmentMode = merged?.enrichmentMode === true;
  const nextEnrichmentField = isEnrichmentMode ? resolveNextEnrichmentField(merged, normalizeServicesForPrompt(submissionGate.details)) : null;
  const isSubmittable = isIntakeSubmittable(merged, submissionGate);

  // Derive suggested replies for the next open field
  const consultationFee = readFiniteNumberField(submissionGate.details, ['consultationFee', 'consultation_fee']);
  const actions = deriveNextActions(merged, submissionGate, consultationFee);
  if (actions.length > 0) {
    patch.ctaShown = true;
  }

  return {
    success: true,
    message: isEnrichmentMode && nextEnrichmentField === null
      ? 'Enrichment complete. All optional fields collected. Summarize what you have and invite the user to submit.'
      : isSubmittable
        ? 'Case details saved. All required fields collected.'
        : 'Case details saved. Continue collecting remaining fields.',
    intakeFields: patch,
    actions: actions.length > 0 ? actions : undefined,
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
): ChatMessageAction[] => {
  if (!mergedState) return [];

  const formattedFee = typeof consultationFee === 'number' && consultationFee > 0 ? formatCurrency(consultationFee / 100) : null;
  const payLabel = formattedFee ? `Pay ${formattedFee}` : 'Pay and submit';
  const isEnrichmentMode = mergedState.enrichmentMode === true;

  if (isEnrichmentMode) {
    const submitAction = createSubmitAction(
      submissionGate.paymentRequiredBeforeSubmit && !submissionGate.paymentCompleted
        ? payLabel
        : 'Submit request'
    );
    const nextField = resolveNextEnrichmentField(mergedState, normalizeServicesForPrompt(submissionGate.details));
    if (nextField) {
      return [
        ...deriveEnrichmentActions(nextField),
        submitAction,
      ];
    }
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

const deriveEnrichmentActions = (nextField: EnrichmentField): ChatMessageAction[] => {
  if (nextField === 'hasDocuments') {
    return [
      { type: 'reply', label: 'Yes, I have documents', value: 'Yes, I have relevant documents.' },
      { type: 'reply', label: 'No documents', value: 'No, I do not have documents yet.' },
    ];
  }

  if (nextField === 'householdSize') {
    return [
      { type: 'reply', label: '1', value: '1 person.' },
      { type: 'reply', label: '2', value: '2 people.' },
      { type: 'reply', label: '3', value: '3 people.' },
      { type: 'reply', label: '4+', value: '4 or more people.' },
    ];
  }

  return [];
};

const resolveNextEnrichmentField = (
  state: Record<string, unknown> | null,
  services: IntakePromptService[] = []
): EnrichmentField | null => {
  if (!state) return 'opposingParty';

  const opposingParty = typeof state.opposingParty === 'string' ? state.opposingParty.trim() : '';
  if (!opposingParty) return 'opposingParty';

  if (typeof state.hasDocuments !== 'boolean') return 'hasDocuments';

  if (isBusinessMatter(state, services)) return null;

  const householdSize = state.householdSize;
  if (!(typeof householdSize === 'number' && Number.isFinite(householdSize) && householdSize > 0)) {
    return 'householdSize';
  }

  return null;
};

const isBusinessMatter = (state: Record<string, unknown>, services: IntakePromptService[]): boolean => {
  const practiceServiceUuid = typeof state.practiceServiceUuid === 'string' ? state.practiceServiceUuid.trim() : '';
  const serviceName = practiceServiceUuid
    ? services.find((service) => service.uuid === practiceServiceUuid)?.name ?? ''
    : '';
  return /business|corporate|commercial|enterprise|company|llc|inc|startup/i.test(serviceName);
};

// ---------------------------------------------------------------------------
// The unified system prompt — one prompt, no KNOWN SO FAR injection
// ---------------------------------------------------------------------------

export const buildIntakeSystemPrompt = (
  services: IntakePromptService[],
  practiceContext: Record<string, unknown> | null,
  storedIntakeState: Record<string, unknown> | null,
  userName?: string | null,
  fields?: IntakeFieldDefinition[],
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
  const userNamingInstruction = firstName ? ' (use their name)' : '';

  const licensedJurisdictions = typeof practiceContext?.licensedJurisdictions === 'string' && practiceContext.licensedJurisdictions.trim()
    ? practiceContext.licensedJurisdictions.trim()
    : '';
  const licensedStatesSnippet = licensedJurisdictions
    ? `\nThis firm is licensed in: ${licensedJurisdictions}.`
    : '';

  const isEnrichmentMode = storedIntakeState?.enrichmentMode === true;

  // Build the field instruction block from the active template.
  // Falls back to the default field list if no template-specific fields are supplied.
  const fieldInstructions = buildFieldInstructions(fields ?? []);
  const requiredFieldLabels = (fields ?? DEFAULT_INTAKE_TEMPLATE.fields)
    .filter((f) => f.required)
    .map((f) => f.label)
    .join(', ') || 'description, city, and state';

  return `${userSalutationSnippet}You are a warm, helpful legal intake assistant for ${practiceName}. Your job is to collect case information conversationally and call tools to save it.${licensedStatesSnippet}

This firm handles the following practice areas:
${serviceList}

Fields to collect for this intake type:
${fieldInstructions}

Tool usage rules:
- Call save_case_details when you have ${requiredFieldLabels} at minimum. You can call it again as more fields are collected.
- Call request_payment when all required case details are gathered AND the practice requires payment.
- Call submit_intake only when the user explicitly says they are ready to submit.
- Use ask_user_question for known-answer-shape questions (yes/no, fixed choices, state selection).
- Never call a tool mid-sentence. Finish your message, then call the tool, or call first then continue.

Conversation rules:
- Be warm and human — like a knowledgeable friend, not a form
- Never give legal advice
- Never ask for contact info (name, email, phone) — it is already collected via the intake form
- Ask exactly ONE focused question per message about the most important missing piece
- Never output raw JSON, tool names, or structured data in your reply text
- You MUST always write a conversational response. Never call a tool without also writing text.
- Infer urgency from the facts when you reasonably can. Do not ask about urgency unless it is genuinely unclear and important for routing.
- Infer desiredOutcome from the facts when you reasonably can. Do not ask unless genuinely unclear.
- Documents are optional context. Do not block submission on whether the user has documents.
- ${isEnrichmentMode
    ? 'The user has chosen to strengthen their case. Focus on collecting enrichment fields before submission.'
    : 'Once required fields are captured, prioritize getting the person to submit instead of asking optional enrichment questions.'}
${
licensedJurisdictions ? `- Licensed jurisdiction guidance: If the user's matter involves a location outside the firm's licensed states (${licensedJurisdictions}), acknowledge the multi-state context warmly without making definitive eligibility judgments. Ask clarifying follow-ups to understand where the legal issue is rooted. Frame the response as a fit question for the attorney to review, not a hard rejection.` : ''
}

- If a consultation fee is required: Acknowledge that you have their details warmly${userNamingInstruction}. Mention the fee softly as the next step to move forward with a review. Max 2 sentences.
- If no fee is required: Acknowledge that you have their details warmly${userNamingInstruction} and ask if they are ready to send it over for review.
${isEnrichmentMode ? `
The user has chosen to strengthen their case. You are in enrichment mode.
Ask about EXACTLY ONE field per message — the next uncollected field in this priority order:
1. opposingParty — ask if a specific person or entity is involved (skip if already known)
2. hasDocuments — do they have any relevant documents
3. householdSize — only if relevant (skip for business matters)

After the user answers, call save_case_details with that field, then ask the next one.
Do NOT list multiple questions. Do NOT summarize what you still need. Ask one thing, then wait.
For known-answer-shape questions in enrichment (especially hasDocuments and householdSize), prefer ask_user_question with answer options.
For desiredOutcome: infer it from what has already been said and save it via save_case_details without asking. Only ask if it is genuinely impossible to infer.
The submit action remains available at any time — never tell the user they must answer more questions.
` : ''}
${intakeContext ? `Current intake state:\n${intakeContext}` : 'No case details collected yet. Start by asking about the situation.'}`;
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

export interface IntakeSubmissionGate {
  paymentRequiredBeforeSubmit: boolean;
  paymentCompleted: boolean;
  details?: Record<string, unknown> | null;
}

function isIntakeReadyForSubmission(state: Record<string, unknown> | null): boolean {
  return isSharedIntakeReadyForSubmission(state as Parameters<typeof isSharedIntakeReadyForSubmission>[0]);
}

function isIntakeSubmittable(
  state: Record<string, unknown> | null,
  submissionGate?: IntakeSubmissionGate | null,
): boolean {
  return isSharedIntakeSubmittable(state as Parameters<typeof isSharedIntakeSubmittable>[0], {
    paymentRequired: submissionGate?.paymentRequiredBeforeSubmit === true,
    paymentReceived: submissionGate?.paymentCompleted === true,
  });
}

// ---------------------------------------------------------------------------
// Deterministic acknowledgment for tool-only turns
// ---------------------------------------------------------------------------

const deriveCaseSavedAcknowledgment = (
  toolResult: ToolResult | null,
  submissionGate: IntakeSubmissionGate,
  mergedState: Record<string, unknown> | null,
  services: IntakePromptService[] = [],
  consultationFee?: number | null,
  userName?: string | null,
): string => {
  if (!toolResult?.success || !mergedState) return '';

  const description = typeof mergedState.description === 'string' ? mergedState.description.trim() : '';
  const city = typeof mergedState.city === 'string' ? mergedState.city.trim() : '';
  const state = typeof mergedState.state === 'string' ? mergedState.state.trim() : '';

  const needsPayment = submissionGate.paymentRequiredBeforeSubmit && !submissionGate.paymentCompleted;
  const isReady = isIntakeReadyForSubmission(mergedState);
  const isEnrichmentMode = mergedState.enrichmentMode === true;
  const nextEnrichmentField = isEnrichmentMode ? resolveNextEnrichmentField(mergedState, services) : null;

  const userPart = userName ? `, ${getFirstName(userName)}` : '';

  if (isEnrichmentMode && nextEnrichmentField) {
    if (nextEnrichmentField === 'opposingParty') {
      return `Thanks${userPart}. Is there a specific person or entity involved on the other side?`;
    }
    if (nextEnrichmentField === 'hasDocuments') {
      return `Thanks${userPart}. Do you have any documents related to this matter?`;
    }
    if (nextEnrichmentField === 'householdSize') {
      return `Thanks${userPart}. How many people are in your household?`;
    }
  }

  if (isEnrichmentMode && nextEnrichmentField === null && isReady) {
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

      return `I’ve got your case details${userPart}. To move forward with a formal review and schedule your consultation, there is ${feePart} fee.`;
    }
    return `I’ve got your details${userPart}. Our team is ready to review these details. Ready to send?`;
  }

  if (!description) {
    return 'Thanks for that detail. Can you tell me a bit more about your situation?';
  }

  if (!city || !state) {
    return 'Got it. Which city and state is this matter located in?';
  }

  return 'Got it. Is there anything else you\'d like to add before we connect you with the practice?';
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
