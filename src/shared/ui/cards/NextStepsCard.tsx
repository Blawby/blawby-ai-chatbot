import { Button } from '@/shared/ui/Button';

export type NextStepsStatus = 'completed' | 'pending' | 'incomplete';

export interface NextStepsAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon';
  size?: 'sm' | 'md' | 'lg';
}

export interface NextStepsItem {
  title: string;
  description?: string;
  status?: NextStepsStatus;
  action?: NextStepsAction;
}

interface NextStepsCardProps {
  title: string;
  subtitle?: string;
  items: NextStepsItem[];
  action?: NextStepsAction;
}

const getStatusStyles = (status?: NextStepsStatus) => {
  if (status === 'completed') {
    return {
      wrapper: 'bg-green-500 border-green-500 text-white',
      icon: 'check'
    };
  }
  if (status === 'incomplete') {
    return {
      wrapper: 'border-gray-400 text-gray-400',
      icon: 'circle'
    };
  }
  return {
    wrapper: 'border-amber-500 text-amber-500',
    icon: 'circle'
  };
};

export const NextStepsCard = ({ title, subtitle, items, action }: NextStepsCardProps) => (
  <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-card-bg p-6 shadow-sm space-y-4">
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
      {subtitle && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {subtitle}
        </p>
      )}
    </div>

    <div className="space-y-4">
      {items.map((item) => {
        const statusStyles = getStatusStyles(item.status);
        return (
        <div key={item.title} className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-xs ${statusStyles.wrapper}`}
            aria-hidden="true"
          >
            {statusStyles.icon === 'check' ? (
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <span className="h-2.5 w-2.5 rounded-full border border-current" />
            )}
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{item.title}</p>
            {item.description && (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {item.description}
              </p>
            )}
          </div>
          {item.action && (
            <Button
              variant={item.action.variant ?? 'secondary'}
              size={item.action.size ?? 'sm'}
              onClick={item.action.onClick}
            >
              {item.action.label}
            </Button>
          )}
        </div>
      )})}
    </div>

    {action && (
      <div>
        <Button
          variant={action.variant ?? 'primary'}
          size={action.size ?? 'md'}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      </div>
    )}
  </div>
);
