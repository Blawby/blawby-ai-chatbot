import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';
import { anonymousClient } from 'better-auth/client/plugins';
import { stripeClient } from '@better-auth/stripe/client';
import type { BackendSessionUser, AuthSessionPayload } from '@/shared/types/user';
import { getWorkerApiUrl } from '@/config/urls';

// Type for the auth client (inferred from createAuthClient return type)
type AuthClientType = ReturnType<typeof createAuthClient>;
// We intentionally avoid exposing any "transformError" union here.
// The hook and `getSession()` unwrap any SDK envelopes and return
// the canonical `AuthSessionPayload` to callers.

// Auth requests are proxied through the Worker to keep session cookies same-origin.
function getAuthBaseUrl(): string | undefined {
  if (typeof window === 'undefined') {
    return 'https://placeholder-auth-server.com';
  }

  return getWorkerApiUrl();
}

// Cached auth client instance (only one is ever created and cached - the browser client)
// Note: During SSR/build (prerender), a placeholder is created but never cached or used at runtime
let cachedAuthClient: AuthClientType | null = null;

/**
 * Get or create the auth client instance.
 * The client is created lazily on first access and cached for subsequent calls.
 * Validation of VITE_BACKEND_API_URL happens in getBackendApiUrl() before client creation.
 * 
 * During SSR/build, returns a placeholder client that will never be used at runtime.
 * 
 * @throws {Error} If VITE_BACKEND_API_URL is missing (browser context)
 */
/**
 * Get or create the auth client instance.
 * 
 * IMPORTANT: Only ONE client is ever active at runtime:
 * - During build/prerender: Returns a minimal placeholder (prevents build errors, never cached)
 * - At runtime (browser): Creates and caches the real client (reused for all subsequent calls)
 * 
 * The SSR placeholder is discarded after build - the browser client replaces it on first access.
 * 
 * @throws {Error} If VITE_BACKEND_API_URL is missing (browser context)
 */
function getAuthClient(): AuthClientType {
  // If already created (browser context), return cached client
  if (cachedAuthClient) {
    return cachedAuthClient;
  }

  // During SSR/build (prerender), return minimal placeholder (not cached)
  // This is ONLY to prevent build errors - it's never used at runtime
  if (typeof window === 'undefined') {
    const placeholderBaseURL = getAuthBaseUrl(); // Returns a placeholder during SSR/build, not the real backend URL.
    return createAuthClient({
      plugins: [organizationClient(), anonymousClient(), stripeClient({ subscription: true })],
      baseURL: placeholderBaseURL,
      fetchOptions: {
        credentials: 'include'
      }
    });
  }

  // Browser context - create the REAL client (only one is ever created and cached)
  const client = createAuthClient({
    plugins: [organizationClient(), anonymousClient(), stripeClient({ subscription: true })],
    baseURL: getAuthBaseUrl(),
    fetchOptions: {
      credentials: 'include'
    }
  });

  // Cache the browser client (only one is ever created)
  cachedAuthClient = client;
  return client;
}

// Helper to get the actual client (for cases where proxy doesn't work)
export function getClient(): AuthClientType {
  return getAuthClient();
}

// Export the auth client getter.
//
// Better Auth already returns a dynamic proxy. Wrapping that proxy again
// makes harmless property reads look like route traversals, which can turn
// accidental lookups into requests such as /api/auth/fetch-options/... .
// We keep the export as a thin pass-through and explicitly block the
// non-public fetchOptions property so it fails locally instead of being
// interpreted as an auth route.
export const authClient = new Proxy({} as AuthClientType, {
  get(_target, prop) {
    if (prop === 'fetchOptions') {
      return undefined;
    }

    const client = getAuthClient();
    return (client as Record<PropertyKey, unknown>)[prop];
  }
}) as AuthClientType;

export const signOut = (...args: Parameters<AuthClientType['signOut']>) => getAuthClient().signOut(...args);

// useSession is a React hook - must be called directly, not wrapped
export const useSession = () => {
  const client = getAuthClient();
  const hook = client.useSession();

  // Normalize the hook return so consumers only see the backend shape.
  const unwrapData = (d: unknown): AuthSessionPayload => {
    if (d === null || d === undefined) return null;
    if (typeof d === 'object' && d !== null) {
      const asRecord = d as Record<string, unknown>;
      if ('data' in asRecord && typeof asRecord.data === 'object' && asRecord.data !== null) {
        const inner = asRecord.data as Record<string, unknown>;
        if ('session' in inner || 'user' in inner) {
          return inner as AuthSessionPayload;
        }
      }
      if ('session' in asRecord || 'user' in asRecord) {
        return asRecord as AuthSessionPayload;
      }
    }
    return null;
  };

  const sessionPayload = unwrapData(hook.data);
  const hookState = hook as unknown as { isPending?: boolean; isLoading?: boolean; error?: unknown };

  return {
    session: sessionPayload,
    isPending: hookState.isPending ?? hookState.isLoading ?? false,
    error: hookState.error ?? null,
  } as { session: AuthSessionPayload; isPending: boolean; error: unknown };
};

export const useActiveMemberRole = () => {
  const client = getAuthClient();
  return client.useActiveMemberRole();
};

export const getSession = async (...args: Parameters<AuthClientType['getSession']>): Promise<AuthSessionPayload> => {
  const result = await getAuthClient().getSession(...args);
  // If the SDK returns an envelope `{ data: { session, user } }`, unwrap it once.
  // Otherwise assume it already returned the backend shape or `null`.
  // Cast via unknown first to avoid accidental structural conversion warnings
  const resUnknown = result as unknown;
  if (resUnknown && typeof resUnknown === 'object') {
    const resObj = resUnknown as Record<string, unknown>;
    if ('data' in resObj && typeof resObj.data === 'object' && resObj.data !== null) {
      const inner = resObj.data as Record<string, unknown>;
      if ('session' in inner || 'user' in inner) return inner as AuthSessionPayload | null;
    }
  }

  return result as unknown as AuthSessionPayload | null;
};
type UpdateUserArgs = Parameters<AuthClientType['updateUser']>;
type UpdateUserInput = Partial<BackendSessionUser> & Record<string, unknown>;
type UpdateUserFn = (data: UpdateUserInput, options?: UpdateUserArgs[1]) => ReturnType<AuthClientType['updateUser']>;

export const updateUser: UpdateUserFn = (data, options) =>
  getAuthClient().updateUser(
    data as UpdateUserArgs[0],
    options as UpdateUserArgs[1]
  );
export const deleteUser = (...args: Parameters<AuthClientType['deleteUser']>) => getAuthClient().deleteUser(...args);

// Keep type export for compatibility
export type AuthClient = typeof authClient;

// Two-factor auth exports
export const hasTwoFactorPlugin = () => {
  const client = getAuthClient();
  return Boolean(client.twoFactor);
};

export type TwoFactorClient = NonNullable<AuthClientType['twoFactor']>;

// Better Auth organization plugin methods (external API uses "organization" terminology):
// Note: These methods wrap Better Auth's organization plugin API which uses "organization" in its interface.
// Internally we use "practice" terminology, but the Better Auth API still requires "organizationId" parameters.
// - authClient.organization.create({ name, slug, logo?, metadata? }) - Create practice
// - authClient.organization.list() - List user's practices
// - authClient.organization.listMembers({ organizationId?, limit?, offset? }) - List members
// - authClient.organization.getFullOrganization({ organizationId?, organizationSlug? }) - Get full practice details
// - authClient.organization.getActiveMemberRole() - Get user's role in active practice context
// See: https://better-auth.com/docs/plugins/organization
