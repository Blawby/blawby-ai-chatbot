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

const MAX_SERVICES_IN_PROMPT = 20;
const MAX_SERVICES_IN_CONVERSATION_PROMPT = 8;

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


export const SAVE_CASE_DETAILS_TOOL = {
  type: 'function',
  function: {
    name: 'save_case_details',
    description: 'Save case information collected in the conversation. Call when you have description, city, and state at minimum. Can be called incrementally as more information is gathered.',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Plain-English summary of the case situation, max 300 chars',
        },
        city: { type: 'string', description: 'City where the legal matter is located' },
        state: { type: 'string', description: '2-letter US state code, e.g. CA, TX' },
        opposingParty: {
          type: 'string',
          description: 'Name of opposing person, company, or organization explicitly mentioned. Never extract descriptions or circumstances.',
        },
        practiceArea: {
          type: 'string',
          description: 'Service key from the firm services list provided in context, e.g. FAMILY_LAW',
        },
        urgency: {
          type: 'string',
          enum: ['routine', 'time_sensitive', 'emergency'],
          description: 'How urgent the matter is',
        },
        desiredOutcome: {
          type: 'string',
          description: 'What the user wants to achieve, max 150 chars',
        },
        courtDate: {
          type: 'string',
          description: 'Court date or hard deadline in ISO 8601 format (YYYY-MM-DD). Omit if not explicitly stated.',
        },
        hasDocuments: {
          type: 'boolean',
          description: 'Whether the user has mentioned having relevant documents',
        },
        householdSize: {
          type: 'integer',
          description: 'Total number of residents in the household',
        },
      },
      required: ['description', 'city', 'state'],
    },
  },
} as const;

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

export const INTAKE_TOOLS = [
  SAVE_CASE_DETAILS_TOOL,
  REQUEST_PAYMENT_TOOL,
  SUBMIT_INTAKE_TOOL,
] as const;

// ---------------------------------------------------------------------------
// Tool result types
// ---------------------------------------------------------------------------

export interface ToolResult {
  success: boolean;
  message?: string;
  actions?: ChatMessageAction[];
  intakeFields?: Record<string, unknown>;
  triggerPayment?: boolean;
  triggerSubmit?: boolean;
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

  if (typeof args.opposingParty === 'string' && args.opposingParty.trim()) {
    patch.opposingParty = args.opposingParty.trim();
  }
  if (typeof args.practiceArea === 'string' && args.practiceArea.trim()) {
    patch.practiceArea = args.practiceArea.trim();
  }
  if (args.urgency === 'routine' || args.urgency === 'time_sensitive' || args.urgency === 'emergency') {
    patch.urgency = args.urgency;
  }
  if (typeof args.desiredOutcome === 'string' && args.desiredOutcome.trim()) {
    patch.desiredOutcome = args.desiredOutcome.trim().slice(0, 150);
  }
  if (typeof args.courtDate === 'string' && args.courtDate.trim()) {
    patch.courtDate = args.courtDate.trim();
  }
  if (typeof args.hasDocuments === 'boolean') {
    patch.hasDocuments = args.hasDocuments;
  }
  if (typeof args.householdSize === 'number') {
    patch.householdSize = Math.max(0, Math.floor(args.householdSize));
  }

  const merged = mergeIntakeState(storedIntakeState, patch);
  const isSubmittable = isIntakeSubmittable(merged, submissionGate);

  // Derive suggested replies for the next open field
  const consultationFee = readFiniteNumberField(submissionGate.details, ['consultationFee', 'consultation_fee']);
  const actions = deriveNextActions(merged, submissionGate, consultationFee);
  if (actions.length > 0) {
    patch.ctaShown = true;
  }

