import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';

interface WorkspacePracticeDetailsErrorProps {
  practiceSlug?: string;
  onRetry?: () => void;
}

export function WorkspacePracticeDetailsError({
  practiceSlug,
  onRetry
}: WorkspacePracticeDetailsErrorProps) {
  const { t } = useTranslation();
  const slugLabel = practiceSlug ? ` "${practiceSlug}"` : '';
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const retryButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (onRetry && retryButtonRef.current) {
      retryButtonRef.current.focus();
    } else {
      dialogRef.current?.focus();
    }
  }, [onRetry]);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-base p-4"
      role="alertdialog"
      aria-labelledby="workspace-error-heading"
      aria-describedby="workspace-error-desc"
      tabIndex={-1}
      ref={dialogRef}
    >
      <div className="max-w-lg rounded-2xl border border-line-default bg-surface-card p-6 text-center shadow-2xl">
        <h1 id="workspace-error-heading" className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {t('workspace.error.title')}
        </h1>
        <p id="workspace-error-desc" className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          {t('workspace.error.description', { slug: slugLabel })}
        </p>
        {onRetry ? (
          <div className="mt-6 flex justify-center">
            <Button variant="primary" onClick={onRetry} ref={retryButtonRef}>
              {t('workspace.error.retry')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
