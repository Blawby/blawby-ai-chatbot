import { isRecord, readAnyString } from './aiChatShared.js';

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
        actions: {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['reply'] },
              label: { type: 'string' },
              value: { type: 'string' },
              variant: { type: 'string', enum: ['primary', 'secondary'] },
            },
            required: ['type', 'label', 'value'],
          },
        },
        triggerEditModal: { type: 'string', enum: ['basics', 'contact'], description: 'Trigger a manual edit modal for the user if they indicate a correction is needed.' },
      },
    },
  },
} as const;

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
    '  - One match: Confirm it with the user. "I found [Practice Name] at [Address]. Is that yours?" Include actions for "Yes, that\'s correct" and "No, that\'s not it".',
    '  - Multiple matches: Present the options and ask which one is theirs.',
    '  - Once confirmed, ALWAYS use update_practice_fields to save the details from SEARCH_CONTEXT.',
    'If SEARCH_CONTEXT is empty or no match is found:',
    '  - Acknowledge what they said: "I couldn\'t find details for [Name] online." or "I couldn\'t scan that website."',
    '  - Transition to manual collection: "No problem. Let\'s do it manually." Then ask one targeted missing-field question.',
    'If PRACTICE_CONTEXT already has a name when the chat starts, welcome them and continue from what is missing.',
    'If the user asks to change a field and the provided value matches the current saved value, acknowledge it is already set and ask what they want to update next.',
    'Collect profile details conversationally, one question at a time.',
    'When suggesting choices, return them as actions rather than plain text lists.',
    'When the profile score hits 80%, congratulate them on the live preview.',
    'Be warm, human, and concise. Avoid sounding like a form.',
    ...stateLines,
  ].join('\n');
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

export {
  ONBOARDING_TOOL,
  buildOnboardingSystemPrompt,
  normalizeOnboardingServices,
  buildOnboardingProfileMetadata,
};
