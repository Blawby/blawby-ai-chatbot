/**
 * Intake orchestration layer — deterministic field sequencing.
 *
 * This module is the "Typeform brain" of the system. It knows the template,
 * evaluates conditions against current state, and decides which field is next.
 * The AI is told what to collect; it never decides on its own.
 *
 * All functions are pure — no AI, no network, fully unit-testable.
 *
 * Imported by:
 *   - worker/routes/aiChat.ts  (calls resolveNextField before building prompt)
 *   - src/shared/utils/consultationState.ts (isIntakeReadyForSubmission)
 *   - Future: frontend progress indicator
 */

import type { IntakeFieldDefinition, IntakeTemplate, FieldPhase } from '../types/intake';

// ---------------------------------------------------------------------------
// Field phase resolution
// ---------------------------------------------------------------------------

/**
 * Returns the effective phase of a field.
 * Supports the legacy `required: boolean` shape for backward compat with
 * existing templates that predate the `phase` field.
 */
export function getFieldPhase(field: IntakeFieldDefinition): FieldPhase {
  if (field.phase !== undefined) return field.phase;
  return field.required ? 'required' : 'enrichment';
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

/**
 * Returns true when a field's condition is satisfied (or the field has none).
 * Checks both the flat state and the customFields bucket in one pass.
 */
export function isFieldConditionMet(
  field: Pick<IntakeFieldDefinition, 'condition'>,
  state: Record<string, unknown>,
): boolean {
  const cond = field.condition;
  if (!cond) return true;
  const customFields =
    state.customFields &&
    typeof state.customFields === 'object' &&
    !Array.isArray(state.customFields)
      ? (state.customFields as Record<string, unknown>)
      : {};
  const current =
    cond.dependsOn in state ? state[cond.dependsOn] : customFields[cond.dependsOn];
  // Loose equality so "true" matches true, "1" matches 1, etc.
  // Note: an explicit cond.value of 0 will match a state value of 0, 
  // even if 0 isn't considered a "meaningful" collected value for some fields. Acceptable edge case.
  return String(current ?? '') === String(cond.value);
}

// ---------------------------------------------------------------------------
// Field collection check
// ---------------------------------------------------------------------------

/**
 * Returns true when a field already has a meaningful value in the intake state.
 * Handles standard fields (flat state) and custom fields (customFields bucket).
 */
export function isFieldCollected(
  field: Pick<IntakeFieldDefinition, 'key' | 'isStandard' | 'type'>,
  state: Record<string, unknown>,
): boolean {
  const customFields =
    state.customFields &&
    typeof state.customFields === 'object' &&
    !Array.isArray(state.customFields)
      ? (state.customFields as Record<string, unknown>)
      : {};

  const raw = field.isStandard ? state[field.key] : customFields[field.key];

  if (raw === null || raw === undefined) return false;
  if (typeof raw === 'string') return raw.trim().length > 0;
  if (typeof raw === 'boolean') return true; // false is a valid answer
  if (typeof raw === 'number') return Number.isFinite(raw);
  return false;
}

// ---------------------------------------------------------------------------
// Core orchestrator
// ---------------------------------------------------------------------------

/**
 * Returns the single next field to collect for the given phase, or null when
 * all applicable fields have been collected.
 *
 * Walk order:
 *   1. Evaluate condition — skip if not met
 *   2. Check if already collected — skip if so
 *   3. Return the first uncollected field
 *
 * The array order in `template.fields` is the canonical question sequence.
 *
 * @param template  The active intake template
 * @param state     Current flat intake state (may include customFields bucket)
 * @param phase     'required' | 'enrichment' — default 'required'
 */
export function resolveNextField(
  template: Pick<IntakeTemplate, 'fields'>,
  state: Record<string, unknown>,
  phase: FieldPhase = 'required',
): IntakeFieldDefinition | null {
  for (const field of template.fields) {
    if (getFieldPhase(field) !== phase) continue;
    if (!isFieldConditionMet(field, state)) continue;
    if (isFieldCollected(field, state)) continue;
    return field;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Submission gate helper
// ---------------------------------------------------------------------------

/**
 * Returns true when all required fields whose conditions are met have been
 * collected — i.e. `resolveNextField` with phase='required' returns null.
 *
 * This is the canonical submission gate. `isIntakeReadyForSubmission` in
 * consultationState.ts delegates here when a template is present.
 */
export function isIntakeCompleteForTemplate(
  template: Pick<IntakeTemplate, 'fields'>,
  state: Record<string, unknown>,
): boolean {
  return resolveNextField(template, state, 'required') === null;
}

// ---------------------------------------------------------------------------
// Progress helpers (for future progress indicator)
// ---------------------------------------------------------------------------

/** Returns { collected, total } for required fields with met conditions. */
export function getRequiredFieldProgress(
  template: Pick<IntakeTemplate, 'fields'>,
  state: Record<string, unknown>,
): { collected: number; total: number } {
  const requiredActive = template.fields.filter(
    (f) => getFieldPhase(f) === 'required' && isFieldConditionMet(f, state),
  );
  const collected = requiredActive.filter((f) => isFieldCollected(f, state)).length;
  return { collected, total: requiredActive.length };
}
