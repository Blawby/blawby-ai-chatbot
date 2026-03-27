import {
  hasNonEmptyStringField,
  readAnyString,
  LEGAL_INTENT_REGEX,
} from './aiChatShared.js';

// messageCount includes both user and assistant turns; 10 total turns is roughly
// 5 user turns before we pivot to closing language. This is a UX default and may
// need tuning per firm/intake context in future configuration.
const INTAKE_CLOSING_MESSAGE_THRESHOLD = 6;
const MAX_SERVICES_IN_PROMPT = 20;
const MAX_KNOWN_FIELDS_IN_PROMPT = 7;

const INTAKE_TOOL = {
  type: 'function',
  function: {
    name: 'update_intake_fields',
    description: 'Extract structured intake fields from the conversation so far',
    parameters: {
      type: 'object',
      properties: {
        practiceArea: {
          type: 'string',
          description: 'The service key from the firm services list, e.g. FAMILY_LAW'
        },
        description: {
          type: 'string',
          description: 'Plain-English summary of the case, max 300 chars'
        },
        urgency: { type: 'string', enum: ['routine', 'time_sensitive', 'emergency'] },
        opposingParty: { type: 'string', description: 'Name or description of the opposing party if mentioned' },
        city: { type: 'string' },
        state: { type: 'string', description: '2-letter US state code' },
        postalCode: { type: 'string' },
        country: { type: 'string' },
        addressLine1: { type: 'string' },
        addressLine2: { type: 'string' },
        desiredOutcome: { type: 'string', description: 'What the user wants to achieve, max 150 chars' },
        courtDate: { type: 'string', description: 'Court date or hard deadline in ISO 8601 format (YYYY-MM-DD). Omit if not explicitly stated as a specific date.' },
        hasDocuments: { type: 'boolean', description: 'Whether the user has mentioned having relevant documents' },
      },
      required: []
    }
  }
} as const;

const buildIntakeSystemPrompt = (services: Array<{ name: string; key: string }>): string => {
  const cappedServices = services.slice(0, MAX_SERVICES_IN_PROMPT);
  const serviceList = cappedServices.length > 0
    ? cappedServices.map((service) => `- ${service.name} (key: ${service.key})`).join('\n')
    : '- General intake (no service list provided)';
  const omittedCount = Math.max(0, services.length - cappedServices.length);
  const overflowNote = omittedCount > 0 ? `\n- ...and ${omittedCount} more practice areas` : '';

  return `You are a legal intake data extractor for a law firm. Extract structured information from the conversation and save it using the update_intake_fields tool.

This firm handles the following practice areas only:
${serviceList}${overflowNote}

Rules:
- Extract only what the user has explicitly stated. Do not infer or guess.
- Use camelCase keys only (practiceArea, opposingParty, etc).
- Map the practice area to the correct key from the list above.
- Call the tool after every user message with everything known so far.
- Do not write anything to the user. Only call the tool.
- Tool arguments must be a raw JSON object only (no function name wrapper, no markdown fences, no XML tags).
- Never include caseStrength or missingSummary in the tool call.`;
};

export const buildIntakeConversationPrompt = (
  services: Array<{ name: string; key: string }>,
  mergedState: Record<string, unknown> | null,
  messageCount: number
): string => {
  const serviceNameByKey = new Map(services.map((service) => [service.key, service.name]));
  const resolvePracticeAreaLabel = (): string | null => {
    if (!mergedState || typeof mergedState.practiceArea !== 'string') return null;
    const key = mergedState.practiceArea.trim();
    if (!key) return null;
    return serviceNameByKey.get(key) ?? key;
  };

  const knownFields: string[] = [];
  if (mergedState) {
    if (typeof mergedState.description === 'string' && mergedState.description.trim()) knownFields.push(`Situation: ${mergedState.description.trim()}`);
    const practiceAreaLabel = resolvePracticeAreaLabel();
    if (practiceAreaLabel) knownFields.push(`Practice area: ${practiceAreaLabel}`);
    if (typeof mergedState.city === 'string' && mergedState.city.trim()) knownFields.push(`City: ${mergedState.city.trim()}`);
    if (typeof mergedState.state === 'string' && mergedState.state.trim()) knownFields.push(`State: ${mergedState.state.trim()}`);
    if (typeof mergedState.opposingParty === 'string' && mergedState.opposingParty.trim()) knownFields.push(`Opposing party: ${mergedState.opposingParty.trim()}`);
    if (typeof mergedState.desiredOutcome === 'string' && mergedState.desiredOutcome.trim()) knownFields.push(`Desired outcome: ${mergedState.desiredOutcome.trim()}`);
    if (typeof mergedState.urgency === 'string' && mergedState.urgency.trim()) knownFields.push(`Urgency: ${mergedState.urgency.trim()}`);
    if (typeof mergedState.hasDocuments === 'boolean') knownFields.push(`Has documents: ${mergedState.hasDocuments}`);
  }

  const compactKnownFields = knownFields.slice(0, MAX_KNOWN_FIELDS_IN_PROMPT);
  const omittedKnownCount = Math.max(0, knownFields.length - compactKnownFields.length);
  const knownSection = compactKnownFields.length > 0
    ? `\nKNOWN SO FAR (do not ask for these again):\n${compactKnownFields.map((f) => `- ${f}`).join('\n')}${omittedKnownCount > 0 ? `\n- ...and ${omittedKnownCount} more known fields omitted` : ''}`
    : '';

  const isSubmissionReady = isIntakeStateReadyForSubmission(mergedState);
  const ctaInstruction = (messageCount >= INTAKE_CLOSING_MESSAGE_THRESHOLD && isSubmissionReady)
    ? `\nYou have asked enough questions and have the required details. Briefly summarize what you know and ask if the user is ready to submit to the firm.`
    : `\nAsk exactly ONE focused question about the single most important missing piece of information. Priority: situation description → city and state → opposing party → urgency → desired outcome → documents. Do not ask for submission readiness until all required details are collected.`;

  return `You are a warm, helpful legal intake assistant for a law firm. The structured intake fields have already been saved by a separate process. Your only job is to respond naturally to the user.

This firm handles: ${services.map(s => s.name).join(', ') || 'general legal matters'}.${knownSection}

Conversation rules:
- Be warm and human — like a knowledgeable friend, not a form
- Never give legal advice
- Never ask for contact info (name, email, phone) — already collected
- Never output JSON, tool names, or structured data${ctaInstruction}`;
};

