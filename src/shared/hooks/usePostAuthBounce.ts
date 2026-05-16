import { useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useNavigation } from '@/shared/utils/navigation';
import { useAuthRouteIntentValue } from '@/shared/auth/AuthRouteIntentContext';
import { consumePostAuthConversationContext } from '@/shared/utils/anonymousIdentity';

/**
 * Side-effect hook that handles post-authentication bounce paths stored in
 * sessionStorage:
 *
 *   - `pendingConversation` set by anonymous→signed-in conversation handoff
 *     (consumed via `consumePostAuthConversationContext()`)
 *   - `intakeAwaitingInvitePath` set by intake submissions that need a sign-up
 *     round-trip before continuing
 *
 * Both are one-shot redirects: fire once when the user becomes authenticated,
 * then clear from storage. They are NOT part of `RouteIntent` because they
 * are pointers to "where the user wanted to go", not "where the system says
 * the user belongs".
 *
 * Guarded on the intent being in a settled workspace/no-subscription kind —
 * firing during `loading`, `unauthenticated`, or `onboarding-required` would
 * fight the AuthenticatedRouter's redirect (the gate would push the user
 * back to /auth or /onboarding the moment they landed on the bounce target).
 */
export function usePostAuthBounce(): void {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { session, isPending } = useSessionContext();
  const intent = useAuthRouteIntentValue();

  useEffect(() => {
    if (isPending) return;
    // Only fire after the intent has settled into a stable workspace kind.
    // Loading/unauthenticated/onboarding-required would race the
    // AuthenticatedRouter's redirect; bouncing the user to a target the gate
    // is about to redirect away from creates a visible flicker.
    if (
      intent.kind === 'loading' ||
      intent.kind === 'unauthenticated' ||
      intent.kind === 'onboarding-required'
    ) {
      return;
    }

    if (session?.user && !session.user.is_anonymous) {
      const pendingConversation = consumePostAuthConversationContext();
      if (
        pendingConversation?.workspace === 'public' &&
        pendingConversation.practiceSlug &&
        pendingConversation.conversationId
      ) {
        const targetPath = `/public/${encodeURIComponent(pendingConversation.practiceSlug)}/conversations/${encodeURIComponent(pendingConversation.conversationId)}`;
        const currentUrl = location.url.startsWith('/')
          ? location.url
          : `/${location.url.replace(/^\/+/, '')}`;
        if (currentUrl !== targetPath) {
          navigate(targetPath, true);
          return;
        }
      }
    }

    if (typeof window === 'undefined') return;

    try {
      const pendingPath = window.sessionStorage.getItem('intakeAwaitingInvitePath');
      if (!pendingPath) return;

      const currentUrl = location.url.startsWith('/')
        ? location.url
        : `/${location.url.replace(/^\/+/, '')}`;
      const isValidPendingPath = pendingPath.startsWith('/') && !pendingPath.startsWith('//');
      const isAuthReturnRoute = location.path.startsWith('/auth');

      if (!isValidPendingPath) {
        window.sessionStorage.removeItem('intakeAwaitingInvitePath');
      } else if (pendingPath === currentUrl) {
        window.sessionStorage.removeItem('intakeAwaitingInvitePath');
      } else if (isAuthReturnRoute) {
        window.sessionStorage.removeItem('intakeAwaitingInvitePath');
        navigate(pendingPath, true);
      } else {
        // Outside the auth-return flow, the pending path is stale by
        // definition — the user has already navigated past the intake/invite
        // round-trip. Consume it so it doesn't fire on subsequent navigations.
        window.sessionStorage.removeItem('intakeAwaitingInvitePath');
      }
    } catch (error) {
      try {
        window.sessionStorage.removeItem('intakeAwaitingInvitePath');
      } catch (_innerError) {
        // Ignore secondary failure
      }
      if (import.meta.env.DEV) {
        console.warn('[Workspace] Failed to read intake awaiting path', error);
      }
    }
  }, [session?.user, isPending, location.path, location.url, navigate, intent.kind]);
}
