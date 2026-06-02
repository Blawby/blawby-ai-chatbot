import type { ComponentType } from 'preact';
import {
  Bell,
  Briefcase,
  Building2,
  Calendar as CalendarIcon,
  CheckSquare,
  Contact,
  CreditCard,
  FileText,
  Folder,
  Home,
  LifeBuoy,
  Map,
  MessageSquare,
  Monitor,
  Palette,
  Puzzle,
  Shield,
  Sparkles,
  TrendingUp,
  User,
  Users,
  Wallet,
} from 'lucide-preact';
import { SettingsNavIcon } from '@/shared/ui/nav/SettingsNavIcon';
import { CONTACTS_DIRECTORY_LABEL } from '@/shared/domain/contacts';
import type { PracticeRole } from '@/shared/utils/practiceRoles';
import { getPreferencesCategory } from '@/shared/lib/preferencesApi';
import {
  REPORT_DEFINITIONS,
  ALL_REPORTS_HUB_ID,
  DELIVERIES_SECTION_ID,
} from '@/features/reports/config/reportCollection';

/**
 * Prefetch helpers for nav items. Fired on hover/focus so the route's code
 * chunk and seed data are already in cache by the time the user clicks.
 * Both `import()` and `queryCache.coalesceGet` (used by the preferences API)
 * are idempotent — calling these repeatedly is safe.
 */
const prefetchLazyChunk = (loader: () => Promise<unknown>) => () => {
  // Swallow errors silently — a failed prefetch doesn't break the click.
  // The lazy boundary will retry on actual navigation and surface the
  // error there.
  loader().catch(() => { /* ignore */ });
};

const prefetchSettingsLanding = () => {
  void getPreferencesCategory('general');
};

const prefetchMattersChunk = prefetchLazyChunk(
  () => import('@/features/matters/pages/PracticeMattersPage')
);
const prefetchClientMattersChunk = prefetchLazyChunk(
  () => import('@/features/matters/pages/ClientMattersPage')
);
const prefetchIntakesChunk = prefetchLazyChunk(
  () => import('@/features/intake/pages/IntakesPage')
);
const prefetchIntakeFormsChunk = prefetchLazyChunk(
  () => import('@/features/intake/pages/IntakeTemplatesPage')
);
const prefetchPracticeInvoicesChunk = prefetchLazyChunk(
  () => import('@/features/invoices/pages/PracticeInvoicesPage')
);
const prefetchClientInvoicesChunk = prefetchLazyChunk(
  () => import('@/features/invoices/pages/ClientInvoicesPage')
);
const prefetchReportsChunk = prefetchLazyChunk(
  () => import('@/features/reports/pages/PracticeReportsPage')
);
const prefetchPracticeContactsChunk = prefetchLazyChunk(
  () => import('@/features/clients/pages/PracticeContactsPage')
);
const prefetchPracticeFilesChunk = prefetchLazyChunk(
  () => import('@/features/files/pages/PracticeFilesPage')
);
const prefetchClientFilesChunk = prefetchLazyChunk(
  () => import('@/features/files/pages/ClientFilesPage')
);
const prefetchEngagementsChunk = prefetchLazyChunk(
  () => import('@/features/engagements/pages/EngagementsPage')
);
const prefetchTrustChunk = prefetchLazyChunk(
  () => import('@/features/trust/pages/PracticeTrustPage')
);
const prefetchTasksChunk = prefetchLazyChunk(
  () => import('@/features/tasks/pages/PracticeTasksPage')
);
const prefetchCalendarChunk = prefetchLazyChunk(
  () => import('@/features/calendar/pages/PracticeCalendarPage')
);

export type NavCtx = {
  practiceSlug: string;
  role: PracticeRole | 'client' | null;
  canAccessPractice: boolean;
};

export type WorkspaceSection = 'home' | 'conversations' | 'intakes' | 'engagements' | 'matters' | 'files' | 'invoices' | 'reports' | 'settings' | 'coverage' | 'assistant' | 'trust' | 'tasks' | 'calendar';



export type NavRailItem = {
  id: string;
  label: string;
  icon: ComponentType<unknown>;
  href: string;
  matchHrefs?: string[];
  badge?: number | null;
  variant?: 'default' | 'danger';
  isAction?: boolean;
  onClick?: () => void;
  /** If true, the unified Sidebar renders an expand chevron even when the item
   *  currently has no children attached (e.g. another section is active). */
  expandable?: boolean;
  /** If true, clicking the item in the desktop Sidebar only toggles its dropdown
   *  and does NOT navigate to `href`. Useful for "container" items whose only
   *  purpose is to reveal sub-items (e.g. Settings). Mobile bottom nav (NavRail)
   *  still navigates to `href` as usual. */
  expandOnly?: boolean;
  /** Fired on hover/focus — preload code chunk + seed data so the click
   *  feels instant. Idempotent. */
  prefetch?: () => void;
};

