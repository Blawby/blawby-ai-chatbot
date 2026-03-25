import {
  hasNonEmptyStringField,
  readAnyString,
  LEGAL_INTENT_REGEX,
} from './aiChatShared.js';

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
        courtDate: { type: 'string', description: 'Any known court date or deadline in plain text' },
        income: { type: 'string', description: 'Monthly or yearly income if mentioned' },
        householdSize: { type: 'number', description: 'Number of people in the household' },
        hasDocuments: { type: 'boolean', description: 'Whether the user has mentioned having relevant documents' },
        eligibilitySignals: {
          type: 'array',
          items: { type: 'string' },
          description: 'Any income, household, or fee-related details mentioned'
        },
        quickReplies: {
          type: 'array',
          maxItems: 3,
          items: { type: 'string' },
          description: '2-3 short suggested answers for predictable questions. Omit for open-ended questions.'
        }
      },
      required: []
    }
  }
} as const;

const buildIntakeSystemPrompt = (services: Array<{ name: string; key: string }>): string => {
  const serviceList = services.length > 0
    ? services.map((service) => `- ${service.name} (key: ${service.key})`).join('\n')
    : '- General intake (no service list provided)';

  return `You are a legal intake data extractor for a law firm. Extract structured information from the conversation and save it using the update_intake_fields tool.

This firm handles the following practice areas only:
${serviceList}

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
  const knownFields: string[] = [];
  if (mergedState) {
    if (typeof mergedState.description === 'string' && mergedState.description.trim()) knownFields.push(`Situation: ${mergedState.description.trim()}`);
    if (typeof mergedState.practiceArea === 'string' && mergedState.practiceArea.trim()) knownFields.push(`Practice area: ${mergedState.practiceAreaName ?? mergedState.practiceArea}`);
    if (typeof mergedState.city === 'string' && mergedState.city.trim()) knownFields.push(`City: ${mergedState.city.trim()}`);
    if (typeof mergedState.state === 'string' && mergedState.state.trim()) knownFields.push(`State: ${mergedState.state.trim()}`);
    if (typeof mergedState.opposingParty === 'string' && mergedState.opposingParty.trim()) knownFields.push(`Opposing party: ${mergedState.opposingParty.trim()}`);
    if (typeof mergedState.desiredOutcome === 'string' && mergedState.desiredOutcome.trim()) knownFields.push(`Desired outcome: ${mergedState.desiredOutcome.trim()}`);
    if (typeof mergedState.urgency === 'string' && mergedState.urgency.trim()) knownFields.push(`Urgency: ${mergedState.urgency.trim()}`);
    if (typeof mergedState.hasDocuments === 'boolean') knownFields.push(`Has documents: ${mergedState.hasDocuments}`);
  }

  const knownSection = knownFields.length > 0
    ? `\nKNOWN SO FAR (do not ask for these again):\n${knownFields.map(f => `- ${f}`).join('\n')}`
    : '';

  const ctaInstruction = messageCount >= 10
    ? `\nYou have asked enough questions. Briefly summarize what you know and ask if the user is ready to submit to the firm.`
    : `\nAsk exactly ONE focused question about the single most important missing piece of information. Priority: situation description → city and state → opposing party → urgency → desired outcome → documents.`;

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

const shouldShowDeterministicIntakeCta = (state: Record<string, unknown> | null): boolean => {
  if (!state) return false;
  const hasDescription = hasNonEmptyStringField(state, 'description');
  const hasLocation = hasNonEmptyStringField(state, 'city') && hasNonEmptyStringField(state, 'state');
  const hasOpposingParty = hasNonEmptyStringField(state, 'opposingParty');
  const hasDesiredOutcome = hasNonEmptyStringField(state, 'desiredOutcome');
  return hasDescription && hasLocation && hasOpposingParty && hasDesiredOutcome;
};

const buildIntakeSummaryFromState = (state: Record<string, unknown> | null): string => {
  if (!state) {
    return 'Here is the summary of what we have so far. Are you ready for me to submit this information to connect you with the right attorney?';
  }

  const read = (key: string): string => {
    const value = state[key];
    return typeof value === 'string' ? value.trim() : '';
  };

  const description = read('description');
  const city = read('city');
  const st = read('state');
  const opposingParty = read('opposingParty');
  const desiredOutcome = read('desiredOutcome');
  const urgency = read('urgency');
  const hasDocuments = typeof state.hasDocuments === 'boolean' ? state.hasDocuments : null;

  const parts: string[] = [];
  if (description) parts.push(`Situation: ${description}.`);
  if (city || st) {
    const location = city && st ? `${city}, ${st}` : city || st;
    if (location) parts.push(`Location: ${location}.`);
  }
  if (opposingParty) parts.push(`Opposing party: ${opposingParty}.`);
  if (desiredOutcome) parts.push(`Desired outcome: ${desiredOutcome}.`);
  if (urgency) parts.push(`Timing: ${urgency}.`);
  if (hasDocuments !== null) {
    parts.push(hasDocuments ? 'They already have supporting documents.' : 'They have not gathered documents yet.');
  }

  const opening = 'Here is what I have gathered so far.';
  return `${opening} ${parts.join(' ')}`.trim() + ' Are you ready for me to submit this information to connect you with the right attorney?';
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

const normalizeApostrophes = (text: string): string => text.replace(/['']/g, '\'');

const shouldRequireDisclaimer = (messages: Array<{ role: 'user' | 'assistant'; content: string }>): boolean => {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUserMessage) return false;
  return LEGAL_INTENT_REGEX.test(lastUserMessage.content);
};

const countQuestions = (text: string): number => (text.match(/\?/g) || []).length;

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

export {
  INTAKE_TOOL,
  buildIntakeSystemPrompt,
  mergeIntakeState,
  shouldShowDeterministicIntakeCta,
  buildIntakeSummaryFromState,
  normalizeServicesForPrompt,
  extractServiceNames,
  formatServiceList,
  normalizeApostrophes,
  shouldRequireDisclaimer,
  countQuestions,
  buildPracticeContactErrorReply,
  normalizePracticeDetailsForAi,
};
