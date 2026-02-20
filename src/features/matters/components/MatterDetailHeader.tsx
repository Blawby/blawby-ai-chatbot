import { useEffect, useRef, useState } from 'preact/hooks';
import { Avatar } from '@/shared/ui/profile';
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
import { type MatterDetail, type MatterSummary } from '@/features/matters/data/matterTypes';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { cn } from '@/shared/utils/cn';

// ---------------------------------------------------------------------------
// Status metadata
// ---------------------------------------------------------------------------

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

// Semantic colour tiers for status badges
const STATUS_COLOR: Record<MatterStatus, string> = {
  first_contact:          'bg-accent-500/15 text-accent-400 ring-accent-500/30',
  intake_pending:         'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  conflict_check:         'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  conflicted:             'bg-red-500/15 text-red-400 ring-red-500/30',
  eligibility:            'bg-accent-500/15 text-accent-400 ring-accent-500/30',
  referred:               'bg-white/10 text-input-placeholder ring-white/10',
  consultation_scheduled: 'bg-accent-500/15 text-accent-400 ring-accent-500/30',
  declined:               'bg-red-500/15 text-red-400 ring-red-500/30',
  engagement_pending:     'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  active:                 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  pleadings_filed:        'bg-accent-500/15 text-accent-400 ring-accent-500/30',
  discovery:              'bg-accent-500/15 text-accent-400 ring-accent-500/30',
  mediation:              'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  pre_trial:              'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  trial:                  'bg-red-500/15 text-red-400 ring-red-500/30',
  order_entered:          'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  appeal_pending:         'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  closed:                 'bg-white/10 text-input-placeholder ring-white/10'
};

// ---------------------------------------------------------------------------
// Status popover
// ---------------------------------------------------------------------------

interface StatusPopoverProps {
  currentStatus: MatterStatus;
  onSelect: (status: MatterStatus) => void;
  disabled?: boolean;
}

