export interface StripeConnectStatus {
  practice_uuid?: string;
  stripe_account_id?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
}

/**
 * The full draft persisted in localStorage between steps. Every field is
 * optional so partial completion stays valid. Per-step validation lives in
 * each step component and gates the "Continue" button.
 */
export interface OnboardingDraft {
  /** Step 1 — About you */
  fullName?: string;
  birthday?: string;
  agreedToTerms?: boolean;

  /** Step 2 — Your practice. Slug is derived from practiceName — not user-editable. */
  practiceName?: string;
  jurisdiction?: string;
  barNumber?: string;
  practiceAreas?: string[];
  practiceTypes?: string[];
  description?: string;
  defaultIntakeTemplateSlug?: string | null;
  /** Set once createPractice() has succeeded so we don't re-create on back/forward. */
  createdOrganizationId?: string | null;
  createdOrganizationSlug?: string | null;
}

/** The 1-indexed step number drives the state machine. */
export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6;
