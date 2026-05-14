import { useState } from 'preact/hooks';
import { Sidebar } from '@/shared/ui/nav/Sidebar';
import { SidebarProfileMenu } from '@/shared/ui/nav/SidebarProfileMenu';
import { useNavigation } from '@/shared/utils/navigation';
import { signOut } from '@/shared/lib/authClient';
import {
  buildSidebarConfig,
  getPracticeNavConfig,
  type SecondaryNavItem,
  type WorkspaceSection,
} from '@/shared/config/navConfig';

const PRACTICE_AREA_COLORS = ['#10B981', '#06B6D4', '#F59E0B', '#A855F7', '#EF4444'];

export interface PracticeSidebarUser {
  name: string;
  email: string | null;
  image: string | null;
}

export interface PracticeSidebarOrg {
  name: string;
  initial: string;
  /** Defaults to "Practice". */
  subtitle?: string;
}

export interface PracticeSidebarProps {
  practiceSlug: string;
  org: PracticeSidebarOrg;
  user: PracticeSidebarUser | null;
  collapsed: boolean;
  /** When true (mobile drawer), render fully expanded regardless of `collapsed`. */
  forceExpanded?: boolean;
  onToggleCollapsed?: () => void;
  onItemActivate?: () => void;
  /** id of the active rail item, or — when a secondary filter is active — the secondary id. */
  activeItemId: string;
  /** Defaults to 'home'. Drives which rail item gets its secondary children attached. */
  workspaceSection?: WorkspaceSection;
  /** Optional. Called when a secondary sub-item is clicked (filter selection,
   *  settings actions, etc.). When omitted, sub-items navigate via their `href`. */
  onSecondaryItemClick?: (id: string, item: SecondaryNavItem) => void;
  /** Source list for the Practice Areas section. Strings or `{ name | title }` objects. */
  services?: unknown[] | null;
  /** Numeric counts keyed by sidebar item id (e.g. `matters`, `intakes`, `pending_review`).
   *  Top-level rail items render the value as a pill badge; sub-items render it as a small
   *  trailing count. Missing/null entries render no number. */
  counts?: Record<string, number | null | undefined>;
}

const normalizeServiceNames = (services: unknown[] | null | undefined): string[] => {
  if (!Array.isArray(services)) return [];
  const names = services
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') {
        const r = entry as Record<string, unknown>;
        if (typeof r.name === 'string') return r.name;
        if (typeof r.title === 'string') return r.title;
      }
      return '';
    })
    .filter((s): s is string => Boolean(s));
  return Array.from(new Set(names));
};

