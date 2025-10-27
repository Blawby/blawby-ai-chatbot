import { createAuthClient } from "better-auth/react";

/**
 * Better Auth Client Configuration
 * 
 * This client handles all authentication operations using Better Auth SDK.
 * It automatically manages Bearer tokens and session state.
 * 
 * Reference: https://www.better-auth.com/docs/plugins/bearer#how-to-use-bearer-tokens
 */

// Get the base URL for Better Auth API
const getBaseURL = () => {
    return "https://staging-api.blawby.com";
};

/**
 * Initialize Better Auth client with Bearer token support
 * 
 * Features:
 * - Automatically stores Bearer token in localStorage on successful auth
 * - Automatically includes Bearer token in Authorization header for all requests
 * - Provides reactive hooks for session management
 */
export const betterAuthClient = createAuthClient({
    baseURL: getBaseURL(),
    fetchOptions: {
        onSuccess: (ctx) => {
            // Extract and store Bearer token from response headers
            const authToken = ctx.response.headers.get("set-auth-token");
            if (authToken) {
                localStorage.setItem("bearer_token", authToken);
            }
        },
        auth: {
            type: "Bearer",
            token: () => localStorage.getItem("bearer_token") || "" // Include token in all requests
        }
    }
});

// Export type for TypeScript
export type BetterAuthClient = typeof betterAuthClient;

/**
 * Export individual authentication methods for convenience
 */
export const signIn = betterAuthClient.signIn;
export const signOut = betterAuthClient.signOut;
export const signUp = betterAuthClient.signUp;
export const updateUser = betterAuthClient.updateUser;
export const deleteUser = betterAuthClient.deleteUser;

/**
 * Export reactive hooks for component usage
 */
export const useSession = betterAuthClient.useSession;
export const useActiveOrganization = betterAuthClient.useActiveOrganization;

/**
 * Export session getter for one-time checks
 */
export const getSession = betterAuthClient.getSession;

