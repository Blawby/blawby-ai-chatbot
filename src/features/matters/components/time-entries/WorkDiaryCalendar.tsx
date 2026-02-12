import { useMemo } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const startOfWeekUtc = (date: Date) => {
  const start = new Date(date);
  const dayIndex = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - dayIndex);
  start.setUTCHours(0, 0, 0, 0);
  return start;
};

const endOfWeekUtc = (date: Date) => {
  const start = startOfWeekUtc(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
};

const startOfMonthUtc = (date: Date) => {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return start;
};

const endOfMonthUtc = (date: Date) => {
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  end.setUTCHours(23, 59, 59, 999);
  return end;
};

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
};

interface WorkDiaryCalendarProps {
  selectedWeekStart: Date;
  onSelectWeek: (date: Date) => void;
}

export const WorkDiaryCalendar = ({ selectedWeekStart, onSelectWeek }: WorkDiaryCalendarProps) => {
  const monthStart = startOfMonthUtc(selectedWeekStart);
  const monthEnd = endOfMonthUtc(selectedWeekStart);
  const calendarStart = startOfWeekUtc(monthStart);
  const calendarEnd = endOfWeekUtc(monthEnd);
  const calendarStartTime = calendarStart.getTime();
  const calendarEndTime = calendarEnd.getTime();
  const selectedWeekEnd = endOfWeekUtc(selectedWeekStart);

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    let current = new Date(calendarStartTime);
    while (current.getTime() <= calendarEndTime) {
      days.push(new Date(current));
      current = addDays(current, 1);
    }
    return days;
  }, [calendarStartTime, calendarEndTime]);

  const monthLabel = monthStart.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });

  const nowUtc = new Date();
  const todayUtc = new Date(Date.UTC(
    nowUtc.getUTCFullYear(),
    nowUtc.getUTCMonth(),
    nowUtc.getUTCDate()
  ));

  const handlePrevMonth = () => {
    const prev = new Date(Date.UTC(
      selectedWeekStart.getUTCFullYear(),
      selectedWeekStart.getUTCMonth() - 1,
      1
    ));
    onSelectWeek(prev);
  };

  const handleNextMonth = () => {
    const next = new Date(Date.UTC(
      selectedWeekStart.getUTCFullYear(),
      selectedWeekStart.getUTCMonth() + 1,
      1
    ));
    onSelectWeek(next);
  };

  return (
    <div className="rounded-2xl border border-line-default bg-surface-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Previous month"
          icon={<ChevronLeftIcon className="h-4 w-4" />}
          onClick={handlePrevMonth}
        />
        <div className="text-sm font-semibold text-gray-900 dark:text-white">{monthLabel}</div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Next month"
          icon={<ChevronRightIcon className="h-4 w-4" />}
          onClick={handleNextMonth}
        />
      </div>

      <div
        className="mt-4 grid gap-2 text-center text-[11px] font-medium text-gray-500 dark:text-gray-400 justify-items-center"
        style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
      >
        {WEEKDAYS.map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>

      <div
        className="mt-2 grid gap-2 justify-items-center"
        style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
      >
        {calendarDays.map((day) => {
          const isCurrentMonth = day.getUTCMonth() === monthStart.getUTCMonth();
          const isSelectedWeek = day >= selectedWeekStart && day <= selectedWeekEnd;
          const isToday = day.getTime() === todayUtc.getTime();
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectWeek(day)}
              className={[
                'h-9 w-9 rounded-full text-sm font-medium transition-colors',
                isCurrentMonth ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500',
                isSelectedWeek ? 'bg-accent-500/20 text-gray-900 dark:text-white' : 'hover:bg-accent-500/10',
                isToday ? 'ring-2 ring-accent-500' : 'ring-1 ring-transparent'
              ].join(' ')}
            >
              {day.getUTCDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};
