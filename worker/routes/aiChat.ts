import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import { HttpError } from '../types.js';
import type { Env } from '../types.js';
import type { ExecutionContext } from '@cloudflare/workers-types';
import { ConversationService } from '../services/ConversationService.js';
import { optionalAuth } from '../middleware/auth.js';
import { SessionAuditService } from '../services/SessionAuditService.js';
import { createAiClient } from '../utils/aiClient.js';
import { fetchPracticeDetailsWithCache } from '../utils/practiceDetailsCache.js';
import { Logger } from '../utils/logger.js';

const DEFAULT_AI_MODEL = '@cf/zai-org/glm-4.7-flash';
const LEGAL_DISCLAIMER = 'I\'m not a lawyer and can\'t provide legal advice, but I can help you request a consultation with this practice.';
const EMPTY_REPLY_FALLBACK = 'I wasn\'t able to generate a response. Please try again or click "Request consultation" to connect with the practice.';
const INTRO_INTAKE_DISCLAIMER_FALLBACK = "I cannot provide legal advice, but I can help you submit a consultation request. Please describe your situation so I can gather the details for the firm.";
const INTRO_ONBOARDING_FALLBACK = "I'm here to help you set up your practice profile. What would you like to update next?";
const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TOTAL_LENGTH = 12000;
const AI_TIMEOUT_MS = 8000;
const AI_STREAM_READ_TIMEOUT_MS = 15000;
const CONSULTATION_CTA_REGEX = /\b(request(?:ing)?|schedule|book)\s+(a\s+)?consultation\b/i;
const SERVICE_QUESTION_REGEX = /(?:\b(?:do you|are you|can you|what|which)\b.*\b(services?|practice (?:area|areas)|specializ(?:e|es) in|personal injury)\b|\b(services?|practice (?:area|areas)|specializ(?:e|es) in|personal injury)\b.*\?)/i;
const HOURS_QUESTION_REGEX = /\b(hours?|opening hours|business hours|office hours|when are you open)\b/i;
const LEGAL_INTENT_REGEX = /\b(?:legal advice|what are my rights|is it legal|do i need (?:a )?lawyer|(?:should|can|could|would)\s+i\b.*\b(?:sue|lawsuit|liable|liability|contract dispute|charged|settlement|custody|divorce|immigration|criminal)\b)/i;