export type SecondaryNavItem = {
  id: string;
  label: string;
  href?: string;
  badge?: number | null;
  children?: SecondaryNavItem[];
  variant?: 'default' | 'danger';
  isAction?: boolean;
  icon?: ComponentType<unknown>;
  /** Renders a small muted "Coming soon" pill next to the label. Used for
   *  report entries that depend on a backend endpoint not yet shipped. */
  comingSoon?: boolean;
  /** Fired on hover/focus — preload data for this sub-page. Idempotent. */
  prefetch?: () => void;
};

export type NavSection = {
  label?: string;
  items: SecondaryNavItem[];
};

export type NavConfig = {
  rail: NavRailItem[];
  secondary?: NavSection[];
  /** Pre-computed Settings secondary, always attached to the Settings rail item
   *  in buildSidebarConfig regardless of current section — so clicking Settings
   *  expands inline instead of waiting for a navigation to attach children. */
  settingsChildren?: SidebarChild[];
};

export type ConversationAssignedToFilter = 'none' | null;

export const PRACTICE_CONVERSATIONS_ASSIGNED_TO_MAP: Record<string, ConversationAssignedToFilter> = {
  'your-inbox': null,
  'assigned-to-me': null,
  mentions: null,
  all: null,
  unassigned: 'none',
};

export const CLIENT_CONVERSATIONS_ASSIGNED_TO_MAP: Record<string, ConversationAssignedToFilter> = {
  'your-inbox': null,
  all: null,
};

const buildPracticeBase = (slug: string) => `/practice/${encodeURIComponent(slug)}`;
const buildClientBase = (slug: string) => `/client/${encodeURIComponent(slug)}`;

const buildPracticeRail = (basePath: string): NavRailItem[] => [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    href: basePath,
    matchHrefs: [basePath, `${basePath}/setup`],
  },
  {
    id: 'assistant',
    label: 'Assistant',
    icon: Sparkles,
    href: `${basePath}/assistant`,
    matchHrefs: [`${basePath}/assistant`],
  },
  {
    id: 'matters',
    label: 'Matters',
    icon: Briefcase,
    href: `${basePath}/matters`,
    matchHrefs: [`${basePath}/matters`],
    prefetch: prefetchMattersChunk,
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: CheckSquare,
    href: `${basePath}/tasks`,
    matchHrefs: [`${basePath}/tasks`],
    prefetch: prefetchTasksChunk,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: CalendarIcon,
    href: `${basePath}/calendar`,
    matchHrefs: [`${basePath}/calendar`],
    prefetch: prefetchCalendarChunk,
  },
  {
    id: 'engagements',
    label: 'Engagements',
    icon: FileText,
    href: `${basePath}/engagements`,
    matchHrefs: [`${basePath}/engagements`],
    prefetch: prefetchEngagementsChunk,
  },
  {
    id: 'intakes',
    label: 'Intakes',
    icon: Contact,
    href: `${basePath}/intakes/responses`,
    matchHrefs: [`${basePath}/intakes`],
    expandable: true,
    prefetch: prefetchIntakesChunk,
  },
  {
    id: 'contacts',
    label: 'Contacts',
    icon: Users,
    href: `${basePath}/contacts`,
    matchHrefs: [`${basePath}/contacts`],
    prefetch: prefetchPracticeContactsChunk,
  },
  {
    id: 'conversations',
    label: 'Messages',
    icon: MessageSquare,
    href: `${basePath}/conversations`,
    matchHrefs: [`${basePath}/conversations`],
  },
  {
    id: 'files',
    label: 'Files',
    icon: Folder,
    href: `${basePath}/files`,
    matchHrefs: [`${basePath}/files`],
    prefetch: prefetchPracticeFilesChunk,
  },
  {
    id: 'invoices',
    label: 'Invoices',
    icon: CreditCard,
    href: `${basePath}/invoices`,
    matchHrefs: [`${basePath}/invoices`],
    prefetch: prefetchPracticeInvoicesChunk,
  },
  {
    id: 'trust',
    label: 'Trust',
    icon: Wallet,
    href: `${basePath}/trust`,
    matchHrefs: [`${basePath}/trust`],
    prefetch: prefetchTrustChunk,
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: TrendingUp,
    href: `${basePath}/reports`,
    matchHrefs: [`${basePath}/reports`],
    prefetch: prefetchReportsChunk,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: SettingsNavIcon,
    href: `${basePath}/settings/general`,
    matchHrefs: [`${basePath}/settings`, `${basePath}/coverage`],
    expandable: true,
    expandOnly: true,
    prefetch: prefetchSettingsLanding,
  },
];

