import { FunctionComponent } from 'preact';
import { QuotaSnapshot } from '../contexts/SessionContext';

interface QuotaBannerProps {
  quota: QuotaSnapshot | null;
  loading: boolean;
  onUpgrade?: () => void;
}

const QuotaBanner: FunctionComponent<QuotaBannerProps> = ({ quota, loading, onUpgrade }) => {
  if (loading || !quota) {
    return null;
  }

  if (quota.messages.unlimited || quota.messages.limit <= 0) {
    return null;
  }

  const percentUsed = Math.min(100, Math.round((quota.messages.used / quota.messages.limit) * 100));
  const showWarning = percentUsed >= 80;

  if (!showWarning) {
    return null;
  }

  return (
    <div className="bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 px-4 py-2 text-sm flex items-center justify-between gap-4">
      <span>
        You&apos;ve used {quota.messages.used} of {quota.messages.limit} messages this month.{" "}
        {percentUsed >= 100 ? 'Upgrade to keep the conversation going.' : 'Consider upgrading to avoid interruptions.'}
      </span>
      {onUpgrade && (
        <button
          type="button"
          onClick={onUpgrade}
          className="inline-flex items-center rounded-md bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 text-sm transition-colors"
        >
          View plans
        </button>
      )}
    </div>
  );
};

export default QuotaBanner;
