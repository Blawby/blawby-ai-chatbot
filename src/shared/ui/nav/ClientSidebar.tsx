import { Sparkles } from 'lucide-preact';
import { Sidebar } from '@/shared/ui/nav/Sidebar';
import { SidebarProfileMenu } from '@/shared/ui/nav/SidebarProfileMenu';
import { useNavigation } from '@/shared/utils/navigation';
import { signOut } from '@/shared/utils/auth';
import {
  buildSidebarConfig,
  getClientNavConfig,
  type SecondaryNavItem,
  type WorkspaceSection,
} from '@/shared/config/navConfig';

export interface ClientSidebarUser {
  name: string;
  email: string | null;
  image: string | null;
}

export interface ClientSidebarOrg {
  name: string;
  initial: string;
  /** Defaults to "Client Portal". */
  subtitle?: string;
}

export interface ClientSidebarProps {
  practiceSlug: string;
  org: ClientSidebarOrg;
  user: ClientSidebarUser | null;
  collapsed: boolean;
  /** When true (mobile drawer), render fully expanded regardless of `collapsed`. */
  forceExpanded?: boolean;
  onToggleCollapsed?: () => void;
  onItemActivate?: () => void;
  /** id of the active rail item, or — when a secondary filter is active — the secondary id. */
  activeItemId: string;
  /** Defaults to 'home'. Drives which rail item gets its secondary children attached. */
  workspaceSection?: WorkspaceSection;
  /** Optional. Called when a secondary sub-item is clicked. When omitted, sub-items navigate via their `href`. */
  onSecondaryItemClick?: (id: string, item: SecondaryNavItem) => void;
  /** When true, prepend an "Upgrade to Practice" CTA item under the primary section. */
  showUpgradeItem?: boolean;
  /** Required when `showUpgradeItem` is true. */
  onUpgradeClick?: () => void;
}

export const ClientSidebar = ({
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
  showUpgradeItem = false,
  onUpgradeClick,
}: ClientSidebarProps) => {
  const { navigate } = useNavigation();
  const basePath = `/client/${encodeURIComponent(practiceSlug)}`;
  const navConfig = getClientNavConfig(
    { practiceSlug, role: 'client', canAccessPractice: false },
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

  return (
    <Sidebar
      activeItemId={activeItemId}
      onItemActivate={onItemActivate}
      collapsed={isCollapsed}
      onToggleCollapsed={toggle}
    >
      <Sidebar.Org
        name={org.name}
        subtitle={org.subtitle ?? 'Client Portal'}
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
            return (
              <Sidebar.Item
                key={item.id}
                id={item.id}
                label={item.label}
                icon={item.icon}
                href={item.href}
                badge={item.badge ?? null}
                variant={item.variant}
                isAction={item.isAction}
                onClick={item.onClick}
                expandable={item.expandable || children.length > 0}
                expandOnly={item.expandOnly}
                persistKey={`client:${item.id}`}
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
                    return (
                      <Sidebar.SubItem
                        key={child.id}
                        id={child.id}
                        label={child.label}
                        href={child.href}
                        count={child.count ?? null}
                        variant={child.variant}
                        isAction={child.isAction}
                        icon={child.icon}
                        onClick={
                          onSecondaryItemClick
                            ? () => {
                                // findSecondaryItem only walks navConfig.secondary, so
                                // children that live under a primary item (e.g. Settings
                                // sub-items) miss. Fall back to the rendered child — it
                                // already carries the href the handler navigates with.
                                const matched = findSecondaryItem(child.id) ?? child;
                                onSecondaryItemClick(child.id, matched);
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
          {idx === 0 && showUpgradeItem ? (
            <Sidebar.Item
              id="upgrade"
              icon={Sparkles}
              label="Upgrade to Practice"
              onClick={onUpgradeClick}
            />
          ) : null}
        </Sidebar.Section>
      ))}
      {user ? (
        <Sidebar.Footer>
          <SidebarProfileMenu
            user={user}
            collapsed={isCollapsed}
            onAccount={() => navigate(`${basePath}/settings/account`)}
            onSettings={() => navigate(`${basePath}/settings/general`)}
            onSignOut={() => void signOut({ navigate })}
          />
        </Sidebar.Footer>
      ) : null}
    </Sidebar>
  );
};
