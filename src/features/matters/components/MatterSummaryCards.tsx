import { Button } from '@/shared/ui/Button';

type SummaryTab = 'overview' | 'time' | 'messages';

interface MatterSummaryCardsProps {
  activeTab: SummaryTab;
  onAddTime?: () => void;
  onViewTimesheet?: () => void;
  onChangeRate?: () => void;
  onLearnMore?: () => void;
  timeStats?: {
    totalBillableSeconds?: number | null;
    totalSeconds?: number | null;
    totalBillableHours?: number | null;
    totalHours?: number | null;
  } | null;
}

const cardBase = 'rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg p-4';

const formatDurationFromSeconds = (totalSeconds?: number | null) => {
  if (!totalSeconds || totalSeconds <= 0) return '0:00 hrs';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, '0')} hrs`;
};

const formatDurationFromHours = (totalHours?: number | null) => {
  if (!totalHours || totalHours <= 0) return '0:00 hrs';
  const hours = Math.floor(totalHours);
  const minutes = Math.round((totalHours - hours) * 60);
  return `${hours}:${String(minutes).padStart(2, '0')} hrs`;
};

export const MatterSummaryCards = ({
  activeTab,
  onAddTime,
  onViewTimesheet,
  onChangeRate,
  onLearnMore,
  timeStats
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

  if (activeTab === 'overview') {
    return (
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cardBase}>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Billable time</p>
          <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{billableDisplay}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Based on recorded billable entries.
          </p>
          {onLearnMore ? (
            <button
              type="button"
              className="mt-2 text-xs font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400"
              onClick={onLearnMore}
            >
              Learn more
            </button>
          ) : (
            <span className="mt-2 text-xs font-medium text-gray-400 dark:text-gray-500">
              Learn more (coming soon)
            </span>
          )}
        </div>
        <div className={cardBase}>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Contract&apos;s rate</p>
          <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">$125.00 /hr</p>
          <button
            type="button"
            className="mt-2 text-xs font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onChangeRate?.()}
            disabled={!onChangeRate}
          >
            Change rate
          </button>
        </div>
        <div className={cardBase}>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Total time tracked</p>
          <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{totalDisplay}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Across all logged entries</p>
        </div>
        <div className={cardBase}>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Quick actions</p>
          <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">Time</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Add new entries or open the full timesheet.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="xs" onClick={() => onAddTime?.()} disabled={!onAddTime}>
              Add time
            </Button>
            <Button variant="secondary" size="xs" onClick={() => onViewTimesheet?.()} disabled={!onViewTimesheet}>
              View timesheet
            </Button>
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
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className={cardBase}>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
            <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{card.value}</p>
            {card.helper ? (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{card.helper}</p>
            ) : null}
          </div>
        ))}
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
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {messageCards.map((card) => (
        <div key={card.label} className={cardBase}>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
          <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{card.value}</p>
        </div>
      ))}
    </section>
  );
};