const mergeIntakeState = (
  base: Record<string, unknown> | null,
  patch: Record<string, unknown> | null
): Record<string, unknown> | null => {
  if (!base && !patch) return null;
  return { ...(base ?? {}), ...(patch ?? {}) };
};

const isIntakeStateReadyForSubmission = (state: Record<string, unknown> | null): boolean => {
  if (!state) return false;
  const hasDescription = hasNonEmptyStringField(state, 'description');
  const hasLocation = hasNonEmptyStringField(state, 'city') && hasNonEmptyStringField(state, 'state');
  const hasOpposingParty = hasNonEmptyStringField(state, 'opposingParty');
  const hasDesiredOutcome = hasNonEmptyStringField(state, 'desiredOutcome');
  const hasDocumentAnswer = typeof state.hasDocuments === 'boolean';
  return hasDescription && hasLocation && hasOpposingParty && hasDesiredOutcome && hasDocumentAnswer;
};

/**
 * Deterministic next-step planner. Inspects merged intake state and returns
 * the canonical next missing field along with any chip-eligible choices.
 *
 * Chip eligibility rules (derived from field semantics, never from the model):
 *   description, city/state, opposingParty, desiredOutcome → open-text → no chips
 *   urgency   → closed enum  → fixed chips
 *   hasDocuments → boolean    → yes/no chips
 *   all fields present → emit __submit__ chip (overridden by deterministic submit path in aiChat.ts)
 */
export interface IntakeNextStep {
  /** The field being asked about, or null when submit-ready */
  nextField: string | null;
  /** Pre-computed UI chips; empty array means render no chips for this field */
  chips: string[];
  chipSource: 'none' | 'urgency' | 'hasDocuments' | 'submit';
}

type DeterministicIntakePatch = Partial<Pick<Record<string, unknown>, 'urgency' | 'hasDocuments'>>;

export const planNextIntakeStep = (state: Record<string, unknown> | null): IntakeNextStep => {
  if (!state) {
    return { nextField: 'description', chips: [], chipSource: 'none' };
  }
  if (!hasNonEmptyStringField(state, 'description')) {
    return { nextField: 'description', chips: [], chipSource: 'none' };
  }
  if (!hasNonEmptyStringField(state, 'city') || !hasNonEmptyStringField(state, 'state')) {
    return { nextField: 'location', chips: [], chipSource: 'none' };
  }
  if (!hasNonEmptyStringField(state, 'opposingParty')) {
    return { nextField: 'opposingParty', chips: [], chipSource: 'none' };
  }
  if (typeof state.urgency !== 'string' || !state.urgency.trim()) {
    return {
      nextField: 'urgency',
      chips: ['Routine (no deadline)', 'Time-sensitive', 'Emergency'],
      chipSource: 'urgency',
    };
  }
  if (!hasNonEmptyStringField(state, 'desiredOutcome')) {
    return { nextField: 'desiredOutcome', chips: [], chipSource: 'none' };
  }
  if (typeof state.hasDocuments !== 'boolean') {
    return {
      nextField: 'hasDocuments',
      chips: ['Yes, I have documents', 'No, not yet'],
      chipSource: 'hasDocuments',
    };
  }
  // All required fields present — aiChat.ts will override with __submit__.
  return { nextField: null, chips: [], chipSource: 'none' };
};

const normalizeIntentText = (value: string): string => (
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
);

