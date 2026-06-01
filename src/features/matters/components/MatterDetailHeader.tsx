import type { LucideIcon } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { Plus, Timer, MoreHorizontal } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Popover } from '@/shared/ui/overlays';
import { StatStrip, type StatStripCell } from '@/design-system/patterns';
import { MATTER_STATUS_LABELS } from '@/shared/types/matterStatus';
import type { MatterDetail } from '@/features/matters/data/matterTypes';

export interface MatterMoreMenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
}

// Maps backend urgency -> human label rendered in the breadcrumb row.
// "emergency" reads as "priority high" per the canonical Matter.html spec.
const URGENCY_BREADCRUMB_LABEL: Record<NonNullable<MatterDetail['urgency']>, string> = {
  routine: 'routine',
  time_sensitive: 'time sensitive',
  emergency: 'priority high'
};

const URGENCY_COLOR_VAR: Record<NonNullable<MatterDetail['urgency']>, string> = {
  routine: 'var(--dim)',
  time_sensitive: 'var(--warn)',
  emergency: 'var(--neg)'
};

// Derive a stable "BLB-####" matter number from the matter UUID when the
// backend doesn't supply a `case_number` field. Uses the first 4 hex chars
// of the id, which is stable across renders and reasonably distinct within
// a single practice. TODO(backend): once /api/matters returns a real
// numeric `case_number`, drop this fallback.
const deriveMatterNumber = (detail: MatterDetail): string => {
  if (detail.caseNumber?.trim()) return detail.caseNumber.trim();
  const idChunk = detail.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
  return `BLB-${idChunk || '0000'}`;
};

const daysBetween = (iso: string | undefined, now = Date.now()): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / (24 * 60 * 60 * 1000)));
};

const formatOpenedDate = (iso: string | undefined): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // "Oct 04, 2026"
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};

const BILLING_TYPE_PILL_LABEL: Record<MatterDetail['billingType'], string> = {
  hourly: 'hourly',
  fixed: 'flat-fee',
  contingency: 'contingency',
  pro_bono: 'pro bono'
};

export interface MatterDetailHeaderProps {
  detail: MatterDetail;
  clientLabel: string;
  clientEmail?: string | null;
  clientImageUrl?: string | null;
  practiceAreaLabel?: string | null;
  responsibleAttorneyLabel?: string | null;
  assigneeLabel?: string | null;
  onLogTime: () => void;
  onAddTask: () => void;
  onAddNote: () => void;
  onUploadFile: () => void;
  moreMenuItems?: MatterMoreMenuItem[];
  /**
   * Stat-strip cells for the 5-cell summary band beneath the title. When
   * omitted, the strip is not rendered. Callers (the PracticeMattersPage)
   * derive these from useBillingData / time stats / task data — see
   * `buildStatStripCells` in PracticeMattersPage for the canonical shape.
   */
  statCells?: readonly StatStripCell[];
}

const MoreMenu = ({ items }: { items: MatterMoreMenuItem[] }) => (
  <Popover
    side="bottom"
    align="end"
    trigger={
      <Button size="sm" variant="ghost" icon={MoreHorizontal} aria-label="More actions" />
    }
  >
    <ul className="flex min-w-[180px] flex-col gap-0.5">
      {items.map((item, idx) => {
        const Icon = item.icon;
        return (
          <li key={idx}>
            <button
              type="button"
              onClick={item.onClick}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ink transition-colors hover:bg-paper-2"
            >
              {Icon ? <Icon className="h-4 w-4 text-dim-2" aria-hidden="true" /> : null}
              {item.label}
            </button>
          </li>
        );
      })}
    </ul>
  </Popover>
);

/**
 * Matter detail header (chat-first, per design_handoff_blawby_chat_first/screens/Matter.html).
 *
 * Layout (top to bottom):
 *   1. Breadcrumb row     — mono uppercase: "Matters / BLB-#### · priority high"
 *   2. Title row          — serif h1 44px with client name in --accent · top-right action cluster
 *   3. Sub strip          — bold practice-area · bold jurisdiction · opened date · billing pill
 *   4. 5-cell StatStrip   — retainer balance · unbilled time · events 30d · SoL/next deadline · est. value
 *
 * Onboarding/Settings hide moreMenuItems; the detail panel passes them to
 * surface "Edit matter" inside the more menu.
 */
