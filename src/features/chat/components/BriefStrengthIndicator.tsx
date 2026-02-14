import { FunctionComponent } from 'preact';
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

const resolveStrengthStyle = (tier: StrengthTier): { width: string; barClass: string } => {
  switch (tier) {
    case 'weak':
      return { width: '25%', barClass: 'bg-rose-500' };
    case 'basic':
      return { width: '50%', barClass: 'bg-amber-500' };
    case 'good':
      return { width: '75%', barClass: 'bg-emerald-500' };
    case 'strong':
      return { width: '100%', barClass: 'bg-emerald-600' };
    case 'none':
    default:
      return { width: '0%', barClass: 'bg-white/20' };
  }
};

interface BriefStrengthIndicatorProps {
  intakeConversationState?: IntakeConversationState | null;
}

const BriefStrengthIndicator: FunctionComponent<BriefStrengthIndicatorProps> = ({
  intakeConversationState
}) => {
  const tier = resolveStrengthTier(intakeConversationState ?? null);
  const label = resolveStrengthLabel(tier);
  const { width, barClass } = resolveStrengthStyle(tier);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-input-placeholder">
        {label}
      </div>
      <div className="h-1 w-28 rounded-full bg-white/10">
        <div
          className={`h-1 rounded-full transition-all duration-300 ${barClass}`}
          style={{ width }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={parseInt(width, 10)}
          aria-label={label}
        />
      </div>
    </div>
  );
};

export default BriefStrengthIndicator;
