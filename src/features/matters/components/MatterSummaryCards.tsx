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

const cardBase = 'rounded-2xl border border-line-default bg-surface-card p-4 sm:p-5 shadow-card';
const gridBase = 'grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4';

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
      <section className={gridBase}>
        <div className={cardBase}>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Billable time</p>
          <p className="mt-2 text-lg font-semibold text-input-text">{billableDisplay}</p>
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
          <p className="mt-2 text-lg font-semibold text-input-text">$125.00 /hr</p>
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
          <p className="mt-2 text-lg font-semibold text-input-text">{totalDisplay}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Across all logged entries</p>
        </div>
        <div className={cardBase}>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Quick actions</p>
          <p className="mt-2 text-lg font-semibold text-input-text">Time</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Add new entries or open the full timesheet.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              size="xs"
              onClick={() => onAddTime?.()}
              disabled={!onAddTime}
              className="w-full sm:w-auto"
            >
              Add time
            </Button>
            <Button
              variant="secondary"
              size="xs"
              onClick={() => onViewTimesheet?.()}
              disabled={!onViewTimesheet}
              className="w-full sm:w-auto"
            >
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
      <section className={gridBase}>
        {cards.map((card) => (
          <div key={card.label} className={cardBase}>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
            <p className="mt-2 text-lg font-semibold text-input-text">{card.value}</p>
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
    <section className={gridBase}>
      {messageCards.map((card) => (
        <div key={card.label} className={cardBase}>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
          <p className="mt-2 text-lg font-semibold text-input-text">{card.value}</p>
        </div>
      ))}
    </section>
  );
};
