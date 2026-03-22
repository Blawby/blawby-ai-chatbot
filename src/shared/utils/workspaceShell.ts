import type { WorkspaceSection } from '@/shared/config/navConfig';

type WorkspaceView =
  | 'home'
  | 'setup'
  | 'list'
  | 'conversation'
  | 'matters'
  | 'clients'
  | 'invoices'
  | 'invoiceDetail'
  | 'reports'
  | 'settings';

type WorkspaceRouteState = {
  selectedMatterIdFromPath: string | null;
  isMatterNonListRoute: boolean;
  selectedClientIdFromPath: string | null;
  peopleRouteKind: 'all' | 'archived' | 'team' | 'clients';
  reportSectionFromPath: string;
};

const REPORT_SECTION_TITLES: Record<string, string> = {
  'all-reports': 'All reports',
  'payroll-matter-activity': 'Payroll & Matter Activity',
  'trust-reconciliation': 'Trust Reconciliation',
  'stale-matters': 'Stale Matters',
};

const REPORT_SECTION_IDS = new Set(Object.keys(REPORT_SECTION_TITLES));

const normalizeDecodedSegment = (value: string) => decodeURIComponent(value).trim();

export const getWorkspaceSection = (view: WorkspaceView): WorkspaceSection => {
  if (view === 'list' || view === 'conversation') return 'conversations';
  if (view === 'invoiceDetail') return 'invoices';
  if (view === 'setup' || view === 'clients') return 'home';
  return view;
};

export const getWorkspaceRouteState = ({
  view,
  path,
  normalizedBase,
  isPracticeWorkspace,
  isClientWorkspace,
}: {
  view: WorkspaceView;
  path: string;
  normalizedBase: string;
  isPracticeWorkspace: boolean;
  isClientWorkspace: boolean;
}): WorkspaceRouteState => {
  const isWorkspaceWithMattersRouting = isPracticeWorkspace || isClientWorkspace;

  let selectedMatterIdFromPath: string | null = null;
  let isMatterNonListRoute = false;
  if (view === 'matters' && isWorkspaceWithMattersRouting) {
    const marker = `${normalizedBase}/matters/`;
    if (path.startsWith(marker)) {
      const raw = path.slice(marker.length).split('/')[0] ?? '';
      const candidate = normalizeDecodedSegment(raw);
      if (candidate === 'new' || candidate === 'activity') {
        isMatterNonListRoute = true;
      } else if (candidate) {
        selectedMatterIdFromPath = candidate;
      }
    }
  }

  let selectedClientIdFromPath: string | null = null;
  let peopleRouteKind: WorkspaceRouteState['peopleRouteKind'] = 'all';
  if (view === 'clients' && isPracticeWorkspace) {
    const peopleMarker = `${normalizedBase}/people/`;
    const legacyMarker = `${normalizedBase}/clients/`;
    const activeBaseMarker = path.startsWith(peopleMarker)
      ? peopleMarker
      : path.startsWith(legacyMarker)
        ? legacyMarker
        : null;

    if (activeBaseMarker) {
      const peopleSubpath = path.slice(activeBaseMarker.length);
      if (peopleSubpath.startsWith('archived/')) {
        peopleRouteKind = 'archived';
        const raw = peopleSubpath.slice('archived/'.length).split('/')[0] ?? '';
        const candidate = normalizeDecodedSegment(raw);
        selectedClientIdFromPath = candidate || null;
      } else if (peopleSubpath === 'archived') {
        peopleRouteKind = 'archived';
      } else if (peopleSubpath.startsWith('team/')) {
        peopleRouteKind = 'team';
        const raw = peopleSubpath.slice('team/'.length).split('/')[0] ?? '';
        const candidate = normalizeDecodedSegment(raw);
        selectedClientIdFromPath = candidate ? `team:${candidate}` : null;
      } else if (peopleSubpath === 'team') {
        peopleRouteKind = 'team';
      } else if (peopleSubpath.startsWith('clients/')) {
        peopleRouteKind = 'clients';
        const raw = peopleSubpath.slice('clients/'.length).split('/')[0] ?? '';
        const candidate = normalizeDecodedSegment(raw);
        selectedClientIdFromPath = candidate || null;
      } else if (peopleSubpath === 'clients') {
        peopleRouteKind = 'clients';
      } else {
        const raw = peopleSubpath.split('/')[0] ?? '';
        const candidate = normalizeDecodedSegment(raw);
        if (candidate && candidate !== 'archived' && candidate !== 'clients' && candidate !== 'team') {
          selectedClientIdFromPath = candidate;
        }
      }
    }
  }

  let reportSectionFromPath = 'all-reports';
  if (view === 'reports' && isPracticeWorkspace) {
    const marker = `${normalizedBase}/reports/`;
    if (path.startsWith(marker)) {
      const raw = path.slice(marker.length).split('/')[0] ?? '';
      const candidate = normalizeDecodedSegment(raw);
      if (candidate.length > 0 && REPORT_SECTION_IDS.has(candidate)) {
        reportSectionFromPath = candidate;
      }
    }
  }

  return {
    selectedMatterIdFromPath,
    isMatterNonListRoute,
    selectedClientIdFromPath,
    peopleRouteKind,
    reportSectionFromPath,
  };
};

