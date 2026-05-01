import { useEffect, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/utils/cn';
import { LoadingSpinner } from './LoadingSpinner';

export interface LoadingScreenProps {
  label?: string;
  showLabel?: boolean;
  showSpinner?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /**
   * Minimum delay in ms before rendering the spinner. Renders nothing
   * until that many ms have passed since mount, so loads that finish
   * inside the window never flash a spinner. Default 0 (render immediately).
   * Recommend 200 for full-screen boots after the user has seen any UI.
   */
  minDurationMs?: number;
}

export const LoadingScreen = ({
  label,
  showLabel = false,
  showSpinner = true,
  size = 'md',
  className,
  minDurationMs = 0,
}: LoadingScreenProps) => {
  const { t } = useTranslation('common');
  const resolvedLabel = label ?? t('app.loading');
  const [visible, setVisible] = useState(minDurationMs <= 0);

  useEffect(() => {
    if (minDurationMs <= 0) return;
    const id = setTimeout(() => setVisible(true), minDurationMs);
    return () => clearTimeout(id);
  }, [minDurationMs]);

  if (!visible) return null;

  return (
    <div
      className={cn('flex h-screen items-center justify-center', className)}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-2">
        {showSpinner ? <LoadingSpinner size={size} ariaLabel={resolvedLabel} announce={false} /> : null}
        {!showLabel ? <span className="sr-only">{resolvedLabel}</span> : null}
        {showLabel ? <span className="text-sm text-input-placeholder">{resolvedLabel}</span> : null}
      </div>
    </div>
  );
};
