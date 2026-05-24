import type { ComponentChildren, FunctionComponent } from 'preact';
import { Menu, Search } from 'lucide-preact';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

/**
 * Workspace shell header — Pencil GtRGH-adjacent components `rt13A` (desktop) and
 * `RuuTq` (mobile). Renders as the global app bar above the sidebar/main grid.
 *
 * Composition (desktop): centered page title + search/actions.
 * Composition (mobile): menu button + logo + centered page title + search button.
 */
export interface WorkspaceShellHeaderProps {
  /** Single-letter org initial; rendered in an accent-colored square. */
  orgInitial: string;
  /** Current page title, centered in the global app bar. */
  title: string;
  /** Mobile only: opens the sidebar drawer. */
  onMenuClick?: () => void;
  /** Mobile only: triggered by the search icon button. */
  onSearchClick?: () => void;
  /** Whether to render the desktop search input. Defaults to true. */
  showDesktopSearch?: boolean;
  /** Placeholder text in the desktop search trigger. */
  searchPlaceholder?: string;
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
  onMenuClick,
  onSearchClick,
  showDesktopSearch = true,
  searchPlaceholder = 'Search...',
  searchShortcut = '⌘K',
  desktopActions,
  className,
}) => {
  return (
    <div
      className={cn(
        'w-full bg-[rgb(var(--header-bg))] border-b border-[rgb(var(--header-border))]',
        className,
      )}
    >
      {/* Desktop variant — Pencil rt13A: 64px, padding [24,14], gap 16 */}
      <div className="relative hidden h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-6 lg:grid">
        <div className="flex min-w-0 items-center gap-4 justify-self-start">
          {/* Hide org logo on desktop, already present in sidebar */}
          {/* <Logo initial={orgInitial} size="md" /> */}
        </div>
        <h1 className="min-w-0 max-w-[42vw] justify-self-center truncate text-center text-sm font-semibold text-[rgb(var(--sidebar-text))]">
          {title}
        </h1>
        <div className="flex items-center gap-4 justify-self-end">
          {showDesktopSearch ? (
            <button
              type="button"
              onClick={onSearchClick}
              aria-label={`${searchPlaceholder} (${searchShortcut})`}
              className="flex h-9 w-[220px] items-center gap-2 rounded-lg bg-[rgb(var(--header-search-bg))] px-3 text-left transition-colors hover:bg-[rgb(var(--sidebar-hover-bg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
            >
              <Icon icon={Search} className="h-4 w-4 shrink-0 text-[rgb(var(--sidebar-text-secondary))]" />
              <span className="min-w-0 flex-1 truncate text-xs text-[rgb(var(--sidebar-text-secondary))]">
                {searchPlaceholder}
              </span>
              <span className="shrink-0 rounded bg-[rgb(var(--header-shortcut-bg))] px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--sidebar-text-secondary))]">
                {searchShortcut}
              </span>
            </button>
          ) : null}
          {desktopActions}
        </div>
      </div>

      {/* Mobile variant — Pencil RuuTq: 56px, padding [16,12], gap 12 */}
      <div className="grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 lg:hidden">
        <div className="flex min-w-0 items-center gap-3 justify-self-start">
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
        </div>
        <h1 className="min-w-0 truncate text-center text-sm font-semibold text-[rgb(var(--sidebar-text))]">{title}</h1>
        <div className="flex items-center gap-2 justify-self-end">
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
