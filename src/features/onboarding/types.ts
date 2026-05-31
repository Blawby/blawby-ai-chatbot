export interface StripeConnectStatus {
  practice_uuid?: string;
  stripe_account_id?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
}

/**
 * Hourly | flat | contingency | sliding — first-pass preference. Tracked locally
 * so step 5 can suggest fee shapes; persisted into the practice profile post-MVP.
 */
export type FeePreference = 'hourly' | 'flat' | 'contingency' | 'sliding';

/**
 * Lightweight service template the user selects in step 5. Shape mirrors what
 * the practice setup services API ultimately accepts (`name` + `key`).
 */
export interface ServiceTemplate {
  key: string;
  name: string;
  /** Optional suggested fee blurb shown in the picker. */
  suggestedFee?: string;
  /** Optional AI rationale ("Suggested for family law", etc.). */
  rationale?: string;
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

  /** Step 2 — Your practice */
  practiceName?: string;
  practiceSlug?: string;
  jurisdiction?: string;
  barNumber?: string;
  /** Set once authClient.organization.create has succeeded so we don't re-create. */
  createdOrganizationId?: string | null;
  createdOrganizationSlug?: string | null;

  /** Step 3 — How you work */
  practiceAreas?: string[];
  practiceQuirks?: string;
  feePreferences?: FeePreference[];

  /** Step 4 — Payments */
  paymentsDeferred?: boolean;

  /** Step 5 — Services */
  selectedServices?: ServiceTemplate[];

  /** Step 6 — Share intake (no captured fields; flagged when user clicks finish) */
}

/** The 1-indexed step number drives the state machine. */
export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6;
