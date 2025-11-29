import { FunctionComponent } from 'preact';
import { SimpleQuota } from '../contexts/SessionContext';

interface QuotaBannerProps {
  quota: SimpleQuota | null;
  onUpgrade?: () => void;
}

const QuotaBanner: FunctionComponent<QuotaBannerProps> = ({ quota, onUpgrade }) => {
  if (!quota) {
    return null;
  }

  if (quota.unlimited || quota.limit <= 0) {
    return null;
  }

  const percentUsed = Math.min(100, Math.round((quota.used / quota.limit) * 100));
  const showWarning = percentUsed >= 80;

  if (!showWarning) {
    return null;
  }

  return (
    <div className="bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 px-4 py-2 text-sm flex items-center justify-between gap-4">
      <span>
        You&apos;ve used {quota.used} of {quota.limit} messages this month.{" "}
        {percentUsed >= 100 ? 'Upgrade to keep the conversation going.' : 'Consider upgrading to avoid interruptions.'}
      </span>
      {onUpgrade && (
        <button
          type="button"
          onClick={onUpgrade}
          className="bg-amber-200 dark:bg-amber-800 hover:bg-amber-300 dark:hover:bg-amber-700 px-3 py-1 rounded text-xs font-medium transition-colors"
        >
          Upgrade
        </button>
      )}
    </div>
  );
};

export default QuotaBanner;
