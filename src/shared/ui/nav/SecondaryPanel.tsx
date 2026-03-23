import type { FunctionComponent } from 'preact';
import { useLocation } from 'preact-iso';
import { useMemo, useState, useCallback } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import type { NavSection, SecondaryNavItem } from '@/shared/config/navConfig';
import { cn } from '@/shared/utils/cn';

export interface SecondaryPanelProps {
  sections: NavSection[];
  activeHref?: string;
  activeItemId?: string | null;
  onSelect?: (id: string) => void;
  onActionItemClick?: (item: SecondaryNavItem) => void;
  onItemActivate?: () => void;
  className?: string;
}

const normalizePath = (value: string): string => {
  if (!value) return '/';
  const path = value.split('?')[0].split('#')[0] || '/';
  return path !== '/' ? path.replace(/\/+$/, '') : '/';
};

const isHrefActive = (currentPath: string, itemHref: string): boolean => {
  const current = normalizePath(currentPath);
  const target = normalizePath(itemHref);
  return current === target || current.startsWith(`${target}/`);
};

export const SecondaryPanel: FunctionComponent<SecondaryPanelProps> = ({
  sections,
  activeHref,
  activeItemId,
  onSelect,
  onActionItemClick,
  onItemActivate,
  className,
}) => {
  const location = useLocation();
  const { navigate } = useNavigation();
  const resolvedPath = normalizePath(activeHref || location.path);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const flattenItems = useCallback((items: SecondaryNavItem[]): SecondaryNavItem[] =>
    items.flatMap((item) => [item, ...(item.children ? flattenItems(item.children) : [])]), []);
  const allItems = useMemo(
    () => sections.flatMap((section) => flattenItems(section.items)),
    [flattenItems, sections]
  );
  const resolvedActiveItemId = activeItemId ?? allItems
    .reduce<{ id: string | null; score: number }>((best, item) => {
      if (!item.href || !isHrefActive(resolvedPath, item.href)) return best;
      const score = normalizePath(item.href).length;
      if (score > best.score) {
        return { id: item.id, score };
      }
      return best;
    }, { id: null, score: -1 }).id;
  const hasActiveDescendant = (item: SecondaryNavItem): boolean => {
    if (!item.children || item.children.length === 0) return false;
    return item.children.some((child) => child.id === resolvedActiveItemId || hasActiveDescendant(child));
  };
  const renderItem = (item: SecondaryNavItem, depth = 0) => {
    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
    const isGroupLabel = hasChildren && !item.href;
    const childActive = hasActiveDescendant(item);
    const isExpanded = hasChildren && (isGroupLabel ? true : (expandedIds[item.id] ?? childActive));
    const isActive = resolvedActiveItemId === item.id;
    const indentClass = depth === 0 ? '' : 'pl-4';
    const isDanger = item.variant === 'danger';

    return (
      <div key={item.id} className={cn('flex flex-col gap-1', indentClass)}>
        {isGroupLabel ? (
          <div
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-input-placeholder"
            title={item.label}
          >
            <span className="truncate">{item.label}</span>
            {item.badge && item.badge > 0 ? (
              <span className="ml-2 rounded-full bg-accent-600 px-2 py-0.5 text-[10px] font-bold leading-none text-[rgb(var(--accent-foreground))]">
                {item.badge}
              </span>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            className={cn(
              'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
              isDanger
                ? 'text-red-400 hover:bg-red-500/10'
                : isActive
                  ? 'nav-item-active'
                  : 'nav-item-inactive'
            )}
            aria-current={isActive && !item.isAction ? 'page' : undefined}
            aria-expanded={hasChildren ? isExpanded : undefined}
            onClick={() => {
              if (item.isAction) {
                if (onActionItemClick) {
                  onActionItemClick(item);
                  onItemActivate?.();
                  return;
                }
              }
              if (hasChildren) {
                setExpandedIds((prev) => ({ ...prev, [item.id]: !isExpanded }));
                if (item.href) {
                  if (onSelect) onSelect(item.id);
                  else navigate(item.href);
                  onItemActivate?.();
                }
                return;
              }
              if (onSelect) {
                onSelect(item.id);
                onItemActivate?.();
                return;
              }
              if (item.href) {
                navigate(item.href);
                onItemActivate?.();
              }
            }}
            title={item.label}
          >
            <span className="truncate">{item.label}</span>
            {item.badge && item.badge > 0 ? (
              <span className="ml-2 rounded-full bg-accent-600 px-2 py-0.5 text-[10px] font-bold leading-none text-[rgb(var(--accent-foreground))]">
                {item.badge}
              </span>
            ) : null}
          </button>
        )}
        {hasChildren && isExpanded ? (
          <div className="ml-1 flex flex-col gap-1">
            {(item.children ?? []).map((child) => renderItem(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <aside className={cn('h-full min-h-0 overflow-y-auto bg-surface-nav-secondary px-4 py-4', className)}>
      <nav className="flex min-h-0 flex-col gap-5">
        {sections.map((section, idx) => (
          <div key={`${section.label ?? 'section'}-${idx}`} className="flex flex-col gap-2">
            {section.label ? (
              <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-input-placeholder">
                {section.label}
              </h2>
            ) : null}
            <div className="flex flex-col gap-1">
              {section.items.map((item) => renderItem(item))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default SecondaryPanel;
