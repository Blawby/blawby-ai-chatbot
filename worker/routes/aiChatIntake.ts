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
        },
        caseStrength: { type: 'string', enum: ['needs_more_info', 'developing', 'strong'] },
        missingSummary: {
          type: ['string', 'null'],
          description: 'Plain English — what would most improve case strength. Null if strong.'
        }
      },
      required: ['caseStrength']
    }
  }
} as const;

const buildIntakeSystemPrompt = (services: Array<{ name: string; key: string }>): string => {
  const serviceList = services.length > 0
    ? services.map((service) => `- ${service.name} (key: ${service.key})`).join('\n')
    : '- General intake (no service list provided)';

  return `You are a warm, helpful legal intake assistant for this law firm. Your job is to understand someone's legal situation so they can be connected with the right attorney.

This firm handles the following practice areas only:
${serviceList}

Conversation style:
- Be warm, human, and concise — like a knowledgeable friend, not a form
- Ask ONE focused question at a time
- Never give legal advice
- Never ask for personal contact info (name, email, phone) — that's already collected
- Only identify practice areas from the list above
- Before the brief is strong or ready to submit, every assistant reply must include exactly ONE concrete next-step intake question for the user.
- If the user just shared what happened, briefly acknowledge it and immediately ask the single most important missing intake question.
- Do not stop at empathy or validation alone. Move the intake forward in the same reply.

Your goal through the conversation is to naturally learn:
1. What is happening (in their words) — ask this first, openly. CHECK INTAKE_CONTEXT first.
2. Which practice area applies — CHECK INTAKE_CONTEXT first.
3. Their city and state — CHECK INTAKE_CONTEXT first. If present, do NOT ask.
4. Whether there's an opposing party — CHECK INTAKE_CONTEXT first.
5. Any time pressure or deadlines
6. What outcome they're hoping for

CRITICAL: The INTAKE_CONTEXT provided in system messages is your GROUND TRUTH. If a field (city, state, practiceArea, opposingParty, description) has a value in the context, treat it as known. NEVER ask for a known field. Instead, focus on the remaining missing pieces.

Do NOT ask for all of this at once. Follow the natural thread of the conversation. Once you know what's happening, ask for one missing piece at a time.

After every user message, call the update_intake_fields function with a SINGLE JSON object using camelCase keys (e.g., practiceArea, opposingParty) containing everything you've learned so far, including your caseStrength assessment and missingSummary.

caseStrength rules:
- needs_more_info: practice area unknown OR description is fewer than 10 words
- developing: practice area known + description has substance, but city/state OR opposing party are still unknown (check context for these!)
- strong: practice area known + description 20+ words + city and state known + at least one of (opposing party OR desired outcome OR urgency) known. WHEN STRONG, DO NOT SAY YOU NEED MORE INFO.

When caseStrength is "strong" (or if the user has sent 8+ messages), stop asking intake questions. Your only task is to respectfully show a brief summary of the case you've collected and ask if they are ready to submit it to the firm.

If the user says "yes", "sure", "go ahead", "ready", or similar in response to your ready-to-submit question, do NOT ask another intake question. Confirm they can submit now.

Question priority when information is missing:
- First: what happened / short description
- Then: city and state
- Then: opposing party
- Then: urgency or deadline
- Then: desired outcome
- Then: whether they have documents

missingSummary: always set this when caseStrength is "needs_more_info" or "developing". One plain sentence saying what's missing (look at what is NOT in INTAKE_CONTEXT). Set to null if caseStrength is "strong".

IMPORTANT: Never print function names, JSON, or structured data to the user. Never write update_intake_fields in chat content. If you need to save fields, use the tool silently and then continue with normal user-facing text.`;
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
  const caseStrength = typeof state.caseStrength === 'string' ? state.caseStrength : null;
  if (caseStrength !== 'developing' && caseStrength !== 'strong') return false;

  const hasDescription = hasNonEmptyStringField(state, 'description');
  const hasLocation = hasNonEmptyStringField(state, 'city') && hasNonEmptyStringField(state, 'state');
  const hasOpposingParty = hasNonEmptyStringField(state, 'opposingParty');
  const hasDesiredOutcome = hasNonEmptyStringField(state, 'desiredOutcome');
  const hasDocumentAnswer = typeof state.hasDocuments === 'boolean';
  return hasDescription && hasLocation && hasOpposingParty && hasDesiredOutcome && hasDocumentAnswer;
};

const buildIntakeSummaryFromState = (state: Record<string, unknown> | null): string => {
  if (!state) {
    return 'Here is the summary of what we have so far. Are you ready for me to submit this information to connect you with the right attorney?';
  }

  const read = (key: string): string => {
    const value = state[key];
    return typeof value === 'string' ? value.trim() : '';
  };

  const caseStrength = typeof state.caseStrength === 'string' ? state.caseStrength : null;
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

  const opening =
    caseStrength === 'strong'
      ? 'This brief looks strong.'
      : caseStrength === 'developing'
        ? 'This brief is developing well.'
        : 'Here is what I have gathered so far.';

  return `${opening} ${parts.join(' ')}`.trim() + ' Are you ready for me to submit this information to connect you with the right attorney?';
};

const shouldShowIntakeCtaForReply = (reply: string): boolean => {
  const normalized = reply.toLowerCase();
  if (
    normalized.includes("here's what we have so far") ||
    normalized.includes('here is what we have so far') ||
    normalized.includes('summary') ||
    normalized.includes('summarize')
  ) {
    return true;
  }
  return /(are you ready to submit|ready to submit|submit your request|submit this|submit this information|submit your consultation|connect you with the right attorney|would you like to submit|would you like to continue now)/i.test(reply);
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
    .map((service) => (typeof service?.name === 'string' ? service.name.trim() : ''))
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
  shouldShowIntakeCtaForReply,
  normalizeServicesForPrompt,
  extractServiceNames,
  formatServiceList,
  normalizeApostrophes,
  shouldRequireDisclaimer,
  countQuestions,
  buildPracticeContactErrorReply,
  normalizePracticeDetailsForAi,
};
