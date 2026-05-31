import { BrandMark } from '@/design-system/layout/BrandMark';
import { NumberedSection, type NumberedSectionState } from '@/design-system/primitives';
import type { OnboardingStep } from '../types';

interface StepSpec {
  number: OnboardingStep;
  title: string;
  description: string;
}

const STEPS: readonly StepSpec[] = [
  { number: 1, title: 'About you', description: 'Name + birthday' },
  { number: 2, title: 'Your practice', description: 'Firm name, jurisdiction, bar #' },
  { number: 3, title: 'How you work', description: 'Practice areas + what makes you, you' },
  { number: 4, title: 'Payments', description: 'Connect Stripe — IOLTA-compatible payouts' },
  { number: 5, title: 'Services', description: "We'll suggest based on your bar + area" },
  { number: 6, title: 'Share intake', description: 'Preview + share or embed your link' }
];

interface ProgressSidebarProps {
  currentStep: OnboardingStep;
}

const resolveState = (
  step: OnboardingStep,
  current: OnboardingStep
): NumberedSectionState => {
  if (step < current) return 'done';
  if (step === current) return 'now';
  return 'next';
};

/**
 * Left-rail progress for the 6-step onboarding flow (Onboarding.html `.progress`).
 *
 * 340px sticky sidebar hidden below `lg`. Renders BrandMark + tagline at the
 * top, the 6 NumberedSection items in the middle, and a mono "Step N of 6"
 * footer at the bottom.
 */
export const ProgressSidebar = ({ currentStep }: ProgressSidebarProps) => {
  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:gap-9 lg:w-[340px] lg:shrink-0 lg:border-r lg:border-rule lg:px-8 lg:pt-9 lg:pb-8"
      style={{ background: 'color-mix(in oklab, var(--paper) 96%, var(--card))' }}
    >
      <div>
        <BrandMark />
        <p
          className="mt-7 max-w-[22ch] text-balance"
          style={{
            fontFamily: 'var(--serif)',
            fontSize: '26px',
            lineHeight: 1.15,
            letterSpacing: '-0.012em',
            color: 'var(--ink)'
          }}
        >
          Let&apos;s get your practice <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>running itself</em>.
        </p>
      </div>

      <nav aria-label="Onboarding progress" className="flex flex-col gap-1">
        {STEPS.map((step) => (
          <NumberedSection
            key={step.number}
            number={step.number}
            state={resolveState(step.number, currentStep)}
            title={step.title}
            description={step.description}
          />
        ))}
      </nav>

      <div
        className="mt-auto"
        style={{
          fontFamily: 'var(--mono)',
          fontSize: '11px',
          color: 'var(--dim)'
        }}
      >
        Step {currentStep} of 6
      </div>
    </aside>
  );
};

/**
 * Mobile-only horizontal step pips that mirror sidebar progress when the
 * full 340px column is hidden (below `lg`).
 */
export const ProgressPips = ({ currentStep }: ProgressSidebarProps) => {
  return (
    <ol
      aria-label="Onboarding progress"
      className="flex items-center gap-2 lg:hidden"
    >
      {STEPS.map((step) => {
        const state = resolveState(step.number, currentStep);
        const isActive = state === 'now';
        const isDone = state === 'done';
        return (
          <li
            key={step.number}
            aria-current={isActive ? 'step' : undefined}
            className="h-1.5 flex-1 rounded-full"
            style={{
              background: isActive
                ? 'var(--accent)'
                : isDone
                  ? 'var(--ink)'
                  : 'var(--rule)'
            }}
            title={`Step ${step.number}: ${step.title}`}
          />
        );
      })}
    </ol>
  );
};

export default ProgressSidebar;
