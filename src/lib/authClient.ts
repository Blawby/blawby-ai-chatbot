import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';
import { setToken, getTokenAsync } from './tokenStorage';
import { isDevelopment } from '../utils/environment';

// Type for the auth client (inferred from createAuthClient return type)
type AuthClientType = ReturnType<typeof createAuthClient>;

// Remote better-auth server URL
// REQUIRED in production - must be set via VITE_AUTH_SERVER_URL environment variable
// For Cloudflare Pages deployments, set this in the Pages dashboard under Environment Variables
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_SERVER_URL;

// Fallback to staging API in development (for local testing)
const FALLBACK_AUTH_URL = "https://staging-api.blawby.com";

// Get auth URL - validate in browser context only
function getAuthBaseUrl(): string {
  if (typeof window === 'undefined') {
    throw new Error('Auth client cannot be instantiated during server-side rendering');
  }
  
  // Browser runtime - validate and throw if missing
  const finalAuthUrl = AUTH_BASE_URL || (isDevelopment() ? FALLBACK_AUTH_URL : null);
  
  if (!finalAuthUrl) {
    throw new Error(
      'VITE_AUTH_SERVER_URL is required in production. Please set this environment variable in Cloudflare Pages (Settings > Environment Variables) to your Better Auth server URL.'
    );
  }
  
  return finalAuthUrl;
}

// Cached auth client instance (created lazily on first access)
let cachedAuthClient: AuthClientType | null = null;

/**
 * Get or create the auth client instance.
 * The client is created lazily on first access and cached for subsequent calls.
 * Validation of VITE_AUTH_SERVER_URL happens in browser context before client creation.
 * 
 * @throws {Error} If VITE_AUTH_SERVER_URL is missing in production (browser context)
 */
function getAuthClient(): AuthClientType {
  // If already created and cached, return it
  if (cachedAuthClient) {
    return cachedAuthClient;
  }
  
  // Validate baseURL in browser context before creating client
  const baseURL = getAuthBaseUrl();
  
  // Create and cache the client
  cachedAuthClient = createAuthClient({
    plugins: [organizationClient()],
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
        const authToken = ctx.response.headers.get("set-auth-token");
        if (authToken) {
          await setToken(authToken);
          if (isDevelopment()) {
            console.debug('[Auth] Token saved from response header');
          }
        }
      }
    }
  });
  
  return cachedAuthClient;
}

// Helper to get the actual client (for cases where proxy doesn't work)
export function getClient(): AuthClientType {
  return getAuthClient();
}

// Export the auth client getter
export const authClient = new Proxy({} as AuthClientType, {
  get(_target, prop) {
    const client = getAuthClient();
    const value = (client as any)[prop];
    // If it's a function, bind it to the client to preserve 'this' context
    if (typeof value === 'function') {
      return value.bind(client);
    }
    // If it's an object (like signUp, signIn which have nested methods), return a proxy for it
    if (value && typeof value === 'object') {
      return new Proxy(value, {
        get(_target, subProp) {
          const subValue = value[subProp];
          if (typeof subValue === 'function') {
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

export const getSession = (...args: Parameters<AuthClientType['getSession']>) => getAuthClient().getSession(...args);
export const updateUser = (...args: Parameters<AuthClientType['updateUser']>) => getAuthClient().updateUser(...args);
export const deleteUser = (...args: Parameters<AuthClientType['deleteUser']>) => getAuthClient().deleteUser(...args);

// Keep type export for compatibility
export type AuthClient = typeof authClient;

// Organization plugin methods available on authClient.organization:
// - authClient.organization.setActive({ organizationId: string }) - Set active organization
// - authClient.organization.create({ name, slug, logo?, metadata? }) - Create organization
// - authClient.organization.list() - List user's organizations
// - authClient.organization.listMembers({ organizationId?, limit?, offset? }) - List members
// - authClient.organization.getFullOrganization({ organizationId?, organizationSlug? }) - Get full org details
// - authClient.useActiveOrganization() - React hook for active organization
// - authClient.organization.getActiveMemberRole() - Get user's role in active org
// See: https://better-auth.com/docs/plugins/organization
