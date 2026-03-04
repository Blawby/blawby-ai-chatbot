import type { FunctionComponent } from 'preact';
import { useLocation } from 'preact-iso';
import { useNavigation } from '@/shared/utils/navigation';
import type { NavSection } from '@/shared/config/navConfig';
import { cn } from '@/shared/utils/cn';

export interface SecondaryPanelProps {
  sections: NavSection[];
  activeHref?: string;
  activeItemId?: string | null;
  onSelect?: (id: string) => void;
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
  onItemActivate,
  className,
}) => {
  const location = useLocation();
  const { navigate } = useNavigation();
  const resolvedPath = normalizePath(activeHref || location.path);
  const resolvedActiveItemId = activeItemId ?? sections
    .flatMap((section) => section.items)
    .reduce<{ id: string | null; score: number }>((best, item) => {
      if (!isHrefActive(resolvedPath, item.href)) return best;
      const score = normalizePath(item.href).length;
      if (score > best.score) {
        return { id: item.id, score };
      }
      return best;
    }, { id: null, score: -1 }).id;

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
              {section.items.map((item) => {
                const isActive = resolvedActiveItemId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
                      isActive
                        ? 'bg-accent-500/10 text-accent-400'
                        : 'text-input-text hover:bg-white/5'
                    )}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => {
                      if (onSelect) {
                        onSelect(item.id);
                        onItemActivate?.();
                        return;
                      }
                      navigate(item.href);
                      onItemActivate?.();
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
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default SecondaryPanel;
