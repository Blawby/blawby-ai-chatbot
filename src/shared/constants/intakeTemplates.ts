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
    isStandard: true,
  },
  {
    key: 'city',
    label: 'City',
    type: 'text',
    required: true,
    isStandard: true,
  },
  {
    key: 'state',
    label: 'State',
    type: 'text',
    required: true,
    isStandard: true,
  },
  {
    key: 'practiceServiceUuid',
    label: 'Practice area',
    type: 'select',
    required: false,
    isStandard: true,
  },
  {
    key: 'urgency',
    label: 'Urgency',
    type: 'select',
    required: false,
    options: ['routine', 'time_sensitive', 'emergency'],
    isStandard: true,
  },
  {
    key: 'opposingParty',
    label: 'Opposing party',
    type: 'text',
    required: false,
    isStandard: true,
  },
  {
    key: 'desiredOutcome',
    label: 'Desired outcome',
    type: 'text',
    required: false,
    isStandard: true,
  },
  {
    key: 'courtDate',
    label: 'Court date',
    type: 'date',
    required: false,
    isStandard: true,
  },
  {
    key: 'hasDocuments',
    label: 'Has documents',
    type: 'boolean',
    required: false,
    isStandard: true,
  },
  {
    key: 'householdSize',
    label: 'Household size',
    type: 'number',
    required: false,
    isStandard: true,
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