const normalizeText = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const extractServiceNames = (details: Record<string, unknown> | null): string[] => {
  if (!details) return [];
  const services = details.services;
  if (!Array.isArray(services)) return [];
  return services
    .map((service) => (typeof service?.name === 'string' ? service.name.trim() : ''))
    .filter((name) => name.length > 0);
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

const formatServiceList = (names: string[]): string => {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`;
  return `${names.slice(0, 3).join(', ')}, and ${names.length - 3} more`;
};

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

  // Core intake readiness for showing CTA actions. This intentionally does not
  // require every optional field; it only ensures we have enough context to
  // offer "continue now" vs "build stronger brief".
  const hasDescription = hasNonEmptyStringField(state, 'description');
  const hasLocation = hasNonEmptyStringField(state, 'city') && hasNonEmptyStringField(state, 'state');
  const hasOpposingParty = hasNonEmptyStringField(state, 'opposingParty');
  const hasDesiredOutcome = hasNonEmptyStringField(state, 'desiredOutcome');
  const hasDocumentAnswer = typeof state.hasDocuments === 'boolean';
  return hasDescription && hasLocation && hasOpposingParty && hasDesiredOutcome && hasDocumentAnswer;
};

const normalizeApostrophes = (text: string): string => text.replace(/['']/g, '\'');

const shouldRequireDisclaimer = (messages: Array<{ role: 'user' | 'assistant'; content: string }>): boolean => {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUserMessage) return false;
  return LEGAL_INTENT_REGEX.test(lastUserMessage.content);
};

const countQuestions = (text: string): number => (text.match(/\?/g) || []).length;

const buildIntakeFallbackReply = (fields: Record<string, unknown> | null): string => {
  if (!fields) return 'Thanks — can you share a bit more about what happened?';
  if (typeof fields.practiceArea !== 'string' || fields.practiceArea.trim() === '') {
    return 'Which practice area best fits your situation?';
  }
  if (typeof fields.description !== 'string' || fields.description.trim() === '') {
    return 'Can you describe what happened in your own words?';
  }
  if (!fields.urgency && !fields.courtDate) {
    return 'Are there any upcoming deadlines or court dates?';
  }
  if (typeof fields.opposingParty !== 'string' || fields.opposingParty.trim() === '') {
    return 'Is there an opposing party involved?';
  }
  if (typeof fields.desiredOutcome !== 'string' || fields.desiredOutcome.trim() === '') {
    return 'What outcome are you hoping for?';
  }
  if (typeof fields.city !== 'string' || fields.city.trim() === '' || typeof fields.state !== 'string' || fields.state.trim() === '') {
    return 'What city and state are you in?';
  }
  if (typeof fields.hasDocuments !== 'boolean') {
    return 'Do you have any documents related to this situation?';
  }
  return 'Would you like to continue now, or build a stronger brief first so we can match you with the right attorney?';
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

const buildOnboardingFallbackReplyFromProfile = (profile: Record<string, unknown> | null): string => {
  if (!profile) return 'What would you like to set up first for your practice profile?';
  const completionScore = typeof profile.completionScore === 'number' ? profile.completionScore : 0;
  const missingFields = Array.isArray(profile.missingFields)
    ? profile.missingFields.filter((value): value is string => typeof value === 'string')
    : [];
  if (completionScore >= 80 && missingFields.length === 0) {
    return 'Welcome back! Your profile looks great. Anything you want to update?';
  }
  const nextField = missingFields[0] ?? null;
  const prompts: Record<string, string> = {
    website: 'If you have a website, share the URL and I can scan it to pre-fill your profile.',
    name: "What's the name of your practice?",
    description: 'What does your firm do or who do you serve?',
    services: 'What services or practice areas should clients be able to choose from?',
    contactPhone: "What's your main phone number?",
    businessEmail: "What's your business email?",
    address: "What's your office address?",
    accentColor: 'What accent color would you like to use?',
  };
  if (nextField && prompts[nextField]) return prompts[nextField];
  if (completionScore >= 80) return 'Welcome back! Your profile looks great. Anything you want to update?';
  return 'What would you like to update in your practice profile?';
};

const extractEmailFromText = (text: string | null | undefined): string | null => {
  if (!text) return null;
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
};

const buildOnboardingEditAwareFallbackReply = (
  profile: Record<string, unknown> | null,
  onboardingFields: Record<string, unknown> | null,
  lastUserContent?: string | null
): string => {
  const requestedEmail =
    (typeof onboardingFields?.businessEmail === 'string' && onboardingFields.businessEmail.trim()) ||
    extractEmailFromText(lastUserContent) ||
    null;
  if (requestedEmail && /\b(email|e-mail)\b/i.test(lastUserContent ?? '')) {
    return `Got it. I'll use ${requestedEmail} as your business email. Anything else you'd like to update?`;
  }

  const requestedPhone =
    typeof onboardingFields?.contactPhone === 'string' && onboardingFields.contactPhone.trim().length > 0
      ? onboardingFields.contactPhone.trim()
      : null;
  if (requestedPhone && /\b(phone|number|call)\b/i.test(lastUserContent ?? '')) {
    return `Got it. I'll use ${requestedPhone} as your main phone number. Anything else you'd like to update?`;
  }

  const requestedName =
    typeof onboardingFields?.name === 'string' && onboardingFields.name.trim().length > 0
      ? onboardingFields.name.trim()
      : null;
  if (requestedName && /\b(name|practice)\b/i.test(lastUserContent ?? '')) {
    return `Got it. I'll update the practice name to ${requestedName}. Anything else you'd like to update?`;
  }

  return buildOnboardingFallbackReplyFromProfile(profile);
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

const ONBOARDING_TOOL = {
  type: 'function',
  function: {
    name: 'update_practice_fields',
    description: 'Extract structured practice onboarding fields from the conversation so far',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        website: { type: 'string' },
        contactPhone: { type: 'string' },
        businessEmail: { type: 'string' },
        address: {
          type: 'object',
          properties: {
            address: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            postalCode: { type: 'string' },
            country: { type: 'string' },
          },
        },
        services: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              key: { type: 'string' },
            },
            required: ['name'],
          },
          maxItems: 20,
        },
        accentColor: { type: 'string' },
        completionScore: { type: 'number', minimum: 0, maximum: 100 },
        missingFields: { type: 'array', items: { type: 'string' } },
        quickReplies: { type: 'array', items: { type: 'string' }, maxItems: 3 },
        triggerEditModal: { type: 'string', enum: ['basics', 'contact'], description: 'Trigger a manual edit modal for the user if they indicate a correction is needed.' },
      },
    },
  },
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

missingSummary: always set this when caseStrength is "needs_more_info" or "developing". One plain sentence saying what's missing (look at what is NOT in INTAKE_CONTEXT). Set to null if caseStrength is "strong".

IMPORTANT: Never print function names, JSON, or structured data to the user. Never write update_intake_fields in chat content. If you need to save fields, use the tool silently and then continue with normal user-facing text.`;
};

const buildOnboardingSystemPrompt = (
  currentProfile: Record<string, unknown> | null = null
): string => {
  const completedFields = Array.isArray(currentProfile?.completedFields)
    ? currentProfile.completedFields.filter((v): v is string => typeof v === 'string')
    : [];
  const missingFields = Array.isArray(currentProfile?.missingFields)
    ? currentProfile.missingFields.filter((v): v is string => typeof v === 'string')
    : [];
  const completionScore = typeof currentProfile?.completionScore === 'number'
    ? currentProfile.completionScore
    : null;
  const summaryFields = Array.isArray(currentProfile?.summaryFields)
    ? currentProfile.summaryFields
        .filter((item): item is { label: string; value: string } => (
          isRecord(item) &&
          typeof item.label === 'string' &&
          typeof item.value === 'string'
        ))
        .map((item) => `${item.label}: ${item.value}`)
    : [];

  const stateLines = currentProfile ? [
    'CURRENT_SAVED_PROFILE_STATE (source of truth for saved fields):',
    ...(completionScore !== null ? [`- Completion score: ${completionScore}%`] : []),
    `- Completed fields: ${completedFields.length > 0 ? completedFields.join(', ') : 'none'}`,
    `- Missing fields: ${missingFields.length > 0 ? missingFields.join(', ') : 'none identified'}`,
    ...(summaryFields.length > 0 ? ['- Current saved values:', ...summaryFields.map((line) => `  - ${line}`)] : []),
    'CRITICAL RULE: Do NOT ask for completed fields again unless the user explicitly asks to change them.',
    'CRITICAL RULE: Ask about missing fields one at a time.',
  ] : [];

  return [
    'You are a practice onboarding assistant helping a law firm set up their profile.',
    'IMPORTANT: Always prioritize responding to the user\'s latest message. If they provide a name or URL, acknowledge it immediately.',
    'The app automatically searches for practice details when the user provides a name or URL.',
    'If search results arrive in SEARCH_CONTEXT:',
    '  - One match: Confirm it with the user. "I found [Practice Name] at [Address]. Is that yours?" Use Quick Replies: ["Yes, that\'s correct", "No, that\'s not it"].',
    '  - Multiple matches: Present the options and ask which one is theirs.',
    '  - Once confirmed, ALWAYS use update_practice_fields to save the details from SEARCH_CONTEXT.',
    'If SEARCH_CONTEXT is empty or no match is found:',
    '  - Acknowledge what they said: "I couldn\'t find details for [Name] online." or "I couldn\'t scan that website."',
    '  - Transition to manual collection: "No problem. Let\'s do it manually." Then ask one targeted missing-field question.',
    'If PRACTICE_CONTEXT already has a name when the chat starts, welcome them and continue from what is missing.',
    'If the user asks to change a field and the provided value matches the current saved value, acknowledge it is already set and ask what they want to update next.',
    'Collect profile details conversationally, one question at a time.',
    'When asking for services, suggest common ones as Quick Replies.',
    'When the profile score hits 80%, congratulate them on the live preview.',
    'Be warm, human, and concise. Avoid sounding like a form.',
    ...stateLines,
  ].join('\n');
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

const normalizeOnboardingServices = (value: unknown): Array<{ name: string; description?: string; key?: string }> => {
  if (!Array.isArray(value)) return [];
  return value
    .map((service) => {
      if (!isRecord(service)) return null;
      const name = readAnyString(service, ['name', 'title']);
      if (!name) return null;
      const description = readAnyString(service, ['description']);
      const key = readAnyString(service, ['key', 'id', 'service_key']);
      return { name, ...(description ? { description } : {}), ...(key ? { key } : {}) };
    })
    .filter((row): row is { name: string; description?: string; key?: string } => Boolean(row));
};

const buildOnboardingProfileMetadata = (
  details: Record<string, unknown> | null,
  onboardingFields: Record<string, unknown> | null
): Record<string, unknown> | null => {
  const fieldAddress = isRecord(onboardingFields?.address) ? onboardingFields.address : null;
  const detailAddress = details;
  const detailAddressObject = isRecord(details?.address) ? details.address : null;

  const name = readAnyString(onboardingFields, ['name']) ?? readAnyString(details, ['name', 'practiceName', 'practice_name']);
  const onboardingDescription = readAnyString(onboardingFields, ['description']);
  const persistedDescription = readAnyString(details, ['description', 'overview']);
  const description = onboardingDescription ?? persistedDescription;
  const website = readAnyString(onboardingFields, ['website']) ?? readAnyString(details, ['website']);
  const contactPhone = readAnyString(onboardingFields, ['contactPhone']) ?? readAnyString(details, ['businessPhone', 'business_phone', 'contactPhone', 'contact_phone']);
  const businessEmail = readAnyString(onboardingFields, ['businessEmail']) ?? readAnyString(details, ['businessEmail', 'business_email', 'email']);
  const accentColor = readAnyString(onboardingFields, ['accentColor']) ?? readAnyString(details, ['accentColor', 'accent_color']);
  const services = normalizeOnboardingServices(onboardingFields?.services ?? details?.services);
  const hasServices = services.length > 0;

  const addressLine1 =
    readAnyString(fieldAddress, ['address']) ??
    readAnyString(detailAddressObject, ['line1', 'address', 'address_line_1']) ??
    readAnyString(detailAddress, ['address', 'addressLine1', 'address_line_1']);
  const city =
    readAnyString(fieldAddress, ['city']) ??
    readAnyString(detailAddressObject, ['city']) ??
    readAnyString(detailAddress, ['city']);
  const state =
    readAnyString(fieldAddress, ['state']) ??
    readAnyString(detailAddressObject, ['state']) ??
    readAnyString(detailAddress, ['state']);
  const hasAddress = Boolean(addressLine1 && city && state);

  const weightedChecks: Array<[string, boolean, number]> = [
    ['name', Boolean(name), 10],
    ['description', Boolean(description), 15],
    ['services', hasServices, 20],
    ['website', Boolean(website), 5],
    ['contactPhone', Boolean(contactPhone), 10],
    ['businessEmail', Boolean(businessEmail), 10],
    ['address', hasAddress, 15],
    ['accentColor', Boolean(accentColor), 10],
  ];
  const totalWeight = weightedChecks.reduce((sum, [, , weight]) => sum + weight, 0);
  const earnedWeight = weightedChecks.reduce((sum, [, done, weight]) => sum + (done ? weight : 0), 0);
  const completionScore = Math.max(0, Math.min(100, Math.round((earnedWeight / totalWeight) * 100)));
  const missingFields = weightedChecks.filter(([, done]) => !done).map(([field]) => field);

  const summaryFields: Array<{ label: string; value: string }> = [];
  if (name) summaryFields.push({ label: 'Practice name', value: name });
  if (website) summaryFields.push({ label: 'Website', value: website.replace(/^https?:\/\//, '') });
  if (contactPhone) summaryFields.push({ label: 'Phone', value: contactPhone });
  if (businessEmail) summaryFields.push({ label: 'Email', value: businessEmail });

  return {
    completionScore,
    completedFields: weightedChecks.filter(([, done]) => done).map(([field]) => field),
    missingFields,
    summaryFields,
    serviceNames: services.map((service) => service.name),
  };
};

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

/**
 * Encode a single SSE event as bytes.
 * We use a single `data:` line containing JSON so the client can parse each
 * event with one JSON.parse call without needing to track event names.
 */
function sseEvent(payload: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Build an SSE Response with the correct headers for Cloudflare Workers.
 * The transform stream lets us write events from a separate async task while
 * the response is already streaming to the client.
 */
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
        // Prevent Cloudflare from buffering the stream
        'X-Accel-Buffering': 'no',
      },
    }),
    write(payload) {
      // Fire-and-forget — if the client disconnected the write will silently fail
      writer.write(sseEvent(payload)).catch(() => {});
    },
    close() {
      writer.close().catch(() => {});
    },
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleAiChat(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  if (request.method !== 'POST') {
    throw HttpErrors.methodNotAllowed('Method not allowed');
  }

  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] !== 'api' || segments[1] !== 'ai' || segments[2] !== 'chat') {
    throw HttpErrors.notFound('Endpoint not found');
  }

  const authContext = await optionalAuth(request, env);
  if (!authContext) {
    throw HttpErrors.unauthorized('Authentication required');
  }

  const body = await parseJsonBody(request) as {
    conversationId?: string;
    practiceSlug?: string;
    mode?: 'ASK_QUESTION' | 'REQUEST_CONSULTATION' | 'PRACTICE_ONBOARDING';
    intakeSubmitted?: boolean;
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    additionalContext?: string;
  };

  if (!body.conversationId || typeof body.conversationId !== 'string') {
    throw HttpErrors.badRequest('conversationId is required');
  }
  if (!Array.isArray(body.messages)) {
    throw HttpErrors.badRequest('messages must be an array');
  }
  const invalidMessage = body.messages.find((message) => (
    !message ||
    (message.role !== 'user' && message.role !== 'assistant') ||
    typeof message.content !== 'string'
  ));
  if (invalidMessage) {
    throw HttpErrors.badRequest('messages must include role and content');
  }
  if (body.messages.length > MAX_MESSAGES) {
    throw HttpErrors.badRequest(`messages exceeds limit of ${MAX_MESSAGES}`);
  }
  const totalLength = body.messages.reduce((sum, message) => sum + message.content.length, 0);
  if (totalLength > MAX_TOTAL_LENGTH) {
    throw HttpErrors.badRequest(`messages total length exceeds ${MAX_TOTAL_LENGTH} characters`);
  }
  const oversizeMessage = body.messages.find((message) => message.content.length > MAX_MESSAGE_LENGTH);
  if (oversizeMessage) {
    throw HttpErrors.badRequest(`message content exceeds ${MAX_MESSAGE_LENGTH} characters`);
  }

  const conversationService = new ConversationService(env);
  const conversation = await conversationService.getConversationById(body.conversationId);
  if (!conversation) {
    throw HttpErrors.notFound('Conversation not found');
  }
  if (!conversation.participants.includes(authContext.user.id)) {
    throw HttpErrors.forbidden('User is not a participant in this conversation');
  }

  const practiceId = conversation.practice_id;
  if (!practiceId) {
    throw HttpErrors.badRequest('Conversation is missing practice context');
  }

  const auditService = new SessionAuditService(env);
  await auditService.createEvent({
    conversationId: body.conversationId,
    practiceId,
    eventType: 'ai_message_sent',
    actorType: 'user',
    actorId: authContext.user.id,
    payload: { conversationId: body.conversationId }
  });

  const conversationMetadata = isRecord(conversation.user_info) ? conversation.user_info : null;
  const storedMode = typeof conversationMetadata?.mode === 'string' ? conversationMetadata.mode : null;
  const effectiveMode = body.mode ?? storedMode;

  const practiceSlugFromBody = typeof body.practiceSlug === 'string' ? body.practiceSlug.trim() : '';
  const practiceSlugFromConversation =
    conversation.practice && typeof conversation.practice.slug === 'string'
      ? conversation.practice.slug.trim()
      : '';
  const practiceSlugFromMetadata =
    typeof conversationMetadata?.practiceSlug === 'string'
      ? conversationMetadata.practiceSlug.trim()
      : '';
  const practiceSlug = practiceSlugFromBody || practiceSlugFromConversation || practiceSlugFromMetadata;

  let details: Record<string, unknown> | null = null;
  let isPublic = false;
  try {
    ({ details, isPublic } = await fetchPracticeDetailsWithCache(
      env,
      request,
      practiceId,
      practiceSlug || undefined,
      {
        bypassCache: effectiveMode === 'PRACTICE_ONBOARDING',
        preferPracticeIdLookup: authContext.isAnonymous !== true,
      }
    ));
  } catch (error) {
    Logger.error('AI chat failed to load practice details', {
      practiceId,
      practiceSlug,
      conversationId: body.conversationId,
      status: error instanceof HttpError ? error.status : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const isOnboardingMode = effectiveMode === 'PRACTICE_ONBOARDING';
  const storedIntakeState = isRecord(conversationMetadata?.intakeConversationState)
    ? conversationMetadata.intakeConversationState as Record<string, unknown>
    : null;
  const slimDraft = isRecord(conversationMetadata?.intakeSlimContactDraft)
    ? conversationMetadata.intakeSlimContactDraft as Record<string, unknown>
    : null;
  const hasSlimContactDraft = Boolean(
    slimDraft && (
      hasNonEmptyStringField(slimDraft, 'name') ||
      hasNonEmptyStringField(slimDraft, 'email') ||
      hasNonEmptyStringField(slimDraft, 'phone')
    )
  );
  const intakeBriefActive = conversationMetadata?.intakeAiBriefActive === true;
  const isIntakeMode = Boolean(
    (effectiveMode === 'REQUEST_CONSULTATION' || hasSlimContactDraft || intakeBriefActive) &&
    body.intakeSubmitted !== true &&
    isPublic
  );
  const isGeneralQaMode = !isIntakeMode && !isOnboardingMode;
  const shouldSkipPracticeValidation = authContext.isAnonymous === true || isPublic;

  if (!details) {
    throw HttpErrors.badGateway(
      `Practice details lookup returned no payload for practice ${practiceId}${practiceSlug ? ` (${practiceSlug})` : ''}.`
    );
  }
  if (!isPublic && !isOnboardingMode) {
    throw HttpErrors.forbidden(
      'This practice is not publicly available for chat. Please request consultation to continue.'
    );
  }

  const lastUserMessage = [...body.messages].reverse().find((message) => message.role === 'user');
  const serviceNames = extractServiceNames(details);
  const hasLegalIntent = Boolean(lastUserMessage && LEGAL_INTENT_REGEX.test(lastUserMessage.content));
  const intakeReadyByState = isIntakeMode && shouldShowDeterministicIntakeCta(storedIntakeState);

  // ------------------------------------------------------------------
  // Short-circuit paths — instant replies that don't need streaming.
  // These return a JSON response identical to the old format so any
  // legacy client code that hasn't been updated yet still works.
  // ------------------------------------------------------------------

  let shortCircuitReply: string | null = null;
  let shortCircuitIntakeReadyCta = false;
  let shortCircuitOnboardingProfile: Record<string, unknown> | null = null;

  if (lastUserMessage && HOURS_QUESTION_REGEX.test(lastUserMessage.content)) {
    const phone = readStringField(details, 'business_phone') ?? readStringField(details, 'businessPhone');
    const email = readStringField(details, 'business_email') ?? readStringField(details, 'businessEmail');
    const website = readStringField(details, 'website');
    const contactParts = [phone ? `phone: ${phone}` : null, email ? `email: ${email}` : null, website ? `website: ${website}` : null]
      .filter((value): value is string => Boolean(value));
    shortCircuitReply = contactParts.length > 0
      ? `The practice has not published specific office hours here yet. You can contact them via ${contactParts.join(', ')}.`
      : 'The practice has not published specific office hours here yet. Please click "Request consultation" to connect with the practice.';
  } else if (isGeneralQaMode && hasLegalIntent) {
    shortCircuitReply = LEGAL_DISCLAIMER;
  } else if (isGeneralQaMode && lastUserMessage && SERVICE_QUESTION_REGEX.test(lastUserMessage.content) && serviceNames.length > 0) {
    const normalizedQuestion = normalizeText(lastUserMessage.content);
    const matchedService = serviceNames.find((service) => normalizedQuestion.includes(normalizeText(service)));
    shortCircuitReply = matchedService
      ? `Yes — we handle ${matchedService}. Would you like to request a consultation?`
      : `We currently handle ${formatServiceList(serviceNames)}. Would you like to request a consultation?`;
  }

  if (shortCircuitReply !== null) {
    if (isOnboardingMode) {
      shortCircuitOnboardingProfile = buildOnboardingProfileMetadata(details, null);
    }
    const shouldPromptConsultation =
      !hasSlimContactDraft &&
      (shouldRequireDisclaimer(body.messages) || CONSULTATION_CTA_REGEX.test(shortCircuitReply));
    const shortCircuitShouldShowIntakeCta =
      isIntakeMode &&
      (
        shortCircuitIntakeReadyCta ||
        (
          intakeReadyByState &&
          shouldShowIntakeCtaForReply(shortCircuitReply)
        )
      );

    const storedMessage = await conversationService.sendSystemMessage({
      conversationId: body.conversationId,
      practiceId: conversation.practice_id,
      content: shortCircuitReply,
      metadata: {
        source: 'ai',
        model: DEFAULT_AI_MODEL,
        ...(shortCircuitOnboardingProfile ? { onboardingProfile: shortCircuitOnboardingProfile } : {}),
        ...(shortCircuitShouldShowIntakeCta ? { intakeReadyCta: true } : {}),
        ...(shouldPromptConsultation
          ? { modeSelector: { showAskQuestion: false, showRequestConsultation: true, source: 'ai' } }
          : {})
      },
      recipientUserId: authContext.user.id,
      skipPracticeValidation: shouldSkipPracticeValidation,
      request
    });

    await auditService.createEvent({
      conversationId: body.conversationId,
      practiceId: conversation.practice_id,
      eventType: 'ai_message_received',
      actorType: 'system',
      payload: { conversationId: body.conversationId }
    });

    return new Response(
      JSON.stringify({
        reply: shortCircuitReply,
        message: storedMessage,
        intakeFields: null,
        onboardingFields: null,
        onboardingProfile: shortCircuitOnboardingProfile,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ------------------------------------------------------------------
  // Streaming path — calls Workers AI with stream:true, pipes tokens to the
  // client via SSE, then persists the completed message via waitUntil.
  // ------------------------------------------------------------------

  const aiDetails = normalizePracticeDetailsForAi(details);
  const aiClient = createAiClient(env);
  const model = DEFAULT_AI_MODEL;

  const servicesForPrompt = normalizeServicesForPrompt(details);
  const onboardingPromptProfile = isOnboardingMode
    ? buildOnboardingProfileMetadata(details, null)
    : null;
  const systemPrompt = isIntakeMode
    ? buildIntakeSystemPrompt(servicesForPrompt)
    : isOnboardingMode
      ? buildOnboardingSystemPrompt(onboardingPromptProfile)
      : [
        'You are an intake assistant for a law practice website.',
        'You may answer only operational questions using provided practice details.',
        `If user asks for legal advice: respond with the exact sentence: "${LEGAL_DISCLAIMER}" and recommend consultation.`,
        'Ask only ONE clarifying question max per assistant message.',
        'If you don\'t have practice details: say you don\'t have access and recommend consultation.',
      ].join('\n');

  const fullSystemPrompt = [
    systemPrompt,
    `PRACTICE_CONTEXT: ${JSON.stringify(aiDetails)}`,
    (isIntakeMode && storedIntakeState) ? `INTAKE_CONTEXT: ${JSON.stringify(storedIntakeState)}` : null,
    body.additionalContext ? `SEARCH_CONTEXT: ${body.additionalContext}` : null
  ].filter(Boolean).join('\n\n');

  const requestPayload: Record<string, unknown> = {
    model: model,
    temperature: 0.2,
    stream: true,
    messages: [
      { role: 'system', content: fullSystemPrompt },
      ...body.messages.map((message) => ({ role: message.role, content: message.content }))
    ]
  };

  // Intake mode uses tools — Workers AI supports streaming with tools,
  // but the tool call arguments arrive in chunks too. We accumulate them
  // separately and only emit the done event once the full tool call is parsed.
  if (isIntakeMode) {
    requestPayload.tools = [INTAKE_TOOL];
  } else if (isOnboardingMode) {
    requestPayload.tools = [ONBOARDING_TOOL];
  }

  const { response: sseResponse, write, close } = createSseResponse();

  // Kick off the async work and register it with ctx.waitUntil so Cloudflare
  // does not terminate the worker before persistence completes.
  const streamAndPersist = async (env: Env) => {
    let accumulatedReply = '';
    let intakeFields: Record<string, unknown> | null = null;
    let onboardingFields: Record<string, unknown> | null = null;
    let quickReplies: string[] | null = null;
    let onboardingProfile: Record<string, unknown> | null = null;
    let emittedAnyToken = false;

    const consumeAiStream = async (
      response: Response,
      emitTokens = true
    ): Promise<{
      reply: string;
      toolCalls: Array<{name: string, arguments: string}>;
      streamStalled: boolean;
      emittedToken: boolean;
    }> => {
      if (!response.body) {
        return {
          reply: '',
          toolCalls: [],
          streamStalled: false,
          emittedToken: false
        };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamStalled = false;
      let localReply = '';
      let localToolCalls: Array<{name: string, arguments: string}> = [];
      let localEmittedToken = false;

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
          Logger.warn('AI stream read stalled or failed', {
            conversationId: body.conversationId,
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

          let chunk: {
            choices?: Array<{
              delta?: {
                content?: string | null;
                tool_calls?: Array<{
                  index?: number;
                  function?: { name?: string; arguments?: string };
                }>;
              };
            }>;
          };

          try {
            chunk = JSON.parse(trimmed.slice(6));
          } catch {
            continue;
          }

          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          if (typeof delta.content === 'string' && delta.content.length > 0) {
            localReply += delta.content;

            const looksLikeToolLeak =
              delta.content.includes('update_intake_fields') ||
              delta.content.includes('update_practice_fields') ||
              delta.content.includes('"caseStrength"') ||
              delta.content.includes('"practiceArea"');

            if (emitTokens && !looksLikeToolLeak) {
              write({ token: delta.content });
              localEmittedToken = true;
            }
          }

          // Handle all tool calls, not just the first one
          if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              if (typeof tc.function?.arguments === 'string') {
                let targetCall: {name: string, arguments: string} | undefined;
                
                if (tc.function?.name) {
                  // Find existing tool call with this name or create new one
                  targetCall = localToolCalls.find(call => call.name === tc.function.name);
                  if (!targetCall) {
                    targetCall = {
                      name: tc.function.name,
                      arguments: tc.function.arguments
                    };
                    localToolCalls.push(targetCall);
                  } else {
                    // Append to existing call
                    targetCall.arguments += tc.function.arguments;
                  }
                } else {
                  // Argument-only fragment: use most recent call if available
                  if (localToolCalls.length > 0) {
                    targetCall = localToolCalls[localToolCalls.length - 1];
                    targetCall.arguments += tc.function.arguments;
                  }
                  // If no existing call, we can't handle argument-only fragments
                  // (this would be malformed SSE)
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
                  tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
                };
              }>;
            };
            const token = chunk.choices?.[0]?.delta?.content;
            if (typeof token === 'string' && token.length > 0) {
              localReply += token;

              const looksLikeToolLeak =
                token.includes('update_intake_fields') ||
                token.includes('update_practice_fields') ||
                token.includes('"caseStrength"') ||
                token.includes('"practiceArea"');

              if (emitTokens && !looksLikeToolLeak) {
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
                    // Find existing tool call with this name or create new one
                    targetCall = localToolCalls.find(call => call.name === tc.function.name);
                    if (!targetCall) {
                      targetCall = {
                        name: tc.function.name,
                        arguments: tc.function.arguments
                      };
                      localToolCalls.push(targetCall);
                    } else {
                      // Append to existing call
                      targetCall.arguments += tc.function.arguments;
                    }
                  } else {
                    // Argument-only fragment: use most recent call if available
                    if (localToolCalls.length > 0) {
                      targetCall = localToolCalls[localToolCalls.length - 1];
                      targetCall.arguments += tc.function.arguments;
                    }
                    // If no existing call, we can't handle argument-only fragments
                    // (this would be malformed SSE)
                  }
                }
              }
            }
          }
        } catch {
          // ignore malformed final chunk
        }
      }

      return {
        reply: localReply,
        toolCalls: localToolCalls,
        streamStalled,
        emittedToken: localEmittedToken
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
        case_strength: 'caseStrength',
        missing_summary: 'missingSummary',
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

    const parseToolCallFromReply = (
      rawReply: string
    ): { name?: string; parameters?: Record<string, unknown>; contentBuffer?: string } | null => {
      const startMatch = rawReply.match(/(update_intake_fields|update_practice_fields)\s*\(/);
      if (startMatch) {
        const startIndex = startMatch.index!;
        const name = startMatch[1];

        const parenIndex = rawReply.indexOf('(', startIndex + name.length);
        let endIndex = -1;

        if (parenIndex !== -1) {
          let parenCount = 1;
          for (let i = parenIndex + 1; i < rawReply.length; i += 1) {
            if (rawReply[i] === '(') parenCount += 1;
            else if (rawReply[i] === ')') {
              parenCount -= 1;
              if (parenCount === 0) {
                endIndex = i;
                break;
              }
            }
          }
        }

        const matchedText =
          endIndex !== -1
            ? rawReply.substring(startIndex, endIndex + 1)
            : rawReply.substring(startIndex);

        let parameters: Record<string, unknown> = {};
        let parseSuccess = false;

        try {
          let jsonPayload = '';
          const openingBraceIndex = matchedText.indexOf('{');

          if (openingBraceIndex !== -1) {
            let braceCount = 0;
            let j = openingBraceIndex;

            for (; j < matchedText.length; j += 1) {
              if (matchedText[j] === '{') braceCount += 1;
              else if (matchedText[j] === '}') braceCount -= 1;
              if (braceCount === 0) break;
            }

            if (braceCount === 0) {
              jsonPayload = matchedText.substring(openingBraceIndex, j + 1);
            }
          }

          if (jsonPayload) {
            parameters = normalizeKeys(JSON.parse(jsonPayload)) as Record<string, unknown>;
            parseSuccess = true;

            if (name === 'update_intake_fields' && !parameters.caseStrength) {
              const rest = matchedText.substring(matchedText.indexOf(jsonPayload) + jsonPayload.length);
              const positionalMatch = rest.match(/,\s*"([^"]+)"\s*(?:,\s*"([^"]+)")?/);
              if (positionalMatch) {
                parameters.caseStrength = positionalMatch[1];
                if (positionalMatch[2]) {
                  parameters.missingSummary = positionalMatch[2];
                }
              }
            }
          }
        } catch {
          // ignore
        }

        const cleanText = rawReply.replace(matchedText, '').trim();
        return {
          name,
          parameters: parseSuccess ? parameters : undefined,
          contentBuffer: cleanText,
        };
      }

      const trimmed = rawReply.trim();
      if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const name = typeof parsed.name === 'string' ? parsed.name : undefined;
        const p =
          parsed.parameters &&
          typeof parsed.parameters === 'object' &&
          !Array.isArray(parsed.parameters)
            ? (parsed.parameters as Record<string, unknown>)
            : undefined;

        if (!name && !p) return null;

        return {
          name,
          parameters: p ? (normalizeKeys(p) as Record<string, unknown>) : undefined,
          contentBuffer: '',
        };
      } catch {
        return null;
      }
    };

    const startedAt = Date.now();

      // Add timeout for the initial AI request
      const controller = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        controller.abort();
      }, AI_TIMEOUT_MS);

    try {
      const aiResponse = await aiClient.requestChatCompletions(requestPayload, controller.signal);
      
      // Clear timeout once headers are received
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text().catch(() => '');
        Logger.warn('AI upstream request failed', {
          conversationId: body.conversationId,
          status: aiResponse.status,
          body: errorText,
          model,
        });
        throw new Error('AI upstream request failed');
      }

      if (!aiResponse.body) {
        throw new Error('AI upstream request failed: missing body');
      }

      const aigStep = aiResponse.headers.get('cf-aig-step');
      const shouldStreamTokensToUser = !isIntakeMode && !isOnboardingMode;
      const streamResult = await consumeAiStream(aiResponse, shouldStreamTokensToUser);
      const latencyMs = Date.now() - startedAt;

      Logger.info('AI response complete', {
        conversationId: body.conversationId,
        model: model,
        aigStep,
        latencyMs,
        emittedToken: streamResult.emittedToken,
        streamStalled: streamResult.streamStalled,
        hasToolCalls: streamResult.toolCalls.length > 0,
        toolCallCount: streamResult.toolCalls.length,
        replyLength: streamResult.reply.length
      });

      accumulatedReply = streamResult.reply;
      
      // Only log AI preview in debug mode to avoid PII leakage
      if (env.DEBUG) {
        Logger.info('AI raw reply preview', {
          conversationId: body.conversationId,
          replyPreview: accumulatedReply.slice(0, 100),
        });
      }
      emittedAnyToken = streamResult.emittedToken;

      // Parse accumulated tool calls if present
      for (const toolCall of streamResult.toolCalls) {
        if (toolCall.name === 'update_intake_fields' && toolCall.arguments.length > 0) {
          try {
            const rawParams = JSON.parse(toolCall.arguments);
            intakeFields = normalizeKeys(rawParams) as Record<string, unknown>;
          } catch (error) {
            Logger.warn('Failed to parse streamed intake tool arguments', {
              conversationId: body.conversationId,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        } else if (toolCall.name === 'update_practice_fields' && toolCall.arguments.length > 0) {
          try {
            const rawParams = JSON.parse(toolCall.arguments);
            onboardingFields = normalizeKeys(rawParams) as Record<string, unknown>;
          } catch (error) {
            Logger.warn('Failed to parse streamed onboarding tool arguments', {
              conversationId: body.conversationId,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }

      // Post-process reply — same validation logic as the non-streaming path
      if (!accumulatedReply.trim()) {
        if (isIntakeMode && intakeFields) {
          accumulatedReply = buildIntakeFallbackReply(intakeFields);
        } else if (isOnboardingMode && onboardingFields) {
          const currentOnboardingProfile = buildOnboardingProfileMetadata(details, onboardingFields);
          accumulatedReply = buildOnboardingEditAwareFallbackReply(
            currentOnboardingProfile,
            onboardingFields,
            lastUserMessage?.content ?? null
          );
        } else {
          throw new Error('AI returned an empty reply');
        }
      }

      // Final cleanup of accumulatedReply to strip any leaked tool calls
      // that might have arrived in the text stream but weren't caught by the delta-parsing logic.
      const looksLikeLeakedToolContent =
        accumulatedReply.includes('update_intake_fields') ||
        accumulatedReply.includes('update_practice_fields') ||
        accumulatedReply.includes('"caseStrength"') ||
        accumulatedReply.includes('"practiceArea"') ||
        accumulatedReply.includes('"opposingParty"') ||
        accumulatedReply.includes('"desiredOutcome"') ||
        accumulatedReply.includes('"completionScore"') ||
        accumulatedReply.includes('"missingFields"') ||
        accumulatedReply.includes('```json') ||
        accumulatedReply.includes('"practice_area"') ||
        accumulatedReply.includes('"case_strength"') ||
        accumulatedReply.includes('"missing_summary"');

      if (looksLikeLeakedToolContent) {
        const finalParsing = parseToolCallFromReply(accumulatedReply);
        if (finalParsing) {
          if (finalParsing.parameters) {
            if (finalParsing.name === 'update_intake_fields') {
              intakeFields = { ...(intakeFields ?? {}), ...finalParsing.parameters };
            } else if (finalParsing.name === 'update_practice_fields') {
              onboardingFields = { ...(onboardingFields ?? {}), ...finalParsing.parameters };
            }
          }
          if (finalParsing.contentBuffer && finalParsing.contentBuffer.trim().length > 0) {
            accumulatedReply = finalParsing.contentBuffer;
          } else if (isIntakeMode && intakeFields) {
            accumulatedReply = buildIntakeFallbackReply(intakeFields);
          } else if (isOnboardingMode && onboardingFields) {
            const currentOnboardingProfile = buildOnboardingProfileMetadata(details, onboardingFields);
            accumulatedReply = buildOnboardingEditAwareFallbackReply(
              currentOnboardingProfile,
              onboardingFields,
              lastUserMessage?.content ?? null
            );
          } else {
            accumulatedReply = isIntakeMode
              ? INTRO_INTAKE_DISCLAIMER_FALLBACK
              : isOnboardingMode
                ? INTRO_ONBOARDING_FALLBACK
                : EMPTY_REPLY_FALLBACK;
          }
        }
      }

      if (accumulatedReply !== EMPTY_REPLY_FALLBACK) {
        const violations: string[] = [];
        if (
          shouldRequireDisclaimer(body.messages) &&
          !normalizeApostrophes(accumulatedReply).toLowerCase().includes(normalizeApostrophes(LEGAL_DISCLAIMER).toLowerCase())
        ) {
          violations.push('missing_disclaimer');
        }
        if (!isIntakeMode && !isOnboardingMode && countQuestions(accumulatedReply) > 1) {
          violations.push('too_many_questions');
        }
        if (violations.length > 0) {
          Logger.warn('AI response violated prompt contract', {
            conversationId: body.conversationId,
            violations
          });
          if (violations.includes('missing_disclaimer')) {
            accumulatedReply = isIntakeMode ? INTRO_INTAKE_DISCLAIMER_FALLBACK : EMPTY_REPLY_FALLBACK;
          } else if (!isIntakeMode && !isOnboardingMode) {
            accumulatedReply = EMPTY_REPLY_FALLBACK;
          }
        }
      }

      if (!emittedAnyToken && accumulatedReply.trim()) {
        write({ token: accumulatedReply });
        emittedAnyToken = true;
      }

      const fieldsForQuickReplies = isIntakeMode ? intakeFields : (isOnboardingMode ? onboardingFields : null);
      // Extract quickReplies from structured tool fields before persisting
      if (fieldsForQuickReplies && Array.isArray(fieldsForQuickReplies.quickReplies)) {
        quickReplies = (fieldsForQuickReplies.quickReplies as unknown[])
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
          .slice(0, 3);
        if (quickReplies.length === 0) quickReplies = null;
      }
      if (intakeFields && 'quickReplies' in intakeFields) {
        const { quickReplies: _q, ...rest } = intakeFields as Record<string, unknown>;
        intakeFields = rest;
      }
      if (onboardingFields && 'quickReplies' in onboardingFields) {
        const { quickReplies: _q, ...rest } = onboardingFields as Record<string, unknown>;
        onboardingFields = rest;
      }
      let triggerEditModal: string | null = null;
      if (onboardingFields && 'triggerEditModal' in onboardingFields) {
        triggerEditModal = onboardingFields.triggerEditModal as string;
        const { triggerEditModal: _t, ...rest } = onboardingFields as Record<string, unknown>;
        onboardingFields = rest;
      }
      if (isOnboardingMode) {
        onboardingProfile = buildOnboardingProfileMetadata(details, onboardingFields);
      }
      if (intakeFields && typeof intakeFields.practiceArea === 'string') {
        const matched = servicesForPrompt.find((s) => s.key === intakeFields?.practiceArea);
        if (matched) intakeFields.practiceAreaName = matched.name;
      }
      let mergedIntakeState = mergeIntakeState(storedIntakeState, intakeFields);

      const shouldPromptConsultation =
        !hasSlimContactDraft &&
        (shouldRequireDisclaimer(body.messages) || CONSULTATION_CTA_REGEX.test(accumulatedReply));

      const intakeCaseStrength = typeof intakeFields?.caseStrength === 'string'
        ? intakeFields.caseStrength
        : null;
      const replyHasIntakePrompt = shouldShowIntakeCtaForReply(accumulatedReply);
      const deterministicReady = isIntakeMode && shouldShowDeterministicIntakeCta(mergedIntakeState);
      const shouldForceIntakeSummary =
        isIntakeMode &&
        deterministicReady &&
        !replyHasIntakePrompt &&
        countQuestions(accumulatedReply) === 0 &&
        mergedIntakeState?.ctaShown !== true;

      if (shouldForceIntakeSummary) {
        intakeFields = { ...(intakeFields ?? {}), ctaShown: true };
        mergedIntakeState = mergeIntakeState(storedIntakeState, intakeFields);
      }

      const shouldShowIntakeCta =
        isIntakeMode &&
        replyHasIntakePrompt &&
        (deterministicReady || intakeCaseStrength === 'developing' || intakeCaseStrength === 'strong');
      const forcedSummaryContent = shouldForceIntakeSummary
        ? buildIntakeSummaryFromState(mergedIntakeState)
        : null;

      // Emit the done event before persisting — client can act on intakeFields
      // immediately without waiting for the DB write
      write({
        done: true,
        intakeFields: intakeFields ?? null,
        onboardingFields: onboardingFields ?? null,
        onboardingProfile: onboardingProfile ?? null,
        quickReplies: quickReplies ?? null,
        triggerEditModal: triggerEditModal ?? null,
      });

      // Persist and audit — runs inside waitUntil so the worker stays alive
      // until this completes even after the SSE stream is closed
      const storedMessage = await conversationService.sendSystemMessage({
        conversationId: body.conversationId,
        practiceId: conversation.practice_id,
        content: accumulatedReply,
        metadata: {
          source: 'ai',
          model: model,
          ...(aigStep ? { aigStep } : {}),
          ...(intakeFields ? { intakeFields } : {}),
          ...(onboardingFields ? { onboardingFields } : {}),
          ...(onboardingProfile ? { onboardingProfile } : {}),
          ...(quickReplies ? { quickReplies } : {}),
          ...(triggerEditModal ? { triggerEditModal } : {}),
          ...(isIntakeMode && shouldShowIntakeCta ? { intakeReadyCta: true } : {}),
          ...(shouldPromptConsultation
            ? { modeSelector: { showAskQuestion: false, showRequestConsultation: true, source: 'ai' } }
            : {})
        },
        recipientUserId: authContext.user.id,
        skipPracticeValidation: shouldSkipPracticeValidation,
        request
      });

      if (forcedSummaryContent) {
        const forcedSummaryMessage = await conversationService.sendSystemMessage({
          conversationId: body.conversationId,
          practiceId: conversation.practice_id,
          content: forcedSummaryContent,
          metadata: {
            source: 'ai',
            model,
            intakeReadyCta: true,
          },
          recipientUserId: authContext.user.id,
          skipPracticeValidation: true,
          request
        });
        if (forcedSummaryMessage) {
          write({ 
            persisted: true, 
            messageId: forcedSummaryMessage.id,
            content: forcedSummaryContent,
            metadata: forcedSummaryMessage.metadata
          });
        }
      }

      if (storedMessage) {
        // Persist the merged intake state back to the conversation metadata
        // so that it persists across devices/refreshes.
        if (isIntakeMode && mergedIntakeState) {
          const updateMetadata = async (attempts = 0) => {
            try {
              const latestConversation = await conversationService.getConversation(body.conversationId, conversation.practice_id);
              const latestMetadata = (latestConversation?.user_info as Record<string, unknown>) || {};
              await conversationService.updateConversation(body.conversationId, conversation.practice_id, {
                metadata: {
                  ...latestMetadata,
                  intakeConversationState: mergedIntakeState
                }
              });
            } catch (metadataError) {
              if (attempts < 1) {
                // One retry for concurrent modification or transient errors
                await updateMetadata(attempts + 1);
              } else {
                Logger.warn('Failed to persist merged intake state to conversation metadata after retries', {
                  conversationId: body.conversationId,
                  error: metadataError instanceof Error ? metadataError.message : String(metadataError)
                });
              }
            }
          };
          await updateMetadata();
        }

        // Send the persisted message ID so the client can reconcile the
        // temporary streaming bubble with the real message when it arrives
        // via WebSocket message.new
        write({ persisted: true, messageId: storedMessage.id });
      }

      await auditService.createEvent({
        conversationId: body.conversationId,
        practiceId: conversation.practice_id,
        eventType: 'ai_message_received',
        actorType: 'system',
        payload: { conversationId: body.conversationId }
      });

    } catch (error) {
      // Clear timeout if still active
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Handle abort errors specifically
      if (error instanceof Error && error.name === 'AbortError') {
        Logger.warn('AI request timed out', {
          conversationId: body.conversationId,
          timeout: AI_TIMEOUT_MS
        });
        write({ error: true, message: 'AI request timed out' });
      } else {
        Logger.warn('Streaming AI handler error', {
          conversationId: body.conversationId,
          error: error instanceof Error ? error.message : String(error)
        });
        write({ error: true, message: error instanceof Error ? error.message : 'AI request failed' });
      }
    } finally {
      close();
    }
  };

  if (ctx) {
    ctx.waitUntil(streamAndPersist(env));
  } else {
    // Fallback for environments without ExecutionContext (tests, local dev without miniflare)
    streamAndPersist(env).catch((error) => {
      Logger.warn('streamAndPersist uncaught error', {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }

  return sseResponse;
}
