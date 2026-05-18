import type { ComponentChildren, FunctionComponent, JSX } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { CircleUser, LogOut, Monitor, Moon, Settings as SettingsIcon, Sun } from 'lucide-preact';
import { Sidebar } from './Sidebar';
import { Avatar } from '@/shared/ui/profile';
import { Icon, type IconComponent } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

type ThemeChoice = 'light' | 'dark' | 'system';

const readStoredTheme = (): ThemeChoice => {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem('theme');
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    // localStorage may be disabled (private mode, quota); fall through.
  }
  return 'system';
};

const applyTheme = (choice: ThemeChoice) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (choice === 'system') {
    try { window.localStorage.removeItem('theme'); } catch { /* ignore */ }
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', prefersDark);
    return;
  }
  try { window.localStorage.setItem('theme', choice); } catch { /* ignore */ }
  document.documentElement.classList.toggle('dark', choice === 'dark');
};

/**
 * Profile menu popover anchored to the sidebar's user row (Pencil `Profile Menu - Desktop`,
 * `f2nxZj`). Click the user row to toggle; click outside or press Esc to close.
 */
export interface SidebarProfileMenuProps {
  user: { name: string; email?: string | null; image?: string | null };
  /** When true, the menu opens as a side-flyout (right of the avatar) with fixed width
   *  so labels don't truncate inside the 64px rail. */
  collapsed?: boolean;
  onAccount?: () => void;
  onSettings?: () => void;
  onSignOut?: () => void;
  className?: string;
}

export const SidebarProfileMenu: FunctionComponent<SidebarProfileMenuProps> = ({
  user,
  collapsed = false,
  onAccount,
  onSettings,
  onSignOut,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setThemeState] = useState<ThemeChoice>(() => readStoredTheme());
  const containerRef = useRef<HTMLDivElement>(null);

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next);
    applyTheme(next);
  }, []);
  // When collapsed, we render the popover with position:fixed and computed coords so
  // it escapes the Sidebar's inner overflow-hidden clipping container.
  const [fixedStyle, setFixedStyle] = useState<JSX.CSSProperties>({});

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !collapsed) return;
    const updatePosition = () => {
      const trigger = containerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setFixedStyle({
        position: 'fixed',
        left: `${rect.right + 12}px`,
        bottom: `${window.innerHeight - rect.bottom}px`,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, collapsed]);

  const select = useCallback((cb?: () => void) => {
    cb?.();
    setIsOpen(false);
  }, []);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Sidebar.UserRow
        name={user.name}
        subtitle={user.email ?? undefined}
        avatar={<Avatar src={user.image ?? null} name={user.name} size="md" />}
        onClick={() => setIsOpen((v) => !v)}
        active={isOpen}
      />
      {isOpen ? (
        <div
          role="menu"
          aria-orientation="vertical"
          aria-label="Profile menu"
          className={
            collapsed
              ? 'z-50 w-60 rounded-xl border p-1 shadow-[0_8px_24px_rgba(0,0,0,0.4)] bg-[rgb(var(--sidebar-menu-bg))] border-[rgb(var(--sidebar-menu-border))]'
              : 'absolute bottom-full left-0 right-0 z-50 mb-2 rounded-xl border p-1 shadow-[0_-4px_24px_rgba(0,0,0,0.4)] bg-[rgb(var(--sidebar-menu-bg))] border-[rgb(var(--sidebar-menu-border))]'
          }
          style={collapsed ? fixedStyle : undefined}
        >
          <div className="flex items-center gap-2.5 px-2 py-2.5">
            <Avatar src={user.image ?? null} name={user.name} size="md" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-medium text-[rgb(var(--sidebar-text))]">{user.name}</span>
              {user.email ? (
                <span className="truncate text-[11px] text-[rgb(var(--sidebar-section-label))]">{user.email}</span>
              ) : null}
            </div>
          </div>
          <Separator />
          <ProfileMenuItem icon={CircleUser} label="Account" onClick={() => select(onAccount)} />
          <ProfileMenuItem icon={SettingsIcon} label="Settings" onClick={() => select(onSettings)} />
          <Separator />
          <ThemeSelector value={theme} onChange={setTheme} />
          <Separator />
          <ProfileMenuItem
            icon={LogOut}
            label="Sign out"
            onClick={() => select(onSignOut)}
            variant="danger"
          />
        </div>
      ) : null}
    </div>
  );
};

const THEME_OPTIONS: Array<{ value: ThemeChoice; label: string; icon: IconComponent }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

const ThemeSelector: FunctionComponent<{
  value: ThemeChoice;
  onChange: (next: ThemeChoice) => void;
}> = ({ value, onChange }) => (
  <div className="px-2 py-1.5">
    <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--sidebar-section-label))]">
      Theme
    </p>
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex items-center gap-1 rounded-md bg-[rgb(var(--sidebar-hover-bg))]/40 p-1"
    >
      {THEME_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
              active
                ? 'bg-[rgb(var(--sidebar-menu-bg))] text-[rgb(var(--sidebar-text))] shadow-sm'
                : 'text-[rgb(var(--sidebar-text-secondary))] hover:text-[rgb(var(--sidebar-text))]',
            )}
          >
            <Icon icon={option.icon} className="h-3.5 w-3.5" aria-hidden />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  </div>
);

const Separator: FunctionComponent = () => (
  <div className="my-1 px-1">
    <div className="h-px bg-[rgb(var(--sidebar-divider))]" />
  </div>
);

const ProfileMenuItem: FunctionComponent<{
  icon: IconComponent;
  label: ComponentChildren;
  onClick: () => void;
  variant?: 'default' | 'danger';
}> = ({ icon, label, onClick, variant = 'default' }) => {
  const isDanger = variant === 'danger';
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'group flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
        isDanger
          ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
          : 'text-[rgb(var(--sidebar-text))] hover:bg-[rgb(var(--sidebar-hover-bg))]',
      )}
    >
      <Icon
        icon={icon}
        className={cn(
          'h-4 w-4',
          isDanger
            ? 'text-red-400 group-hover:text-red-300'
            : 'text-[rgb(var(--sidebar-text-secondary))]',
        )}
      />
      <span>{label}</span>
    </button>
  );
};

export default SidebarProfileMenu;
