import { createAuthClient } from "better-auth/react";


// Use staging API for Better Auth client
const getBaseURL = () => {
  return "https://staging-api.blawby.com";
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  fetchOptions: {
    onSuccess: (ctx) => {
        const authToken = ctx.response.headers.get("set-auth-token") // get the token from the response headers
        // Store the token securely (e.g., in localStorage)
        if(authToken){
          localStorage.setItem("bearer_token", authToken);
        }
      },
      auth: {
        type:"Bearer",
        token: () => localStorage.getItem("bearer_token") || "" // get the token from localStorage
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