  return {
    success: true,
    message: isSubmittable
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

// ---------------------------------------------------------------------------
// The unified system prompt — one prompt, no KNOWN SO FAR injection
// ---------------------------------------------------------------------------

export const buildIntakeSystemPrompt = (
  services: Array<{ name: string; key: string }>,
  practiceContext: Record<string, unknown> | null,
  storedIntakeState: Record<string, unknown> | null,
  userName?: string | null,
): string => {
  const cappedServices = services.slice(0, MAX_SERVICES_IN_CONVERSATION_PROMPT);
  const serviceList = cappedServices.length > 0
    ? cappedServices.map((s) => `- ${s.name} (key: ${s.key})`).join('\n')
    : '- General legal matters';

  const practiceName = typeof practiceContext?.practiceName === 'string'
    ? practiceContext.practiceName.trim()
    : 'this law firm';
  const intakeContext = buildIntakeContextSummary(storedIntakeState, services);
  const firstName = userName ? getFirstName(userName) : null;
  const userSalutationSnippet = firstName ? `The user's first name is ${firstName}. ` : '';
  const userNamingInstruction = firstName ? ' (use their name)' : '';

  const isEnrichmentMode = storedIntakeState?.enrichmentMode === true;

  return `${userSalutationSnippet}You are a warm, helpful legal intake assistant for ${practiceName}. Your job is to collect case information conversationally and call tools to save it.

This firm handles the following practice areas:
${serviceList}

Tool usage rules:
- Call save_case_details when you have description, city, and state at minimum. You can call it again as more fields are collected.
- Call request_payment when all required case details are gathered AND the practice requires payment.
- Call submit_intake only when the user explicitly says they are ready to submit.
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
    : 'Once description, city, and state are captured, prioritize getting the person to submit instead of asking optional enrichment questions.'}

- If a consultation fee is required: Acknowledge that you have their details warmly${userNamingInstruction}. Mention the fee softly as the next step to move forward with a review. Max 2 sentences.
- If no fee is required: Acknowledge that you have their details warmly${userNamingInstruction} and ask if they are ready to send it over for review.
${isEnrichmentMode ? `
The user has chosen to strengthen their case before submitting.
Ask about these fields in order, one at a time, only if not already collected:
1. opposingParty — ask if a specific person or entity is involved (skip if already known)
2. hasDocuments — do they have any relevant documents
3. householdSize — only if relevant (skip for business matters)

For desiredOutcome: infer it from what has already been said and save it via save_case_details without asking. Only ask if it is genuinely impossible to infer.
After each answer, call save_case_details with the new field.
The submit action remains available at any time — never tell the user they must answer more questions.
` : ''}
${intakeContext ? `Current intake state:\n${intakeContext}` : 'No case details collected yet. Start by asking about the situation.'}`;
};


function buildIntakeContextSummary(
  state: Record<string, unknown> | null,
  services: Array<{ name: string; key: string }>,
): string {
  if (!state) return '';
  const serviceNameByKey = new Map(services.map((s) => [s.key, s.name]));
  const lines: string[] = [];

  if (typeof state.description === 'string' && state.description.trim()) {
    lines.push(`Situation: ${state.description.trim().slice(0, 200)}`);
  }
  if (typeof state.practiceArea === 'string' && state.practiceArea.trim()) {
    const label = serviceNameByKey.get(state.practiceArea.trim()) ?? state.practiceArea.trim();
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
  _services: Array<{ name: string; key: string }> = [],
  consultationFee?: number | null,
  userName?: string | null,
): string => {
  if (!toolResult?.success || !mergedState) return '';

  const description = typeof mergedState.description === 'string' ? mergedState.description.trim() : '';
  const city = typeof mergedState.city === 'string' ? mergedState.city.trim() : '';
  const state = typeof mergedState.state === 'string' ? mergedState.state.trim() : '';
  const _practiceAreaKey = typeof mergedState.practiceArea === 'string' ? mergedState.practiceArea.trim() : '';

  const needsPayment = submissionGate.paymentRequiredBeforeSubmit && !submissionGate.paymentCompleted;
  const isReady = isIntakeReadyForSubmission(mergedState);

  const userPart = userName ? `, ${getFirstName(userName)}` : '';

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
): Array<{ name: string; key: string }> => {
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
      const key = typeof record.key === 'string'
        ? record.key.trim()
        : typeof record.service_key === 'string'
          ? record.service_key.trim()
          : '';
      if (!name) return null;
      return { name, key: key || name.toUpperCase().replace(/[^A-Z0-9]+/g, '_') };
    })
    .filter((service): service is { name: string; key: string } => Boolean(service));
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
