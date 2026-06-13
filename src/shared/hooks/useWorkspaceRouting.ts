/**
 * useWorkspaceRouting
 *
 * Derives all workspace-scoped identifiers and resolved slugs from raw props
 * and Better Auth session state. Centralises the logic that was previously
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
 * Outputs  (all stable/memoized)
 * ────────────────────────────────
 *  isPublicWorkspace / isPracticeWorkspace / isClientWorkspace
 *  isAuthenticatedClient   – public workspace + authenticated client role
 *
 *  resolvedPracticeSlug    – canonical practice slug (prop → live practice)
 *
 *  resolvedPracticeName    – display name (live practice > config fallback)
 *  resolvedPracticeLogo    – logo URL (live practice > config fallback)
 *  resolvedPublicPracticeSlug   – slug for public workspace routes
 *  resolvedClientPracticeSlug   – slug for client workspace routes
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
 */

import { useMemo } from 'preact/hooks';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import type { WorkspaceType } from '@/shared/types/workspace';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { hasLeadReviewPermission } from '@/shared/utils/leadPermissions';
import { getWorkspaceConversationsPath, getWorkspaceMattersPath, getWorkspaceContactsPath } from '@/shared/utils/workspace';
import type { LayoutMode } from '@/app/MainApp';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import type { AuthSessionPayload } from '@/shared/types/user';

// ─── types ────────────────────────────────────────────────────────────────────

interface CurrentPractice {
  slug?: string | null;
  name?: string | null;
  logo?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface PracticeDetails {}

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
  session?: AuthSessionPayload;
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
}: UseWorkspaceRoutingOptions) => {
  const isMobile = useMobileDetection();

  // ── workspace flags ────────────────────────────────────────────────────────

  const isPublicWorkspace = workspace === 'public';
  const isPracticeWorkspace = workspace === 'practice';
  const isClientWorkspace = workspace === 'client';

  const isAuthenticatedClient = useMemo(() => Boolean(
    isPublicWorkspace &&
    session?.user &&
    !session.user.is_anonymous &&
    normalizePracticeRole(activeMemberRole) === 'client'
  ), [activeMemberRole, isPublicWorkspace, session?.user]);

  // ── slug resolution ────────────────────────────────────────────────────────

  const resolvedPublicPracticeSlug = isPublicWorkspace ? (publicPracticeSlug ?? null) : null;
  const resolvedClientPracticeSlug = isClientWorkspace ? (clientPracticeSlug ?? null) : null;

  const resolvedPracticeSlug = useMemo(
    () => practiceSlug ?? currentPractice?.slug ?? undefined,
    [currentPractice?.slug, practiceSlug]
  );

  // ── display values ─────────────────────────────────────────────────────────

  const resolvedPracticeName = useMemo(() => {
    if (isPublicWorkspace) return practiceConfig.name ?? '';
    return currentPractice?.name ?? practiceConfig.name ?? '';
  }, [currentPractice?.name, isPublicWorkspace, practiceConfig.name]);

  const resolvedPracticeLogo = useMemo(() => {
    if (isPublicWorkspace) return practiceConfig.profileImage ?? null;
    return currentPractice?.logo ?? practiceConfig?.profileImage ?? null;
  }, [currentPractice?.logo, isPublicWorkspace, practiceConfig?.profileImage]);

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
    () => getWorkspaceMattersPath('practice', resolvedPracticeSlug ?? null),
    [resolvedPracticeSlug]
  );
  
  const practiceContactsPath = useMemo(
    () => getWorkspaceContactsPath('practice', resolvedPracticeSlug ?? null),
    [resolvedPracticeSlug]
  );

  // ── layout mode ───────────────────────────────────────────────────────────

  /**
   * 'widget'   – embedded in a 3rd-party site via iframe (?v=widget)
   * 'desktop'  – full app shell
   * 'mobile'   – compact app shell
   */
  const layoutMode = useMemo((): LayoutMode => {
    if (isPublicWorkspace && isWidget) return 'widget';
    return isMobile ? 'mobile' : 'desktop';
  }, [isPublicWorkspace, isWidget, isMobile]);

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

  // ─────────────────────────────────────────────────────────────────────────

  return {
    // Workspace flags
    isPublicWorkspace,
    isPracticeWorkspace,
    isClientWorkspace,
    isAuthenticatedClient,

    // slugs
    resolvedPracticeSlug,
    resolvedPublicPracticeSlug,
    resolvedClientPracticeSlug,

    // Display values
    resolvedPracticeName,
    resolvedPracticeLogo,

    // Navigation
    normalizedRouteConversationId,
    conversationsBasePath,
    conversationBackPath,
    practiceMattersPath,
    practiceContactsPath,
    publicConversationsBasePath,
    conversationResetKey,

    // Layout & roles
    layoutMode,
    currentUserRole,
    canReviewLeads,
  };
};
