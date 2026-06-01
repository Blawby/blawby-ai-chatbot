import { FunctionComponent, type ComponentChildren } from 'preact';
import { ChevronLeft } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Pill } from '@/design-system/primitives';
import { cn } from '@/shared/utils/cn';

export interface IntakeStickyHeaderProps {
  /** Receivers — relative time string like "12 minutes ago" or "12m". */
  receivedRelative: string;
  /** Client name (e.g. "Sarah Chen"). */
  clientName: string;
  /** Short scope label (e.g. "custody modification"). */
  scopeLabel: string | null;
  /** Practice area string for meta strip. */
  practiceArea?: string | null;
  /** Jurisdiction string (state · county). */
  jurisdiction?: string | null;
  /** Source label (e.g. "blawby.com/p/firm-slug"). */
  source?: string | null;
  /** Response window line (e.g. "3h response window"). */
  responseWindow?: string | null;
  /** Status pill node (existing triage badge). */
  statusBadge?: ComponentChildren;
  /** Right-side action cluster. */
  actions?: ComponentChildren;
  /** Stamp line under actions (e.g. "conversation took 8 minutes · client paid $150"). */
  stamp?: string | null;
  /** Back navigation. */
  onBack?: () => void;
}

/**
 * Chat-first sticky header for the intake detail surface.
 * Replaces the generic DetailHeader with a typographic crumb + serif H2
 * + meta strip + action cluster (per design_handoff_blawby_chat_first/screens/Intakes.html).
 */
export const IntakeStickyHeader: FunctionComponent<IntakeStickyHeaderProps> = ({
  receivedRelative,
  clientName,
  scopeLabel,
  practiceArea,
  jurisdiction,
  source,
  responseWindow,
  statusBadge,
  actions,
  stamp,
  onBack,
}) => {
  const metaParts: Array<{ key: string; node: ComponentChildren }> = [];
  if (practiceArea) metaParts.push({ key: 'pa', node: <span className="font-medium text-ink">{practiceArea}</span> });
  if (jurisdiction) metaParts.push({ key: 'jx', node: <span className="font-medium text-ink">{jurisdiction}</span> });
  if (source) metaParts.push({ key: 'src', node: <span>{source}</span> });
  if (responseWindow) metaParts.push({ key: 'rw', node: <span className="text-error">{responseWindow}</span> });

  return (
    <header
      className={cn(
        'sticky top-0 z-10 border-b border-line-subtle bg-paper/95 backdrop-blur',
        'px-4 py-4 sm:px-6 sm:py-5',
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {onBack ? (
              <Button
                type="button"
                variant="icon"
                size="icon-sm"
                onClick={onBack}
                aria-label="Back"
                icon={ChevronLeft}
                iconClassName="h-5 w-5"
              />
            ) : null}
            <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-dim-2">
              Intake · received {receivedRelative}
            </div>
          </div>
          <h2 className="mt-2 font-serif text-2xl font-normal leading-tight tracking-tight text-ink sm:text-[28px] lg:text-[32px]">
            <span className="text-accent-deep">{clientName}</span>
            {scopeLabel ? (
              <>
                <span className="text-dim-2"> — </span>
                <span>{scopeLabel}</span>
              </>
            ) : null}
          </h2>
          {metaParts.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-[0.04em] text-dim-2">
              {metaParts.map((part, idx) => (
                <span key={part.key} className="flex items-center gap-2">
                  {idx > 0 ? <span className="text-dim-2/60">·</span> : null}
                  {part.node}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch gap-2 lg:items-end">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {actions}
            {statusBadge ? <div className="ml-1">{statusBadge}</div> : null}
          </div>
          {stamp ? (
            <span className="text-right font-mono text-[10.5px] uppercase tracking-[0.06em] text-dim">
              {stamp}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
};

// Re-export pill in case external callers want to mimic styles.
export { Pill };

export default IntakeStickyHeader;
