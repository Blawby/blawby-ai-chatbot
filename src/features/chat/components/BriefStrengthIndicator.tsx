import { FunctionComponent } from 'preact';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown';
import type { IntakeConversationState } from '@/shared/types/intake';

type StrengthTier = 'none' | 'weak' | 'basic' | 'good' | 'strong';

const resolveStrengthTier = (state: IntakeConversationState | null): StrengthTier => {
  if (!state?.caseStrength) return 'none';
  if (state.caseStrength === 'needs_more_info') return 'weak';
  if (state.caseStrength === 'strong') return 'strong';
  // developing
  if (state.missingSummary) return 'basic';
  return 'good';
};

const resolveStrengthLabel = (tier: StrengthTier): string => {
  switch (tier) {
    case 'weak':
      return 'Weak Brief';
    case 'basic':
      return 'Basic Brief';
    case 'good':
      return 'Good Brief';
    case 'strong':
      return 'Strong Brief';
    case 'none':
    default:
      return 'Brief strength';
  }
};

const resolveStrengthStyle = (tier: StrengthTier): { percent: number; ringClass: string } => {
  switch (tier) {
    case 'weak':
      return { percent: 25, ringClass: 'text-rose-400' };
    case 'basic':
      return { percent: 50, ringClass: 'text-amber-400' };
    case 'good':
      return { percent: 75, ringClass: 'text-emerald-400' };
    case 'strong':
      return { percent: 100, ringClass: 'text-emerald-500' };
    case 'none':
    default:
      return { percent: 0, ringClass: 'text-white/30' };
  }
};

const resolveStrengthDescription = (tier: StrengthTier, state: IntakeConversationState | null): string => {
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

interface BriefStrengthIndicatorProps {
  intakeConversationState?: IntakeConversationState | null;
}

const BriefStrengthIndicator: FunctionComponent<BriefStrengthIndicatorProps> = ({
  intakeConversationState
}) => {
  const state = intakeConversationState ?? null;
  const tier = resolveStrengthTier(state);
  const label = resolveStrengthLabel(tier);
  const { percent, ringClass } = resolveStrengthStyle(tier);
  const description = resolveStrengthDescription(tier, state);
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (percent / 100) * circumference;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-glass/30 bg-surface-glass/40 text-input-text transition hover:bg-surface-glass/60"
          aria-label={`${label} details`}
        >
          <span className="relative h-6 w-6">
            <svg className="-rotate-90 h-6 w-6" viewBox="0 0 24 24" aria-hidden="true">
              <circle
                cx="12"
                cy="12"
                r={radius}
                strokeWidth="2"
                fill="none"
                className="text-white/15"
                stroke="currentColor"
              />
              <circle
                cx="12"
                cy="12"
                r={radius}
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                className={`transition-all duration-300 ${ringClass}`}
                stroke="currentColor"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center">
              <InformationCircleIcon className="h-3.5 w-3.5 text-input-text/80" aria-hidden="true" />
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-3">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-input-placeholder">
            {label}
          </div>
          <p className="text-sm text-input-text/90">{description}</p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default BriefStrengthIndicator;
