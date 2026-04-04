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
const gridBase = 'grid grid-cols-2 gap-x-4 gap-y-5 @xl:grid-cols-4 @xl:gap-x-6';
const wrapperBase = 'glass-panel p-4 sm:p-5 @container';

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
      const fixedCards = [
        { label: 'Project price', value: formatCurrency(fixedProjectPrice), helper: 'Fixed-price' },
        { label: 'Project funds', value: formatCurrency(fixedProjectFunds) },
        ...(hasMilestones ? [
          {
            label: `Milestones paid (${milestonesPaidCount})`,
            value: formatCurrency(milestonesPaidAmount)
          },
          {
            label: `Milestones remaining (${milestonesRemainingCount})`,
            value: formatCurrency(milestonesRemainingAmount)
          }
        ] : []),
        { label: 'Total earnings', value: formatCurrency(fixedTotalEarnings) }
      ];

      const fixedGridClass = hasMilestones
        ? 'grid grid-cols-2 gap-x-4 gap-y-5 @xl:grid-cols-5 @xl:gap-x-6'
        : 'grid grid-cols-2 gap-x-4 gap-y-5 @xl:grid-cols-3 @xl:gap-x-6';

      return (
        <section className={wrapperBase}>
          <div className={fixedGridClass}>
            {fixedCards.map((card, index) => {
              const isFirst = index === 0;
              const isLast = index === fixedCards.length - 1;
              const spanClass = isFirst || isLast ? 'col-span-2 @xl:col-span-1' : 'col-span-1';
              return (
                <div key={card.label} className={cn(summaryItemBase, spanClass)}>
                  <p className="text-xs font-medium text-input-placeholder leading-tight">{card.label}</p>
                  <p className="mt-2 text-lg font-semibold text-input-text leading-tight break-words">{card.value}</p>
                  {card.helper ? (
                    <p className="mt-1 text-xs text-input-placeholder leading-tight">{card.helper}</p>
                  ) : null}
                </div>
              );
            })}
            <div className="col-span-2 flex flex-col gap-2 @xl:col-span-1 @xl:justify-start">
              <Button
                size="xs"
                onClick={() => onCreateInvoice?.()}
                disabled={!onCreateInvoice}
                className="w-full justify-center"
              >
                Invoice
              </Button>
              <div className="text-center @xl:text-left">
                {onViewTimesheet ? (
                  <button
                    type="button"
                    onClick={() => onViewTimesheet()}
                    className="text-xs font-medium text-accent-500 hover:underline"
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
        <div className={gridBase}>
          <div className={cn(summaryItemBase, 'col-span-2 @xl:col-span-1')}>
            <p className="text-xs font-medium text-input-placeholder leading-tight">Billable time this week</p>
            <p className="mt-2 text-lg font-semibold text-input-text leading-tight break-words">{billableDisplay}</p>
            <p className="mt-1 text-xs text-input-placeholder leading-tight">
              Based on recorded billable entries this week.
            </p>
            {onLearnMore ? (
              <button
                type="button"
                className="mt-2 text-xs font-medium text-accent-500 hover:underline"
                onClick={onLearnMore}
              >
                Learn more
              </button>
            ) : (
              <span className="mt-2 text-xs font-medium text-input-placeholder/60">
                Learn more (coming soon)
              </span>
            )}
          </div>
          <div className={summaryItemBase}>
            <p className="text-xs font-medium text-input-placeholder leading-tight">{billingTypeLabel}</p>
            {Array.isArray(billingRateLines) ? (
              <div className="mt-2 space-y-1 text-sm text-input-text">
                {billingRateLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-lg font-semibold text-input-text">{billingRateLines}</p>
            )}
          </div>
          <div className={summaryItemBase}>
            <p className="text-xs font-medium text-input-placeholder leading-tight">This week&apos;s tracked</p>
            <p className="mt-2 text-lg font-semibold text-input-text leading-tight break-words">{totalDisplay}</p>
            <p className="mt-1 text-xs text-input-placeholder leading-tight">Across all logged entries this week</p>
          </div>
          <div className="col-span-2 flex flex-col gap-2 @xl:col-span-1">
            <Button
              size="xs"
              onClick={() => onCreateInvoice?.()}
              disabled={!onCreateInvoice}
              className="w-full justify-center"
            >
              Invoice
            </Button>
            <div className="text-center @xl:text-left">
              {onViewTimesheet ? (
                <button
                  type="button"
                  onClick={() => onViewTimesheet()}
                  className="text-xs font-medium text-accent-500 hover:underline"
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

  if (activeTab === 'time') {
    const cards = [
      { label: 'Billable hours', value: billableDisplay, helper: 'All billable time logged' },
      { label: 'Total time tracked', value: totalDisplay, helper: 'All time entries' }
    ];

    return (
      <section className={wrapperBase}>
        <div className={gridBase}>
          {cards.map((card) => (
            <div key={card.label} className={summaryItemBase}>
              <p className="text-xs font-medium text-input-placeholder leading-tight">{card.label}</p>
              <p className="mt-2 text-lg font-semibold text-input-text leading-tight break-words">{card.value}</p>
              {card.helper ? (
                <p className="mt-1 text-xs text-input-placeholder leading-tight">{card.helper}</p>
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
      <div className={gridBase}>
        {messageCards.map((card) => (
          <div key={card.label} className={summaryItemBase}>
            <p className="text-xs font-medium text-input-placeholder">{card.label}</p>
            <p className="mt-2 text-lg font-semibold text-input-text">{card.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
