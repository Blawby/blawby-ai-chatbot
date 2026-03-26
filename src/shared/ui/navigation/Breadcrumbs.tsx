import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  onNavigate?: (href: string) => void;
  className?: string;
  separator?: ComponentChildren;
}

export const Breadcrumbs = ({
  items,
  onNavigate,
  className = '',
  separator = '/'
}: BreadcrumbsProps) => {
  const lastIndex = items.length - 1;
  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center text-sm text-gray-500', className)}>
      <ol className="flex items-center gap-2">
        {items.map((item, index) => {
          const isLast = index === lastIndex;
          const content = item.href && !isLast ? (
            <button
              type="button"
              onClick={() => onNavigate?.(item.href as string)}
              className="text-gray-600 hover:text-input-text dark:text-gray-400 dark:hover:text-gray-200"
            >
              {item.label}
            </button>
          ) : (
            <span className={cn(isLast ? 'text-input-text' : '')}>{item.label}</span>
          );
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {content}
              {!isLast && <span className="text-gray-300 dark:text-gray-600">{separator}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
