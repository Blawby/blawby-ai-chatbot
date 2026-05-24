import { signOut as betterAuthSignOut } from '@/shared/lib/authClient';
import { queryCache } from '@/shared/lib/queryCache';

/**
 * Centralized sign out utility that handles:
 * 1. Better Auth sign out (revokes session)
 * 2. Remove auth-related localStorage hints (without touching unrelated app data)
 * 3. Always route to /auth — even if the Better Auth call errors, so the user
 *    can never be stranded in a signed-out-but-still-on-the-workspace state.
 */
export async function signOut(options?: {
  skipReload?: boolean;
  onSuccess?: () => void;
  navigate?: (path: string, replace?: boolean) => void;
  fetchOptions?: {
    onSuccess?: () => void;
  };
}): Promise<void> {
  const clearLocalAuthState = () => {
    try {
      const authKeys = [
        'onboardingCompleted',
        'onboardingCheckDone',
        'businessSetupPending',
        'cartPreferences',
        'cartData',
      ];

      for (const key of authKeys) {
        localStorage.removeItem(key);
      }

      // Clean any Better Auth specific markers
      const betterAuthKeys = Object.keys(localStorage).filter((key) =>
        key.startsWith('better-auth') || key.startsWith('__better-auth')
      );
      for (const key of betterAuthKeys) {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn('Failed to clear auth-related localStorage entries:', error);
    }
  };

  const routeToAuth = () => {
    if (options?.skipReload) return;
    // Hard reload guarantees in-memory session caches (SessionContext,
    // query caches, etc.) are dropped, so /auth can't bounce back into a
    // workspace using a stale signed-in state. SPA navigate is only used
    // when an opt-out reload was explicitly requested via skipReload.
    if (typeof window !== 'undefined') {
      window.location.replace('/auth');
      return;
    }
    options?.navigate?.('/auth', true);
  };

  let signOutError: unknown = null;
  try {
    await betterAuthSignOut({
      fetchOptions: {
        ...options?.fetchOptions,
        onSuccess: () => {
          options?.fetchOptions?.onSuccess?.();
        },
      },
    });
  } catch (error) {
    signOutError = error;
    console.error('Error signing out:', error);
  } finally {
    clearLocalAuthState();
    queryCache.clear();
    options?.onSuccess?.();
    routeToAuth();
  }

  if (signOutError) {
    throw signOutError;
  }
}
