import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface ListItemProps {
  icon?: ComponentChildren;
  title: string;
  description?: string;
  trailing?: ComponentChildren;
  onClick?: () => void;
  className?: string;
}

export interface ListProps {
  items: ListItemProps[];
  divided?: boolean;
  className?: string;
}

export function ListItem({
  icon,
  title,
  description,
  trailing,
  onClick,
  className,
}: ListItemProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 w-full text-left rounded-xl transition-colors',
        onClick && 'hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer',
        className,
      )}
    >
      {icon && <span className="shrink-0 text-input-placeholder">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-input-text truncate">{title}</p>
        {description && (
          <p className="text-xs text-input-placeholder truncate">{description}</p>
        )}
      </div>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </Tag>
  );
}

export function List({ items, divided = true, className }: ListProps) {
  return (
    <div role="list" className={cn('flex flex-col', className)}>
      {items.map((item, i) => (
        <div key={i} role="listitem">
          <ListItem {...item} />
          {divided && i < items.length - 1 && (
            <div className="mx-3 border-t border-line-glass/10" />
          )}
        </div>
      ))}
    </div>
  );
}
