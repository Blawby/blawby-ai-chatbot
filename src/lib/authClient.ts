import { backendClient } from './backendClient';
import type { SigninData, SignupData, AuthResponse } from '../types/backend';

export const authClient = {
  signIn: {
    email: (data: SigninData): Promise<AuthResponse> => backendClient.signin(data)
  },
  signUp: {
    email: (data: SignupData): Promise<AuthResponse> => backendClient.signup(data)
  },
  signOut: (): Promise<{ message: string }> => backendClient.signout()
};
