import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/utils/cn';
import { LoadingSpinner } from './LoadingSpinner';

export interface LoadingBlockProps {
 label?: string;
 showLabel?: boolean;
 showSpinner?: boolean;
 size?: 'sm' | 'md' | 'lg';
 className?: string;
}

export const LoadingBlock = ({
 label,
 showLabel = false,
 showSpinner = true,
 size = 'md',
 className
}: LoadingBlockProps) => {
 const { t } = useTranslation('common');
 const resolvedLabel = label ?? t('app.loading');

 return (
  <div
   className={cn('flex h-full min-h-0 items-center justify-center', className)}
   role="status"
   aria-live="polite"
  >
   <div className="flex flex-col items-center gap-2">
    {showSpinner ? <LoadingSpinner size={size} ariaLabel={resolvedLabel} /> : null}
    {!showLabel ? <span className="sr-only">{resolvedLabel}</span> : null}
    {showLabel ? <span className="text-sm text-input-placeholder">{resolvedLabel}</span> : null}
   </div>
  </div>
 );
};
