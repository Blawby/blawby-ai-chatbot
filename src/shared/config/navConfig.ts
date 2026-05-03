import type { ComponentType } from 'preact';
import {
  Bell,
  Briefcase,
  Building2,
  ClipboardList,
  Contact,
  CreditCard,
  Folder,
  Home,
  LifeBuoy,
  MessageSquare,
  Palette,
  Puzzle,
  Shield,
  TrendingUp,
  User,
  Users,
} from 'lucide-preact';
import { SettingsNavIcon } from '@/shared/ui/nav/SettingsNavIcon';
import { CONTACTS_DIRECTORY_LABEL } from '@/shared/domain/contacts';
import type { PracticeRole } from '@/shared/utils/practiceRoles';
import { getPreferencesCategory } from '@/shared/lib/preferencesApi';

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

export type NavCtx = {
  practiceSlug: string;
  role: PracticeRole | 'client' | null;
  canAccessPractice: boolean;
};

export type WorkspaceSection = 'home' | 'conversations' | 'intakes' | 'engagements' | 'matters' | 'invoices' | 'reports' | 'settings';



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
};

export const MATTERS_FILTER_MAP: Record<string, string[]> = {
  all: [],
  new: ['first_contact', 'intake_pending', 'conflict_check', 'eligibility'],
  active: ['consultation_scheduled', 'engagement_pending', 'active', 'pleadings_filed', 'discovery', 'mediation', 'pre_trial', 'trial'],
  closing: ['order_entered', 'appeal_pending'],
  closed: ['closed'],
  declined: ['declined', 'conflicted', 'referred'],
};

export const CLIENT_MATTERS_FILTER_MAP: Record<string, string[]> = {
  all: [],
  active: MATTERS_FILTER_MAP.active,
  closed: MATTERS_FILTER_MAP.closed,
};

export const PRACTICE_INVOICES_FILTER_MAP: Record<string, string[]> = {
  all: [],
  draft: ['draft'],
  sent: ['sent'],
  open: ['open'],
  overdue: ['overdue'],
  paid: ['paid'],
  void: ['void'],
};

export const CLIENT_INVOICES_FILTER_MAP: Record<string, string[]> = {
  all: [],
  unpaid: ['open', 'overdue'],
  paid: ['paid'],
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
    id: 'matters',
    label: 'Matters',
    icon: Briefcase,
    href: `${basePath}/matters`,
    // /engagements lives under Matters in the unified sidebar (per Pencil GtRGH).
    matchHrefs: [`${basePath}/matters`, `${basePath}/engagements`],
    expandable: true,
    prefetch: prefetchMattersChunk,
  },
  {
    id: 'conversations',
    label: 'Inbox',
    icon: MessageSquare,
    href: `${basePath}/conversations`,
    matchHrefs: [`${basePath}/conversations`],
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
    id: 'intakes',
    label: 'Intakes',
    icon: Contact,
    href: `${basePath}/intakes`,
    matchHrefs: [`${basePath}/intakes`],
    expandable: true,
    prefetch: prefetchIntakesChunk,
  },
  {
    id: 'files',
    label: 'Files',
    icon: Folder,
    href: `${basePath}/files`,
    matchHrefs: [`${basePath}/files`],
    expandable: true,
  },
  {
    id: 'invoices',
    label: 'Payments',
    icon: CreditCard,
    href: `${basePath}/invoices`,
    matchHrefs: [`${basePath}/invoices`],
    expandable: true,
    prefetch: prefetchPracticeInvoicesChunk,
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: TrendingUp,
    href: `${basePath}/reports`,
    matchHrefs: [`${basePath}/reports`],
    expandable: true,
    prefetch: prefetchReportsChunk,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: SettingsNavIcon,
    href: `${basePath}/settings/general`,
    matchHrefs: [`${basePath}/settings`],
    expandable: true,
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
    expandable: true,
    prefetch: prefetchClientMattersChunk,
  },
  {
    id: 'conversations',
    label: 'Inbox',
    icon: MessageSquare,
    href: `${basePath}/conversations`,
    matchHrefs: [`${basePath}/conversations`],
  },
  {
    id: 'invoices',
    label: 'Payments',
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
    prefetch: prefetchSettingsLanding,
  },
];

