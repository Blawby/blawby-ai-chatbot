import type { ComponentType, FunctionComponent, JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { useNavigation } from '@/shared/utils/navigation';
import { cn } from '@/shared/utils/cn';

export interface NavRailItem {
  id: string;
  label: string;
  icon: ComponentType<JSX.SVGAttributes<SVGSVGElement>>;
  href: string;
  badge?: number | null;
  variant?: 'default' | 'danger';
  isAction?: boolean;
  onClick?: () => void;
}

export interface NavRailProps {
  items: NavRailItem[];
  activeHref: string;
  variant: 'rail' | 'bottom';
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

export const NavRail: FunctionComponent<NavRailProps> = ({
  items,
  activeHref,
  variant,
  className,
}) => {
  const location = useLocation();
  const { navigate } = useNavigation();
  const resolvedPath = normalizePath(activeHref || location.path);
  const activeItemId = items.reduce<{ id: string | null; score: number }>((best, item) => {
    if (item.isAction) return best;
    if (!isHrefActive(resolvedPath, item.href)) return best;
    const score = normalizePath(item.href).length;
    if (score > best.score) {
      return { id: item.id, score };
    }
    return best;
  }, { id: null, score: -1 }).id;

  const baseButtonClass = variant === 'rail'
    ? 'btn btn-tab relative h-11 w-11 rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50'
    : 'btn btn-tab relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl border px-2 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50';

  return (
    <div
      className={cn(
        variant === 'rail'
          ? 'flex h-full flex-col items-center gap-2 border-r border-line-glass/30 bg-transparent px-2 py-3'
          : 'grid grid-cols-[repeat(auto-fit,minmax(56px,1fr))] gap-2 bg-transparent px-3 py-2',
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = !item.isAction && activeItemId === item.id;
        const isDanger = item.variant === 'danger';

        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              baseButtonClass,
              isDanger
                ? 'text-red-400 hover:bg-red-500/10'
                : isActive
                  ? 'active nav-item-active'
                  : 'nav-item-inactive backdrop-blur-xl',
            )}
            onClick={() => {
              if (item.isAction) {
                if (!item.onClick) {
                  console.warn(`[NavRail] Item "${item.label}" (id: ${item.id}) is marked as isAction but has no onClick handler.`);
                  return;
                }
                item.onClick();
                return;
              }
              if (item.onClick) {
                item.onClick();
                return;
              }
              navigate(item.href);
            }}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {variant === 'bottom' && <span className="truncate max-w-full">{item.label}</span>}
            {item.badge && item.badge > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-[1.125rem] rounded-full bg-accent-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-[rgb(var(--accent-foreground))]">
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};

export default NavRail;
