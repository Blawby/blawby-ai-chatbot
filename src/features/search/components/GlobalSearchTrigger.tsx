import { Search } from 'lucide-preact';
import { useCommandPalette } from '../contexts/CommandPaletteContext';
import { cn } from '@/shared/utils/cn';

type GlobalSearchTriggerProps = {
  className?: string;
  /** Visual placement context — adjusts padding/typography to fit the host
   *  surface. `rail` is the desktop LeftRail header slot; `drawer` is the
   *  mobile FocusDrawer body. */
  placement?: 'rail' | 'drawer';
  /** Runs immediately before the palette opens. Used by the mobile drawer to
   *  close itself so the palette isn't stacked on top of an open drawer. */
  onBeforeOpen?: () => void;
};

const isMacPlatform = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
    ?? navigator.platform
    ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform);
};

/**
 * Persistent global-search affordance for the workspace shell. Opens the
 * existing command palette via `useCommandPalette()` — there is no parallel
 * search system.
 *
 * Renders nothing when the palette isn't enabled (public/widget surfaces,
 * unauthenticated state, no resolved practice id) so it never appears as a
 * dead button.
 */
export function GlobalSearchTrigger({ className, placement = 'rail', onBeforeOpen }: GlobalSearchTriggerProps) {
  const { open, enabled } = useCommandPalette();
  if (!enabled) return null;

  const shortcutLabel = isMacPlatform() ? '⌘K' : 'Ctrl+K';

  return (
    <button
      type="button"
      onClick={() => {
        onBeforeOpen?.();
        open();
      }}
      aria-label="Open global search"
      aria-keyshortcuts={isMacPlatform() ? 'Meta+K' : 'Control+K'}
      className={cn(
        'group flex w-full items-center gap-2 rounded-lg border text-left transition-colors',
        'border-[rgb(var(--sidebar-border))] bg-[rgb(var(--sidebar-bg))]',
        'text-[rgb(var(--sidebar-text-secondary))]',
        'hover:bg-[rgb(var(--sidebar-hover-bg))] hover:text-[rgb(var(--sidebar-text))]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        placement === 'rail' ? 'px-2.5 py-[7px] text-xs' : 'px-3 py-2.5 text-sm',
        className,
      )}
    >
      <Search
        size={placement === 'rail' ? 14 : 16}
        className="shrink-0"
        aria-hidden="true"
      />
      <span className="flex-1 truncate">Search</span>
      <kbd
        aria-hidden="true"
        className={cn(
          'shrink-0 rounded border px-1.5 font-mono leading-none',
          'border-[rgb(var(--sidebar-border))] text-[rgb(var(--sidebar-text-secondary))]',
          placement === 'rail' ? 'py-0.5 text-[10px]' : 'py-1 text-[11px]',
        )}
      >
        {shortcutLabel}
      </kbd>
    </button>
  );
}
