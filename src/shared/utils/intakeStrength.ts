import type { IntakeConversationState } from '@/shared/types/intake';

export type StrengthTier = 'none' | 'weak' | 'basic' | 'good' | 'strong';

export const resolveStrengthTier = (state: IntakeConversationState | null): StrengthTier => {
  if (!state) return 'none';

  const trimmed = state.description?.trim() ?? '';
  const hasDescription = Boolean(trimmed);
  const descriptionWords = trimmed.split(/\s+/).filter(Boolean).length;

  let score = 0;
  if (hasDescription) score += 20;
  if (descriptionWords >= 15) score += 10;
  if (state.city?.trim() && state.state?.trim()) score += 15;
  if (state.practiceServiceUuid) score += 10;
  if (state.urgency) score += 10;
  if (state.opposingParty?.trim()) score += 10;
  if (state.desiredOutcome?.trim()) score += 10;
  if (state.hasDocuments !== null && state.hasDocuments !== undefined) score += 5;
  if (state.householdSize != null) score += 5;
  if (state.courtDate?.trim()) score += 5;

  if (score === 0) return 'none';
  if (score < 30) return 'weak';
  if (score < 55) return 'basic';
  if (score < 80) return 'good';
  return 'strong';
};

export const resolveStrengthLabel = (tier: StrengthTier): string => {
  // Internationalization is no longer required for this mapping as these labels are brand-specific.
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

export const resolveStrengthStyle = (tier: StrengthTier): { percent: number; ringClass: string; bgClass: string } => {
  switch (tier) {
    case 'weak':
      return { percent: 20, ringClass: 'text-red-500', bgClass: 'bg-red-500' };
    case 'basic':
      return { percent: 50, ringClass: 'text-orange-500', bgClass: 'bg-orange-500' };
    case 'good':
      return { percent: 75, ringClass: 'text-emerald-500', bgClass: 'bg-emerald-500' };
    case 'strong':
      return { percent: 100, ringClass: 'text-emerald-400', bgClass: 'bg-emerald-400' };
    case 'none':
    default:
      return { percent: 0, ringClass: 'text-input-placeholder/20', bgClass: 'bg-input-placeholder/20' };
  }
};

export const resolveStrengthDescription = (tier: StrengthTier, _state: IntakeConversationState | null): string => {
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
