import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';
import { anonymousClient } from 'better-auth/client/plugins';
import { stripeClient } from '@better-auth/stripe/client';
import { setToken, getTokenAsync } from './tokenStorage';
import { transformSessionUser, type BetterAuthSessionUser } from '@/shared/types/user';
import { getBackendApiUrl } from '@/config/urls';

// Type for the auth client (inferred from createAuthClient return type)
type AuthClientType = ReturnType<typeof createAuthClient>;
type AuthSession = ReturnType<AuthClientType['useSession']>;
type AuthSessionData = AuthSession['data'];
type TypedSessionData = AuthSessionData extends { user: unknown; session: infer S }
  ? { user: BetterAuthSessionUser; session: S }
  : AuthSessionData;

// ENV VAR: VITE_BACKEND_API_URL (via getBackendApiUrl() from src/config/urls.ts)
// In development, use Vite proxy if backend is localhost, otherwise use direct URL.
// In production, always use remote backend URL.
function getAuthBaseUrl(): string | undefined {
  if (typeof window === 'undefined') {
    return 'https://placeholder-auth-server.com';
  }

  if (import.meta.env.DEV) {
    const backendUrl = import.meta.env.VITE_APP_BASE_URL;

    // If backend is localhost, use Vite proxy (relative URLs)
    // Vite proxy routes /api/auth to the local backend (e.g., http://localhost:3000/api/auth)
    if (backendUrl.startsWith('http://localhost:') || backendUrl.startsWith('http://127.0.0.1:')) {
      return undefined; // Use relative URLs, let Vite proxy handle it
    }

    // Remote backend (staging-api.blawby.com) - use direct URL with credentials
    return getBackendApiUrl();
  }

  // In production, always use remote backend URL
  return getBackendApiUrl();
}

// Cached auth client instance (only one is ever created and cached - the browser client)
// Note: During SSR/build (prerender), a placeholder is created but never cached or used at runtime
let cachedAuthClient: AuthClientType | null = null;

/**
 * Get or create the auth client instance.
 * The client is created lazily on first access and cached for subsequent calls.
 * Validation of VITE_BACKEND_API_URL happens in browser context before client creation.
 * 
 * During SSR/build, returns a placeholder client that will never be used at runtime.
 * 
 * @throws {Error} If VITE_BACKEND_API_URL is missing in production (browser context)
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
 * @throws {Error} If VITE_BACKEND_API_URL is missing in production (browser context)
 */
