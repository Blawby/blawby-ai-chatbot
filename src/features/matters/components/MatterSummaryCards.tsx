import { Button } from '@/shared/ui/Button';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { getMajorAmountValue, type MajorAmount } from '@/shared/utils/money';

type SummaryTab = 'overview' | 'time' | 'messages';

interface MatterSummaryCardsProps {
  activeTab: SummaryTab;
  onAddTime?: () => void;
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
}

const summaryItemBase = 'min-w-0 py-1';
const gridBase = 'grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4';
const wrapperBase = 'glass-panel p-4 sm:p-5';

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
  onAddTime,
  onViewTimesheet,
  onLearnMore,
  timeStats,
  billingType,
  attorneyHourlyRate,
  adminHourlyRate,
  totalFixedPrice,
  contingencyPercent,
  paymentFrequency
}: MatterSummaryCardsProps) => {
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
  const billingRateLabel = (() => {
    if (!billingType) return 'Rate not set';
    if (billingType === 'pro_bono') return 'No charge';
    if (billingType === 'hourly') {
      const hourlyRate = attorneyHourlyRate ?? adminHourlyRate ?? null;
      const value = getMajorAmountValue(hourlyRate);
      return value > 0 ? `${formatCurrency(value)}/hr` : 'Rate not set';
    }
    if (billingType === 'fixed') {
      if (paymentFrequency === 'milestone') return 'Milestone schedule';
      const value = getMajorAmountValue(totalFixedPrice ?? null);
      return value > 0 ? `${formatCurrency(value)} total` : 'Rate not set';
    }
    const percent = typeof contingencyPercent === 'number' ? contingencyPercent : null;
    return percent !== null ? `${percent}% contingency` : 'Rate not set';
  })();

  if (activeTab === 'overview') {
    return (
      <section className={wrapperBase}>
        <div className={gridBase}>
          <div className={summaryItemBase}>
          <p className="text-xs font-medium text-input-placeholder">Billable time</p>
          <p className="mt-2 text-lg font-semibold text-input-text">{billableDisplay}</p>
          <p className="mt-1 text-xs text-input-placeholder">
            Based on recorded billable entries.
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
            <p className="text-xs font-medium text-input-placeholder">{billingTypeLabel}</p>
            <p className="mt-2 text-lg font-semibold text-input-text">{billingRateLabel}</p>
          </div>
          <div className={summaryItemBase}>
            <p className="text-xs font-medium text-input-placeholder">Total time tracked</p>
            <p className="mt-2 text-lg font-semibold text-input-text">{totalDisplay}</p>
            <p className="mt-1 text-xs text-input-placeholder">Across all logged entries</p>
          </div>
          <div className={summaryItemBase}>
            <div className="mt-3 flex flex-col items-start gap-2">
              <Button
                size="xs"
                onClick={() => onAddTime?.()}
                disabled={!onAddTime}
                className="w-auto"
              >
                Add time
              </Button>
            </div>
            <div className="mt-2">
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
      { label: 'Billable total', value: billableDisplay, helper: 'All billable time logged' },
      { label: 'Total tracked', value: totalDisplay, helper: 'All time entries' },
      { label: 'Billable hours', value: billableDisplay },
      { label: 'Since start', value: totalDisplay }
    ];

    return (
      <section className={wrapperBase}>
        <div className={gridBase}>
          {cards.map((card) => (
            <div key={card.label} className={summaryItemBase}>
              <p className="text-xs font-medium text-input-placeholder">{card.label}</p>
              <p className="mt-2 text-lg font-semibold text-input-text">{card.value}</p>
              {card.helper ? (
                <p className="mt-1 text-xs text-input-placeholder">{card.helper}</p>
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
