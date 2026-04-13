import type { FunctionComponent } from 'preact';
import { useLocation } from 'preact-iso';
import { Icon, type IconComponent } from '@/shared/ui/Icon';
import { useNavigation } from '@/shared/utils/navigation';
import { cn } from '@/shared/utils/cn';

export interface NavRailItem {
 id: string;
 label: string;
 icon: IconComponent;
 href: string;
 matchHrefs?: string[];
 badge?: number | null;
 variant?: 'default' | 'danger';
 isAction?: boolean;
 onClick?: () => void;
}

export interface NavRailProps {
 items: NavRailItem[];
 activeHref: string;
 variant: 'rail' | 'bottom';
 showLabels?: boolean;
 hidden?: boolean;
 className?: string;
 onItemActivate?: () => void;
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

const getBestMatchScore = (currentPath: string, item: NavRailItem): number => {
 const targets = (item.matchHrefs?.length ? item.matchHrefs : [item.href]).map(normalizePath);
 let bestScore = -1;
 for (const target of targets) {
  if (!isHrefActive(currentPath, target)) continue;
  bestScore = Math.max(bestScore, target.length);
 }
 return bestScore;
};

export const NavRail: FunctionComponent<NavRailProps> = ({
 items,
 activeHref,
 variant,
 showLabels = false,
 hidden = false,
 className,
 onItemActivate,
}) => {
 const location = useLocation();
 const { navigate } = useNavigation();
 const resolvedPath = normalizePath(activeHref || location.path);
 if (hidden) return null;
 const activeItemId = items.reduce<{ id: string | null; score: number }>((best, item) => {
  if (item.isAction) return best;
  const score = getBestMatchScore(resolvedPath, item);
  if (score < 0) return best;
  if (score > best.score) {
   return { id: item.id, score };
  }
  return best;
 }, { id: null, score: -1 }).id;

 const baseButtonClass = 'relative flex items-center justify-center rounded-xl font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50';
 const layoutClass = variant === 'rail'
  ? 'h-11 w-11'
  : 'min-w-0 flex-1 flex-col gap-1 rounded-2xl px-2 py-2 text-xs';

 const containerClass = variant === 'rail'
  ? 'flex h-full flex-col items-center gap-2 bg-[rgb(var(--nav-surface))] px-3 py-4'
  : 'flex w-full items-center justify-around bg-[rgb(var(--nav-surface))] px-4 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] nav-rail--bottom';

 return (
  <div className={cn(containerClass, className)}>
   {items.map((item) => {
    const icon = item.icon;
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
       layoutClass,
       isDanger
        ? 'text-[rgb(var(--error-foreground))] hover:bg-[rgb(var(--error-foreground))]/10'
        : isActive
         ? 'nav-item-active'
         : 'nav-item-inactive',
      )}
      onClick={() => {
       if (item.isAction) {
        if (!item.onClick) {
         console.warn(`[NavRail] Item "${item.label}" (id: ${item.id}) is marked as isAction but has no onClick handler.`);
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
      }}
     >
      <Icon icon={icon} className="h-5 w-5" />
      {variant === 'bottom' && showLabels ? <span className="truncate max-w-full">{item.label}</span> : null}
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
