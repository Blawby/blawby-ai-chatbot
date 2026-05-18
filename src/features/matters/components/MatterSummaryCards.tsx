import { Clock, DollarSign, Timer } from 'lucide-preact';
import { Button } from '@/shared/ui/Button';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { getMajorAmountValue, type MajorAmount } from '@/shared/utils/money';
import { cn } from '@/shared/utils/cn';

type SummaryTab = 'overview' | 'time' | 'messages';

interface MatterSummaryCardsProps {
  activeTab: SummaryTab;
  onCreateInvoice?: () => void;
  onViewTimesheet?: () => void;
  onLearnMore?: () => void;
  timeStats?: {
    totalBillableSeconds?: number | null;
    totalSeconds?: number | null;
    totalBillableHours?: number | null;
    totalHours?: number | null;
  } | null;
  billingType?: 'hourly' | 'fixed' | 'contingency' | 'pro_bono';
  attorneyHourlyRate?: MajorAmount | null;
  adminHourlyRate?: MajorAmount | null;
  totalFixedPrice?: MajorAmount | null;
  contingencyPercent?: number | null;
  paymentFrequency?: 'project' | 'milestone' | null;
  fixedMetrics?: {
    projectPrice?: MajorAmount | null;
    projectFunds?: MajorAmount | null;
    totalEarnings?: MajorAmount | null;
    milestonesPaidCount?: number;
    milestonesPaidAmount?: MajorAmount | null;
    milestonesRemainingCount?: number;
    milestonesRemainingAmount?: MajorAmount | null;
    hasMilestones?: boolean;
  } | null;
}

const summaryItemBase = 'min-w-0 flex flex-col gap-1';
const gridBase = 'grid grid-cols-1 gap-x-4 gap-y-5 @lg:grid-cols-2 @3xl:grid-cols-4 @3xl:gap-x-6';
const wrapperBase = 'card relative overflow-hidden rounded-[20px] @container p-5 sm:p-7';
const labelClass = 'text-[10px] font-semibold uppercase tracking-[0.14em] text-input-placeholder';
const kpiValueClass = 'font-display text-[28px] font-bold leading-none tracking-tight tabular-nums text-input-text';
const denseValueClass = 'font-display text-[24px] font-bold leading-none tracking-tight tabular-nums text-input-text';
const iconSquareClass = 'inline-flex h-7 w-7 items-center justify-center rounded-lg border border-card-border bg-surface-card-raised text-accent-utility';
const revealClass = 'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300';

const Halo = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(circle_at_center,rgb(var(--accent-500)/0.035),transparent_70%)] blur-2xl"
  />
);

const formatDurationFromSeconds = (totalSeconds?: number | null) => {
  if (!totalSeconds || totalSeconds <= 0) return '0:00 hrs';
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')} hrs`;
};

