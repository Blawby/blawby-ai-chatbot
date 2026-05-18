import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export type TabItem = {
  id: string;
  label: string;
  count?: number;
};

interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange?: (id: string) => void;
  className?: string;
  actions?: ComponentChildren;
}

export const Tabs = ({ items, activeId, onChange, className = '', actions }: TabsProps) => (
  <div className={cn('tabs', className)}>
    <div className="tabs__row">
      <div className="tabs__list" role="tablist">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-active={isActive ? 'true' : 'false'}
              onClick={() => onChange?.(item.id)}
              className="tabs__tab"
            >
              {item.label}
              {typeof item.count === 'number' && (
                <span className="tabs__count">{item.count}</span>
              )}
            </button>
          );
        })}
      </div>
      {actions && <div className="tabs__actions">{actions}</div>}
    </div>
  </div>
);
