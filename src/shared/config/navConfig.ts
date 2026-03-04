import type { ComponentType, JSX } from 'preact';
import {
  ChatBubbleOvalLeftEllipsisIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  HomeIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import type { UserDetailStatus } from '@/shared/lib/apiClient';
import type { PracticeRole } from '@/shared/utils/practiceRoles';

export type NavCtx = {
  practiceSlug: string;
  role: PracticeRole | 'client' | null;
  canAccessPractice: boolean;
};

export type WorkspaceSection = 'home' | 'conversations' | 'matters' | 'clients' | 'invoices' | 'settings';

export type NavRailItem = {
  id: string;
  label: string;
  icon: ComponentType<JSX.SVGAttributes<SVGSVGElement>>;
  href: string;
  badge?: number | null;
  variant?: 'default' | 'danger';
  isAction?: boolean;
  onClick?: () => void;
};

export type SecondaryNavItem = {
  id: string;
  label: string;
  href: string;
  badge?: number | null;
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

export const CLIENTS_FILTER_MAP: Record<string, UserDetailStatus | null> = {
  all: null,
  leads: 'lead',
  active: 'active',
  inactive: 'inactive',
  archived: 'archived',
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
  { id: 'home', label: 'Home', icon: HomeIcon, href: basePath },
  { id: 'messages', label: 'Messages', icon: ChatBubbleOvalLeftEllipsisIcon, href: `${basePath}/conversations` },
  { id: 'matters', label: 'Matters', icon: ClipboardDocumentListIcon, href: `${basePath}/matters` },
  { id: 'invoices', label: 'Invoices', icon: DocumentTextIcon, href: `${basePath}/invoices` },
  { id: 'clients', label: 'Clients', icon: UsersIcon, href: `${basePath}/clients` },
  { id: 'settings', label: 'Settings', icon: Cog6ToothIcon, href: `${basePath}/settings/general` },
];

const buildClientRail = (basePath: string): NavRailItem[] => [
  { id: 'home', label: 'Home', icon: HomeIcon, href: basePath },
  { id: 'messages', label: 'Messages', icon: ChatBubbleOvalLeftEllipsisIcon, href: `${basePath}/conversations` },
  { id: 'matters', label: 'Matters', icon: ClipboardDocumentListIcon, href: `${basePath}/matters` },
  { id: 'invoices', label: 'Invoices', icon: DocumentTextIcon, href: `${basePath}/invoices` },
  { id: 'settings', label: 'Settings', icon: Cog6ToothIcon, href: `${basePath}/settings/general` },
];

const buildConversationsSecondary = (basePath: string, workspace: 'practice' | 'client'): NavSection[] => {
  if (workspace === 'practice') {
    return [{
      label: 'Inbox',
      items: [
        { id: 'your-inbox', label: 'Your Inbox', href: `${basePath}/conversations` },
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

const buildClientsSecondary = (basePath: string): NavSection[] => [{
  label: 'Status',
  items: [
    { id: 'all', label: 'All', href: `${basePath}/clients` },
    { id: 'leads', label: 'Leads', href: `${basePath}/clients` },
    { id: 'active', label: 'Active', href: `${basePath}/clients` },
    { id: 'inactive', label: 'Inactive', href: `${basePath}/clients` },
    { id: 'archived', label: 'Archived', href: `${basePath}/clients` },
  ],
}];

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
  const sections: NavSection[] = [
    {
      label: 'Account',
      items: [
        { id: 'general', label: 'General', href: `${basePath}/settings/general` },
        { id: 'notifications', label: 'Notifications', href: `${basePath}/settings/notifications` },
        { id: 'account', label: 'Account', href: `${basePath}/settings/account` },
        { id: 'security', label: 'Security', href: `${basePath}/settings/security` },
      ],
    },
  ];

  if (canAccessPractice) {
    sections.push({
      label: 'Practice',
      items: [
        { id: 'practice', label: 'Practice', href: `${basePath}/settings/practice` },
        { id: 'practice-services', label: 'Services', href: `${basePath}/settings/practice/services` },
        { id: 'practice-team', label: 'Team', href: `${basePath}/settings/practice/team` },
        { id: 'practice-pricing', label: 'Pricing', href: `${basePath}/settings/practice/pricing` },
        { id: 'apps', label: 'Apps', href: `${basePath}/settings/apps` },
      ],
    });
  }

  sections.push({
    label: 'Support',
    items: [{ id: 'help', label: 'Help', href: `${basePath}/settings/help` }],
  });

  return sections;
};

const buildSecondary = (basePath: string, section: WorkspaceSection, workspace: 'practice' | 'client', canAccessPractice: boolean): NavSection[] | undefined => {
  switch (section) {
    case 'conversations':
      return buildConversationsSecondary(basePath, workspace);
    case 'matters':
      return buildMattersSecondary(basePath, workspace);
    case 'clients':
      return workspace === 'practice' ? buildClientsSecondary(basePath) : undefined;
    case 'invoices':
      return buildInvoicesSecondary(basePath, workspace);
    case 'settings':
      return buildSettingsSecondary(basePath, canAccessPractice);
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