export const PracticeSidebar = ({
  practiceSlug,
  org,
  user,
  collapsed,
  forceExpanded = false,
  onToggleCollapsed,
  onItemActivate,
  activeItemId,
  workspaceSection = 'home',
  onSecondaryItemClick,
  services,
  counts,
}: PracticeSidebarProps) => {
  const { navigate } = useNavigation();
  const basePath = `/practice/${encodeURIComponent(practiceSlug)}`;
  const navConfig = getPracticeNavConfig(
    { practiceSlug, role: null, canAccessPractice: true },
    workspaceSection,
  );
  const sidebarConfig = buildSidebarConfig(navConfig, workspaceSection);

  const isCollapsed = forceExpanded ? false : collapsed;
  const toggle = forceExpanded ? undefined : onToggleCollapsed;

  const findSecondaryItem = (id: string): SecondaryNavItem | undefined => {
    for (const section of navConfig.secondary ?? []) {
      for (const item of section.items) {
        if (item.id === id) return item;
        const child = item.children?.find((c) => c.id === id);
        if (child) return child;
      }
    }
    return undefined;
  };

  const [practiceAreasExpanded, setPracticeAreasExpanded] = useState(false);
  const uniqueServiceNames = normalizeServiceNames(services);
  const visibleServiceNames = practiceAreasExpanded
    ? uniqueServiceNames
    : uniqueServiceNames.slice(0, 3);
  const practiceAreas = visibleServiceNames.map((name, i) => ({
    name,
    color: PRACTICE_AREA_COLORS[i % PRACTICE_AREA_COLORS.length],
  }));
  const hasMorePracticeAreas = uniqueServiceNames.length > 3;

  return (
    <Sidebar
      activeItemId={activeItemId}
      onItemActivate={onItemActivate}
      collapsed={isCollapsed}
      onToggleCollapsed={toggle}
    >
      <Sidebar.Org
        name={org.name}
        subtitle={org.subtitle ?? 'Practice'}
        logo={
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--accent-500))] text-sm font-bold text-[rgb(var(--accent-foreground))]"
          >
            {org.initial}
          </span>
        }
        onCollapseClick={toggle}
      />
      {sidebarConfig.sections.map((section, idx) => (
        <Sidebar.Section
          key={section.label ?? `section-${idx}`}
          label={section.label}
          first={idx === 0}
        >
          {section.items.map((item) => {
            const children = item.children ?? [];
            const liveCount = counts?.[item.id];
            const resolvedBadge = liveCount != null ? liveCount : item.badge ?? null;
            return (
              <Sidebar.Item
                key={item.id}
                id={item.id}
                label={item.label}
                icon={item.icon}
                href={item.href}
                badge={resolvedBadge}
                variant={item.variant}
                isAction={item.isAction}
                onClick={item.onClick}
                expandable={item.expandable || children.length > 0}
                persistKey={`practice:${item.id}`}
              >
                {(() => {
                  let groupIndex = -1;
                  return children.map((child) => {
                    if (child.isGroupLabel) {
                      groupIndex += 1;
                      return (
                        <Sidebar.SubGroupLabel
                          key={child.id}
                          label={child.label}
                          first={groupIndex === 0}
                        />
                      );
                    }
                    const liveChildCount = counts?.[child.id];
                    return (
                      <Sidebar.SubItem
                        key={child.id}
                        id={child.id}
                        label={child.label}
                        href={child.href}
                        count={liveChildCount != null ? liveChildCount : child.count ?? null}
                        variant={child.variant}
                        isAction={child.isAction}
                        icon={child.icon}
                        onClick={
                          onSecondaryItemClick
                            ? () => {
                                const matched = findSecondaryItem(child.id);
                                if (matched) onSecondaryItemClick(child.id, matched);
                              }
                            : undefined
                        }
                      />
                    );
                  });
                })()}
              </Sidebar.Item>
            );
          })}
        </Sidebar.Section>
      ))}
      {practiceAreas.length > 0 ? (
        <Sidebar.Section label="Practice Areas">
          {practiceAreas.map((pa) => (
            <Sidebar.PracticeAreaItem
              key={pa.name}
              label={pa.name}
              color={pa.color}
              onClick={() => navigate(`${basePath}/coverage`)}
            />
          ))}
          {hasMorePracticeAreas ? (
            <button
              type="button"
              onClick={() => setPracticeAreasExpanded((v) => !v)}
              title={practiceAreasExpanded ? 'Less' : 'More'}
              aria-label={practiceAreasExpanded ? 'Show fewer practice areas' : 'Show more practice areas'}
              aria-expanded={practiceAreasExpanded}
              className={
                isCollapsed
                  ? 'flex h-9 w-full items-center justify-center rounded-lg text-[rgb(var(--sidebar-text-secondary))] transition-colors hover:bg-[rgb(var(--sidebar-hover-bg))] hover:text-[rgb(var(--sidebar-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50'
                  : 'flex items-center gap-2.5 rounded-lg px-2.5 py-[9px] text-left text-xs text-[rgb(var(--sidebar-text-secondary))] transition-colors hover:text-[rgb(var(--sidebar-text))] hover:bg-[rgb(var(--sidebar-hover-bg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50'
              }
            >
              <svg
                aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <circle cx="5" cy="12" r="1" />
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
              </svg>
              {isCollapsed ? null : <span>{practiceAreasExpanded ? 'Less' : 'More'}</span>}
            </button>
          ) : null}
        </Sidebar.Section>
      ) : null}
      {user ? (
        <Sidebar.Footer>
          <SidebarProfileMenu
            user={user}
            collapsed={isCollapsed}
            onAccount={() => navigate(`${basePath}/settings/account`)}
            onInvoices={() => navigate(`${basePath}/invoices`)}
            onSignOut={() => void signOut({ navigate })}
          />
        </Sidebar.Footer>
      ) : null}
    </Sidebar>
  );
};
