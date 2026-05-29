import type { ComponentChildren, JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { MoreHorizontal } from 'lucide-preact';
import { Icon, type IconComponent } from '@/shared/ui/Icon';
import { useNavigation } from '@/shared/utils/navigation';
import { cn } from '@/shared/utils/cn';

export interface LeftRailItem {
  id: string;
  label: string;
  icon?: IconComponent;
  href: string;
  matchHrefs?: string[];
  badge?: number | null;
  variant?: 'default' | 'danger';
  isAction?: boolean;
  isActive?: boolean;
  onClick?: () => void;
  /** Fired on hover/focus — preload code chunk + seed data so the click
   *  feels instant. Safe to call repeatedly (idempotent). */
  prefetch?: () => void;
}

export interface LeftRailSection {
  id: string;
  /** Optional section label (mono uppercase small caps). */
  label?: string;
  items: LeftRailItem[];
}

export interface LeftRailProps {
  variant: 'desktop' | 'mobile';
  /** Flat item list. Provide either `items` OR `sections`, not both. */
  items?: LeftRailItem[];
  /** Grouped sections. Each section may render an optional header label. */
  sections?: LeftRailSection[];
  activeHref?: string;
  onItemActivate?: () => void;
  /** Mobile only: when set and rendered items exceed this count, render the
   *  first `maxItems - 1` followed by a "More" overflow button. */
  maxItems?: number;
  onOverflowClick?: () => void;
  overflowLabel?: string;
  /** Desktop only: rendered above the rail items (BrandMark slot). */
  brandMark?: ComponentChildren;
  /** Desktop only: rendered below the rail items (org switcher + profile slot). */
  footer?: ComponentChildren;
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

const getBestMatchScore = (currentPath: string, item: LeftRailItem): number => {
  const targets = (item.matchHrefs?.length ? item.matchHrefs : [item.href]).map(normalizePath);
  let bestScore = -1;
  for (const target of targets) {
    if (!isHrefActive(currentPath, target)) continue;
    bestScore = Math.max(bestScore, target.length);
  }
  return bestScore;
};

const collectItems = (props: Pick<LeftRailProps, 'items' | 'sections'>): LeftRailItem[] => {
  if (props.items?.length) return props.items;
  if (props.sections?.length) {
    return props.sections.flatMap((section) => section.items);
  }
  return [];
};

export function LeftRail(props: LeftRailProps): JSX.Element | null {
  const {
    variant,
    sections,
    activeHref,
    onItemActivate,
    maxItems,
    onOverflowClick,
    overflowLabel = 'More',
    brandMark,
    footer,
    className,
  } = props;

  const location = useLocation();
  const { navigate } = useNavigation();

  const allItems = collectItems(props);
  if (allItems.length === 0 && !brandMark && !footer) return null;

  const resolvedPath = normalizePath(activeHref || location.path);

  const activeItemId = allItems.reduce<{ id: string | null; score: number }>((best, item) => {
    if (item.isAction) return best;
    const score = getBestMatchScore(resolvedPath, item);
    if (score < 0) return best;
    if (score > best.score) return { id: item.id, score };
    return best;
  }, { id: null, score: -1 }).id;

  const getIsActive = (item: LeftRailItem) =>
    item.isActive !== undefined ? item.isActive : (!item.isAction && activeItemId === item.id);

  const handleItemClick = (item: LeftRailItem) => {
    if (item.isAction) {
      if (!item.onClick) {
        console.warn(`[LeftRail] Item "${item.label}" (id: ${item.id}) is marked as isAction but has no onClick handler.`);
        return;
      }
      item.onClick();
      onItemActivate?.();
      return;
    }
    if (item.onClick) {
      item.onClick();
      onItemActivate?.();
      return;
    }
    navigate(item.href);
    onItemActivate?.();
  };

  if (variant === 'mobile') {
    const flat = allItems;
    const shouldOverflow = typeof maxItems === 'number' && flat.length > maxItems;
    const rendered = shouldOverflow ? flat.slice(0, maxItems - 1) : flat;

    return (
      <nav className={cn('left-rail-mobile', className)} aria-label="Primary">
        {rendered.map((item) => {
          const isActive = getIsActive(item);
          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'left-rail-mobile-item',
                isActive && 'active',
                item.variant === 'danger' && 'danger'
              )}
              onMouseEnter={item.prefetch}
              onFocus={item.prefetch}
              onClick={() => handleItemClick(item)}
            >
              {item.icon && <Icon icon={item.icon} className="h-5 w-5" />}
              <span className="left-rail-mobile-label">{item.label}</span>
              {item.badge && item.badge > 0 && (
                <span className="left-rail-badge" aria-label={`${item.badge} unread`}>{item.badge}</span>
              )}
            </button>
          );
        })}
        {shouldOverflow && (
          <button
            type="button"
            aria-label={overflowLabel}
            className="left-rail-mobile-item"
            onClick={() => {
              onOverflowClick?.();
              onItemActivate?.();
            }}
          >
            <Icon icon={MoreHorizontal} className="h-5 w-5" />
            <span className="left-rail-mobile-label">{overflowLabel}</span>
          </button>
        )}
      </nav>
    );
  }

  // Desktop variant — 240px sticky rail
  const renderItem = (item: LeftRailItem) => {
    const isActive = getIsActive(item);
    return (
      <button
        key={item.id}
        type="button"
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'left-rail-item',
          isActive && 'active',
          item.variant === 'danger' && 'danger'
        )}
        onMouseEnter={item.prefetch}
        onFocus={item.prefetch}
        onClick={() => handleItemClick(item)}
      >
        {item.icon && <Icon icon={item.icon} className="h-4 w-4 shrink-0" />}
        <span className="left-rail-item-label">{item.label}</span>
        {item.badge && item.badge > 0 && (
          <span className="left-rail-badge" aria-label={`${item.badge} unread`}>{item.badge}</span>
        )}
      </button>
    );
  };

  return (
    <aside className={cn('left-rail', className)} aria-label="Primary">
      {brandMark && <div className="left-rail-brand">{brandMark}</div>}
      <div className="left-rail-scroll">
        {sections?.length ? (
          sections.map((section) => (
            <div key={section.id} className="left-rail-section">
              {section.label && (
                <div className="left-rail-section-label">{section.label}</div>
              )}
              {section.items.map(renderItem)}
            </div>
          ))
        ) : (
          <div className="left-rail-section">
            {allItems.map(renderItem)}
          </div>
        )}
      </div>
      {footer && <div className="left-rail-footer">{footer}</div>}
    </aside>
  );
}