const parseUrgencyFromLatestMessage = (content: string): 'routine' | 'time_sensitive' | 'emergency' | null => {
  const normalized = normalizeIntentText(content);
  if (!normalized) return null;

  const bareEmergency = /^(emergency|urgent|asap|right away|immediately)$/i.test(normalized);
  const bareTimeSensitive = /^(time sensitive|time-sensitive|soon|deadline)$/i.test(normalized);
  const bareRoutine = /^(routine|standard|normal|not urgent|no rush|no deadline)$/i.test(normalized);
  if (bareEmergency) return 'emergency';
  if (bareTimeSensitive) return 'time_sensitive';
  if (bareRoutine) return 'routine';

  if (
    /\bemergency\b/.test(normalized)
    || /\bimmediately\b/.test(normalized)
    || /\basap\b/.test(normalized)
    || /\bright away\b/.test(normalized)
    || /\burgent\b/.test(normalized)
  ) {
    return 'emergency';
  }

  if (
    /\btime sensitive\b/.test(normalized)
    || /\btime-sensitive\b/.test(content.toLowerCase())
    || /\bsoon\b/.test(normalized)
    || /\bquickly\b/.test(normalized)
    || /\bdeadline\b/.test(normalized)
  ) {
    return 'time_sensitive';
  }

  if (
    /\broutine\b/.test(normalized)
    || /\bstandard\b/.test(normalized)
    || /\bnormal\b/.test(normalized)
    || /\bno deadline\b/.test(normalized)
    || /\bnon urgent\b/.test(normalized)
    || /\bnot urgent\b/.test(normalized)
    || /\bno rush\b/.test(normalized)
  ) {
    return 'routine';
  }

  return null;
};

const parseHasDocumentsFromLatestMessage = (content: string): boolean | null => {
  const normalized = normalizeIntentText(content);
  if (!normalized) return null;

  const bareYes = /^(yes|yep|yeah|y|affirmative)$/i.test(normalized);
  const bareNo = /\b(no|nope|nah|n|negative|not yet|false)\b/i.test(normalized);
  if (/^(true)$/.test(normalized)) return true;
  if (bareYes) return true;
  if (bareNo) return false;

  const mentionsDocuments = /\b(doc|docs|document|documents|paperwork|files|records|evidence)\b/.test(normalized);

  if (
    mentionsDocuments
    && (
      /\byes\b/.test(normalized)
    || /\bi have documents\b/.test(normalized)
    || /\bi have them\b/.test(normalized)
    || /\bi do\b/.test(normalized)
    || /\bi can upload\b/.test(normalized)
    || /\bi have paperwork\b/.test(normalized)
    )
  ) {
    return true;
  }

  if (
    mentionsDocuments
    && (
      /\bno\b/.test(normalized)
    || /\bnot yet\b/.test(normalized)
    || /\bno documents\b/.test(normalized)
    || /\bdon t have\b/.test(normalized)
    || /\bi don t\b/.test(normalized)
    || /\bno paperwork\b/.test(normalized)
    )
  ) {
    return false;
  }

  return null;
};

const deriveDeterministicIntakePatchFromLatestMessage = (
  latestUserMessage: string | null | undefined,
  mergedState: Record<string, unknown> | null
): DeterministicIntakePatch | null => {
  if (!latestUserMessage || latestUserMessage.trim().length === 0) return null;

  const nextStep = planNextIntakeStep(mergedState);
  if (nextStep.nextField === 'urgency') {
    const urgency = parseUrgencyFromLatestMessage(latestUserMessage);
    return urgency ? { urgency } : null;
  }
  if (nextStep.nextField === 'hasDocuments') {
    const hasDocuments = parseHasDocumentsFromLatestMessage(latestUserMessage);
    return typeof hasDocuments === 'boolean' ? { hasDocuments } : null;
  }

  return null;
};

const normalizeServicesForPrompt = (
  details: Record<string, unknown> | null
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

const buildPracticeContactErrorReply = (
  practiceName: string,
  details: Record<string, unknown> | null
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
  if ('payment_link_prefill_amount' in normalized) {
    const next = normalizeMoney(normalized.payment_link_prefill_amount);
    if (next !== undefined) normalized.payment_link_prefill_amount = next;
  }
  if ('paymentLinkPrefillAmount' in normalized) {
    const next = normalizeMoney(normalized.paymentLinkPrefillAmount);
    if (next !== undefined) normalized.paymentLinkPrefillAmount = next;
  }
  return normalized;
};

const buildCompactPracticeContextForPrompt = (
  details: Record<string, unknown> | null
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
  copyIfPresent('paymentLinkPrefillAmount', ['paymentLinkPrefillAmount', 'payment_link_prefill_amount']);

  if (Array.isArray(normalized.services)) {
    compact.services = normalizeServicesForPrompt(normalized);
  }

  return compact;
};

export {
  INTAKE_TOOL,
  buildIntakeSystemPrompt,
  mergeIntakeState,
  isIntakeStateReadyForSubmission,
  normalizeServicesForPrompt,
  extractServiceNames,
  formatServiceList,
  shouldRequireDisclaimer,
  deriveDeterministicIntakePatchFromLatestMessage,
  buildPracticeContactErrorReply,
  normalizePracticeDetailsForAi,
  buildCompactPracticeContextForPrompt,
};
