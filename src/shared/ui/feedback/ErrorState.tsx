import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';
import { AlertCircle } from 'lucide-preact';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  icon?: ComponentChildren;
  onRetry?: () => void;
  retryLabel?: string;
  action?: ComponentChildren;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'An unexpected error occurred. Please try again.',
  icon,
  onRetry,
  retryLabel = 'Try again',
  action,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}>
      <div className="mb-4 text-red-400/70">
        {icon ?? <AlertCircle size={40} strokeWidth={1.5} />}
      </div>
      <h3 className="text-sm font-medium text-input-text mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-input-placeholder max-w-xs">{description}</p>
      )}
      <div className="mt-4">
        {action ?? (onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="btn btn-secondary btn-sm"
          >
            {retryLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
