import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';
import { anonymousClient } from 'better-auth/client/plugins';
import { stripeClient } from '@better-auth/stripe/client';
import { setToken, getTokenAsync } from './tokenStorage';
import { isDevelopment } from '@/shared/utils/environment';
import { transformSessionUser, type BetterAuthSessionUser } from '@/shared/types/user';

// Type for the auth client (inferred from createAuthClient return type)
type AuthClientType = ReturnType<typeof createAuthClient>;
type AuthSession = ReturnType<AuthClientType['useSession']>;
type AuthSessionData = AuthSession['data'];
type TypedSessionData = AuthSessionData extends { user: unknown; session: infer S }
  ? { user: BetterAuthSessionUser; session: S }
  : AuthSessionData;

// Remote better-auth server URL
// REQUIRED in production - must be set via VITE_AUTH_SERVER_URL environment variable
// For Cloudflare Pages deployments, set this in the Pages dashboard under Environment Variables
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_SERVER_URL;

// Fallback to staging API in development (for local testing)
const FALLBACK_AUTH_URL = "https://staging-api.blawby.com";

// Get auth URL - validate in browser context only
function getAuthBaseUrl(): string {
  if (typeof window === 'undefined') {
    // During SSR/build, return a placeholder that won't be used
    // The actual client creation is guarded in getAuthClient()
    return 'https://placeholder-auth-server.com';
  }
  
  // In development, use same origin ONLY if MSW is enabled
  // MSW service workers can only intercept same-origin requests
  // If MSW is disabled, use staging-api directly
  if (isDevelopment()) {
    const enableMocks = import.meta.env.VITE_ENABLE_MSW === 'true';
    
    if (enableMocks) {
      // MSW enabled - use same origin for interception
      console.log('[getAuthBaseUrl] DEV mode with MSW - using window.location.origin');
      return window.location.origin;
    } else {
      // MSW disabled - use staging-api directly
      console.log('[getAuthBaseUrl] DEV mode without MSW - using staging-api');
      return FALLBACK_AUTH_URL;
    }
  }
  
  // Browser runtime - validate and throw if missing
  const finalAuthUrl = AUTH_BASE_URL || null;
  
  if (!finalAuthUrl) {
    throw new Error(
      'VITE_AUTH_SERVER_URL is required in production. Please set this environment variable in Cloudflare Pages (Settings > Environment Variables) to your Better Auth server URL.'
    );
  }
  
  return finalAuthUrl;
}

// Cached auth client instance with context tracking (created lazily on first access)
let cachedAuthClient: { client: AuthClientType; context: 'ssr' | 'browser' } | null = null;

/**
 * Get or create the auth client instance.
 * The client is created lazily on first access and cached for subsequent calls.
 * Validation of VITE_AUTH_SERVER_URL happens in browser context before client creation.
 * 
 * During SSR/build, returns a placeholder client that will never be used at runtime.
 * 
 * @throws {Error} If VITE_AUTH_SERVER_URL is missing in production (browser context)
 */
function getAuthClient(): AuthClientType {
  const currentContext = typeof window === 'undefined' ? 'ssr' : 'browser';
  
  // If already created and cached for the same context, return it
  if (cachedAuthClient && cachedAuthClient.context === currentContext) {
    return cachedAuthClient.client;
  }
  
  // During SSR/build, create a placeholder client that won't be used
  // This prevents build errors while still allowing the code to be analyzed
  if (currentContext === 'ssr') {
    const placeholderBaseURL = getAuthBaseUrl(); // Returns placeholder during SSR
    const client = createAuthClient({
      plugins: [organizationClient(), anonymousClient(), stripeClient({ subscription: true })],
      baseURL: placeholderBaseURL,
      fetchOptions: {
        auth: {
          type: "Bearer",
          token: async () => "",
        },
        onSuccess: async () => {},
      }
    });
    cachedAuthClient = { client, context: 'ssr' };
    return client;
  }
  
  // Browser context - validate baseURL before creating client
  const baseURL = getAuthBaseUrl();
  
  // Create and cache the client
  const client = createAuthClient({
    plugins: [organizationClient(), anonymousClient(), stripeClient({ subscription: true })],
    baseURL,
    fetchOptions: {
      auth: {
        type: "Bearer",
        token: async () => {
          // Wait for token to be available from IndexedDB on first call
          const token = await getTokenAsync();
          if (isDevelopment()) {
            console.debug('[Auth] Token retrieved:', token ? '***' : 'null');
          }
          return token || "";
        }
      },
      onSuccess: async (ctx) => {
        // Better Auth Bearer plugin sends token in lowercase header name
        // Check both lowercase and capitalized versions
        const authToken = ctx.response.headers.get("set-auth-token") || 
                         ctx.response.headers.get("Set-Auth-Token");
        if (authToken) {
          try {
            await setToken(authToken);
            if (isDevelopment()) {
              console.log('[Auth] Token saved from response header:', `${authToken.substring(0, 20)}...`);
              // Verify it was saved
              const verifyToken = await getTokenAsync();
              if (verifyToken === authToken) {
                console.log('[Auth] Token verified in storage');
              } else {
                console.error('[Auth] Token save verification failed. Expected:', authToken.substring(0, 20), 'Got:', verifyToken?.substring(0, 20));
              }
            }
          } catch (error) {
            console.error('[Auth] Failed to save token:', error);
          }
        } else if (isDevelopment()) {
          const headerEntries: string[] = [];
          ctx.response.headers.forEach((_value, key) => {
            headerEntries.push(key);
          });
          console.warn('[Auth] No token in response headers. Available headers:', headerEntries);
        }
      }
    }
  });
  
  cachedAuthClient = { client, context: 'browser' };
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

export const useTypedSession = (): Omit<AuthSession, 'data'> & { data: TypedSessionData } => {
  const client = getAuthClient();
  const session = client.useSession();
  const rawUser = session.data?.user as Record<string, unknown> | undefined;
  const typedUser: BetterAuthSessionUser | undefined = rawUser ? transformSessionUser(rawUser) : undefined;

  return {
    ...session,
    data: session.data && typedUser
      ? { ...session.data, user: typedUser }
      : (session.data as TypedSessionData)
  };
};

export const getSession = (...args: Parameters<AuthClientType['getSession']>) => getAuthClient().getSession(...args);
export const updateUser = (...args: Parameters<AuthClientType['updateUser']>) => getAuthClient().updateUser(...args);
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
