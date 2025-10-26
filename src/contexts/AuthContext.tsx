import { createContext, useContext } from 'preact';
import { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { User } from '../types/backend';
import { backendClient } from '../lib/backendClient';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

interface AuthContextType {
  session: {
    data: AuthState;
    isPending: boolean;
  };
  activeOrg: {
    data: null;
    isPending: boolean;
  };
  signin: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, firstName?: string, lastName?: string, name?: string) => Promise<void>;
  signout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const defaultState: AuthState = {
  user: null,
  token: null,
  isLoading: true,
  error: null
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ComponentChildren }) => {
  const [authState, setAuthState] = useState<AuthState>(defaultState);

  const hydrateSession = useCallback(async () => {
    const existingToken = backendClient.getToken();

    if (!existingToken) {
      setAuthState({
        user: null,
        token: null,
        isLoading: false,
        error: null
      });
      return;
    }

    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const session = await backendClient.getSession();
      setAuthState({
        user: session.user,
        token: session.token ?? existingToken,
        isLoading: false,
        error: null
      });
    } catch (error) {
      console.error('Failed to hydrate session:', error);
      backendClient.setToken(null);
      setAuthState({
        user: null,
        token: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load session'
      });
    }
  }, []);

  useEffect(() => {
    hydrateSession().catch((error) => {
      console.error('Initial session hydration failed:', error);
    });
  }, [hydrateSession]);

  const signin = useCallback(async (email: string, password: string) => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await backendClient.signin({ email, password });
      backendClient.setToken(response.token ?? null);
      setAuthState({
        user: response.user,
        token: response.token ?? null,
        isLoading: false,
        error: null
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed';
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: message
      }));
      throw error;
    }
  }, []);

  const signup = useCallback(async (email: string, password: string, firstName?: string, lastName?: string, name?: string) => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await backendClient.signup({
        email,
        password,
        firstName,
        lastName,
        name
      });

      backendClient.setToken(response.token ?? null);
      setAuthState({
        user: response.user,
        token: response.token ?? null,
        isLoading: false,
        error: null
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign up failed';
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: message
      }));
      throw error;
    }
  }, []);

  const signout = useCallback(async () => {
    try {
      await backendClient.signout();
    } catch (error) {
      console.warn('Sign out request failed, clearing local session anyway:', error);
    } finally {
      backendClient.setToken(null);
      setAuthState({
        user: null,
        token: null,
        isLoading: false,
        error: null
      });
    }
  }, []);

  const refreshSession = useCallback(async () => {
    await hydrateSession();
  }, [hydrateSession]);

  const contextValue = useMemo<AuthContextType>(() => ({
    session: {
      data: authState,
      isPending: authState.isLoading
    },
    activeOrg: {
      data: null,
      isPending: false
    },
    signin,
    signup,
    signout,
    refreshSession
  }), [authState, signin, signup, signout, refreshSession]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useSession = () => {
  const { session } = useAuth();
  return session;
};

export const useActiveOrganization = () => {
  const { activeOrg } = useAuth();
  return activeOrg;
};
