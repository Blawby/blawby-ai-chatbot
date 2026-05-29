import { Check } from 'lucide-preact';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

export type JourneyStepStatus = 'done' | 'now' | 'future';

export interface JourneyStep {
  id: string;
  /** Short serif name, max ~14ch. */
  name: string;
  /** Optional mono uppercase date/time line. */
  when?: string;
  status: JourneyStepStatus;
}

export interface JourneyProgressProps {
  /** Per spec, exactly 5 steps. Fewer/more renders but breaks the layout. */
  steps: readonly JourneyStep[];
  className?: string;
}

/**
 * Journey progress (DESIGN_SYSTEM §3.15).
 *
 * Client-portal-only 5-step horizontal indicator. Use **only** on the
 * client portal — staff app milestones use the milestone list instead.
 *
 * Done steps show an ink fill with a gold check; the "now" step has a
 * gold fill with accent-soft ring. The connecting line auto-fills to the
 * last "done" or "now" step.
 */
export function JourneyProgress({ steps, className }: JourneyProgressProps) {
  // Compute progress: % of the rail filled in gold. We want the line to
  // reach the center of the last done/now step.
  const lastFilledIndex = (() => {
    let lastIdx = -1;
    steps.forEach((step, idx) => {
      if (step.status !== 'future') lastIdx = idx;
    });
    return lastIdx;
  })();
  const denom = Math.max(1, steps.length - 1);
  const progressPct = lastFilledIndex <= 0 ? 0 : (lastFilledIndex / denom) * 100;

  return (
    <div className={cn('journey', className)}>
      <div className="journey-line" aria-hidden="true" />
      <div
        className="journey-line-fill"
        aria-hidden="true"
        style={{ width: `calc(${progressPct}% - ${progressPct === 0 ? 0 : 56}px)` }}
      />
      <ol className="journey-steps">
        {steps.map((step, idx) => (
          <li
            key={step.id}
            className={cn(
              'journey-step',
              step.status === 'done' && 'journey-step-done',
              step.status === 'now' && 'journey-step-now'
            )}
            aria-current={step.status === 'now' ? 'step' : undefined}
          >
            <div className="journey-step-mark" aria-hidden="true">
              {step.status === 'done' ? <Icon icon={Check} className="h-4 w-4" /> : idx + 1}
            </div>
            <div className="journey-step-name">{step.name}</div>
            {step.when && <div className="journey-step-when">{step.when}</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}
