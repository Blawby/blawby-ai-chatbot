import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';
import { FileQuestion } from 'lucide-preact';

export interface NotFoundPageProps {
  title?: string;
  description?: string;
  action?: ComponentChildren;
  className?: string;
}

export function NotFoundPage({
  title = 'Page not found',
  description = "The page you're looking for doesn't exist or has been moved.",
  action,
  className,
}: NotFoundPageProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center min-h-[60vh] px-6 text-center', className)}>
      <div className="mb-6 text-input-placeholder/40">
        <FileQuestion size={56} strokeWidth={1.2} />
      </div>
      <h1 className="text-xl font-semibold text-input-text mb-2">{title}</h1>
      <p className="text-sm text-input-placeholder max-w-sm mb-6">{description}</p>
      {action ?? (
        <a href="/" className="btn btn-primary btn-md link-plain">
          Go home
        </a>
      )}
    </div>
  );
}
