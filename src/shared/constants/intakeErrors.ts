/**
 * Canonical hard-error code + copy for intake AI failures. Single source of
 * truth so the worker SSE event, the conversation envelope, and the widget
 * composer all render the same message. See U6/U8 of
 * docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md.
 *
 * Lives in src/shared because both the worker and the Preact app need it.
 */

export const INTAKE_HARD_ERROR_CODE = 'ai_failed' as const;

export const INTAKE_HARD_ERROR_MESSAGE =
  "Our intake assistant is having trouble right now. We've passed what you've told us to the practice and they'll reach out.";
