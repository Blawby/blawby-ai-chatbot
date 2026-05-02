import type { WorkspaceSection } from '@/shared/config/navConfig';

type WorkspaceView =
  | 'home'
  | 'setup'
  | 'list'
  | 'conversation'
  | 'intakes'
  | 'intakeDetail'
  | 'engagements'
  | 'matters'
  | 'contacts'
  | 'invoices'
  | 'invoiceCreate'
  | 'invoiceEdit'
  | 'invoiceDetail'
  | 'reports'
  | 'settings';

type WorkspaceRouteState = {
  isIntakeTemplateRoute: boolean;
  isIntakeTemplateEditorRoute: boolean;
  isIntakeResponsesRoute: boolean;
  selectedMatterIdFromPath: string | null;
  isMatterNonListRoute: boolean;
  selectedContactIdFromPath: string | null;
  contactsRouteKind: 'all' | 'archived' | 'team' | 'clients' | 'pending';
  reportSectionFromPath: string;
};

const REPORT_SECTION_TITLES: Record<string, string> = {
  'all-reports': 'All reports',
  'payroll-matter-activity': 'Payroll & Matter Activity',
  'trust-reconciliation': 'Trust Reconciliation',
  'stale-matters': 'Stale Matters',
};

const REPORT_SECTION_IDS = new Set(Object.keys(REPORT_SECTION_TITLES));

const normalizeDecodedSegment = (value: string) => {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
};