const buildConversationsSecondary = (basePath: string, workspace: 'practice' | 'client'): NavSection[] => {
  if (workspace === 'practice') {
    return [{
      label: 'Inbox',
      items: [
        { id: 'your-inbox', label: 'Your Inbox', href: `${basePath}/conversations` },
        { id: 'assigned-to-me', label: 'Assigned to me', href: `${basePath}/conversations` },
        { id: 'mentions', label: 'Mentions', href: `${basePath}/conversations` },
        { id: 'all', label: 'All', href: `${basePath}/conversations` },
        { id: 'unassigned', label: 'Unassigned', href: `${basePath}/conversations` },
      ],
    }];
  }
  return [{
    label: 'Inbox',
    items: [
      { id: 'your-inbox', label: 'Your Inbox', href: `${basePath}/conversations` },
      { id: 'all', label: 'All', href: `${basePath}/conversations` },
    ],
  }];
};

const buildMattersSecondary = (basePath: string, workspace: 'practice' | 'client'): NavSection[] => {
  if (workspace === 'practice') {
    return [{
      label: 'Stage',
      items: [
        // Engagements is a peer route but lives under Matters in the unified sidebar (Pencil GtRGH).
        { id: 'engagements', label: 'Engagements', href: `${basePath}/engagements` },
        { id: 'all', label: 'All', href: `${basePath}/matters` },
        { id: 'new', label: 'New', href: `${basePath}/matters` },
        { id: 'active', label: 'Active', href: `${basePath}/matters` },
        { id: 'closing', label: 'Closing', href: `${basePath}/matters` },
        { id: 'closed', label: 'Closed', href: `${basePath}/matters` },
        { id: 'declined', label: 'Declined', href: `${basePath}/matters` },
      ],
    }];
  }
  return [{
    label: 'Stage',
    items: [
      { id: 'all', label: 'All', href: `${basePath}/matters` },
      { id: 'active', label: 'Active', href: `${basePath}/matters` },
      { id: 'closed', label: 'Closed', href: `${basePath}/matters` },
    ],
  }];
};

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

const buildReportsSecondary = (basePath: string, workspace: 'practice' | 'client'): NavSection[] | undefined => {
  if (workspace !== 'practice') return undefined;
  return [{
    label: 'Reports',
    items: [
      { id: 'all-reports', label: 'All reports', href: `${basePath}/reports` },
      { id: 'payroll-matter-activity', label: 'Payroll & Matter Activity', href: `${basePath}/reports/payroll-matter-activity` },
      { id: 'trust-reconciliation', label: 'Trust Reconciliation', href: `${basePath}/reports/trust-reconciliation` },
      { id: 'stale-matters', label: 'Stale Matters', href: `${basePath}/reports/stale-matters` },
    ],
  }];
};

const buildInvoicesSecondary = (basePath: string, workspace: 'practice' | 'client'): NavSection[] => {
  if (workspace === 'practice') {
    return [{
      label: 'Status',
      items: [
        { id: 'all', label: 'All', href: `${basePath}/invoices` },
        { id: 'draft', label: 'Draft', href: `${basePath}/invoices` },
        { id: 'sent', label: 'Sent', href: `${basePath}/invoices` },
        { id: 'open', label: 'Open', href: `${basePath}/invoices` },
        { id: 'overdue', label: 'Overdue', href: `${basePath}/invoices` },
        { id: 'paid', label: 'Paid', href: `${basePath}/invoices` },
        { id: 'void', label: 'Void', href: `${basePath}/invoices` },
      ],
    }];
  }
  return [{
    label: 'Status',
    items: [
      { id: 'all', label: 'All', href: `${basePath}/invoices` },
      { id: 'unpaid', label: 'Unpaid', href: `${basePath}/invoices` },
      { id: 'paid', label: 'Paid', href: `${basePath}/invoices` },
    ],
  }];
};

