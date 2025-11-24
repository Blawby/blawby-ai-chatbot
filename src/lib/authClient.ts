import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';
import { setToken, getTokenAsync } from './tokenStorage';

// Remote better-auth server URL
// Use environment variable for flexibility
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_SERVER_URL || "https://adapted-humbly-lynx.ngrok-free.app";

export const authClient = createAuthClient({
  plugins: [organizationClient()],
  baseURL: AUTH_BASE_URL,
  fetchOptions: {
    auth: {
      type: "Bearer",
      token: async () => {
        // Wait for token to be available from IndexedDB on first call
        const token = await getTokenAsync();
        console.log("token", token);
        return token || "";
      }
    },
    onSuccess: async (ctx) => {
      console.log("onSuccess", ctx);
      const authToken = ctx.response.headers.get("Set-Auth-Token");
      if (authToken) {
        await setToken(authToken);
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