const buildClientRail = (basePath: string): NavRailItem[] => [
  { id: 'home', label: 'Home', icon: Home, href: basePath, matchHrefs: [basePath] },
  {
    id: 'matters',
    label: 'Matters',
    icon: Briefcase,
    href: `${basePath}/matters`,
    matchHrefs: [`${basePath}/matters`],
    prefetch: prefetchClientMattersChunk,
  },
  {
    id: 'conversations',
    label: 'Messages',
    icon: MessageSquare,
    href: `${basePath}/conversations`,
    matchHrefs: [`${basePath}/conversations`],
  },
  {
    id: 'intakes',
    label: 'Intake Forms',
    icon: Contact,
    href: `${basePath}/intakes`,
    matchHrefs: [`${basePath}/intakes`],
    prefetch: prefetchIntakesChunk,
  },
  {
    id: 'files',
    label: 'Files',
    icon: Folder,
    href: `${basePath}/files`,
    matchHrefs: [`${basePath}/files`],
    prefetch: prefetchClientFilesChunk,
  },
  {
    id: 'invoices',
    label: 'Invoices',
    icon: CreditCard,
    href: `${basePath}/invoices`,
    matchHrefs: [`${basePath}/invoices`],
    expandable: true,
    prefetch: prefetchClientInvoicesChunk,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: SettingsNavIcon,
    href: `${basePath}/settings/general`,
    matchHrefs: [`${basePath}/settings`],
    expandable: true,
    expandOnly: true,
    prefetch: prefetchSettingsLanding,
  },
];

const buildHomeSecondary = (basePath: string, workspace: 'practice' | 'client'): NavSection[] | undefined => {
  if (workspace !== 'practice') return undefined;
  return [{
    label: 'Home',
    items: [
      { id: 'overview', label: 'Overview', href: `${basePath}` },
      {
        id: 'contacts',
        label: CONTACTS_DIRECTORY_LABEL,
        children: [
          { id: 'contacts-all', label: 'All', href: `${basePath}/contacts` },
          { id: 'contacts-clients', label: 'Clients', href: `${basePath}/contacts/clients` },
          { id: 'contacts-pending', label: 'Pending', href: `${basePath}/contacts/pending` },
          { id: 'contacts-team', label: 'Team', href: `${basePath}/contacts/team` },
          { id: 'contacts-archived', label: 'Archived', href: `${basePath}/contacts/archived` },
        ],
      },
    ],
  }];
};

const buildConversationsSecondary = (basePath: string, workspace: 'practice' | 'client'): NavSection[] => {
  if (workspace === 'practice') {
    return [{
      label: 'Messages',
      items: [
        { id: 'all', label: 'All', href: `${basePath}/conversations` },
        { id: 'your-inbox', label: 'Yours', href: `${basePath}/conversations` },
        { id: 'unassigned', label: 'Unassigned', href: `${basePath}/conversations` },
      ],
    }];
  }

  return [{
    label: 'Messages',
    items: [
      { id: 'all', label: 'All', href: `${basePath}/conversations` },
      { id: 'your-inbox', label: 'Unread', href: `${basePath}/conversations` },
    ],
  }];
};

const buildReportsSecondary = (basePath: string, workspace: 'practice' | 'client'): NavSection[] | undefined => {
  if (workspace !== 'practice') return undefined;
  const reportItems: SecondaryNavItem[] = REPORT_DEFINITIONS.map((def) => ({
    id: def.id,
    label: def.title,
    href: `${basePath}/reports/${def.id}`,
    comingSoon: def.phase === 3,
  }));
  return [{
    label: 'Reports',
    items: [
      { id: ALL_REPORTS_HUB_ID, label: 'All reports', href: `${basePath}/reports` },
      ...reportItems,
      { id: DELIVERIES_SECTION_ID, label: 'Deliveries', href: `${basePath}/reports/deliveries` },
    ],
  }];
};

