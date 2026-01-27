import { Button } from '@/shared/ui/Button';

interface PublicPracticeDetailsErrorProps {
  practiceSlug?: string;
  onRetry?: () => void;
}

export function PublicPracticeDetailsError({
  practiceSlug,
  onRetry
}: PublicPracticeDetailsErrorProps) {
  const slugLabel = practiceSlug ? ` "${practiceSlug}"` : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-light-bg p-4 dark:bg-dark-bg">
      <div className="max-w-lg rounded-2xl border border-light-border bg-light-card-bg p-6 text-center shadow-2xl dark:border-dark-border dark:bg-dark-card-bg">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Practice details unavailable
        </h1>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          We could not load the practice name and logo{slugLabel}. Please refresh or contact the practice to confirm their public settings.
        </p>
        {onRetry ? (
          <div className="mt-6 flex justify-center">
            <Button variant="primary" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
