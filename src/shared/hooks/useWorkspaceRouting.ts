/**
 * useWorkspaceRouting
 *
 * Derives all workspace-scoped identifiers and resolved slugs from raw props
 * and session routing claims.  Centralises the logic that was previously
 * scattered across ~15 useMemo calls at the top of MainApp.tsx.
 *
 * Inputs
 * ──────
 *  practiceId          – raw practice ID from the route/prop
 *  practiceConfig      – static config loaded for this practice
 *  workspace           – 'public' | 'client' | 'practice'
 *  publicPracticeSlug  – slug from the public route param (optional)
 *  clientPracticeSlug  – slug from the client route param (optional)
 *  practiceSlug        – explicit slug override (optional)
 *  routeConversationId – raw (URL-encoded) conversation ID from the route
 *  currentPractice     – live practice object from usePracticeManagement
 *  practiceDetails     – richer details from usePracticeDetails
 *  activeMemberRole    – raw role string from SessionContext
 *  session             – current session from SessionContext
 *  routing             – backend-derived RoutingClaims (from session.routing)
 *
 * Outputs  (all stable/memoized)
 * ────────────────────────────────
 *  isPublicWorkspace / isPracticeWorkspace / isClientWorkspace
 *  isAuthenticatedClient   – public workspace + authenticated client role
 *
 *  effectivePracticeId     – the practiceId to use for API calls
 *  effectivePracticeSlug   – resolved slug, preferring explicit prop
 *
 *  resolvedPracticeName    – display name (live practice > config fallback)
 *  resolvedPracticeLogo    – logo URL (live practice > config fallback)
 *  resolvedPracticeDescription
 *
 *  resolvedPublicPracticeSlug   – slug for public workspace
 *  resolvedClientPracticeSlug   – slug for client workspace
 *
 *  normalizedRouteConversationId – URL-decoded conversation ID (or null)
 *
 *  conversationsBasePath   – base path for the conversations list
 *  conversationBackPath    – where the back button should navigate
 *  practiceMattersPath     – base path for practice matters
 *
 *  layoutMode              – 'desktop' | 'mobile' | 'widget'
 *  currentUserRole         – normalized role string
 *  canReviewLeads          – whether this user can see lead review actions
 *
 * Backend routing preference
 * ──────────────────────────
 * When `routing` claims are present (injected by the backend PR #101),
 * `default_workspace` is preferred over the frontend workspace prop for
 * resolving access-dependent values.  The frontend workspace prop is still
 * used for layout decisions (which tabs/nav to show) since that is a
 * presentational concern, not an access control one.
 */

import { useMemo } from 'preact/hooks';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import type { WorkspaceType } from '@/shared/types/workspace';
import type { RoutingClaims } from '@/shared/types/routing';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { hasLeadReviewPermission } from '@/shared/utils/leadPermissions';
import { getWorkspaceConversationsPath, getWorkspaceMattersPath } from '@/shared/utils/workspace';
import type { LayoutMode } from '@/app/MainApp';

// ─── types ────────────────────────────────────────────────────────────────────

interface CurrentPractice {
  slug?: string | null;
  name?: string | null;
  logo?: string | null;
  description?: string | null;
  accentColor?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface PracticeDetails {
  description?: string | null;
  accentColor?: string | null;
}

interface Session {
  user?: { id: string; isAnonymous?: boolean } | null;
}

export interface UseWorkspaceRoutingOptions {
  practiceId: string;
  practiceConfig: UIPracticeConfig;
  workspace: WorkspaceType;
  publicPracticeSlug?: string;
  clientPracticeSlug?: string;
  practiceSlug?: string;
  routeConversationId?: string;
  isWidget?: boolean;

  // Live data from sibling hooks
  currentPractice?: CurrentPractice | null;
  practiceDetails?: PracticeDetails | null;
  activeMemberRole?: string | null;
  session?: Session | null;

