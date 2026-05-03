import type { ComponentChildren, FunctionComponent } from 'preact';
import { Menu, Search } from 'lucide-preact';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

/**
 * Workspace shell header — Pencil GtRGH-adjacent components `rt13A` (desktop) and
 * `RuuTq` (mobile). Renders as the global app bar above the sidebar/main grid.
 *
 * Composition (desktop): logo + breadcrumb/title + search bar.
 * Composition (mobile): menu button + logo + title + search button.
 */
export interface WorkspaceShellHeaderProps {
  /** Single-letter org initial; rendered in an accent-colored square. */
  orgInitial: string;
  /** Current page title (Inter 18/600 desktop, Inter 16/600 mobile). */
  title: string;
  /** Optional breadcrumb segments rendered above the title on desktop. The last
   *  segment is treated as the current page. */
  breadcrumb?: string[];
  /** Mobile only: opens the sidebar drawer. */
  onMenuClick?: () => void;
  /** Mobile only: triggered by the search icon button. */
  onSearchClick?: () => void;
  /** Whether to render the desktop search input. Defaults to true. */
  showDesktopSearch?: boolean;
  /** Placeholder text in the desktop search input. */
  searchPlaceholder?: string;
  /** Fires on every keystroke in the desktop search input (placeholder for the
   *  real search experience). Leave undefined to ignore input. */
  onSearchChange?: (value: string) => void;
  /** Shortcut hint shown in the desktop search badge. */
  searchShortcut?: string;
  /** Right-side slot for desktop, e.g. notification bell + extras. */
  desktopActions?: ComponentChildren;
  className?: string;
}

const Logo: FunctionComponent<{ initial: string; size: 'sm' | 'md' }> = ({ initial, size }) => (
  <span
    aria-hidden="true"
    className={cn(
      'flex shrink-0 items-center justify-center bg-[rgb(var(--accent-500))] font-bold text-[rgb(var(--accent-foreground))]',
      size === 'sm' ? 'h-7 w-7 rounded-md text-sm' : 'h-8 w-8 rounded-lg text-base',
    )}
  >
    {initial}
  </span>
);

export const WorkspaceShellHeader: FunctionComponent<WorkspaceShellHeaderProps> = ({
  orgInitial,
  title,
  breadcrumb,
  onMenuClick,
  onSearchClick,
  showDesktopSearch = true,
  searchPlaceholder = 'Search...',
  onSearchChange,
  searchShortcut = '⌘K',
  desktopActions,
  className,
}) => {
  const trail = breadcrumb && breadcrumb.length > 0 ? breadcrumb : null;

  return (
    <div
      className={cn(
        'w-full bg-[rgb(var(--header-bg))] border-b border-[rgb(var(--header-border))]',
        className,
      )}
    >
      {/* Desktop variant — Pencil rt13A: 64px, padding [24,14], gap 16 */}
      <div className="hidden h-16 items-center justify-between gap-4 px-6 lg:flex">
        <div className="flex min-w-0 items-center gap-4">
          <Logo initial={orgInitial} size="md" />
          <div className="flex min-w-0 flex-col gap-0.5">
            {trail ? (
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[rgb(var(--sidebar-text-secondary))]">
                {trail.map((segment, idx) => {
                  const isLast = idx === trail.length - 1;
                  return (
                    <span key={`${segment}-${idx}`} className="flex items-center gap-1.5">
                      {idx > 0 ? <span className="text-[rgb(var(--sidebar-section-label))]">/</span> : null}
                      <span className={isLast ? 'text-[rgb(var(--sidebar-text-secondary))]' : 'text-[rgb(var(--sidebar-section-label))]'}>
                        {segment}
                      </span>
                    </span>
                  );
                })}
              </div>
            ) : null}
            <span className="truncate text-lg font-semibold text-[rgb(var(--sidebar-text))]">{title}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {showDesktopSearch ? (
            <label className="flex h-9 w-[220px] items-center gap-2 rounded-lg bg-[rgb(var(--header-search-bg))] px-3 transition-colors focus-within:ring-2 focus-within:ring-accent-500/50 hover:bg-[rgb(var(--sidebar-hover-bg))]">
              <Icon icon={Search} className="h-4 w-4 shrink-0 text-[rgb(var(--sidebar-text-secondary))]" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                onInput={onSearchChange ? (e) => onSearchChange((e.currentTarget as HTMLInputElement).value) : undefined}
                className="min-w-0 flex-1 bg-transparent text-xs text-[rgb(var(--sidebar-text))] outline-none placeholder:text-[rgb(var(--sidebar-text-secondary))]"
              />
              <span className="shrink-0 rounded bg-[rgb(var(--header-shortcut-bg))] px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--sidebar-text-secondary))]">
                {searchShortcut}
              </span>
            </label>
          ) : null}
          {desktopActions}
        </div>
      </div>

      {/* Mobile variant — Pencil RuuTq: 56px, padding [16,12], gap 12 */}
      <div className="flex h-14 items-center justify-between gap-3 px-3 lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          {onMenuClick ? (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="Open navigation"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[rgb(var(--sidebar-text-secondary))] transition-colors hover:bg-[rgb(var(--sidebar-hover-bg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
            >
              <Icon icon={Menu} className="h-5 w-5" />
            </button>
          ) : null}
          <Logo initial={orgInitial} size="sm" />
          <span className="truncate text-base font-semibold text-[rgb(var(--sidebar-text))]">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {onSearchClick ? (
            <button
              type="button"
              onClick={onSearchClick}
              aria-label="Search"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[rgb(var(--sidebar-text-secondary))] transition-colors hover:bg-[rgb(var(--sidebar-hover-bg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
            >
              <Icon icon={Search} className="h-[18px] w-[18px]" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default WorkspaceShellHeader;
