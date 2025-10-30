import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { cloudflareClient } from "better-auth-cloudflare/client";
import { stripeClient } from "@better-auth/stripe/client";

// Safe baseURL computation that prefers the current origin in local dev
const getBaseURL = () => {
  // In the browser, always use current origin for localhost to keep auth and APIs on the same host
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    try {
      const { hostname } = new URL(origin);
      const normalizedHostname =
        hostname.startsWith("[") && hostname.endsWith("]")
          ? hostname.slice(1, -1)
          : hostname;
      const localHostnames = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
      const isLocal = localHostnames.has(normalizedHostname);
      if (isLocal) return origin;
    } catch {
      // Treat invalid URLs as non-local
    }
  }

  // Otherwise allow explicit override (e.g., production, preview)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Fallback to current origin if available
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [organizationClient(), cloudflareClient(), stripeClient({ subscription: true })],
  fetchOptions: {
    credentials: "include", // Important for CORS
  },
  endpoints: {
    session: {
      get: "/get-session"  // Override client default to match server endpoint
    }
  }
});

export type AuthClient = typeof authClient;

/**
 * Interface for Better Auth twoFactor plugin client methods
 */
export interface TwoFactorClient {
  enable: (options: { code: string }) => Promise<void>;
  disable: () => Promise<void>;
}

/**
 * Type guard to check if authClient has twoFactor plugin available
 */
export function hasTwoFactorPlugin(
  client: AuthClient
): client is AuthClient & { twoFactor: TwoFactorClient } {
  return (
    typeof client === 'object' &&
    client !== null &&
    'twoFactor' in client &&
    typeof (client as { twoFactor?: unknown }).twoFactor === 'object' &&
    (client as { twoFactor?: { enable?: unknown; disable?: unknown } }).twoFactor !== null &&
    typeof (client as { twoFactor?: { enable?: unknown } }).twoFactor?.enable === 'function' &&
    typeof (client as { twoFactor?: { disable?: unknown } }).twoFactor?.disable === 'function'
  );
}

// Export individual methods for easier use
export const signIn = authClient.signIn;
export const signOut = authClient.signOut;
export const signUp = authClient.signUp;
export const updateUser = authClient.updateUser;
export const deleteUser = authClient.deleteUser;

// Export Better Auth's reactive hooks (primary method for components)
export const useSession = authClient.useSession;
export const useActiveOrganization = authClient.useActiveOrganization;

// Export getSession for one-time checks (secondary method)
export const getSession = authClient.getSession;