const StatusPopover = ({ currentStatus, onSelect, disabled }: StatusPopoverProps) => {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Focus the option when focusedIndex changes
  useEffect(() => {
    if (open && optionRefs.current[focusedIndex]) {
      optionRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex, open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Handle keyboard navigation within listbox
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
          if (!open) setFocusedIndex(0);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Status: ${MATTER_STATUS_LABELS[currentStatus]}. Click to change.`}
        className={cn(
          'inline-flex items-center gap-2.5 rounded-full px-4 py-2.5',
          'text-base font-medium ring-1 ring-inset',
          'transition-all duration-150',
          'hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          colorClasses
        )}
      >
        <StatusIcon className="h-[18px] w-[18px] shrink-0" aria-hidden />
        {MATTER_STATUS_LABELS[currentStatus]}
        <ChevronDownIcon
          className={cn('h-4 w-4 shrink-0 transition-transform duration-150', open && 'rotate-180')}
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
                onClick={() => { onSelect(status); setOpen(false); buttonRef.current?.focus(); }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors duration-100',
                  isSelected
                    ? 'bg-accent-500/15 text-accent-400'
                    : 'text-input-text hover:bg-white/[0.06]'
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-input-placeholder" aria-hidden />
                <span className="flex-1">{MATTER_STATUS_LABELS[status]}</span>
                {isSelected && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-accent-400" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Client badge
// ---------------------------------------------------------------------------

interface ClientEntry {
  id: string;
  name: string;
  status?: string;
  location?: string;
}

const resolveAvatarStatus = (status?: string): 'active' | 'inactive' | undefined => {
  if (status === 'active' || status === 'lead') return 'active';
  if (status === 'inactive' || status === 'archived') return 'inactive';
  return undefined;
};

const ClientSection = ({ entry }: { entry: ClientEntry }) => (
  <div className="flex items-center gap-3">
    <Avatar
      name={entry.name}
      size="md"
      status={resolveAvatarStatus(entry.status)}
      className="bg-white/10 ring-1 ring-white/10 shrink-0"
    />
    <div className="min-w-0">
      <p className="text-sm font-semibold text-input-text leading-none truncate">{entry.name}</p>
      {(entry.location || entry.status) && (
        <p className="mt-0.5 text-xs text-input-placeholder truncate">
          {[entry.location, entry.status].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MatterDetailHeaderProps {
  matter: MatterSummary;
  detail: MatterDetail | null;
  headerMeta: {
    clientEntries: ClientEntry[];
    description?: string;
    assigneeNames: string[];
    billingLabel: string;
    createdLabel: string;
  };
  activeTab: string;
  onTabChange: (tabId: string) => void;
  tabs: Array<{ id: string; label: string }>;
  onUpdateStatus: (newStatus: MatterStatus) => void;
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MatterDetailHeader = ({
  matter,
  detail,
  headerMeta,
  activeTab,
  onTabChange,
  tabs,
  onUpdateStatus,
  isLoading = false
}: MatterDetailHeaderProps) => {
  const primaryClient = headerMeta.clientEntries[0] ?? null;
  const closed = matter.status === 'closed';
  const primaryDateLabel = closed ? 'Closed at' : 'Created';
  const primaryDateValue = closed
    ? formatLongDate(matter.updatedAt || matter.createdAt)
    : (headerMeta.createdLabel ?? formatLongDate(matter.createdAt));

  return (
    <div className="glass-panel overflow-hidden">

      {/* ── Top content area ─────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4">

        {/* Row 1: title + actions */}
        <div className="flex items-start gap-4">
          <h1 className="flex-1 text-2xl font-semibold leading-snug text-input-text min-w-0">
            {matter.title}
          </h1>

          {/* Status badge */}
          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            <StatusPopover
              currentStatus={matter.status}
              onSelect={onUpdateStatus}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Row 2: timestamps */}
        <p className="mt-1 text-xs text-input-placeholder">
          {primaryDateLabel} {primaryDateValue}
          {!closed && matter.updatedAt && (
            <> · Updated {formatRelativeTime(matter.updatedAt)}</>
          )}
        </p>

        {/* ── Divider ──────────────────────────────────────────────── */}
        <div className="mt-4 border-t border-white/[0.06]" />

        {/* Row 3: client relationship */}
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-input-placeholder/70">
            Client
          </p>
          {primaryClient ? (
            <ClientSection entry={primaryClient} />
          ) : (
            <p className="text-sm text-input-placeholder italic">No client assigned</p>
          )}
        </div>

        {/* Row 4: secondary metadata strip (billing type + assignees) — only when detail is loaded */}
        {detail && (headerMeta.billingLabel || headerMeta.assigneeNames.length > 0) && (
          <div className="mt-4 flex flex-wrap gap-4">
            {headerMeta.billingLabel && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-input-placeholder/70 mb-0.5">
                  Billing
                </p>
                <p className="text-xs text-input-text capitalize">{headerMeta.billingLabel}</p>
              </div>
            )}
            {headerMeta.assigneeNames.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-input-placeholder/70 mb-0.5">
                  {headerMeta.assigneeNames.length === 1 ? 'Attorney' : 'Attorneys'}
                </p>
                <p className="text-xs text-input-text">{headerMeta.assigneeNames.join(', ')}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tab bar — flush to bottom, no padding ────────────────────── */}
      <nav
        className="flex items-end gap-0 border-t border-white/[0.06] px-5"
        aria-label="Matter sections"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-selected={isActive}
              role="tab"
              className={cn(
                'relative px-3 py-3 text-sm font-medium whitespace-nowrap',
                'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded-t-sm',
                'after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:transition-all after:duration-150',
                isActive
                  ? 'text-input-text after:bg-accent-500'
                  : 'text-input-placeholder hover:text-input-text after:bg-transparent hover:after:bg-white/20'
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
