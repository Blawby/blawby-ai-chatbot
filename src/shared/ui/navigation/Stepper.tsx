import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';
import { Check } from 'lucide-preact';

export interface StepperStep {
  label: string;
  description?: string;
  icon?: ComponentChildren;
}

export interface StepperProps {
  steps: StepperStep[];
  currentStep: number;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function Stepper({
  steps,
  currentStep,
  orientation = 'horizontal',
  className,
}: StepperProps) {
  return (
    <div
      aria-label="Progress steps"
      className={cn(
        'flex',
        orientation === 'horizontal' ? 'flex-row items-start' : 'flex-col',
        className,
      )}
    >
      {steps.map((step, i) => {
        const status = i < currentStep ? 'completed' : i === currentStep ? 'active' : 'upcoming';

        return (
          <div
            key={i}
            className={cn(
              'flex',
              orientation === 'horizontal' ? 'flex-1 flex-col items-center' : 'flex-row items-start gap-3',
            )}
          >
            <div className={cn(
              'flex',
              orientation === 'horizontal' ? 'w-full items-center' : 'flex-col items-center',
            )}>
              {i > 0 && (
                <div
                  className={cn(
                    orientation === 'horizontal' ? 'flex-1 h-0.5' : 'w-0.5 h-6',
                    status === 'upcoming' ? 'bg-black/8 dark:bg-white/8' : 'bg-accent-500',
                    'transition-colors',
                  )}
                />
              )}
              {i === 0 && orientation === 'horizontal' && <div className="flex-1" />}

              <div
                aria-current={status === 'active' ? 'step' : undefined}
                className={cn(
                  'shrink-0 flex items-center justify-center rounded-full transition-all',
                  'w-8 h-8 text-xs font-medium',
                  status === 'completed' && 'bg-accent-500 text-white',
                  status === 'active' && 'bg-accent-500/15 text-accent-600 dark:text-accent-400 ring-2 ring-accent-500/30',
                  status === 'upcoming' && 'bg-black/5 dark:bg-white/8 text-input-placeholder',
                )}
              >
                {status === 'completed' ? (
                  <Check size={14} strokeWidth={2.5} />
                ) : (
                  step.icon ?? <span>{i + 1}</span>
                )}
              </div>

              {i < steps.length - 1 && orientation === 'horizontal' && (
                <div
                  className={cn(
                    'flex-1 h-0.5',
                    i < currentStep ? 'bg-accent-500' : 'bg-black/8 dark:bg-white/8',
                    'transition-colors',
                  )}
                />
              )}
              {i === steps.length - 1 && orientation === 'horizontal' && <div className="flex-1" />}
            </div>

            <div className={cn(
              orientation === 'horizontal' ? 'text-center mt-2' : 'pt-1',
            )}>
              <p className={cn(
                'text-xs font-medium',
                status === 'active' ? 'text-input-text' : 'text-input-placeholder',
              )}>
                {step.label}
              </p>
              {step.description && (
                <p className="text-[11px] text-input-placeholder/70 mt-0.5">{step.description}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
