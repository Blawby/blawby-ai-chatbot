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

  const description = typeof args.description === 'string' ? args.description.trim().slice(0, 300) : '';
  const city = typeof args.city === 'string' ? args.city.trim() : '';
  const rawState = typeof args.state === 'string' ? args.state.trim() : '';
  const state = normalizeStateCode(rawState);

  if (!description || !city || !state) {
    return {
      success: false,
      message: 'Case details incomplete — description, city, and state are required.',
    };
  }

  patch.description = description;
  patch.city = city;
  patch.state = state;

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

  const merged = mergeIntakeState(storedIntakeState, patch);
  const isSubmittable = isIntakeSubmittable(merged, submissionGate);

  // Derive suggested replies for the next open field
  const actions = deriveNextActions(merged, submissionGate);
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
  _args: Record<string, unknown>,
): ToolResult => {
  return {
    success: true,
    message: 'Payment requested.',
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
): ChatMessageAction[] => {
  if (!mergedState) return [];

  // All required fields collected — either payment or submit
  if (isIntakeSubmittable(mergedState, submissionGate)) {
    return [createSubmitAction(submissionGate.paymentRequiredBeforeSubmit && !submissionGate.paymentCompleted ? 'Continue' : 'Submit request')];
  }

  // Payment required (case info complete, payment pending)
  if (
    submissionGate.paymentRequiredBeforeSubmit &&
    !submissionGate.paymentCompleted &&
    isIntakeReadyForSubmission(mergedState)
  ) {
    return [createSubmitAction('Continue')];
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
  submissionGate: IntakeSubmissionGate,
): string => {
  const cappedServices = services.slice(0, MAX_SERVICES_IN_CONVERSATION_PROMPT);
  const serviceList = cappedServices.length > 0
    ? cappedServices.map((s) => `- ${s.name} (key: ${s.key})`).join('\n')
    : '- General legal matters';

  const practiceName = typeof practiceContext?.practiceName === 'string'
    ? practiceContext.practiceName.trim()
    : 'this law firm';
  const consultationFee = typeof practiceContext?.consultationFee === 'number' && practiceContext.consultationFee > 0
    ? `$${(practiceContext.consultationFee / 100).toFixed(2)}`
    : null;

  const intakeContext = buildIntakeContextSummary(storedIntakeState, services);

  const paymentNote = submissionGate.paymentRequiredBeforeSubmit && !submissionGate.paymentCompleted
    ? `\n\nNote: This practice requires a consultation fee${consultationFee ? ` of ${consultationFee}` : ''} before submission. Once all case details are collected, use the request_payment tool.`
    : '';

  return `You are a warm, helpful legal intake assistant for ${practiceName}. Your job is to collect case information conversationally and call tools to save it.

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
- You MUST always write a conversational response. Never call a tool without also writing text. If you are calling save_case_details because the user just gave you information, acknowledge what they shared before or after the tool call.
- When you have description, city, and state, call save_case_details immediately${paymentNote}
- Infer urgency from the facts when you reasonably can. Do not ask about urgency unless it is genuinely unclear and important for routing.
- Documents are optional context. Do not block submission on whether the user has documents.
- Once description, city, and state are captured, prioritize getting the person to submit instead of asking optional enrichment questions.

- When all required case details are collected and a consultation fee is required, tell the user warmly that you have everything you need and that the practice requires a fee to review their case. Explain they can tap Continue below to proceed. Keep it to 2 sentences maximum.

${intakeContext ? `Current intake state:\n${intakeContext}` : 'No case details collected yet. Start by asking about the situation.'}`;
};

const buildIntakeContextSummary = (
  state: Record<string, unknown> | null,
  services: Array<{ name: string; key: string }>,
): string => {
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
}

const isIntakeReadyForSubmission = (state: Record<string, unknown> | null): boolean =>
  isSharedIntakeReadyForSubmission(state as Parameters<typeof isSharedIntakeReadyForSubmission>[0]);

const isIntakeSubmittable = (
  state: Record<string, unknown> | null,
  submissionGate?: IntakeSubmissionGate | null,
): boolean =>
  isSharedIntakeSubmittable(state as Parameters<typeof isSharedIntakeSubmittable>[0], {
    paymentRequired: submissionGate?.paymentRequiredBeforeSubmit === true,
    paymentReceived: submissionGate?.paymentCompleted === true,
  });

// ---------------------------------------------------------------------------
// Deterministic acknowledgment for tool-only turns
// ---------------------------------------------------------------------------

const deriveCaseSavedAcknowledgment = (
  toolResult: ToolResult | null,
  intakePatch: Record<string, unknown>,
  submissionGate: IntakeSubmissionGate,
  mergedState: Record<string, unknown> | null
): string => {
  if (!toolResult?.success || !mergedState) {
    return '';
  }

  const hasDescription = typeof mergedState.description === 'string' && mergedState.description.trim().length > 0;
  const hasCity = typeof mergedState.city === 'string' && mergedState.city.trim().length > 0;
  const hasState = typeof mergedState.state === 'string' && mergedState.state.trim().length > 0;
  const hasOpposingParty = typeof mergedState.opposingParty === 'string' && mergedState.opposingParty.trim().length > 0;
  const hasUrgency = typeof mergedState.urgency === 'string' && mergedState.urgency.trim().length > 0;
  const isReady = isIntakeSubmittable(mergedState, submissionGate);
  const needsPayment = submissionGate.paymentRequiredBeforeSubmit && !submissionGate.paymentCompleted;

  // Just saved location, need more fields
  if (intakePatch.city || intakePatch.state) {
    if (isReady) return;
    if (!hasOpposingParty) {
      return 'Got it — I have your location. Who is the opposing party in this matter?';
    }
    if (!hasUrgency) {
      return 'Thanks for the location. How urgent is this matter?';
    }
  }

  // Just saved opposing party, need more fields  
  if (intakePatch.opposingParty) {
    if (isReady) return;
    if (!hasUrgency) {
      return 'Thank you. How urgent is this matter?';
    }
    if (!hasCity || !hasState) {
      return 'I have the opposing party. Which city and state is this in?';
    }
  }

  // Just saved urgency, check if ready for next step
  if (intakePatch.urgency) {
    if (isReady && needsPayment) {
      return 'I have everything I need. The practice requires a consultation fee to review your case. Tap Continue below to proceed.';
    }
    if (isReady && !needsPayment) {
      return 'I have everything I need to connect you with the right attorney. Are you ready to submit your case?';
    }
    if (!hasOpposingParty) {
      return 'Thanks for the urgency information. Who is the opposing party?';
    }
  }

  // Generic acknowledgment for other saves
  if (isReady && needsPayment) {
    return 'I have everything I need. The practice requires a consultation fee to review your case. Tap Continue below to proceed.';
  }
  if (isReady && !needsPayment) {
    return 'I have everything I need to connect you with the right attorney. Are you ready to submit your case?';
  }

  return 'Thanks for the information. Let me know if there\'s anything else you\'d like to add about your situation.';
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
