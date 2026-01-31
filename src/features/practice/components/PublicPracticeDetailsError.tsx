import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';

interface PublicPracticeDetailsErrorProps {
  practiceSlug?: string;
  onRetry?: () => void;
}

export function PublicPracticeDetailsError({
  practiceSlug,
  onRetry
}: PublicPracticeDetailsErrorProps) {
  const { t } = useTranslation();
  const slugLabel = practiceSlug ? ` "${practiceSlug}"` : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-light-bg p-4 dark:bg-dark-bg">
      <div className="max-w-lg rounded-2xl border border-light-border bg-light-card-bg p-6 text-center shadow-2xl dark:border-dark-border dark:bg-dark-card-bg">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {t('embed.error.title')}
        </h1>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          {t('embed.error.description', { slug: slugLabel })}
        </p>
        {onRetry ? (
          <div className="mt-6 flex justify-center">
            <Button variant="primary" onClick={onRetry}>
              {t('embed.error.retry')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
