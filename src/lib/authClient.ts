import { backendClient } from './backendClient';
import { useSession as useAuthSession, useActiveOrganization as useAuthActiveOrg } from '../contexts/AuthContext';

export const authClient = {
  signIn: backendClient.signin.bind(backendClient),
  signOut: backendClient.signout.bind(backendClient),
  signUp: backendClient.signup.bind(backendClient),
  updateUser: async (_data: Record<string, unknown>) => {
    console.warn('updateUser is not implemented with the current backend.');
    return { success: false };
  },
  deleteUser: async () => {
    console.warn('deleteUser is not implemented with the current backend.');
    return { success: false };
  },
  useSession: () => useAuthSession(),
  useActiveOrganization: () => useAuthActiveOrg(),
  getSession: backendClient.getSession.bind(backendClient),
  twoFactor: {
    enable: async () => {
      throw new Error('Two-factor authentication is not supported yet.');
    },
    disable: async () => {
      throw new Error('Two-factor authentication is not supported yet.');
    }
  }
};

export const signIn = authClient.signIn;
export const signOut = authClient.signOut;
export const signUp = authClient.signUp;
export const updateUser = authClient.updateUser;
export const deleteUser = authClient.deleteUser;
export const useSession = authClient.useSession;
export const useActiveOrganization = authClient.useActiveOrganization;
export const getSession = authClient.getSession;
