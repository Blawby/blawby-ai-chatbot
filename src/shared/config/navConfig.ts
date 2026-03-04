import type { ComponentType, JSX } from 'preact';
import {
  ChatBubbleOvalLeftEllipsisIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  HomeIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import type { PracticeRole } from '@/shared/utils/practiceRoles';

export type NavCtx = {
  practiceSlug: string;
  role: PracticeRole | 'client' | null;
  canAccessPractice: boolean;
};

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

export function getPracticeNavConfig(ctx: NavCtx): NavConfig {
  const basePath = buildPracticeBase(ctx.practiceSlug);
  return { rail: buildPracticeRail(basePath) };
}

export function getClientNavConfig(ctx: NavCtx): NavConfig {
  const basePath = buildClientBase(ctx.practiceSlug);
  return { rail: buildClientRail(basePath) };
}

export function getSettingsNavConfig(ctx: NavCtx): NavConfig {
  const usePracticeBase = ctx.canAccessPractice && ctx.role !== 'client';
  const basePath = usePracticeBase
    ? buildPracticeBase(ctx.practiceSlug)
    : buildClientBase(ctx.practiceSlug);

  return {
    rail: usePracticeBase ? buildPracticeRail(basePath) : buildClientRail(basePath),
    secondary: buildSettingsSecondary(basePath, ctx.canAccessPractice),
  };
}
