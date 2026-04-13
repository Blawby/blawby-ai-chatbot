import { cn } from '@/shared/utils/cn';
import { useTranslation } from 'react-i18next';

export interface LoadingSpinnerProps {
 className?: string;
 size?: 'sm' | 'md' | 'lg';
 ariaLabel?: string;
 announce?: boolean;
}

export const LoadingSpinner = ({
 className = '',
 size = 'md',
 ariaLabel,
 announce = true,
}: LoadingSpinnerProps) => {
 const { t } = useTranslation('common');

 const sizeClasses = {
  sm: 'h-3 w-3 border-2',
  md: 'h-4 w-4 border-2',
  lg: 'h-6 w-6 border-2'
 };
 const resolvedAriaLabel = ariaLabel ?? t('app.loading');

 return (
  <div
   className={cn('inline-flex items-center justify-center', className)}
   {...(announce ? { role: 'status', 'aria-live': 'polite' } : {})}
  >
   {announce
    ? <span className="sr-only">{resolvedAriaLabel}</span>
    : <span aria-hidden="true" />}
   <div
    aria-hidden="true"
    className={cn(
     'rounded-full animate-spin border-[rgb(var(--accent-foreground))] border-t-transparent',
     sizeClasses[size]
    )}
   />
  </div>
 );
};
