import type { ComponentChildren, JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { MoreHorizontal } from 'lucide-preact';
import { Icon, type IconComponent } from '@/shared/ui/Icon';
import { Sidebar } from '@/shared/ui/nav/Sidebar';
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
  const forcedActiveItemId = allItems.find((item) => item.isActive)?.id ?? null;
  const resolvedActiveItemId = forcedActiveItemId ?? activeItemId;

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

  // Desktop delegates to the canonical Sidebar primitive so settings and the
  // rest of the workspace share one source of truth for rail chrome.
  const renderSidebarItem = (item: LeftRailItem) => (
    <Sidebar.Item
      key={item.id}
      id={item.id}
      label={item.label}
      icon={item.icon}
      href={item.href}
      badge={item.badge}
      variant={item.variant}
      isAction={item.isAction}
      onClick={item.onClick}
      prefetch={item.prefetch}
    />
  );

  return (
    <Sidebar
      activeItemId={resolvedActiveItemId}
      onItemActivate={onItemActivate}
      width={240}
      className={className}
    >
      {brandMark ? <Sidebar.Header>{brandMark}</Sidebar.Header> : null}
      {sections?.length ? (
        sections.map((section, index) => (
          <Sidebar.Section key={section.id} label={section.label} first={index === 0}>
            {section.items.map(renderSidebarItem)}
          </Sidebar.Section>
        ))
      ) : (
        <Sidebar.Section first>
          {allItems.map(renderSidebarItem)}
        </Sidebar.Section>
      )}
      {footer ? <Sidebar.Footer>{footer}</Sidebar.Footer> : null}
    </Sidebar>
  );
}
