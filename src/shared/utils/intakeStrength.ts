import type { IntakeConversationState } from '@/shared/types/intake';

export type StrengthTier = 'none' | 'weak' | 'basic' | 'good' | 'strong';

export const resolveStrengthTier = (state: IntakeConversationState | null): StrengthTier => {
  if (!state) return 'none';

  const hasDescription = Boolean(state.description?.trim());
  const descriptionWords = state.description?.trim().split(/\s+/).length ?? 0;
  const hasPracticeArea = Boolean(state.practiceArea || state.practiceAreaName);
  const hasLocation = Boolean(state.city?.trim() || state.state?.trim());
  const hasOpposingParty = Boolean(state.opposingParty?.trim());
  const hasDesiredOutcome = Boolean(state.desiredOutcome?.trim());
  const hasUrgency = Boolean(state.urgency);
  const hasBasicAddress = Boolean(state.addressLine1?.trim());

  // Count how many unique pieces of information we have
  const signals = [
    hasDescription,
    hasPracticeArea,
    hasLocation,
    hasOpposingParty,
    hasDesiredOutcome,
    hasUrgency,
    hasBasicAddress
  ].filter(Boolean).length;

  // 1. None: Literally nothing shared yet
  if (signals === 0) return 'none';

  // 2. Strong: High confidence (Practice area + 15+ word description + at least 3 other signals)
  if (hasPracticeArea && descriptionWords >= 15 && signals >= 5) {
    return 'strong';
  }

  // 3. Good: Solid detail (at least 4 signals including description)
  if (signals >= 4 && hasDescription) {
    return 'good';
  }

  // 4. Basic: Getting there (at least 2-3 signals)
  if (signals >= 2) {
    return 'basic';
  }

  // 5. Weak: Just starting out (1 signal)
  return 'weak';
};

export const resolveStrengthLabel = (tier: StrengthTier): string => {
  switch (tier) {
    case 'weak':
      return 'Weak Status';
    case 'basic':
      return 'Developing Status';
    case 'good':
      return 'Good Status';
    case 'strong':
      return 'High Confidence';
    case 'none':
    default:
      return 'Collecting Details';
  }
};

export const resolveStrengthStyle = (tier: StrengthTier): { percent: number; ringClass: string } => {
  switch (tier) {
    case 'weak':
      return { percent: 25, ringClass: 'text-red-500' };
    case 'basic':
      return { percent: 50, ringClass: 'text-orange-500' };
    case 'good':
      return { percent: 75, ringClass: 'text-emerald-500' };
    case 'strong':
      return { percent: 100, ringClass: 'text-emerald-400' };
    case 'none':
    default:
      return { percent: 0, ringClass: 'text-white/20' };
  }
};

export const resolveStrengthDescription = (tier: StrengthTier, state: IntakeConversationState | null): string => {
  if ((tier === 'weak' || tier === 'basic') && state?.missingSummary) {
    return state.missingSummary;
  }
  switch (tier) {
    case 'weak':
      return 'We need core facts before generating a reliable brief.';
    case 'basic':
      return 'We have enough detail to draft a basic brief, but gaps remain.';
    case 'good':
      return 'This brief has solid detail and should produce useful results.';
    case 'strong':
      return 'This brief is complete and high confidence for intake and review.';
    case 'none':
    default:
      return 'Brief strength appears after consultation details are collected.';
  }
};
