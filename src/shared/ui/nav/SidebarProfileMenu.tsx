import type { ComponentChildren, FunctionComponent, JSX } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { CircleUser, LogOut, Wallet } from 'lucide-preact';
import { Sidebar } from './Sidebar';
import { Avatar } from '@/shared/ui/profile';
import { Icon, type IconComponent } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

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
  onPayments?: () => void;
  onSignOut?: () => void;
  className?: string;
}

export const SidebarProfileMenu: FunctionComponent<SidebarProfileMenuProps> = ({
  user,
  collapsed = false,
  onAccount,
  onPayments,
  onSignOut,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
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
          <ProfileMenuItem icon={Wallet} label="Payments" onClick={() => select(onPayments)} />
          <Separator />
          <ProfileMenuItem icon={LogOut} label="Sign out" onClick={() => select(onSignOut)} />
        </div>
      ) : null}
    </div>
  );
};

const Separator: FunctionComponent = () => (
  <div className="my-1 px-1">
    <div className="h-px bg-[rgb(var(--sidebar-divider))]" />
  </div>
);

const ProfileMenuItem: FunctionComponent<{ icon: IconComponent; label: ComponentChildren; onClick: () => void }> = ({
  icon,
  label,
  onClick,
}) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-[rgb(var(--sidebar-text))] transition-colors hover:bg-[rgb(var(--sidebar-hover-bg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
  >
    <Icon icon={icon} className="h-4 w-4 text-[rgb(var(--sidebar-text-secondary))]" />
    <span>{label}</span>
  </button>
);

export default SidebarProfileMenu;
