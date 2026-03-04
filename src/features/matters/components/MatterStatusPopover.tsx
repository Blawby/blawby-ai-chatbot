import { useEffect, useRef, useState } from 'preact/hooks';
import {
  ScaleIcon,
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
  ShieldExclamationIcon,
  ExclamationTriangleIcon,
  DocumentCheckIcon,
  BriefcaseIcon,
  PauseCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowUturnRightIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/solid';
import {
  MATTER_STATUS_LABELS,
  MATTER_WORKFLOW_STATUSES,
  type MatterStatus
} from '@/shared/types/matterStatus';
import { cn } from '@/shared/utils/cn';

const STATUS_ICON: Record<MatterStatus, unknown> = {
  first_contact: ChatBubbleLeftRightIcon,
  intake_pending: MagnifyingGlassIcon,
  conflict_check: ShieldExclamationIcon,
  conflicted: ExclamationTriangleIcon,
  eligibility: ScaleIcon,
  referred: ArrowUturnRightIcon,
  consultation_scheduled: DocumentCheckIcon,
  declined: XCircleIcon,
  engagement_pending: PauseCircleIcon,
  active: BriefcaseIcon,
  pleadings_filed: DocumentCheckIcon,
  discovery: MagnifyingGlassIcon,
  mediation: ScaleIcon,
  pre_trial: ShieldExclamationIcon,
  trial: ExclamationTriangleIcon,
  order_entered: CheckCircleIcon,
  appeal_pending: ArrowUturnRightIcon,
  closed: CheckCircleIcon
};

const STATUS_COLOR: Record<MatterStatus, string> = {
  first_contact: 'bg-accent-500/15 text-[rgb(var(--accent-foreground))] ring-accent-500/30',
  intake_pending: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  conflict_check: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  conflicted: 'bg-red-500/15 text-red-400 ring-red-500/30',
  eligibility: 'bg-accent-500/15 text-[rgb(var(--accent-foreground))] ring-accent-500/30',
  referred: 'bg-white/10 text-input-placeholder ring-white/10',
  consultation_scheduled: 'bg-accent-500/15 text-[rgb(var(--accent-foreground))] ring-accent-500/30',
  declined: 'bg-red-500/15 text-red-400 ring-red-500/30',
  engagement_pending: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  active: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  pleadings_filed: 'bg-accent-500/15 text-[rgb(var(--accent-foreground))] ring-accent-500/30',
  discovery: 'bg-accent-500/15 text-[rgb(var(--accent-foreground))] ring-accent-500/30',
  mediation: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  pre_trial: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  trial: 'bg-red-500/15 text-red-400 ring-red-500/30',
  order_entered: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  appeal_pending: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  closed: 'bg-white/10 text-input-placeholder ring-white/10'
};

interface MatterStatusPopoverProps {
  currentStatus: MatterStatus;
  onSelect: (status: MatterStatus) => void;
  disabled?: boolean;
}

export const MatterStatusPopover = ({ currentStatus, onSelect, disabled }: MatterStatusPopoverProps) => {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (open && optionRefs.current[focusedIndex]) {
      optionRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleListboxKeyDown = (e: KeyboardEvent) => {
    const maxIndex = MATTER_WORKFLOW_STATUSES.length - 1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((i) => (i < maxIndex ? i + 1 : i));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((i) => (i > 0 ? i - 1 : i));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusedIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusedIndex(maxIndex);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const status = MATTER_WORKFLOW_STATUSES[focusedIndex];
      if (status) {
        onSelect(status);
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
  };

  const StatusIcon = (STATUS_ICON[currentStatus] as preact.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>) ?? ScaleIcon;
  const colorClasses = STATUS_COLOR[currentStatus];

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) {
            const selectedIndex = MATTER_WORKFLOW_STATUSES.indexOf(currentStatus);
            setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Status: ${MATTER_STATUS_LABELS[currentStatus]}. Click to change.`}
        className={cn(
          'inline-flex items-center gap-2 rounded-full px-3 py-1.5',
          'text-sm font-medium ring-1 ring-inset',
          'transition-all duration-150',
          'hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          colorClasses
        )}
      >
        <StatusIcon className="h-4 w-4 shrink-0" aria-hidden />
        {MATTER_STATUS_LABELS[currentStatus]}
        <ChevronDownIcon
          className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-150', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select status"
          tabIndex={-1}
          onKeyDown={handleListboxKeyDown}
          className={cn(
            'absolute left-0 top-full z-50 mt-2 w-56',
            'rounded-xl border border-white/10',
            'bg-surface-overlay/95 backdrop-blur-2xl shadow-glass',
            'py-1 overflow-y-auto max-h-72'
          )}
        >
          {MATTER_WORKFLOW_STATUSES.map((status, index) => {
            const Icon = (STATUS_ICON[status] as preact.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>) ?? ScaleIcon;
            const isSelected = status === currentStatus;
            const isFocused = index === focusedIndex;
            return (
              <button
                key={status}
                ref={(el) => { optionRefs.current[index] = el; }}
                type="button"
                role="option"
                tabIndex={isFocused ? 0 : -1}
                aria-selected={isSelected}
                onClick={() => {
                  onSelect(status);
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors duration-100',
                  isSelected
                    ? 'bg-accent-500/15 text-[rgb(var(--accent-foreground))]'
                    : 'text-input-text hover:bg-white/[0.06]'
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-input-placeholder" aria-hidden />
                <span className="flex-1">{MATTER_STATUS_LABELS[status]}</span>
                {isSelected && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--accent-foreground))]" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MatterStatusPopover;