const buildSettingsSecondary = (basePath: string, canAccessPractice: boolean): NavSection[] => {
  // Settings shell IA follows the redesign files: practice-first for practice
  // workspaces, then intelligence, then account-level controls.
  const sections: NavSection[] = [
    {
      label: 'Account',
      items: [
        { id: 'security', label: 'Security', href: `${basePath}/settings/security`, icon: Shield },
        { id: 'sessions', label: 'Sessions', href: `${basePath}/settings/sessions`, icon: Monitor },
        { id: 'general', label: 'Appearance', href: `${basePath}/settings/general`, icon: Palette },
        { id: 'notifications', label: 'Notifications', href: `${basePath}/settings/notifications`, icon: Bell },
        { id: 'audit-log', label: 'Audit log', href: `${basePath}/settings/audit-log`, icon: FileText },
        { id: 'export-data', label: 'Export data', href: `${basePath}/settings/export-data`, icon: Folder },
        { id: 'account', label: 'Profile', href: `${basePath}/settings/account`, icon: User },
      ],
    },
  ];

  if (canAccessPractice) {
    sections.unshift({
      label: 'Practice',
      items: [
        { id: 'practice', label: 'Profile & areas', href: `${basePath}/settings/practice`, icon: Building2 },
        { id: 'practice-team', label: 'Team', href: `${basePath}/settings/practice/team`, icon: Users },
        { id: 'practice-payouts', label: 'Payouts & billing', href: `${basePath}/settings/practice/payouts`, icon: CreditCard },
      ],
    });
    sections.splice(1, 0, {
      label: 'Intelligence',
      items: [
        { id: 'intelligence', label: 'AI behavior', href: `${basePath}/settings/practice/intelligence`, icon: Sparkles },
        { id: 'engagement-templates', label: 'Engagement templates', href: `${basePath}/settings/practice/engagement-templates`, icon: FileText },
        { id: 'coverage', label: 'Coverage', href: `${basePath}/coverage`, icon: Map },
        { id: 'apps', label: 'Apps & integrations', href: `${basePath}/settings/apps`, icon: Puzzle },
      ],
    });
  }

  sections.push({
    label: 'Support',
    items: [{ id: 'help', label: 'Help', href: `${basePath}/settings/help`, icon: LifeBuoy }],
  });

  return sections;
};

const buildIntakesSecondary = (basePath: string): NavSection[] => [
  {
    label: 'Intakes',
    items: [
      { id: 'responses', label: 'Responses', href: `${basePath}/intakes/responses`, icon: Contact },
      {
        id: 'forms',
        label: 'Forms',
        href: `${basePath}/intakes/forms`,
        icon: FileText,
        prefetch: prefetchIntakeFormsChunk,
      },
    ],
  },
];

const buildSecondary = (basePath: string, section: WorkspaceSection, workspace: 'practice' | 'client', canAccessPractice: boolean): NavSection[] | undefined => {
  switch (section) {
    case 'conversations':
      return buildConversationsSecondary(basePath, workspace);
    case 'intakes':
      return workspace === 'practice' ? buildIntakesSecondary(basePath) : undefined;
    case 'reports':
      return buildReportsSecondary(basePath, workspace);
    case 'settings':
      return buildSettingsSecondary(basePath, canAccessPractice);
    case 'home':
      return buildHomeSecondary(basePath, workspace);
    default:
      return undefined;
  }
};

export function getPracticeNavConfig(ctx: NavCtx, section: WorkspaceSection = 'home'): NavConfig {
  const basePath = buildPracticeBase(ctx.practiceSlug);
  return {
    rail: buildPracticeRail(basePath),
    secondary: buildSecondary(basePath, section, 'practice', true),
    settingsChildren: flattenSecondary(buildSettingsSecondary(basePath, true)),
  };
}

export function getClientNavConfig(ctx: NavCtx, section: WorkspaceSection = 'home'): NavConfig {
  const basePath = buildClientBase(ctx.practiceSlug);
  return {
    rail: buildClientRail(basePath),
    secondary: buildSecondary(basePath, section, 'client', false),
    settingsChildren: flattenSecondary(buildSettingsSecondary(basePath, false)),
  };
}

export function getSettingsNavConfig(ctx: NavCtx): NavConfig {
  const usePracticeBase = ctx.canAccessPractice && ctx.role !== 'client';
  const basePath = usePracticeBase
    ? buildPracticeBase(ctx.practiceSlug)
    : buildClientBase(ctx.practiceSlug);

  return {
    rail: usePracticeBase ? buildPracticeRail(basePath) : buildClientRail(basePath),
    secondary: buildSettingsSecondary(basePath, usePracticeBase),
    settingsChildren: flattenSecondary(buildSettingsSecondary(basePath, usePracticeBase)),
  };
}

