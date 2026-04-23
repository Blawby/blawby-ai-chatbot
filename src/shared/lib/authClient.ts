import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';
import { anonymousClient } from 'better-auth/client/plugins';
import { stripeClient } from '@better-auth/stripe/client';
import type { BackendSessionUser, AuthSessionPayload } from '@/shared/types/user';
import { safeConvertToDate, validateRequiredFields } from '@/shared/types/user';
import { getWorkerApiUrl } from '@/config/urls';

type BetterAuthRawSessionRecord = Record<string, unknown> & {
  active_organization_id?: string;
  activeOrganizationId?: string;
};

type BetterAuthRawSessionUser = Record<string, unknown> & {
  is_anonymous?: boolean;
  isAnonymous?: boolean;
  onboarding_complete?: boolean;
  onboardingComplete?: boolean;
  primary_workspace?: 'public' | 'client' | 'practice' | null;
  primaryWorkspace?: 'public' | 'client' | 'practice' | null;
  practice_id?: string | null;
  practiceId?: string | null;
  active_practice_id?: string | null;
  activePracticeId?: string | null;
  active_organization_id?: string | null;
  activeOrganizationId?: string | null;
  stripe_customer_id?: string | null;
  stripeCustomerId?: string | null;
  email_verified?: boolean;
  emailVerified?: boolean;
  last_login_method?: string;
  lastLoginMethod?: string;
};

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
  const sessionPayload = unwrapSessionData(hook.data);
  const hookState = hook as unknown as { isPending?: boolean; isLoading?: boolean; error?: unknown };

  return {
    session: sessionPayload,
    isPending: hookState.isPending ?? hookState.isLoading ?? false,
    error: hookState.error ?? null,
  } as { session: AuthSessionPayload | null; isPending: boolean; error: unknown };
};

// Helper to normalize/unpack SDK envelopes or raw backend session shapes.
function unwrapSessionData(d: unknown): AuthSessionPayload | null {
  const toCanonical = (record: Record<string, unknown>): AuthSessionPayload | null => {
    if (!('session' in record) || !('user' in record)) {
      return null;
    }
    // Better Auth may return explicit nulls for unauthenticated state.
    if (record.session === null && record.user === null) {
      return null;
    }
    if (!record.session || !record.user || typeof record.session !== 'object' || typeof record.user !== 'object') {
      return null;
    }

    const sessionRecord = record.session as BetterAuthRawSessionRecord;
    const userRecord = record.user as BetterAuthRawSessionUser;

    const normalizedSession: Record<string, unknown> = {
      ...sessionRecord,
    };
    if (
      typeof normalizedSession.active_organization_id !== 'string'
      && typeof sessionRecord.activeOrganizationId === 'string'
    ) {
      normalizedSession.active_organization_id = sessionRecord.activeOrganizationId;
    }

    const normalizedUser: Record<string, unknown> = {
      ...userRecord,
    };
    if (
      typeof normalizedUser.is_anonymous !== 'boolean'
      && typeof userRecord.isAnonymous === 'boolean'
    ) {
      normalizedUser.is_anonymous = userRecord.isAnonymous;
    }
    if (typeof normalizedUser.is_anonymous !== 'boolean') {
      normalizedUser.is_anonymous = false;
    }
    if (
      typeof normalizedUser.onboarding_complete !== 'boolean'
      && typeof userRecord.onboardingComplete === 'boolean'
    ) {
      normalizedUser.onboarding_complete = userRecord.onboardingComplete;
    }
    if (
      typeof normalizedUser.primary_workspace !== 'string'
      && typeof userRecord.primaryWorkspace === 'string'
    ) {
      normalizedUser.primary_workspace = userRecord.primaryWorkspace;
    }
    if (
      typeof normalizedUser.practice_id !== 'string'
      && typeof userRecord.practiceId === 'string'
    ) {
      normalizedUser.practice_id = userRecord.practiceId;
    }
    if (
      typeof normalizedUser.active_practice_id !== 'string'
      && typeof userRecord.activePracticeId === 'string'
    ) {
      normalizedUser.active_practice_id = userRecord.activePracticeId;
    }
    if (
      typeof normalizedUser.active_organization_id !== 'string'
      && typeof userRecord.activeOrganizationId === 'string'
    ) {
      normalizedUser.active_organization_id = userRecord.activeOrganizationId;
    }
    if (
      typeof normalizedUser.stripe_customer_id !== 'string'
      && typeof userRecord.stripeCustomerId === 'string'
    ) {
      normalizedUser.stripe_customer_id = userRecord.stripeCustomerId;
    }
    if (
      typeof normalizedUser.email_verified !== 'boolean'
      && typeof userRecord.emailVerified === 'boolean'
    ) {
      normalizedUser.email_verified = userRecord.emailVerified;
    }
    if (
      typeof normalizedUser.last_login_method !== 'string'
      && typeof userRecord.lastLoginMethod === 'string'
    ) {
      normalizedUser.last_login_method = userRecord.lastLoginMethod;
    }
    // Runtime validation: ensure required fields exist and timestamps are converted
    try {
      // Basic required fields (id, email) - throws if missing
      validateRequiredFields(normalizedUser);
    } catch (err) {
      console.warn('[authClient] Invalid session user received; rejecting session payload', err, { raw: userRecord });
      return null;
    }

    // Ensure name exists (must be a string)
    if (typeof normalizedUser.name !== 'string' || normalizedUser.name.trim() === '') {
      console.warn('[authClient] Session user missing `name` field; rejecting session payload', { raw: userRecord });
      return null;
    }

    // Ensure is_anonymous exists and is boolean
    if (typeof normalizedUser.is_anonymous !== 'boolean') {
      normalizedUser.is_anonymous = Boolean(userRecord.isAnonymous ?? false);
    }

    // Convert timestamps to Date|null
    try {
      normalizedUser.created_at = safeConvertToDate((userRecord as Record<string, unknown>).created_at ?? (userRecord as Record<string, unknown>).createdAt ?? null);
      normalizedUser.updated_at = safeConvertToDate((userRecord as Record<string, unknown>).updated_at ?? (userRecord as Record<string, unknown>).updatedAt ?? null);
    } catch (_) {
      normalizedUser.created_at = null;
      normalizedUser.updated_at = null;
    }

    return {
      session: normalizedSession,
      user: normalizedUser as unknown as BackendSessionUser,
    } as AuthSessionPayload;
  };

  if (d === null || d === undefined) return null;
  if (typeof d === 'object' && d !== null) {
    const asRecord = d as Record<string, unknown>;
    if ('data' in asRecord && typeof asRecord.data === 'object' && asRecord.data !== null) {
      const inner = asRecord.data as Record<string, unknown>;
      return toCanonical(inner);
    }
    return toCanonical(asRecord);
  }
  return null;
}

export const useActiveMemberRole = () => {
  const client = getAuthClient();
  return client.useActiveMemberRole();
};

export const getSession = async (...args: Parameters<AuthClientType['getSession']>): Promise<AuthSessionPayload | null> => {
  const result = await getAuthClient().getSession(...args);
  return unwrapSessionData(result);
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
