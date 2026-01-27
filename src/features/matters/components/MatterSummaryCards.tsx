import { Button } from '@/shared/ui/Button';

type SummaryTab = 'overview' | 'time' | 'messages';

interface MatterSummaryCardsProps {
  activeTab: SummaryTab;
  onAddTime?: () => void;
  onViewTimesheet?: () => void;
  onChangeRate?: () => void;
}

const cardBase = 'rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg p-4';

export const MatterSummaryCards = ({
  activeTab,
  onAddTime,
  onViewTimesheet,
  onChangeRate
}: MatterSummaryCardsProps) => {
  if (activeTab === 'overview') {
    return (
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cardBase}>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Earnings this week</p>
          <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">$0.00</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            You will get paid for these hours on Monday.
            {' '}
            <span className="text-gray-400">(Blawby&apos;s billing timezone)</span>
          </p>
          <button type="button" className="mt-2 text-xs font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400">
            Learn more
          </button>
        </div>
        <div className={cardBase}>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Contract&apos;s rate</p>
          <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">$125.00 /hr</p>
          <button
            type="button"
            className="mt-2 text-xs font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400"
            onClick={onChangeRate}
          >
            Change rate
          </button>
        </div>
        <div className={cardBase}>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">This week&apos;s tracked</p>
          <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">0:00 hrs</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">of 10 hrs weekly limit</p>
        </div>
        <div className={cardBase}>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Quick actions</p>
          <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">Time</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Add new entries or open the full timesheet.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="xs" onClick={onAddTime}>
              Add time
            </Button>
            <Button variant="secondary" size="xs" onClick={onViewTimesheet}>
              View timesheet
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if (activeTab === 'time') {
    const cards = [
      { label: 'Last 24 hours', value: '0:00 hrs', helper: 'Last worked 4 quarters ago' },
      { label: 'This week', value: '0:00 hrs', helper: 'of 10 hrs weekly limit' },
      { label: 'Last week', value: '0:00 hrs' },
      { label: 'Since start', value: '11:00 hrs' }
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