function getAuthClient(): AuthClientType {
  // If already created (browser context), return cached client
  if (cachedAuthClient) {
    return cachedAuthClient;
  }

  // During SSR/build (prerender), return minimal placeholder (not cached)
  // This is ONLY to prevent build errors - it's never used at runtime
  if (typeof window === 'undefined') {
    const placeholderBaseURL = getAuthBaseUrl(); // Returns placeholder during SSR
    return createAuthClient({
      plugins: [organizationClient(), anonymousClient(), stripeClient({ subscription: true })],
      baseURL: placeholderBaseURL,
      fetchOptions: {
        credentials: 'include',
        auth: {
          type: "Bearer",
          token: async () => "",
        },
        onSuccess: async () => { },
      }
    });
  }

  // Browser context - create the REAL client (only one is ever created and cached)
  const baseURL = getAuthBaseUrl();

  const client = createAuthClient({
    plugins: [organizationClient(), anonymousClient(), stripeClient({ subscription: true })],
    baseURL: import.meta.env.VITE_BACKEND_API_URL,
    fetchOptions: {
      credentials: 'include',
      auth: {
        type: "Bearer",
        token: async () => {
          // Wait for token to be available from IndexedDB on first call
          const token = await getTokenAsync();
          return token || "";
        }
      },
      onSuccess: async (ctx) => {
        // Better Auth Bearer plugin sends token in Set-Auth-Token header for write operations
        // (sign-in, sign-up, bearer.generate). Read operations (getSession, etc.) don't return tokens.
        // We use the token from IndexedDB for all requests, and only update it when we get a new one.
        const authToken = ctx.response.headers.get("set-auth-token") ||
          ctx.response.headers.get("Set-Auth-Token");

        if (authToken) {
          // New token received - save it to IndexedDB
          // This happens on sign-in, sign-up, or token refresh
          try {
            await setToken(authToken);
          } catch (error) {
            console.error('[Auth] Failed to save token:', error);
          }
        }
        // No token in response is expected for read operations (getSession, etc.)
        // We already have the token in IndexedDB, so we don't need to do anything
      }
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

// Export the auth client getter
export const authClient = new Proxy({} as AuthClientType, {
  get(_target, prop) {
    const client = getAuthClient();
    const value = (client as Record<PropertyKey, unknown>)[prop];

    // If it's a function, it might also have properties (like subscription.upgrade, subscription.list)
    // Create a proxy that handles both calling the function AND accessing its properties
    if (typeof value === 'function') {
      const boundFn = value.bind(client);
      // Create a function that has the properties from the original value
      // We'll use Object.assign to copy properties, but the main approach is to proxy property access
      const proxiedFn = Object.assign(boundFn, value);

      // Return a proxy that handles both function calls and property access
      return new Proxy(proxiedFn, {
        apply(_target, _thisArg, args) {
          // When called as a function, call the bound function
          return boundFn(...args);
        },
        get(_target, subProp) {
          // When accessing properties (like subscription.upgrade), get them from the original value
          // Properties are on the original function, not the bound one
          const subValue = (value as unknown as Record<PropertyKey, unknown>)[subProp];

          if (typeof subValue === 'function') {
            // Bind nested functions to the original value to preserve 'this'
            return subValue.bind(value);
          }
          // Handle further nesting (e.g., subscription.upgrade might return an object)
          if (subValue && typeof subValue === 'object') {
            return new Proxy(subValue, {
              get(_target, subSubProp) {
                const subSubValue = subValue[subSubProp];
                if (typeof subSubValue === 'function') {
                  return subSubValue.bind(subValue);
                }
                return subSubValue;
              }
            });
          }
          return subValue;
        }
      });
    }

    // If it's an object (like signUp, signIn, organization which have nested methods), return a proxy for it
    if (value && typeof value === 'object') {
      return new Proxy(value, {
        get(_target, subProp) {
          const subValue = value[subProp];
          if (typeof subValue === 'function') {
            // Bind the function to preserve 'this' context
            return subValue.bind(value);
          }
          // Handle further nesting (e.g., signUp.email)
          if (subValue && typeof subValue === 'object') {
            return new Proxy(subValue, {
              get(_target, subSubProp) {
                const subSubValue = subValue[subSubProp];
                if (typeof subSubValue === 'function') {
                  return subSubValue.bind(subValue);
                }
                return subSubValue;
              }
            });
          }
          return subValue;
        }
      });
    }
    return value;
  }
}) as AuthClientType;

export const signOut = (...args: Parameters<AuthClientType['signOut']>) => getAuthClient().signOut(...args);

// useSession is a React hook - must be called directly, not wrapped
export const useSession = () => {
  const client = getAuthClient();
  return client.useSession();
};

export const useTypedSession = (): Omit<AuthSession, 'data'> & { data: TypedSessionData | undefined } => {
  const client = getAuthClient();
  const session = client.useSession();
  const rawUser = session.data?.user as Record<string, unknown> | undefined;
  let typedUser: BetterAuthSessionUser | undefined;

  if (rawUser) {
    try {
      typedUser = transformSessionUser(rawUser);
    } catch (error) {
      console.error('[Auth] Failed to transform session user', {
        error,
        userId: typeof rawUser.id === 'string' ? rawUser.id : undefined
      });
    }
  }

  if (session.data && typedUser) {
    return {
      ...session,
      data: { ...session.data, user: typedUser }
    };
  }

  return {
    ...session,
    data: undefined
  };
};

export const getSession = (...args: Parameters<AuthClientType['getSession']>) => getAuthClient().getSession(...args);
type UpdateUserArgs = Parameters<AuthClientType['updateUser']>;
type UpdateUserInput = Partial<BetterAuthSessionUser> & Record<string, unknown>;
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
// - authClient.organization.setActive({ organizationId: string }) - Set active practice
// - authClient.organization.create({ name, slug, logo?, metadata? }) - Create practice
// - authClient.organization.list() - List user's practices
// - authClient.organization.listMembers({ organizationId?, limit?, offset? }) - List members
// - authClient.organization.getFullOrganization({ organizationId?, organizationSlug? }) - Get full practice details
// - authClient.useActiveOrganization() - React hook for active practice
// - authClient.organization.getActiveMemberRole() - Get user's role in active practice
// See: https://better-auth.com/docs/plugins/organization