export const getWorkspaceDefaultSecondaryFilter = ({
  workspaceSection,
  isPracticeWorkspace,
  view,
  peopleRouteKind,
  reportSectionFromPath,
  navSecondary,
}: {
  workspaceSection: WorkspaceSection;
  isPracticeWorkspace: boolean;
  view: WorkspaceView;
  peopleRouteKind: WorkspaceRouteState['peopleRouteKind'];
  reportSectionFromPath: string;
  navSecondary?: Array<{ items: Array<{ id: string }> }>;
}) => {
  if (workspaceSection === 'conversations' && isPracticeWorkspace) {
    return 'all';
  }
  if (workspaceSection === 'home' && isPracticeWorkspace) {
    if (view !== 'clients') return 'overview';
    if (peopleRouteKind === 'archived') return 'people-archived';
    if (peopleRouteKind === 'team') return 'people-team';
    if (peopleRouteKind === 'clients') return 'people-clients';
    return 'people-all';
  }
  if (workspaceSection === 'reports' && isPracticeWorkspace) {
    return reportSectionFromPath;
  }
  return navSecondary?.[0]?.items[0]?.id ?? null;
};

export const getWorkspaceActiveSecondaryFilter = ({
  workspaceSection,
  isPracticeWorkspace,
  view,
  peopleRouteKind,
  reportSectionFromPath,
  secondaryFilterBySection,
  defaultSecondaryFilterId,
}: {
  workspaceSection: WorkspaceSection;
  isPracticeWorkspace: boolean;
  view: WorkspaceView;
  peopleRouteKind: WorkspaceRouteState['peopleRouteKind'];
  reportSectionFromPath: string;
  secondaryFilterBySection: Partial<Record<WorkspaceSection, string>>;
  defaultSecondaryFilterId: string | null;
}) => {
  if (workspaceSection === 'settings') return null;
  if (workspaceSection === 'home' && isPracticeWorkspace) {
    if (view !== 'clients') return 'overview';
    if (peopleRouteKind === 'archived') return 'people-archived';
    if (peopleRouteKind === 'team') return 'people-team';
    if (peopleRouteKind === 'clients') return 'people-clients';
    return 'people-all';
  }
  if (workspaceSection === 'reports' && isPracticeWorkspace) {
    return reportSectionFromPath;
  }
  return secondaryFilterBySection[workspaceSection] ?? defaultSecondaryFilterId;
};

export const shouldShowWorkspaceMobileMenuButton = ({
  isMobileLayout,
  hasSecondaryNav,
  workspaceSection,
  view,
  isPracticeWorkspace,
  selectedMatterIdFromPath,
  isMatterNonListRoute,
  selectedClientIdFromPath,
}: {
  isMobileLayout: boolean;
  hasSecondaryNav: boolean;
  workspaceSection: WorkspaceSection;
  view: WorkspaceView;
  isPracticeWorkspace: boolean;
  selectedMatterIdFromPath: string | null;
  isMatterNonListRoute: boolean;
  selectedClientIdFromPath: string | null;
}) => {
  if (!isMobileLayout || !hasSecondaryNav) return false;
  if (workspaceSection === 'conversations') return view === 'list';
  if (workspaceSection === 'matters') return !selectedMatterIdFromPath && !isMatterNonListRoute;
  if (workspaceSection === 'home') {
    return isPracticeWorkspace && (view === 'home' || (view === 'clients' && !selectedClientIdFromPath));
  }
  if (workspaceSection === 'invoices') return view === 'invoices';
  if (workspaceSection === 'reports') return true;
  if (workspaceSection === 'settings') return true;
  return false;
};

export const shouldShowWorkspaceBottomNav = ({
  isMobileLayout,
  workspace,
  view,
}: {
  isMobileLayout: boolean;
  workspace: 'public' | 'practice' | 'client';
  view: WorkspaceView;
}) => {
  if (!isMobileLayout) return false;
  if (workspace === 'practice') return true;
  return view !== 'list' && view !== 'conversation';
};

export const getWorkspaceActiveHref = ({
  view,
  normalizedBase,
  path,
}: {
  view: WorkspaceView;
  normalizedBase: string;
  path: string;
}) => {
  return view === 'clients' ? (normalizedBase || '/') : path;
};

export const WORKSPACE_REPORT_SECTION_TITLES = REPORT_SECTION_TITLES;
