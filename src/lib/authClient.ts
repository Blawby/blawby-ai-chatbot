import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';
import { setToken, getTokenAsync } from './tokenStorage';
import { isDevelopment } from '../utils/environment';

// Remote better-auth server URL
// REQUIRED in production - must be set via VITE_AUTH_SERVER_URL environment variable
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_SERVER_URL;

// Fail fast in production if AUTH_SERVER_URL is not configured
if (!AUTH_BASE_URL && import.meta.env.MODE === 'production') {
  throw new Error(
    'VITE_AUTH_SERVER_URL is required in production. Please set this environment variable to your Better Auth server URL.'
  );
}

// Fallback to ngrok URL only in development (for local testing)
const FALLBACK_AUTH_URL = "https://adapted-humbly-lynx.ngrok-free.app";
const finalAuthUrl = AUTH_BASE_URL || (isDevelopment() ? FALLBACK_AUTH_URL : null);

if (!finalAuthUrl) {
  throw new Error('VITE_AUTH_SERVER_URL must be configured');
}

export const authClient = createAuthClient({
  plugins: [organizationClient()],
  baseURL: finalAuthUrl,
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
      const authToken = ctx.response.headers.get("Set-Auth-Token");
      if (authToken) {
        await setToken(authToken);
        if (isDevelopment()) {
          console.debug('[Auth] Token saved from response header');
        }
      }
    }
  }
});

// Export all auth methods directly - use these, no manual API calls
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  updateUser,
  deleteUser,
} = authClient;

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
