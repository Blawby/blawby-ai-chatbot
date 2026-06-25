import { Logo } from '@/shared/ui/Logo';
import type { OnboardingStep } from '../types';

interface SidebarStep {
  row: number;
  title: string;
  description: string;
  clickStep?: OnboardingStep;
}

interface ProgressSidebarProps {
  currentStep: OnboardingStep;
  hasActiveSubscription?: boolean;
  onStepSelect?: (step: OnboardingStep) => void;
}

const SIDEBAR_STEPS: readonly SidebarStep[] = [
  {
    row: 1,
    title: 'Create your account',
    description: 'Name, birthday, and terms',
    clickStep: 1
  },
  {
    row: 2,
    title: 'Tell us about your practice',
    description: 'Firm name, jurisdiction, bar #, and description',
    clickStep: 2
  },
  {
    row: 3,
    title: 'Get Business',
    description: 'Billed monthly. Cancel anytime.',
    clickStep: 3
  },
  {
    row: 4,
    title: 'Connect Stripe',
    description: 'Accept payments and receive payouts',
    clickStep: 4
  },
  {
    row: 5,
    title: 'Your intake form',
    description: 'Review the fields clients will answer',
    clickStep: 5
  },
  {
    row: 6,
    title: 'Share your intake link',
    description: 'Preview + share or embed your link',
    clickStep: 6
  }
];

const getSidebarPosition = (step: OnboardingStep): number => {
  return step;
};

const getStepState = (
  row: number,
  currentStep: OnboardingStep,
  hasActiveSubscription: boolean
): 'done' | 'now' | 'next' => {
  const currentRow = getSidebarPosition(currentStep);
  if (row === 3 && hasActiveSubscription && currentStep !== 3) {
    return 'done';
  }
  if (row < currentRow) return 'done';
  if (row === currentRow) return 'now';
  return 'next';
};

const indicatorStyles = (state: 'done' | 'now' | 'next') => {
  if (state === 'done') {
    return {
      background: 'var(--ink)',
      border: '1px solid var(--ink)',
      color: 'var(--accent)'
    };
  }
  if (state === 'now') {
    return {
      background: 'var(--accent)',
      border: '1px solid var(--accent)',
      color: 'var(--accent-ink)',
      boxShadow: '0 0 0 4px var(--accent-soft)'
    };
  }
  return {
    background: 'var(--card)',
    border: '1px solid var(--rule)',
    color: 'var(--dim)'
  };
};

const getMobileState = (
  step: OnboardingStep,
  currentStep: OnboardingStep
): 'done' | 'now' | 'next' => {
  if (step < currentStep) return 'done';
  if (step === currentStep) return 'now';
  return 'next';
};

export const ProgressSidebar = ({
  currentStep,
  hasActiveSubscription = false,
  onStepSelect
}: ProgressSidebarProps) => {
  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:w-[340px] lg:shrink-0 lg:border-r lg:border-rule lg:px-8 lg:pt-9 lg:pb-8"
      style={{ background: 'color-mix(in oklab, var(--paper) 96%, var(--card))' }}
    >
      <div>
        <Logo size="md" />
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

      <nav aria-label="Onboarding progress" className="mt-9 flex flex-col gap-1">
        {SIDEBAR_STEPS.map((step, index) => {
          const state = getStepState(step.row, currentStep, hasActiveSubscription);
          const canClick =
            typeof step.clickStep === 'number' && typeof onStepSelect === 'function';
          const indicatorLabel = state === 'done' ? '✓' : String(step.row);

          return (
            <button
              key={step.row}
              type="button"
              onClick={
                !canClick ? undefined : () => onStepSelect?.(step.clickStep as OnboardingStep)
              }
              disabled={!canClick}
              className="relative grid grid-cols-[24px_1fr] gap-3.5 rounded-r-md px-3 py-3.5 text-left"
              style={{
                cursor: canClick ? 'pointer' : 'default',
                opacity: 1,
                background: 'transparent',
                border: 0
              }}
            >
              {index < SIDEBAR_STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute"
                  style={{
                    left: '23px',
                    top: '38px',
                    bottom: '-2px',
                    width: '1px',
                    background: state === 'done' ? 'var(--ink)' : 'var(--rule)'
                  }}
                />
              )}

              <span
                aria-hidden="true"
                className="relative z-[1] grid h-6 w-6 place-items-center rounded-full"
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  ...indicatorStyles(state)
                }}
              >
                {indicatorLabel}
              </span>

              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color:
                      step.row === 3 && state === 'now'
                        ? 'var(--accent-deep)'
                        : state === 'done'
                          ? 'var(--ink-2)'
                          : 'var(--ink)',
                    textDecoration:
                      state === 'done' && step.row !== 3 ? 'line-through' : 'none',
                    textDecorationColor: 'var(--dim-2)'
                  }}
                >
                  {step.title}
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    color: 'var(--dim)',
                    lineHeight: 1.35
                  }}
                >
                  {step.description}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div
        className="mt-auto"
        style={{
          fontFamily: 'var(--mono)',
          fontSize: '11px',
          color: 'var(--dim)'
        }}
      >
        Step {getSidebarPosition(currentStep)} of 6
      </div>
    </aside>
  );
};

export const ProgressPips = ({ currentStep }: ProgressSidebarProps) => {
  const steps: readonly OnboardingStep[] = [1, 2, 3, 4, 5, 6];

  return (
    <ol
      aria-label="Onboarding progress"
      className="flex items-center gap-2 lg:hidden"
    >
      {steps.map((step) => {
        const state = getMobileState(step, currentStep);
        const isActive = state === 'now';
        const isDone = state === 'done';
        return (
          <li
            key={step}
            aria-current={isActive ? 'step' : undefined}
            className="h-1.5 flex-1 rounded-full"
            style={{
              background: isActive
                ? 'var(--accent)'
                : isDone
                  ? 'var(--ink)'
                  : 'var(--rule)'
            }}
            title={`Step ${step}`}
          />
        );
      })}
    </ol>
  );
};

export default ProgressSidebar;