export const getWorkspaceSection = (view: WorkspaceView): WorkspaceSection => {
  if (view === 'list' || view === 'conversation') return 'conversations';
  if (view === 'invoiceCreate' || view === 'invoiceEdit' || view === 'invoiceDetail') return 'invoices';
  if (view === 'setup' || view === 'contacts') return 'home';
  if (view === 'intakeDetail') return 'intakes';
  // /engagements lives under Matters in the unified sidebar; route + breadcrumb still drive
  // the engagements view, but the rail/active state belongs to Matters.
  if (view === 'engagements') return 'matters';
  return view as WorkspaceSection;
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
  const intakesPath = `${normalizedBase}/intakes`;
  const intakeResponsesPath = `${intakesPath}/responses`;
  const isIntakeResponsesRoute = view === 'intakes'
    && isPracticeWorkspace
    && (path === intakeResponsesPath || path.startsWith(`${intakeResponsesPath}/`));
  const isIntakeTemplateRoute = view === 'intakes'
    && isPracticeWorkspace
    && path.startsWith(intakesPath)
    && !isIntakeResponsesRoute;
  const isIntakeTemplateEditorRoute = isIntakeTemplateRoute
    && path !== intakesPath;

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

  let selectedContactIdFromPath: string | null = null;
  let contactsRouteKind: WorkspaceRouteState['contactsRouteKind'] = 'all';
  if (view === 'contacts' && isPracticeWorkspace) {
    const contactsMarker = `${normalizedBase}/contacts/`;

    if (path.startsWith(contactsMarker)) {
      const contactsSubpath = path.slice(contactsMarker.length);
      if (contactsSubpath.startsWith('archived/')) {
        contactsRouteKind = 'archived';
        const raw = contactsSubpath.slice('archived/'.length).split('/')[0] ?? '';
        const candidate = normalizeDecodedSegment(raw);
        selectedContactIdFromPath = candidate || null;
      } else if (contactsSubpath === 'archived') {
        contactsRouteKind = 'archived';
      } else if (contactsSubpath.startsWith('team/')) {
        contactsRouteKind = 'team';
        const raw = contactsSubpath.slice('team/'.length).split('/')[0] ?? '';
        const candidate = normalizeDecodedSegment(raw);
        selectedContactIdFromPath = candidate ? `team:${candidate}` : null;
      } else if (contactsSubpath === 'team') {
        contactsRouteKind = 'team';
      } else if (contactsSubpath.startsWith('clients/')) {
        contactsRouteKind = 'clients';
        const raw = contactsSubpath.slice('clients/'.length).split('/')[0] ?? '';
        const candidate = normalizeDecodedSegment(raw);
        selectedContactIdFromPath = candidate || null;
      } else if (contactsSubpath === 'clients') {
        contactsRouteKind = 'clients';
      } else if (contactsSubpath.startsWith('pending/')) {
        contactsRouteKind = 'pending';
        const raw = contactsSubpath.slice('pending/'.length).split('/')[0] ?? '';
        const candidate = normalizeDecodedSegment(raw);
        selectedContactIdFromPath = candidate ? `pending:${candidate}` : null;
      } else if (contactsSubpath === 'pending') {
        contactsRouteKind = 'pending';
      } else {
        const raw = contactsSubpath.split('/')[0] ?? '';
        const candidate = normalizeDecodedSegment(raw);
        if (candidate && candidate !== 'archived' && candidate !== 'clients' && candidate !== 'team' && candidate !== 'pending') {
          selectedContactIdFromPath = candidate;
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
    isIntakeTemplateRoute,
    isIntakeTemplateEditorRoute,
    selectedMatterIdFromPath,
    isMatterNonListRoute,
    isIntakeResponsesRoute,
    selectedContactIdFromPath,
    contactsRouteKind,
    reportSectionFromPath,
  };
};

export const getWorkspaceDefaultSecondaryFilter = ({
  workspaceSection,
  isPracticeWorkspace,
  view,
  contactsRouteKind,
  reportSectionFromPath,
  isIntakeTemplateRoute,
  isIntakeResponsesRoute,
  navSecondary,
}: {
  workspaceSection: WorkspaceSection;
  isPracticeWorkspace: boolean;
  view: WorkspaceView;
  contactsRouteKind: WorkspaceRouteState['contactsRouteKind'];
  reportSectionFromPath: string;
  isIntakeTemplateRoute: boolean;
  isIntakeResponsesRoute: boolean;
  navSecondary?: Array<{ items: Array<{ id: string }> }>;
}) => {
  if (workspaceSection === 'conversations' && isPracticeWorkspace) {
    return 'all';
  }
  if (workspaceSection === 'home' && isPracticeWorkspace) {
    if (view !== 'contacts') return 'overview';
    if (contactsRouteKind === 'archived') return 'contacts-archived';
    if (contactsRouteKind === 'team') return 'contacts-team';
    if (contactsRouteKind === 'clients') return 'contacts-clients';
    if (contactsRouteKind === 'pending') return 'contacts-pending';
    return 'contacts-all';
  }
  if (workspaceSection === 'reports' && isPracticeWorkspace) {
    return reportSectionFromPath;
  }
  if (workspaceSection === 'intakes' && isPracticeWorkspace && isIntakeTemplateRoute) {
    return 'forms';
  }
  if (workspaceSection === 'intakes' && isPracticeWorkspace && isIntakeResponsesRoute) {
    return 'all';
  }
  // Matters > Engagements is a peer route rendered as the first sub-item; the default
  // filter for /matters is the 'all' stage filter, not 'engagements'.
  if (workspaceSection === 'matters' && isPracticeWorkspace) {
    return view === 'engagements' ? 'engagements' : 'all';
  }
  return navSecondary?.[0]?.items[0]?.id ?? null;
};

export const getWorkspaceActiveSecondaryFilter = ({
  workspaceSection,
  isPracticeWorkspace,
  view,
  contactsRouteKind,
  reportSectionFromPath,
  isIntakeTemplateRoute,
  isIntakeResponsesRoute,
  secondaryFilterBySection,
  defaultSecondaryFilterId,
}: {
  workspaceSection: WorkspaceSection;
  isPracticeWorkspace: boolean;
  view: WorkspaceView;
  contactsRouteKind: WorkspaceRouteState['contactsRouteKind'];
  reportSectionFromPath: string;
  isIntakeTemplateRoute: boolean;
  isIntakeResponsesRoute: boolean;
  secondaryFilterBySection: Partial<Record<WorkspaceSection, string>>;
  defaultSecondaryFilterId: string | null;
}) => {
  if (workspaceSection === 'settings') return null;
  if (workspaceSection === 'home' && isPracticeWorkspace) {
    if (view !== 'contacts') return 'overview';
    if (contactsRouteKind === 'archived') return 'contacts-archived';
    if (contactsRouteKind === 'team') return 'contacts-team';
    if (contactsRouteKind === 'clients') return 'contacts-clients';
    if (contactsRouteKind === 'pending') return 'contacts-pending';
    return 'contacts-all';
  }
  if (workspaceSection === 'reports' && isPracticeWorkspace) {
    return reportSectionFromPath;
  }
  if (workspaceSection === 'intakes' && isPracticeWorkspace && isIntakeTemplateRoute) {
    return 'forms';
  }
  if (
    workspaceSection === 'intakes'
    && isPracticeWorkspace
    && isIntakeResponsesRoute
    && secondaryFilterBySection.intakes === 'forms'
  ) {
    return defaultSecondaryFilterId;
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
  selectedContactIdFromPath,
}: {
  isMobileLayout: boolean;
  hasSecondaryNav: boolean;
  workspaceSection: WorkspaceSection;
  view: WorkspaceView;
  isPracticeWorkspace: boolean;
  selectedMatterIdFromPath: string | null;
  isMatterNonListRoute: boolean;
  selectedContactIdFromPath: string | null;
}) => {
  if (!isMobileLayout || !hasSecondaryNav) return false;
  if (workspaceSection === 'conversations') return view === 'list';
  if (workspaceSection === 'intakes') return view === 'intakes';
  if (workspaceSection === 'matters') return !selectedMatterIdFromPath && !isMatterNonListRoute;
  if (workspaceSection === 'home') {
    return isPracticeWorkspace && (view === 'home' || (view === 'contacts' && !selectedContactIdFromPath));
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
  path,
}: {
  view: WorkspaceView;
  normalizedBase: string;
  path: string;
}) => {
  // Previously rewrote /contacts to basePath so the Home rail item highlighted.
  // With Contacts promoted to a top-level rail item (Pencil GtRGH), we want the
  // real path so the unified Sidebar's longest-prefix match picks Contacts.
  return path;
};

export const WORKSPACE_REPORT_SECTION_TITLES = REPORT_SECTION_TITLES;
