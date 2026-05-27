import { useEffect, useMemo, useState, useCallback, useRef } from 'preact/hooks';
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
import { buildReportRouteMap } from '@/features/reports/config/reportCollection';


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
  // Persist the per-section secondary filter so refreshing /matters returns to
  // the last-clicked stage (e.g. Active) instead of falling back to default.
  // Scoped per workspace so practice and client filters don't collide.
  const filtersStorageKey = `blawby:secondary-filters:${workspace}`;
  const filtersStorageKeyRef = useRef(filtersStorageKey);
  filtersStorageKeyRef.current = filtersStorageKey;
  const [secondaryFilterBySection, setSecondaryFilterBySection] = useState<Partial<Record<WorkspaceSection, string>>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(filtersStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed as Partial<Record<WorkspaceSection, string>> : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    // Rehydrate when the storage key changes (workspace switch) so the new
    // workspace's persisted filters replace the prior one's in-memory state.
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(filtersStorageKey);
      if (!raw) {
        setSecondaryFilterBySection({});
        return;
      }
      const parsed = JSON.parse(raw);
      setSecondaryFilterBySection(
        parsed && typeof parsed === 'object' ? parsed as Partial<Record<WorkspaceSection, string>> : {}
      );
    } catch {
      setSecondaryFilterBySection({});
    }
  }, [filtersStorageKey]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(filtersStorageKeyRef.current, JSON.stringify(secondaryFilterBySection));
    } catch {
      // localStorage may be disabled (private mode, quota); persistence is best-effort.
    }
  }, [secondaryFilterBySection]);

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
    isIntakeTemplateEditorRoute,
    isIntakeResponseDetailRoute,
    selectedMatterIdFromPath,
    isMatterNonListRoute,
    selectedContactIdFromPath,
    contactsRouteKind,
    isEngagementCreateRoute,
    isEngagementDetailRoute,
    isEngagementEditRoute,
    isReportDeliveryDetailRoute,
    reportSectionFromPath,
    intakeSectionFromPath,
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
    intakeSectionFromPath,
    navSecondary: navConfig.secondary,
  }), [workspaceSection, isPracticeWorkspace, view, contactsRouteKind, reportSectionFromPath, intakeSectionFromPath, navConfig.secondary]);

  const activeSecondaryFilter = useMemo(() => getWorkspaceActiveSecondaryFilter({
    workspaceSection,
    isPracticeWorkspace,
    view,
    contactsRouteKind,
    reportSectionFromPath,
    intakeSectionFromPath,
    secondaryFilterBySection,
    defaultSecondaryFilterId,
  }), [workspaceSection, isPracticeWorkspace, view, contactsRouteKind, reportSectionFromPath, intakeSectionFromPath, secondaryFilterBySection, defaultSecondaryFilterId]);

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
      const reportPathById = buildReportRouteMap(basePath);
      navigate(reportPathById[id] ?? `${basePath}/reports`);
      setSecondaryFilterBySection((prev) => ({ ...prev, [workspaceSection]: id }));
      return;
    }
    if (workspaceSection === 'intakes') {
      navigate(id === 'forms' ? `${basePath}/intakes/forms` : `${basePath}/intakes/responses`);
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
    isIntakeTemplateEditorRoute,
    isIntakeResponseDetailRoute,
    selectedMatterIdFromPath,
    isMatterNonListRoute,
    selectedContactIdFromPath,
    contactsRouteKind,
    isEngagementCreateRoute,
    isEngagementDetailRoute,
    isEngagementEditRoute,
    isReportDeliveryDetailRoute,
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
