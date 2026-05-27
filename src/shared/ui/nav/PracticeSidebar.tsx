import { ArrowLeft, Plus } from 'lucide-preact';
import { Sidebar } from '@/shared/ui/nav/Sidebar';
import { Icon, type IconComponent } from '@/shared/ui/Icon';
import { OrgSwitcherMenu } from '@/shared/ui/nav/OrgSwitcherMenu';
import { SidebarProfileMenu } from '@/shared/ui/nav/SidebarProfileMenu';
import { useNavigation } from '@/shared/utils/navigation';
import { signOut } from '@/shared/utils/auth';
import { Button } from '@/shared/ui/Button';
import ConversationListView from '@/features/chat/views/ConversationListView';
import type { Conversation } from '@/shared/types/conversation';
import {
  buildSidebarConfig,
  getPracticeNavConfig,
  type SecondaryNavItem,
  type WorkspaceSection,
} from '@/shared/config/navConfig';

export interface PracticeSidebarUser {
  name: string;
  email: string | null;
  image: string | null;
}

export interface PracticeSidebarOrg {
  /** When provided, the org row becomes a switcher anchored on this active org. */
  id?: string;
  name: string;
  initial: string;
  /** Defaults to "Practice". */
  subtitle?: string;
  /** Optional slug — present for the switcher to render checkmarks consistently. */
  slug?: string;
  /** Optional uploaded logo URL; falls back to the initials badge when absent. */
  logoUrl?: string | null;
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
  /** Numeric counts keyed by sidebar item id (e.g. `matters`, `intakes`, `pending_review`).
   *  Top-level rail items render the value as a pill badge; sub-items render it as a small
   *  trailing count. Missing/null entries render no number. */
  counts?: Record<string, number | null | undefined>;
  /** Assistant conversations — only used when workspaceSection === 'assistant'. */
  assistantConversations?: Conversation[];
  assistantConversationPreviews?: Record<string, { content: string; role: string; createdAt: string } | undefined>;
  assistantConversationsLoading?: boolean;
  assistantConversationsError?: unknown;
  activeConversationId?: string | null;
  onSelectAssistantConversation?: (conversationId: string) => void;
  onNewAssistantConversation?: () => void;
}

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
  counts,
  assistantConversations = [],
  assistantConversationPreviews = {},
  assistantConversationsLoading = false,
  assistantConversationsError,
  activeConversationId = null,
  onSelectAssistantConversation,
  onNewAssistantConversation,
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

  if (workspaceSection === 'assistant') {
    return (
      <Sidebar
        activeItemId={activeItemId}
        onItemActivate={onItemActivate}
        collapsed={isCollapsed}
        onToggleCollapsed={toggle}
      >
        <Sidebar.Org
          name="Assistant"
          logo={
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--sidebar-hover-bg))] text-[rgb(var(--sidebar-text-secondary))]">
              <Icon icon={ArrowLeft} className="h-4 w-4" />
            </span>
          }
          onClick={() => navigate(basePath)}
          onCollapseClick={toggle}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="px-3 py-2">
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              icon={Plus}
              iconClassName="h-3.5 w-3.5"
              onClick={onNewAssistantConversation}
            >
              New conversation
            </Button>
          </div>
          <ConversationListView
            conversations={assistantConversations}
            previews={assistantConversationPreviews as Record<string, { content: string; role: 'user' | 'system' | 'assistant' | string; createdAt: string } | undefined>}
            isLoading={assistantConversationsLoading}
            error={assistantConversationsError}
            onSelectConversation={onSelectAssistantConversation ?? (() => {})}
            onSendMessage={onNewAssistantConversation ?? (() => {})}
            showSendMessageButton={false}
            activeConversationId={activeConversationId}
          />
        </div>
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
  }

  if (workspaceSection === 'reports' || workspaceSection === 'intakes') {
    const sections = navConfig.secondary ?? [];
    const sectionLabel = workspaceSection === 'reports'
      ? 'Reports'
      : 'Intakes';
    return (
      <Sidebar
        activeItemId={activeItemId}
        onItemActivate={onItemActivate}
        collapsed={isCollapsed}
        onToggleCollapsed={toggle}
      >
        <Sidebar.Org
          name={sectionLabel}
          logo={
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--sidebar-hover-bg))] text-[rgb(var(--sidebar-text-secondary))]">
              <Icon icon={ArrowLeft} className="h-4 w-4" />
            </span>
          }
          onClick={() => navigate(basePath)}
          onCollapseClick={toggle}
        />
        {sections.map((section, idx) => (
          <Sidebar.Section key={section.label ?? `s${idx}`} label={section.label} first={idx === 0}>
            {section.items.map((item) => (
              <Sidebar.Item
                key={item.id}
                id={item.id}
                label={item.label}
                icon={item.icon as IconComponent | undefined}
                href={item.href}
                onClick={
                  onSecondaryItemClick
                    ? () => {
                        const matched = findSecondaryItem(item.id) ?? item;
                        onSecondaryItemClick(item.id, matched);
                      }
                    : undefined
                }
              />
            ))}
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
  }

  if (workspaceSection === 'settings') {
    const settingsSections = navConfig.secondary ?? [];
    return (
      <Sidebar
        activeItemId={activeItemId}
        onItemActivate={onItemActivate}
        collapsed={isCollapsed}
        onToggleCollapsed={toggle}
      >
        <Sidebar.Org
          name="Settings"
          logo={
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--sidebar-hover-bg))] text-[rgb(var(--sidebar-text-secondary))]">
              <Icon icon={ArrowLeft} className="h-4 w-4" />
            </span>
          }
          onClick={() => navigate(basePath)}
          onCollapseClick={toggle}
        />
        {settingsSections.map((section, idx) => (
          <Sidebar.Section key={section.label ?? `s${idx}`} label={section.label} first={idx === 0}>
            {section.items.map((item) => (
              <Sidebar.Item
                key={item.id}
                id={item.id}
                label={item.label}
                icon={item.icon as IconComponent | undefined}
                href={item.href}
                onClick={
                  onSecondaryItemClick
                    ? () => {
                        const matched = findSecondaryItem(item.id) ?? item;
                        onSecondaryItemClick(item.id, matched);
                      }
                    : undefined
                }
              />
            ))}
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
  }

  return (
    <Sidebar
      activeItemId={activeItemId}
      onItemActivate={onItemActivate}
      collapsed={isCollapsed}
      onToggleCollapsed={toggle}
    >
      {org.id ? (
        <OrgSwitcherMenu
          org={{
            id: org.id,
            name: org.name,
            initial: org.initial,
            subtitle: org.subtitle ?? 'Practice',
            logoUrl: org.logoUrl ?? null,
          }}
          collapsed={isCollapsed}
          onCollapseClick={toggle}
        />
      ) : (
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
      )}
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
                expandOnly={item.expandOnly}
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
                        comingSoon={child.comingSoon}
                        onClick={
                          onSecondaryItemClick
                            ? () => {
                                // findSecondaryItem only walks navConfig.secondary, so
                                // children under primary items (e.g. Settings sub-items)
                                // miss. Fall back to the rendered child — handler reads
                                // item.href to navigate.
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
