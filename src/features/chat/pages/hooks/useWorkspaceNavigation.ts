import { useMemo, useState, useCallback } from 'preact/hooks';
import {
  getWorkspaceActiveSecondaryFilter,
  getWorkspaceDefaultSecondaryFilter,
  getWorkspaceRouteState,
  getWorkspaceSection,
  type WorkspaceView,
} from '@/shared/utils/workspaceShell';
import {
  type WorkspaceSection,
  getClientNavConfig,
  getPracticeNavConfig,
  getSettingsNavConfig,
} from '@/shared/config/navConfig';
import type { PracticeRole } from '@/shared/utils/practiceRoles';

type PreviewTab = 'home' | 'messages' | 'intake';

// Mirror of WorkspaceView from workspaceShell (not exported from there).
export const previewTabOptions: Array<{ id: PreviewTab; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'messages', label: 'Messages' },
  { id: 'intake', label: 'Intake form' },
];

export type UseWorkspaceNavigationInput = {
  view: WorkspaceView;
  workspace: 'public' | 'practice' | 'client';
  practiceSlug: string | null;
  layoutMode: 'desktop' | 'mobile' | 'widget';
  location: { path: string; url?: string };
  navigate: (path: string) => void;
  isPracticeWorkspace: boolean;
  isClientWorkspace: boolean;
  normalizedRole: PracticeRole | null;
};

