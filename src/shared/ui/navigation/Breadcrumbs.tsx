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
  <nav aria-label="Breadcrumb" className={cn('flex items-center text-sm text-input-placeholder', className)}>
   <ol className="flex items-center gap-2">
    {items.map((item, index) => {
     const isLast = index === lastIndex;
     const content = item.href && !isLast ? (
      <button
       type="button"
       onClick={() => onNavigate?.(item.href as string)}
       className="text-input-placeholder hover:text-input-text transition-colors"
      >
       {item.label}
      </button>
     ) : (
      <span className={cn(isLast ? 'text-input-text' : '')}>{item.label}</span>
     );
     return (
      <li key={`${item.label}-${index}`} className="flex items-center gap-2">
       {content}
       {!isLast && <span className="text-line-glass/30">{separator}</span>}
      </li>
     );
    })}
   </ol>
  </nav>
 );
};