// ---------------------------------------------------------------------------
// Sidebar (unified) — derived from rail + secondary for the new Sidebar primitive.
// Pencil GtRGH semantics: every rail item renders as a top-level Sidebar.Item; the
// rail item matching the current section gets `secondary` items as expandable children.
// ---------------------------------------------------------------------------

export type SidebarChild = {
  id: string;
  label: string;
  href?: string;
  badge?: number | null;
  count?: number | null;
  variant?: 'default' | 'danger';
  isAction?: boolean;
  icon?: ComponentType<unknown>;
  /** Renders this child as a group heading + separator instead of a button. */
  isGroupLabel?: boolean;
  /** Renders a small muted pill next to the label. */
  comingSoon?: boolean;
};

export type SidebarItem = NavRailItem & {
  children?: SidebarChild[];
};

export type SidebarSection = { label?: string; items: SidebarItem[] };

export type SidebarConfig = {
  sections: SidebarSection[];
};

/**
 * Map a rail item id to the WorkspaceSection it represents.
 * Used to attach secondary items as children of the matching rail item.
 *
 * Note: 'home' is intentionally excluded — Home is a single, non-expandable button
 * (per Pencil GtRGH); contacts/overview filters render in the page body, not the sidebar.
 */
const RAIL_ID_TO_SECTION: Record<string, WorkspaceSection> = {
  conversations: 'conversations',
  intakes: 'intakes',
  engagements: 'engagements',
  matters: 'matters',
  tasks: 'tasks',
  calendar: 'calendar',
  files: 'files',
  invoices: 'invoices',
  trust: 'trust',
  reports: 'reports',
  settings: 'settings',
};

/**
 * Flatten a NavSection[] tree into a single list of sub-items for the Sidebar.
 * Section labels become group-label entries (rendered as headings in the Sidebar).
 * Nested children (e.g. contacts > all) are flattened with their parent.
 */
function flattenSecondary(sections: NavSection[]): SidebarChild[] {
  const out: SidebarChild[] = [];
  const visit = (items: SecondaryNavItem[]) => {
    for (const item of items) {
      out.push({
        id: item.id,
        label: item.label,
        href: item.href,
        badge: item.badge,
        variant: item.variant,
        isAction: item.isAction,
        icon: item.icon,
        comingSoon: item.comingSoon,
      });
      if (item.children?.length) visit(item.children);
    }
  };
  // Only render group headings when the secondary actually has multiple groups
  // (e.g. Settings: Personal/Account/Practice/Support). For single-group dropdowns
  // the parent rail item already names them — duplicating "Messages", "Stage", etc.
  // above the items adds noise.
  const labeledSectionCount = sections.filter((s) => s.label).length;
  const showGroupLabels = labeledSectionCount > 1;
  sections.forEach((section, index) => {
    if (section.label && showGroupLabels) {
      out.push({
        id: `__group__${section.label}__${index}`,
        label: section.label,
        isGroupLabel: true,
      });
    }
    visit(section.items);
  });
  return out;
}

/**
 * Build the unified SidebarConfig from rail + section-scoped secondary.
 * Returns a single "Platform" section (no label by default) — additional sections
 * (e.g. "Practice Areas") can be appended by the caller.
 */
export function buildSidebarConfig(navConfig: NavConfig, currentSection: WorkspaceSection): SidebarConfig {
  const secondaryChildren = navConfig.secondary?.length ? flattenSecondary(navConfig.secondary) : [];
  const items: SidebarItem[] = navConfig.rail.map((railItem) => {
    const railSection = RAIL_ID_TO_SECTION[railItem.id];
    const isCurrent = railSection === currentSection;
    if (isCurrent && secondaryChildren.length) {
      return { ...railItem, children: secondaryChildren };
    }
    // The Settings rail item always carries its full child list so a click
    // expands the dropdown inline (instead of forcing a navigation just to
    // reveal the children). Other rail items keep the current behavior:
    // children only appear once that section is active.
    if (railItem.id === 'settings' && navConfig.settingsChildren?.length) {
      return { ...railItem, children: navConfig.settingsChildren };
    }
    return railItem;
  });
  return { sections: [{ label: 'Platform', items }] };
}
