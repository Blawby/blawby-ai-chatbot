import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { cloudflareClient } from "better-auth-cloudflare/client";
import { stripeClient } from "@better-auth/stripe/client";

// Safe baseURL computation for SSR/build-time compatibility
const getBaseURL = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Guard against undefined window in SSR/build-time
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  
  // Safe fallback for SSR/build-time
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
