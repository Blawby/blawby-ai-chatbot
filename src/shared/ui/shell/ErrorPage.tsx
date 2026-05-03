import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';
import { AlertOctagon } from 'lucide-preact';

export interface ErrorPageProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  action?: ComponentChildren;
  className?: string;
}

export function ErrorPage({
  title = 'Something went wrong',
  description = "We hit an unexpected error. Please try again, or contact support if the problem persists.",
  onRetry,
  action,
  className,
}: ErrorPageProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center min-h-[60vh] px-6 text-center', className)}>
      <div className="mb-6 text-red-400/60">
        <AlertOctagon size={56} strokeWidth={1.2} />
      </div>
      <h1 className="text-xl font-semibold text-input-text mb-2">{title}</h1>
      <p className="text-sm text-input-placeholder max-w-sm mb-6">{description}</p>
      {action ?? (
        <div className="flex items-center gap-3">
          {onRetry && (
            <button type="button" onClick={onRetry} className="btn btn-primary btn-md">
              Try again
            </button>
          )}
          <a href="/" className="btn btn-secondary btn-md link-plain">
            Go home
          </a>
        </div>
      )}
    </div>
  );
}
