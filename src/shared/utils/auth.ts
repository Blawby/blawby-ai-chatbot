import { signOut as betterAuthSignOut } from '@/shared/lib/authClient';

/**
 * Centralized sign out utility that handles:
 * 1. Better Auth sign out (revokes session)
 * 2. Remove auth-related localStorage hints (without touching unrelated app data)
 * 3. Optional callback for custom behavior
 */
export async function signOut(options?: {
  skipReload?: boolean;
  onSuccess?: () => void;
  navigate?: (path: string, replace?: boolean) => void;
  fetchOptions?: {
    onSuccess?: () => void;
  };
}): Promise<void> {
  try {
    const handleSuccess = () => {
      // Remove other auth-related localStorage (non-token data)
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

      if (options?.onSuccess) {
        options.onSuccess();
      }

      if (!options?.skipReload) {
        if (options?.navigate) {
          options.navigate('/auth', true);
        } else if (typeof window !== 'undefined') {
          window.location.href = '/auth';
        }
      }
    };

    // Sign out from Better Auth (uses Better Auth method only)
    await betterAuthSignOut({
      fetchOptions: {
        ...options?.fetchOptions,
        onSuccess: () => {
          options?.fetchOptions?.onSuccess?.();
          handleSuccess();
        }
      }
    });
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}