export function useWorkspaceNavigation({
  view,
  workspace,
  practiceSlug,
  layoutMode,
  location,
  navigate,
  isPracticeWorkspace,
  isClientWorkspace,
  normalizedRole,
}: UseWorkspaceNavigationInput) {
  const [secondaryFilterBySection, setSecondaryFilterBySection] = useState<Partial<Record<WorkspaceSection, string>>>({});

  const workspaceBasePath = useMemo(() => {
    let base = '/';
    if (workspace === 'practice' && practiceSlug) {
      base = `/practice/${encodeURIComponent(practiceSlug)}`;
    } else if (workspace === 'client' && practiceSlug) {
      base = `/client/${encodeURIComponent(practiceSlug)}`;
    } else if (practiceSlug) {
      base = `/public/${encodeURIComponent(practiceSlug)}`;
    }
    return base.replace(/\/+$/, '') || '/';
  }, [workspace, practiceSlug]);

  const normalizedBase = useMemo(() =>
    workspaceBasePath === '/' ? '' : workspaceBasePath,
  [workspaceBasePath]);

  const conversationsPath = useMemo(() => {
    return `${normalizedBase}/conversations`;
  }, [normalizedBase]);

  const withWidgetQuery = useCallback((path: string): string => {
    if (workspace !== 'public' || layoutMode !== 'widget') {
      return path;
    }
    return path.includes('?') ? `${path}&v=widget` : `${path}?v=widget`;
  }, [layoutMode, workspace]);

  const {
    isIntakeTemplateRoute,
    isIntakeTemplateEditorRoute,
    isIntakeResponsesRoute,
    selectedMatterIdFromPath,
    isMatterNonListRoute,
    selectedContactIdFromPath,
    contactsRouteKind,
    reportSectionFromPath,
  } = useMemo(() => getWorkspaceRouteState({
    view,
    path: location.path,
    normalizedBase,
    isPracticeWorkspace,
    isClientWorkspace,
  }), [view, location.path, normalizedBase, isPracticeWorkspace, isClientWorkspace]);

  const previewBaseUrl = useMemo(() => {
    const path = practiceSlug ? `/public/${encodeURIComponent(practiceSlug)}` : '/public';
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${path}`;
    }
    return path;
  }, [practiceSlug]);

  const previewUrls = useMemo(() => {
    const trimmed = previewBaseUrl.endsWith('/')
      ? previewBaseUrl.slice(0, -1)
      : previewBaseUrl;
    return {
      home: trimmed,
      messages: `${trimmed}/conversations`,
    };
  }, [previewBaseUrl]);

  const handleDashboardCreateInvoice = useCallback(() => {
    const rawUrl = typeof location.url === 'string' && location.url.length > 0
      ? location.url
      : location.path;
    const returnTo = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl.replace(/^\/+/, '')}`;
    navigate(`${normalizedBase}/invoices/new?returnTo=${encodeURIComponent(returnTo)}`);
  }, [location.path, location.url, navigate, normalizedBase]);

  const workspaceSection: WorkspaceSection = getWorkspaceSection(view);

  const navConfig = useMemo(() => {
    const slug = (practiceSlug ?? '').trim();
    if (!slug) return { rail: [] };
    const navCtx = {
      practiceSlug: slug,
      role: normalizedRole,
      canAccessPractice: isPracticeWorkspace || normalizedRole !== 'client',
    };
    if (view === 'settings') {
      return getSettingsNavConfig(navCtx);
    }
    if (workspace === 'public') {
      return { rail: [] };
    }
    return isPracticeWorkspace
      ? getPracticeNavConfig(navCtx, workspaceSection)
      : getClientNavConfig(navCtx, workspaceSection);
  }, [isPracticeWorkspace, normalizedRole, practiceSlug, view, workspace, workspaceSection]);

  const defaultSecondaryFilterId = useMemo(() => getWorkspaceDefaultSecondaryFilter({
    workspaceSection,
    isPracticeWorkspace,
    view,
    contactsRouteKind,
    reportSectionFromPath,
    isIntakeTemplateRoute,
    isIntakeResponsesRoute,
    navSecondary: navConfig.secondary,
  }), [workspaceSection, isPracticeWorkspace, view, contactsRouteKind, reportSectionFromPath, isIntakeTemplateRoute, isIntakeResponsesRoute, navConfig.secondary]);

  const activeSecondaryFilter = useMemo(() => getWorkspaceActiveSecondaryFilter({
    workspaceSection,
    isPracticeWorkspace,
    view,
    contactsRouteKind,
    reportSectionFromPath,
    isIntakeTemplateRoute,
    isIntakeResponsesRoute,
    secondaryFilterBySection,
    defaultSecondaryFilterId,
  }), [workspaceSection, isPracticeWorkspace, view, contactsRouteKind, reportSectionFromPath, isIntakeTemplateRoute, isIntakeResponsesRoute, secondaryFilterBySection, defaultSecondaryFilterId]);

  const handleSecondaryFilterSelect = useCallback((id: string) => {
    if (workspaceSection === 'settings') return;
    const basePath = normalizedBase || '/';
    if (workspaceSection === 'home') {
      const contactsBasePath = `${basePath}/contacts`;
      const target = id === 'contacts-archived'
        ? `${contactsBasePath}/archived`
        : id === 'contacts-team'
          ? `${contactsBasePath}/team`
          : id === 'contacts-clients'
            ? `${contactsBasePath}/clients`
            : id === 'contacts-pending'
              ? `${contactsBasePath}/pending`
          : id === 'contacts' || id === 'contacts-all'
            ? contactsBasePath
            : basePath;
      navigate(target);
      setSecondaryFilterBySection((prev) => ({ ...prev, [workspaceSection]: id }));
      return;
    }
    if (workspaceSection === 'reports') {
      const reportPathById: Record<string, string> = {
        'all-reports': `${basePath}/reports`,
        'payroll-matter-activity': `${basePath}/reports/payroll-matter-activity`,
        'trust-reconciliation': `${basePath}/reports/trust-reconciliation`,
        'stale-matters': `${basePath}/reports/stale-matters`,
      };
      navigate(reportPathById[id] ?? `${basePath}/reports`);
      setSecondaryFilterBySection((prev) => ({ ...prev, [workspaceSection]: id }));
      return;
    }
    if (workspaceSection === 'intakes') {
      navigate(id === 'forms' ? `${basePath}/intakes` : `${basePath}/intakes/responses`);
      setSecondaryFilterBySection((prev) => ({ ...prev, [workspaceSection]: id }));
      return;
    }
    setSecondaryFilterBySection((prev) => ({ ...prev, [workspaceSection]: id }));
  }, [navigate, normalizedBase, workspaceSection]);

  return {
    workspaceBasePath,
    normalizedBase,
    conversationsPath,
    withWidgetQuery,
    isIntakeTemplateRoute,
    isIntakeTemplateEditorRoute,
    isIntakeResponsesRoute,
    selectedMatterIdFromPath,
    isMatterNonListRoute,
    selectedContactIdFromPath,
    contactsRouteKind,
    reportSectionFromPath,
    previewBaseUrl,
    previewUrls,
    handleDashboardCreateInvoice,
    workspaceSection,
    navConfig,
    defaultSecondaryFilterId,
    activeSecondaryFilter,
    handleSecondaryFilterSelect,
  };
}
