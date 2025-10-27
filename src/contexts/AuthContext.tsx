import { createContext } from 'preact';
import { ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { User, UserDetails } from '../types/backend';
import { authClient } from '../lib/authClient';
import { backendClient } from '../lib/backendClient';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  session: { activeOrganizationId: string | null } | null;
}

interface AuthContextType {
  session: {
    data: AuthState;
    isPending: boolean;
    error: string | null;
    refetch: () => Promise<void>;
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

const STORAGE_TOKEN_KEY = 'blawby.auth.token';
const STORAGE_USER_KEY = 'blawby.auth.user';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const createInitialState = (): AuthState => ({
  user: null,
  token: null,
  isLoading: true,
  error: null,
  session: null
});

const persistSession = (token: string | null, user: User | null) => {
  try {
    // Only remove legacy keys on sign-out/cleanup - no longer persist new data
    if (!token) {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
    }
    if (!user) {
      localStorage.removeItem(STORAGE_USER_KEY);
    }
  } catch (error) {
    console.warn('Failed to clean up legacy auth session:', error);
  }
};

const restoreStoredSession = (): { token: string | null; user: User | null } => {
  // Restore bearer token from localStorage for cross-origin authentication
  try {
    const bearerToken = localStorage.getItem('bearer_token');
    if (bearerToken) {
      // Set the token in backendClient so it can be used for API calls
      backendClient.restoreAuthToken(bearerToken);
      return { token: bearerToken, user: null }; // user will be loaded separately
    }
  } catch (error) {
    console.warn('Failed to restore stored session:', error);
  }

  return { token: null, user: null };
};

export const AuthProvider = ({ children }: { children: ComponentChildren }) => {
  const [authState, setAuthState] = useState<AuthState>(createInitialState);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const initRef = useRef(false);

  const loadUserDetails = useCallback(async () => {
    console.log('🔍 loadUserDetails: Starting to load user details...');
    setDetailsLoading(true);
    setDetailsError(null);

    try {
      console.log('📤 loadUserDetails: Calling backendClient.getUserDetails()...');
      const details = await backendClient.getUserDetails();
      console.log('✅ loadUserDetails: Successfully loaded user details:', details);
      setUserDetails(details);
      setAuthState((prev) => ({
        ...prev,
        user: prev.user ? { ...prev.user, details } : null,
        error: null,
        isLoading: false
      }));
    } catch (error) {
      console.error('❌ loadUserDetails: Failed to load user details:', error);
      const message = error instanceof Error ? error.message : 'Failed to load user details';
      setDetailsError(message);
      setAuthState((prev) => ({
        ...prev,
        error: message,
        isLoading: false
      }));
      throw error;
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    // Restore stored session (bearer token)
    const { token, user } = restoreStoredSession();

    // Start with loading state
    setAuthState({
      user,
      token,
      isLoading: true,
      error: null,
      session: null
    });

    // Create AbortController for cleanup
    const abortController = new AbortController();

    // Fetch session from backend using bearer token authentication
    const fetchSessionFromBackend = async () => {
      try {
        // Check if component is still mounted before proceeding
        if (abortController.signal.aborted) return;

        // If we have a token, try to get user details to validate the session
        if (token) {
          await loadUserDetails();
        } else {
          // No token available, user needs to sign in
          setAuthState({
            user: null,
            token: null,
            isLoading: false,
            error: null,
            session: null
          });
        }

        // Check again after async operation
        if (abortController.signal.aborted) return;
      } catch (_error) {
        // Check if component is still mounted before updating state
        if (abortController.signal.aborted) return;

        // Session is invalid or user is not authenticated
        setAuthState({
          user: null,
          token: null,
          isLoading: false,
          error: null,
          session: null
        });
      }
    };

    void fetchSessionFromBackend();

    // Cleanup function to abort pending operations
    return () => {
      abortController.abort();
    };
  }, [loadUserDetails]);

  const signin = useCallback(async (email: string, password: string) => {
    console.log('🔐 signin: Starting sign-in process...');
    setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      console.log('📤 signin: Calling backendClient.signin...');
      const result = await backendClient.signin({ email, password });
      console.log('✅ signin: Sign-in successful, result:', result);
      
      const token = result.token || null;
      const user = result.user ?? null;

      console.log('💾 signin: Storing token and setting auth state...');
      backendClient.restoreAuthToken(token);
      
      // Store token in localStorage for persistence
      if (token) {
        localStorage.setItem('bearer_token', token);
      }

      setAuthState({
        user,
        token,
        isLoading: false,
        error: null,
        session: user ? { activeOrganizationId: null } : null
      });

      console.log('📋 signin: Loading user details...');
      await loadUserDetails().catch(() => {
        // Details fetch failure already handled in helper
      });
      
      console.log('✅ signin: Sign-in process completed successfully');
    } catch (error) {
      console.error('❌ signin: Sign-in failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to sign in';
      setAuthState({
        user: null,
        token: null,
        isLoading: false,
        error: message,
        session: null
      });
      persistSession(null, null); // Clean up legacy keys
      backendClient.restoreAuthToken(null);
      throw new Error(message);
    }
  }, [loadUserDetails]);

  const signup = useCallback(async (email: string, password: string, firstName?: string, lastName?: string, name?: string) => {
    let fullName = name;
    if (!fullName && firstName && lastName) {
      fullName = `${firstName} ${lastName}`;
    } else if (!fullName && firstName) {
      fullName = firstName;
    } else if (!fullName) {
      fullName = email.split('@')[0] || 'User';
    }

    setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const result = await backendClient.signup({
        email,
        password,
        name: fullName
      });

      const token = result.token || null;
      const user = result.user ?? null;

      if (token) {
        backendClient.restoreAuthToken(token);
        // Store token in localStorage for persistence
        localStorage.setItem('bearer_token', token);
      }

      setAuthState({
        user,
        token,
        isLoading: false,
        error: null,
        session: user ? { activeOrganizationId: null } : null
      });

      if (token) {
        await loadUserDetails().catch(() => {});
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sign up';
      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        error: message
      }));
      throw new Error(message);
    }
  }, [loadUserDetails]);

  const signout = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch (error) {
      console.warn('Sign out request failed:', error);
    } finally {
      persistSession(null, null);
      backendClient.restoreAuthToken(null);
      setUserDetails(null);
      setDetailsError(null);
      setAuthState({
        user: null,
        token: null,
        isLoading: false,
        error: null,
        session: null
      });
    }
  }, []);

  const refreshSession = useCallback(async () => {
    setAuthState((prev) => ({ ...prev, isLoading: true }));
    try {
      await loadUserDetails();
    } finally {
      setAuthState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [loadUserDetails]);

  const combinedState = useMemo<AuthState>(() => {
    const combinedUser = authState.user
      ? {
          ...authState.user,
          details: userDetails ?? authState.user.details ?? null
        }
      : null;

    const combinedError = authState.error ?? detailsError;
    const isPending = authState.isLoading || detailsLoading;

    return {
      user: combinedUser,
      token: authState.token,
      isLoading: isPending,
      error: combinedError,
      session: combinedUser ? authState.session ?? { activeOrganizationId: null } : null
    };
  }, [authState, userDetails, detailsError, detailsLoading]);

  const contextValue = useMemo<AuthContextType>(() => ({
    session: {
      data: combinedState,
      isPending: combinedState.isLoading,
      error: combinedState.error,
      refetch: refreshSession
    },
    activeOrg: {
      data: null,
      isPending: false
    },
    signin,
    signup,
    signout,
    refreshSession
  }), [combinedState, refreshSession, signin, signup, signout]);

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
