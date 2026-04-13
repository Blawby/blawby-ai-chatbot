import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/utils/cn';
import { LoadingSpinner } from './LoadingSpinner';

export interface LoadingScreenProps {
 label?: string;
 showLabel?: boolean;
 showSpinner?: boolean;
 size?: 'sm' | 'md' | 'lg';
 className?: string;
}

export const LoadingScreen = ({
 label,
 showLabel = false,
 showSpinner = true,
 size = 'md',
 className
}: LoadingScreenProps) => {
 const { t } = useTranslation('common');
 const resolvedLabel = label ?? t('app.loading');

 return (
  <div
   className={cn('flex h-screen items-center justify-center', className)}
   role="status"
   aria-live="polite"
  >
   <div className="flex flex-col items-center gap-2">
    {showSpinner ? <LoadingSpinner size={size} ariaLabel={resolvedLabel} announce={false} /> : null}
    {!showSpinner && !showLabel ? <span className="sr-only">{resolvedLabel}</span> : null}
    {showLabel ? <span className="text-sm text-input-placeholder">{resolvedLabel}</span> : null}
   </div>
  </div>
 );
};