  // Backend routing claims (from session.routing injected by middleware PR #101)
  routing?: RoutingClaims | null;
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export const useWorkspaceRouting = ({
  practiceId,
  practiceConfig,
  workspace,
  publicPracticeSlug,
  clientPracticeSlug,
  practiceSlug,
  routeConversationId,
  isWidget = false,
  currentPractice,
  practiceDetails,
  activeMemberRole,
  session,
  routing,
}: UseWorkspaceRoutingOptions) => {

  // ── workspace flags ────────────────────────────────────────────────────────

  const isPublicWorkspace = workspace === 'public';
  const isPracticeWorkspace = workspace === 'practice';
  const isClientWorkspace = workspace === 'client';

  /**
   * When the backend provides routing claims, prefer its `default_workspace`
   * for access-sensitive checks.  The frontend `workspace` prop is kept for
   * layout/navigation decisions.
   */
  const effectiveWorkspace = useMemo<WorkspaceType>(() => {
    if (!routing?.default_workspace) return workspace;
    // Only override if the backend claim is more specific than 'public'
    if (routing.default_workspace === 'practice' || routing.default_workspace === 'client') {
      return routing.default_workspace as WorkspaceType;
    }
    return workspace;
  }, [routing?.default_workspace, workspace]);

  const isAuthenticatedClient = useMemo(() => Boolean(
    isPublicWorkspace &&
    session?.user &&
    !session.user.isAnonymous &&
    normalizePracticeRole(activeMemberRole) === 'client'
  ), [activeMemberRole, isPublicWorkspace, session?.user]);

  // ── slug resolution ────────────────────────────────────────────────────────

  const resolvedPublicPracticeSlug = useMemo(() => {
    if (!isPublicWorkspace) return null;
    return publicPracticeSlug ?? practiceConfig.slug ?? null;
  }, [isPublicWorkspace, practiceConfig.slug, publicPracticeSlug]);

  const resolvedClientPracticeSlug = useMemo(() => {
    if (!isClientWorkspace) return null;
    return clientPracticeSlug ?? practiceConfig.slug ?? null;
  }, [clientPracticeSlug, isClientWorkspace, practiceConfig.slug]);

  /**
   * The "canonical" practice slug for the current session.
   * Priority: explicit prop → live practice → config.
   */
  const resolvedPracticeSlug = useMemo(
    () => practiceSlug ?? currentPractice?.slug ?? practiceConfig?.slug ?? undefined,
    [currentPractice?.slug, practiceConfig?.slug, practiceSlug]
  );

  const effectivePracticeSlug = practiceSlug ?? resolvedPracticeSlug ?? null;

  // ── effective practice ID ──────────────────────────────────────────────────

  /**
   * For public workspaces, prefer the config ID when the slug matches.
   * This avoids an unnecessary API call when the slug is already in scope.
   */
  const effectivePracticeId = useMemo(() => {
    if (isPublicWorkspace) {
      if (
        practiceConfig.id &&
        resolvedPublicPracticeSlug &&
        practiceConfig.slug === resolvedPublicPracticeSlug
      ) {
        return practiceConfig.id;
      }
      return practiceId || undefined;
    }
    return practiceId || undefined;
  }, [isPublicWorkspace, practiceConfig.id, practiceConfig.slug, practiceId, resolvedPublicPracticeSlug]);

  // ── display values ─────────────────────────────────────────────────────────

  const resolvedPracticeName = useMemo(() => {
    if (isPublicWorkspace) return practiceConfig.name ?? '';
    return currentPractice?.name ?? practiceConfig.name ?? '';
  }, [currentPractice?.name, isPublicWorkspace, practiceConfig.name]);

  const resolvedPracticeLogo = useMemo(() => {
    if (isPublicWorkspace) return practiceConfig.profileImage ?? null;
    return currentPractice?.logo ?? practiceConfig?.profileImage ?? null;
  }, [currentPractice?.logo, isPublicWorkspace, practiceConfig?.profileImage]);

  const resolvedPracticeDescription = useMemo(
    () => practiceDetails?.description ?? currentPractice?.description ?? practiceConfig?.description ?? '',
    [currentPractice?.description, practiceConfig?.description, practiceDetails?.description]
  );

  /**
   * Resolved accent color — used by initializeAccentColor in MainApp.
   * Returned here so MainApp's effect has a single stable value to depend on.
   */
  const resolvedAccentColor = useMemo(() => {
    if (isPublicWorkspace || isClientWorkspace) return practiceConfig.accentColor;
    return practiceDetails?.accentColor ?? currentPractice?.accentColor ?? practiceConfig.accentColor;
  }, [
    currentPractice?.accentColor,
    isClientWorkspace,
    isPublicWorkspace,
    practiceConfig.accentColor,
    practiceDetails?.accentColor,
  ]);

  // ── conversation ID from route ─────────────────────────────────────────────

  const normalizedRouteConversationId = useMemo(() => {
    if (!routeConversationId) return null;
    try { return decodeURIComponent(routeConversationId); }
    catch (err) {
      console.warn('[useWorkspaceRouting] Failed to decode conversation ID from route', { id: routeConversationId, err });
      return routeConversationId;
    }
  }, [routeConversationId]);

  // ── navigation paths ───────────────────────────────────────────────────────

  const conversationsBasePath = useMemo(() => {
    if (isPracticeWorkspace) return getWorkspaceConversationsPath('practice', resolvedPracticeSlug);
    if (isClientWorkspace) return getWorkspaceConversationsPath('client', resolvedClientPracticeSlug);
    // Public: derive from resolved slug
    if (!resolvedPublicPracticeSlug) return null;
    return `/public/${encodeURIComponent(resolvedPublicPracticeSlug)}/conversations`;
  }, [isClientWorkspace, isPracticeWorkspace, resolvedClientPracticeSlug, resolvedPracticeSlug, resolvedPublicPracticeSlug]);

  const conversationBackPath = useMemo(() => {
    if (isPublicWorkspace) {
      return resolvedPublicPracticeSlug
        ? `/public/${encodeURIComponent(resolvedPublicPracticeSlug)}`
        : '/public';
    }
    return conversationsBasePath ?? '/';
  }, [conversationsBasePath, isPublicWorkspace, resolvedPublicPracticeSlug]);

  const practiceMattersPath = useMemo(
    () => getWorkspaceMattersPath('practice', effectivePracticeSlug),
    [effectivePracticeSlug]
  );

  // ── layout mode ───────────────────────────────────────────────────────────

  /**
   * 'widget'   – embedded in a 3rd-party site via iframe (?v=widget)
   * 'embed'    – legacy alias for widget, kept for backwards compat
   * 'desktop'  – practice dashboard
   * 'mobile'   – authenticated client on phone
   */
  const layoutMode = useMemo((): LayoutMode => {
    if (isPracticeWorkspace) return 'desktop';
    if (isClientWorkspace) return 'mobile';
    return 'widget';
  }, [isClientWorkspace, isPracticeWorkspace]);

  // ── role & permissions ────────────────────────────────────────────────────

  const currentUserRole = useMemo(
    () => normalizePracticeRole(activeMemberRole) ?? 'member',
    [activeMemberRole]
  );

  const canReviewLeads = useMemo(
    () => hasLeadReviewPermission(currentUserRole, currentPractice?.metadata ?? null),
    [currentPractice?.metadata, currentUserRole]
  );

  // ── reset key ────────────────────────────────────────────────────────────
  // Stable value that changes whenever the "active practice context" changes.
  // MainApp uses this to reset conversationId state on navigation.

  const conversationResetKey = useMemo(() => {
    if (isPublicWorkspace) return resolvedPublicPracticeSlug ?? '';
    return practiceId;
  }, [isPublicWorkspace, practiceId, resolvedPublicPracticeSlug]);

  // ── public conversations base path (used by WorkspacePage) ───────────────

  const publicConversationsBasePath = useMemo(() => {
    if (!resolvedPublicPracticeSlug) return null;
    return `/public/${encodeURIComponent(resolvedPublicPracticeSlug)}/conversations`;
  }, [resolvedPublicPracticeSlug]);

  // ── backend routing access flags ─────────────────────────────────────────

  /**
   * Exposes the backend workspace_access claims directly so consumers can
   * gate features without re-deriving from role strings.
   * Falls back to frontend-derived values when claims are unavailable.
   */
  const workspaceAccess = useMemo(() => {
    if (routing?.workspace_access) return routing.workspace_access;
    // Frontend fallback
    return {
      practice: isPracticeWorkspace,
      client: isClientWorkspace || isAuthenticatedClient,
      public: true,
    };
  }, [isAuthenticatedClient, isClientWorkspace, isPracticeWorkspace, routing?.workspace_access]);

  const practiceEntitled = routing?.practice_entitled ?? isPracticeWorkspace;

  // ─────────────────────────────────────────────────────────────────────────

  return {
    // Workspace flags
    isPublicWorkspace,
    isPracticeWorkspace,
    isClientWorkspace,
    isAuthenticatedClient,
    effectiveWorkspace,

    // IDs & slugs
    effectivePracticeId,
    effectivePracticeSlug,
    resolvedPracticeSlug,
    resolvedPublicPracticeSlug,
    resolvedClientPracticeSlug,

    // Display values
    resolvedPracticeName,
    resolvedPracticeLogo,
    resolvedPracticeDescription,
    resolvedAccentColor,

    // Navigation
    normalizedRouteConversationId,
    conversationsBasePath,
    conversationBackPath,
    practiceMattersPath,
    publicConversationsBasePath,
    conversationResetKey,

    // Layout & roles
    layoutMode,
    currentUserRole,
    canReviewLeads,

    // Backend routing claims
    workspaceAccess,
    practiceEntitled,
  };
};