const buildSettingsSecondary = (basePath: string, canAccessPractice: boolean): NavSection[] => {
  // Pencil GtRGH > settingsSubItems: PERSONAL / ACCOUNT / PRACTICE / SUPPORT
  const sections: NavSection[] = [
    {
      label: 'Personal',
      items: [
        { id: 'general', label: 'Appearance', href: `${basePath}/settings/general`, icon: Palette },
        { id: 'notifications', label: 'Notifications', href: `${basePath}/settings/notifications`, icon: Bell },
      ],
    },
    {
      label: 'Account',
      items: [
        { id: 'security', label: 'Security', href: `${basePath}/settings/security`, icon: Shield },
        { id: 'account', label: 'Profile', href: `${basePath}/settings/account`, icon: User },
      ],
    },
  ];

  if (canAccessPractice) {
    sections.push({
      label: 'Practice',
      items: [
        { id: 'practice', label: 'Practice', href: `${basePath}/settings/practice`, icon: Building2 },
        { id: 'practice-coverage', label: 'Intake Forms', href: `${basePath}/settings/practice/coverage`, icon: ClipboardList },
        { id: 'practice-payouts', label: 'Payouts', href: `${basePath}/settings/practice/payouts`, icon: CreditCard },
        { id: 'practice-team', label: 'Team', href: `${basePath}/settings/practice/team`, icon: Users },
        { id: 'apps', label: 'Apps', href: `${basePath}/settings/apps`, icon: Puzzle },
      ],
    });
  }

  sections.push({
    label: 'Support',
    items: [{ id: 'help', label: 'Help', href: `${basePath}/settings/help`, icon: LifeBuoy }],
  });

  sections.push({
    items: [
      {
        id: 'sign-out',
        label: 'Sign out',
        isAction: true,
        variant: 'danger',
      },
    ],
  });

  return sections;
};

const buildIntakesSecondary = (basePath: string): NavSection[] => [{
  label: 'Intakes',
  items: [
    { id: 'forms', label: 'Forms', href: `${basePath}/intakes` },
    { id: 'all', label: 'All responses', href: `${basePath}/intakes/responses` },
    { id: 'pending_review', label: 'Pending', href: `${basePath}/intakes/responses` },
    { id: 'accepted', label: 'Accepted', href: `${basePath}/intakes/responses` },
    { id: 'declined', label: 'Declined', href: `${basePath}/intakes/responses` },
  ],
}];

const buildSecondary = (basePath: string, section: WorkspaceSection, workspace: 'practice' | 'client', canAccessPractice: boolean): NavSection[] | undefined => {
  switch (section) {
    case 'conversations':
      return buildConversationsSecondary(basePath, workspace);
    case 'intakes':
      return workspace === 'practice' ? buildIntakesSecondary(basePath) : undefined;
    case 'matters':
      return buildMattersSecondary(basePath, workspace);
    case 'invoices':
      return buildInvoicesSecondary(basePath, workspace);
    case 'reports':
      return buildReportsSecondary(basePath, workspace);
    case 'settings':
      return buildSettingsSecondary(basePath, canAccessPractice);
    case 'home':
      return buildHomeSecondary(basePath, workspace);
    case 'engagements':
      return undefined;
    default:
      return undefined;
  }
};

export function getPracticeNavConfig(ctx: NavCtx, section: WorkspaceSection = 'home'): NavConfig {
  const basePath = buildPracticeBase(ctx.practiceSlug);
  return {
    rail: buildPracticeRail(basePath),
    secondary: buildSecondary(basePath, section, 'practice', true),
  };
}

export function getClientNavConfig(ctx: NavCtx, section: WorkspaceSection = 'home'): NavConfig {
  const basePath = buildClientBase(ctx.practiceSlug);
  return {
    rail: buildClientRail(basePath),
    secondary: buildSecondary(basePath, section, 'client', false),
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
  invoices: 'invoices',
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
      });
      if (item.children?.length) visit(item.children);
    }
  };
  // Only render group headings when the secondary actually has multiple groups
  // (e.g. Settings: Personal/Account/Practice/Support). For single-group dropdowns
  // the parent rail item already names them — duplicating "Inbox", "Stage", etc.
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
    return isCurrent && secondaryChildren.length
      ? { ...railItem, children: secondaryChildren }
      : railItem;
  });
  return { sections: [{ label: 'Platform', items }] };
}
