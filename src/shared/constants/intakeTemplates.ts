/**
 * Shared intake template constants.
 *
 * This file is the single source of truth for the default template field list
 * and the set of keys that map directly to IntakeConversationState (standard fields).
 * Both the worker (aiChatIntake.ts, widget.ts) and the frontend (useIntakeFlow,
 * IntakeDetailPage) import from here — nothing else should re-define these.
 */

import type { IntakeTemplate, IntakeFieldDefinition } from '../types/intake';

/** All field definitions that map onto existing IntakeConversationState keys. */
export const STANDARD_FIELD_DEFINITIONS: IntakeFieldDefinition[] = [
  {
    key: 'description',
    label: 'Case description',
    type: 'text',
    required: true,
    phase: 'required',
    isStandard: true,
    mapsTo: 'description',
    description: 'A short summary of what happened.',
    previewQuestion: 'Can you tell me what happened in your own words?',
  },
  {
    key: 'city',
    label: 'City',
    type: 'text',
    required: true,
    phase: 'required',
    isStandard: true,
    mapsTo: 'address.city',
    description: 'The city where the legal issue happened.',
    previewQuestion: 'What city did this happen in?',
  },
  {
    key: 'state',
    label: 'State',
    type: 'text',
    required: true,
    phase: 'required',
    isStandard: true,
    mapsTo: 'address.state',
    description: 'The state or jurisdiction for the issue.',
    previewQuestion: 'What state did this happen in?',
  },
  {
    key: 'urgency',
    label: 'Urgency',
    type: 'select',
    required: false,
    phase: 'enrichment',
    options: ['routine', 'time_sensitive', 'emergency'],
    isStandard: true,
    mapsTo: 'urgency',
    description: 'Routine, time-sensitive, or emergency.',
    previewQuestion: 'How urgent does this feel: routine, time-sensitive, or emergency?',
  },
  {
    key: 'practiceServiceUuid',
    label: 'Practice area',
    type: 'select',
    required: false,
    phase: 'enrichment',
    isStandard: true,
    mapsTo: 'practice_service_uuid',
    description: 'The practice service or matter type.',
    previewQuestion: 'Which type of legal help are you looking for?',
  },
  {
    key: 'opposingParty',
    label: 'Opposing party',
    type: 'text',
    required: false,
    phase: 'enrichment',
    isStandard: true,
    mapsTo: 'opposing_party',
    description: 'The person, company, or organization on the other side.',
    previewQuestion: 'Who is on the other side of this issue?',
  },
  {
    key: 'desiredOutcome',
    label: 'Desired outcome',
    type: 'text',
    required: false,
    phase: 'enrichment',
    isStandard: true,
    mapsTo: 'desired_outcome',
    description: 'What the client hopes the practice can help achieve.',
    previewQuestion: 'What outcome are you hoping for?',
  },
  {
    key: 'courtDate',
    label: 'Court date',
    type: 'date',
    required: false,
    phase: 'enrichment',
    isStandard: true,
    mapsTo: 'court_date',
    description: 'Any court date, hearing, or deadline.',
    previewQuestion: 'Is there a court date, hearing, or deadline coming up?',
  },
  {
    key: 'hasDocuments',
    label: 'Has documents',
    type: 'boolean',
    required: false,
    phase: 'enrichment',
    isStandard: true,
    mapsTo: 'has_documents',
    description: 'Whether the client has documents to share.',
    previewQuestion: 'Do you have any documents related to this?',
  },
  {
    key: 'householdSize',
    label: 'Household size',
    type: 'number',
    required: false,
    phase: 'enrichment',
    isStandard: true,
    mapsTo: 'household_size',
    description: 'Household size for eligibility review.',
    previewQuestion: 'How many people are in your household?',
  },
];

/**
 * The set of keys that belong to IntakeConversationState directly.
 * Used by aiChatIntake.ts to route tool-call values to the right bucket.
 */
export const STANDARD_FIELD_KEYS: ReadonlySet<string> = new Set(
  STANDARD_FIELD_DEFINITIONS.map((f) => f.key),
);

/**
 * The default IntakeTemplate — mirrors the current hardcoded field list exactly.
 * Used as fallback when no ?template param is present or slug resolution fails.
 */
export const DEFAULT_INTAKE_TEMPLATE: IntakeTemplate = {
  slug: 'default',
  name: 'Default',
  isDefault: true,
  fields: STANDARD_FIELD_DEFINITIONS,
};