export const MatterDetailHeader = ({
  detail,
  clientLabel,
  practiceAreaLabel,
  onLogTime,
  onAddTask,
  moreMenuItems,
  statCells
}: MatterDetailHeaderProps) => {
  const title = detail.title?.trim() || 'Untitled matter';
  const matterNumber = deriveMatterNumber(detail);
  const urgencyLabel = detail.urgency ? URGENCY_BREADCRUMB_LABEL[detail.urgency] : null;
  const urgencyColor = detail.urgency ? URGENCY_COLOR_VAR[detail.urgency] : undefined;

  const openedLabel = formatOpenedDate(detail.openDate);
  const openedDays = daysBetween(detail.openDate);
  const billingPill = BILLING_TYPE_PILL_LABEL[detail.billingType] ?? null;
  // "pre-litigation" is a status-derived pill — surface when the matter is
  // still in a pre-litigation workflow stage. TODO(backend): expose a real
  // `litigation_phase` field so we don't infer it from `status`.
  const isPreLitigation = ['engagement_pending', 'engagement_accepted', 'active'].includes(detail.status);

  const subPieces: ComponentChildren[] = [];
  if (practiceAreaLabel) {
    subPieces.push(
      <b key="area" className="font-[family-name:var(--sans)] text-[13px] font-medium normal-case tracking-normal text-ink-2">
        {practiceAreaLabel}
      </b>
    );
  }
  if (detail.court) {
    subPieces.push(
      <b key="court" className="font-[family-name:var(--sans)] text-[13px] font-medium normal-case tracking-normal text-ink-2">
        {detail.court}
      </b>
    );
  }
  if (openedLabel) {
    subPieces.push(
      <span key="opened">
        opened {openedLabel}
        {openedDays !== null ? ` · ${openedDays} days` : null}
      </span>
    );
  }
  if (billingPill) {
    subPieces.push(
      <span
        key="billing"
        className="inline-flex items-center rounded-[2px] border border-line-utility bg-paper-2 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-ink-2"
      >
        {billingPill}
      </span>
    );
  }
  if (isPreLitigation) {
    subPieces.push(
      <span
        key="phase"
        className="inline-flex items-center rounded-[2px] border border-line-utility bg-paper-2 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-ink-2"
      >
        pre-litigation
      </span>
    );
  }

  return (
    <header className="page-detail-header border-b border-line-subtle bg-[color-mix(in_oklab,var(--paper)_96%,var(--card))] !px-6 !py-6 sm:!px-10 sm:!py-7">
      {/* breadcrumb row */}
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-dim">
        <span className="cursor-default text-ink-2">Matters</span>
        <span className="text-dim-2" aria-hidden="true">/</span>
        <span>{matterNumber}</span>
        {urgencyLabel ? (
          <>
            <span className="text-dim-2" aria-hidden="true">·</span>
            <span style={{ color: urgencyColor }}>{urgencyLabel}</span>
          </>
        ) : null}
      </div>

      {/* title row */}
      <div className="mt-1.5 grid grid-cols-1 items-end gap-4 lg:grid-cols-[1fr_auto] lg:gap-8">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--serif)] text-[34px] font-normal leading-[1.05] tracking-tight text-ink sm:text-[44px]">
            {title}
            {clientLabel ? (
              <>
                {' · '}
                <em className="not-italic text-[color:var(--accent)]">{clientLabel}</em>
              </>
            ) : null}
          </h1>
          {subPieces.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.04em] text-dim">
              {subPieces.flatMap((piece, idx) =>
                idx === 0
                  ? [piece]
                  : [
                      <span key={`sep-${idx}`} className="text-dim-2" aria-hidden="true">·</span>,
                      piece
                    ]
              )}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-start gap-1.5 lg:items-end">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {moreMenuItems && moreMenuItems.length > 0 ? <MoreMenu items={moreMenuItems} /> : null}
            <Button size="sm" variant="ghost" icon={Timer} onClick={onLogTime}>
              Log time
            </Button>
            <Button size="sm" variant="primary" icon={Plus} onClick={onAddTask}>
              Add task
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            {detail.urgency === 'emergency' ? (
              <span className="inline-flex items-center rounded-[2px] border border-[color-mix(in_oklab,var(--neg)_40%,var(--rule))] bg-[color-mix(in_oklab,var(--neg)_14%,var(--card))] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[color:var(--neg)]">
                at risk
              </span>
            ) : null}
            <span className="inline-flex items-center rounded-[2px] border border-line-utility bg-paper-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-2">
              status: {MATTER_STATUS_LABELS[detail.status].toLowerCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Stat strip — 5-cell on lg+, 3-cell on <lg (per canonical Matter.html
          1180px breakpoint). The DS .stat-strip CSS is hard-coded to 5 cols
          via repeat(5, 1fr); on mobile we slice to 3 cells and override the
          grid-template-columns inline so the strip doesn't show 2 empty
          phantom cells. Authoring a responsive rule in index.css is out of
          scope for this feature. */}
      {statCells && statCells.length > 0 ? (
        <div className="mt-6">
          <div className="hidden lg:block">
            <StatStrip cells={statCells} />
          </div>
          <div className="lg:hidden" style={{ ['--stat-cols' as string]: '3' }}>
            <div
              className="stat-strip"
              style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
              role="group"
            >
              {statCells.slice(0, 3).map((cell, idx) => (
                <div key={`mobile:${cell.label}:${idx}`} className="stat-strip-cell">
                  <div className="stat-strip-label">{cell.label}</div>
                  <div className="stat-strip-value">
                    {cell.value}
                    {cell.unit ? <small>{cell.unit}</small> : null}
                  </div>
                  {cell.extra ? (
                    <div className={`stat-strip-extra${cell.extraWarn ? ' stat-strip-extra-warn' : ''}`}>
                      {cell.extra}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
};
