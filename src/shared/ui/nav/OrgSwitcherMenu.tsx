import type { ComponentChildren, FunctionComponent, JSX } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Check, Plus, Building2, ChevronsUpDown } from 'lucide-preact';
import { Sidebar } from './Sidebar';
import { Icon } from '@/shared/ui/Icon';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { cn } from '@/shared/utils/cn';
import { useNavigation } from '@/shared/utils/navigation';
import {
  authClient,
  getSession,
  useListOrganizations,
} from '@/shared/lib/authClient';
import { CreatePracticeDialog } from '@/features/practice-onboarding/components/CreatePracticeDialog';

export interface OrgSwitcherOrg {
  id: string;
  name: string;
  initial: string;
  /** Defaults to "Practice". */
  subtitle?: string;
  /** Optional logo URL — falls back to a colored initial badge. */
  logoUrl?: string | null;
}

type MembershipRecord = {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
  // The org plugin tags client memberships with a role on the membership row;
  // we use this to decide whether to route to /practice/ or /client/.
  role?: string | null;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const unwrapOrgList = (raw: unknown): MembershipRecord[] => {
  if (!raw) return [];
  const data = isPlainObject(raw) && 'data' in raw ? (raw as { data: unknown }).data : raw;
  if (!Array.isArray(data)) return [];
  return data
    .filter(isPlainObject)
    .map((record) => ({
      id: typeof record.id === 'string' ? record.id : null,
      name: typeof record.name === 'string' ? record.name : null,
      slug: typeof record.slug === 'string' ? record.slug : null,
      role: typeof record.role === 'string' ? record.role : null,
    }));
};

const initialFor = (name: string | null | undefined): string => {
  const ch = name?.trim().charAt(0);
  return ch ? ch.toUpperCase() : '?';
};

const subtitleFor = (role: string | null | undefined): string =>
  role === 'client' ? 'Client portal' : 'Practice';

const routeFor = (slug: string, role: string | null | undefined): string =>
  role === 'client'
    ? `/client/${encodeURIComponent(slug)}`
    : `/practice/${encodeURIComponent(slug)}`;

export interface OrgSwitcherMenuProps {
  /** Currently-active org rendered as the trigger row. */
  org: OrgSwitcherOrg;
  /** When true, anchor as a fixed flyout to the right of the trigger (collapsed rail). */
  collapsed?: boolean;
  /** Forwards to Sidebar.Org so the row's collapse button still works. */
  onCollapseClick?: () => void;
  className?: string;
}

export const OrgSwitcherMenu: FunctionComponent<OrgSwitcherMenuProps> = ({
  org,
  collapsed = false,
  onCollapseClick,
  className,
}) => {
  const { navigate } = useNavigation();
  const [isOpen, setIsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const orgsHook = useListOrganizations() as { data?: unknown; isPending?: boolean };
  const memberships = unwrapOrgList(orgsHook?.data);
  const loading = Boolean(orgsHook?.isPending);

  // Match the SidebarProfileMenu pattern: fixed positioning when collapsed so
  // the menu escapes the sidebar's overflow-hidden inner container.
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
        top: `${rect.top}px`,
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

  const handleSelect = useCallback(
    async (membership: MembershipRecord) => {
      const targetId = typeof membership.id === 'string' ? membership.id : null;
      if (!targetId) return;
      if (targetId === org.id) {
        setIsOpen(false);
        return;
      }
      setSwitchingId(targetId);
      try {
        await authClient.organization.setActive({ organizationId: targetId });
        await getSession().catch(() => undefined);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:session-updated'));
        }
        setIsOpen(false);
        if (membership.slug) {
          navigate(routeFor(membership.slug, membership.role));
        }
      } catch (error) {
        // Better Auth surfaces typed errors in its response envelope; in practice
        // an explicit toast belongs upstream in the caller. Keep the menu open so
        // the user can retry without losing context.
        console.warn('[OrgSwitcherMenu] Failed to switch active organization', error);
      } finally {
        setSwitchingId(null);
      }
    },
    [navigate, org.id]
  );

  const triggerLogo = (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[rgb(var(--accent-500))] text-sm font-bold text-[rgb(var(--accent-foreground))]"
    >
      {org.logoUrl ? (
        <img src={org.logoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        org.initial
      )}
    </span>
  );

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Sidebar.Org
        name={org.name}
        subtitle={org.subtitle ?? 'Practice'}
        logo={triggerLogo}
        onClick={() => setIsOpen((v) => !v)}
        onCollapseClick={onCollapseClick}
      />
      {isOpen ? (
        <div
          role="menu"
          aria-label="Switch practice"
          className={
            collapsed
              ? 'z-50 w-72 rounded-xl border p-1 shadow-[0_8px_24px_rgba(0,0,0,0.4)] bg-[rgb(var(--sidebar-menu-bg))] border-[rgb(var(--sidebar-menu-border))]'
              : 'absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border p-1 shadow-[0_8px_24px_rgba(0,0,0,0.4)] bg-[rgb(var(--sidebar-menu-bg))] border-[rgb(var(--sidebar-menu-border))]'
          }
          style={collapsed ? fixedStyle : undefined}
        >
          <div className="px-2 pb-1 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--sidebar-section-label))]">
              Switch practice
            </p>
          </div>
          {loading && memberships.length === 0 ? (
            <div className="flex items-center justify-center px-2 py-4">
              <LoadingSpinner size="sm" ariaLabel="Loading practices" />
            </div>
          ) : memberships.length === 0 ? (
            <div className="px-2 py-3 text-[12px] text-[rgb(var(--sidebar-text-secondary))]">
              You&apos;re not a member of any practice yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5 px-1 py-1">
              {memberships.map((membership) => {
                const id = membership.id ?? '';
                const isActive = id === org.id;
                const name = membership.name ?? 'Untitled practice';
                const isSwitching = switchingId === id;
                return (
                  <li key={id || name}>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      onClick={() => {
                        void handleSelect(membership);
                      }}
                      disabled={isSwitching}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
                        isActive
                          ? 'bg-[rgb(var(--sidebar-hover-bg))] text-[rgb(var(--sidebar-text))]'
                          : 'text-[rgb(var(--sidebar-text))] hover:bg-[rgb(var(--sidebar-hover-bg))]'
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[rgb(var(--accent-500))] text-[11px] font-bold text-[rgb(var(--accent-foreground))]"
                      >
                        {initialFor(name)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{name}</span>
                        <span className="truncate text-[11px] text-[rgb(var(--sidebar-text-secondary))]">
                          {subtitleFor(membership.role)}
                        </span>
                      </span>
                      {isActive ? (
                        <Icon icon={Check} className="h-4 w-4 text-accent-utility" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Separator />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              setCreateOpen(true);
            }}
            className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-[rgb(var(--sidebar-text))] transition-colors hover:bg-[rgb(var(--sidebar-hover-bg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
          >
            <Icon icon={Plus} className="h-4 w-4 text-[rgb(var(--sidebar-text-secondary))]" aria-hidden />
            <span>Create practice</span>
          </button>
        </div>
      ) : null}
      <CreatePracticeDialog isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
};

const Separator: FunctionComponent = () => (
  <div className="my-1 px-1">
    <div className="h-px bg-[rgb(var(--sidebar-divider))]" />
  </div>
);

// Re-export icon used in chrome elsewhere to keep tree-shaken imports stable.
export const OrgSwitcherIcons = { Building2, ChevronsUpDown };

export type OrgSwitcherChildren = ComponentChildren;
export default OrgSwitcherMenu;