const formatDurationFromHours = (totalHours?: number | null) => {
  if (!totalHours || totalHours <= 0) return '0:00 hrs';
  const totalMinutes = Math.round(totalHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')} hrs`;
};

export const MatterSummaryCards = ({
  activeTab,
  onCreateInvoice,
  onViewTimesheet,
  onLearnMore,
  timeStats,
  billingType,
  attorneyHourlyRate,
  adminHourlyRate,
  totalFixedPrice,
  contingencyPercent,
  paymentFrequency,
  fixedMetrics
}: MatterSummaryCardsProps) => {
  const resolveMajorAmount = (amount: MajorAmount | null | undefined): number | null =>
    amount === null || amount === undefined ? null : getMajorAmountValue(amount);

  const totalBillableSeconds = timeStats?.totalBillableSeconds ?? null;
  const totalSeconds = timeStats?.totalSeconds ?? null;
  const totalBillableHours = timeStats?.totalBillableHours ?? null;
  const totalHours = timeStats?.totalHours ?? null;
  const billableDisplay = totalBillableSeconds !== null
    ? formatDurationFromSeconds(totalBillableSeconds)
    : formatDurationFromHours(totalBillableHours);
  const totalDisplay = totalSeconds !== null
    ? formatDurationFromSeconds(totalSeconds)
    : formatDurationFromHours(totalHours);

  const billingTypeLabel = billingType
    ? billingType.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())
    : 'Not set';
  const billingRateLines = (() => {
    if (!billingType) return 'Rate not set';
    if (billingType === 'pro_bono') return 'No charge';
    if (billingType === 'hourly') {
      const attorneyRateValue = resolveMajorAmount(attorneyHourlyRate);
      const adminRateValue = resolveMajorAmount(adminHourlyRate);
      if (attorneyRateValue === null && adminRateValue === null) return 'Rate not set';
      const lines: string[] = [];
      if (attorneyRateValue !== null) lines.push(`Attorney: ${formatCurrency(attorneyRateValue)}/hr`);
      if (adminRateValue !== null) lines.push(`Admin: ${formatCurrency(adminRateValue)}/hr`);
      return lines;
    }
    if (billingType === 'fixed') {
      if (paymentFrequency === 'milestone') return 'Milestone schedule';
      const value = resolveMajorAmount(totalFixedPrice);
      return value !== null ? `${formatCurrency(value)} total` : 'Rate not set';
    }
    const percent = typeof contingencyPercent === 'number' ? contingencyPercent : null;
    return percent !== null ? `${percent}% contingency` : 'Rate not set';
  })();

  const fixedProjectPrice = resolveMajorAmount(fixedMetrics?.projectPrice ?? totalFixedPrice ?? null) ?? 0;
  const fixedProjectFunds = resolveMajorAmount(fixedMetrics?.projectFunds ?? null) ?? 0;
  const fixedTotalEarnings = resolveMajorAmount(fixedMetrics?.totalEarnings ?? null) ?? 0;
  const milestonesPaidCount = Math.max(0, fixedMetrics?.milestonesPaidCount ?? 0);
  const milestonesPaidAmount = resolveMajorAmount(fixedMetrics?.milestonesPaidAmount ?? null) ?? 0;
  const milestonesRemainingCount = Math.max(0, fixedMetrics?.milestonesRemainingCount ?? 0);
  const milestonesRemainingAmount = resolveMajorAmount(fixedMetrics?.milestonesRemainingAmount ?? null) ?? 0;
  const hasMilestones = Boolean(fixedMetrics?.hasMilestones ?? (milestonesPaidCount + milestonesRemainingCount > 0));

  if (activeTab === 'overview') {
    if (billingType === 'fixed') {
      const fixedCards: Array<{ label: string; value: string; helper?: string; icon?: typeof DollarSign }> = [
        { label: 'Project price', value: formatCurrency(fixedProjectPrice), helper: 'Fixed-price', icon: DollarSign },
        { label: 'Project funds', value: formatCurrency(fixedProjectFunds), icon: DollarSign },
        ...(hasMilestones ? [
          {
            label: `Milestones paid (${milestonesPaidCount})`,
            value: formatCurrency(milestonesPaidAmount),
            icon: Timer
          },
          {
            label: `Milestones remaining (${milestonesRemainingCount})`,
            value: formatCurrency(milestonesRemainingAmount),
            icon: Timer
          }
        ] : []),
        { label: 'Total earnings', value: formatCurrency(fixedTotalEarnings), icon: Clock }
      ];

      const fixedGridClass = 'grid grid-cols-1 gap-x-4 gap-y-5 @lg:grid-cols-2 @3xl:grid-cols-4 @5xl:grid-cols-6 @5xl:gap-x-6';

      return (
        <section className={wrapperBase}>
          <Halo />
          <div className={fixedGridClass}>
            {fixedCards.map((card, index) => {
              const isFirst = index === 0;
              const spanClass = isFirst ? 'col-span-1 @lg:col-span-2 @5xl:col-span-4' : 'col-span-1';
              const CardIcon = card.icon ?? DollarSign;
              return (
                <div
                  key={card.label}
                  className={cn(summaryItemBase, spanClass, revealClass)}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <div className="flex items-center gap-2">
                    <span className={iconSquareClass}>
                      <CardIcon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <p className={cn(labelClass, 'leading-tight')}>{card.label}</p>
                  </div>
                  <p className={cn('mt-3 break-words', isFirst ? kpiValueClass : denseValueClass)}>{card.value}</p>
                  {card.helper ? (
                    <p className="mt-1 text-xs leading-snug text-input-placeholder/80">{card.helper}</p>
                  ) : null}
                </div>
              );
            })}
            <div className="col-span-1 flex flex-col gap-2 @lg:col-span-2 @lg:justify-start @5xl:col-span-2">
              <Button
                size="xs"
                onClick={() => onCreateInvoice?.()}
                disabled={!onCreateInvoice}
                className="w-full justify-center font-display font-semibold tracking-wide"
              >
                Invoice
              </Button>
              <div className="text-center md:text-left">
                {onViewTimesheet ? (
                  <button
                    type="button"
                    onClick={() => onViewTimesheet()}
                    className="text-xs font-semibold text-accent-500 transition-colors hover:text-accent-600"
                  >
                    View timesheet
                  </button>
                ) : (
                  <span className="text-xs font-medium text-input-placeholder/60">View timesheet</span>
                )}
              </div>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className={wrapperBase}>
        <Halo />
        <div className={gridBase}>
          <div
            className={cn(summaryItemBase, 'col-span-1 @lg:col-span-2 @3xl:col-span-1', revealClass)}
            style={{ animationDelay: '0ms' }}
          >
            <div className="flex items-center gap-2">
              <span className={iconSquareClass}>
                <Clock className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className={cn(labelClass, 'leading-tight')}>Billable time this week</p>
            </div>
            <p className={cn('mt-3 break-words', kpiValueClass)}>{billableDisplay}</p>
            <p className="mt-1.5 text-xs leading-snug text-input-placeholder/80">
              Based on recorded billable entries this week.
            </p>
            {onLearnMore ? (
              <button
                type="button"
                className="mt-1 self-start text-xs font-semibold text-accent-500 transition-colors hover:text-accent-600"
                onClick={onLearnMore}
              >
                Learn more
              </button>
            ) : (
              <span className="mt-1 text-xs font-medium text-input-placeholder/60">
                Learn more (coming soon)
              </span>
            )}
          </div>
          <div
            className={cn(summaryItemBase, '@3xl:border-l @3xl:border-card-border @3xl:pl-6', revealClass)}
            style={{ animationDelay: '60ms' }}
          >
            <div className="flex items-center gap-2">
              <span className={iconSquareClass}>
                <DollarSign className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className={cn(labelClass, 'leading-tight')}>{billingTypeLabel}</p>
            </div>
            {Array.isArray(billingRateLines) ? (
              <div className="mt-3 space-y-1 font-display text-base font-semibold leading-snug tabular-nums text-input-text">
                {billingRateLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : (
              <p className="mt-3 font-display text-lg font-semibold leading-snug tabular-nums text-input-text">{billingRateLines}</p>
            )}
          </div>
          <div
            className={cn(summaryItemBase, '@3xl:border-l @3xl:border-card-border @3xl:pl-6', revealClass)}
            style={{ animationDelay: '120ms' }}
          >
            <div className="flex items-center gap-2">
              <span className={iconSquareClass}>
                <Timer className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className={cn(labelClass, 'leading-tight')}>This week&apos;s tracked</p>
            </div>
            <p className={cn('mt-3 break-words', kpiValueClass)}>{totalDisplay}</p>
            <p className="mt-1.5 text-xs leading-snug text-input-placeholder/80">Across all logged entries this week</p>
          </div>
          <div className="col-span-1 flex flex-col items-stretch gap-2 self-center @lg:col-span-2 @lg:items-center @3xl:col-span-1 @3xl:items-end">
            <Button
              size="md"
              onClick={() => onCreateInvoice?.()}
              disabled={!onCreateInvoice}
              className="justify-center rounded-full px-8 font-display font-semibold tracking-wide shadow-sm"
            >
              Invoice
            </Button>
            <div className="text-center">
              {onViewTimesheet ? (
                <button
                  type="button"
                  onClick={() => onViewTimesheet()}
                  className="text-sm font-semibold text-accent-500 transition-colors hover:text-accent-600"
                >
                  View timesheet
                </button>
              ) : (
                <span className="text-sm font-medium text-input-placeholder/60">View timesheet</span>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (activeTab === 'time') {
    const cards = [
      { label: 'Billable hours', value: billableDisplay, helper: 'All billable time logged' },
      { label: 'Total time tracked', value: totalDisplay, helper: 'All time entries' }
    ];

    return (
      <section className={wrapperBase}>
        <Halo />
        <div className={gridBase}>
          {cards.map((card, index) => (
            <div
              key={card.label}
              className={cn(summaryItemBase, revealClass)}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <p className={cn(labelClass, 'leading-tight')}>{card.label}</p>
              <p className={cn('mt-2 break-words', denseValueClass)}>{card.value}</p>
              {card.helper ? (
                <p className="mt-1 text-xs leading-snug text-input-placeholder/80">{card.helper}</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    );
  }

  const messageCards = [
    { label: 'Unread', value: '0' },
    { label: 'Last reply', value: '2 hrs ago' },
    { label: 'Participants', value: '3' },
    { label: 'Total messages', value: '18' }
  ];

  return (
    <section className={wrapperBase}>
      <Halo />
      <div className={gridBase}>
        {messageCards.map((card, index) => (
          <div
            key={card.label}
            className={cn(summaryItemBase, revealClass)}
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <p className={labelClass}>{card.label}</p>
            <p className={cn('mt-2', denseValueClass)}>{card.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
