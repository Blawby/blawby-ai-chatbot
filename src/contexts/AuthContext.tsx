import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'preact/compat';
import { ComponentChildren } from 'preact';
import { backendClient } from '../lib/backendClient';
import { loadUserData as loadUserDataFromIndexedDB } from '../lib/indexedDBStorage';
import type { User } from '../types/backend';

// Type guard to validate user data structure
const isUser = (obj: unknown): obj is User => {
  if (!obj || typeof obj !== 'object') return false;
  
  const user = obj as Record<string, unknown>;
  
  // Check required fields and their types
  return (
    typeof user.id === 'string' &&
    typeof user.email === 'string' &&
    (user.name === null || typeof user.name === 'string') &&
    typeof user.emailVerified === 'boolean' &&
    typeof user.createdAt === 'string' &&
    typeof user.updatedAt === 'string'
  );
};

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

interface AuthContextType {
  session: {
    data: AuthState | null;
    isPending: boolean;
  };
  activeOrg: {
    data: unknown | null;
    isPending: boolean;
  };
  signin: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, firstName?: string, lastName?: string, name?: string) => Promise<void>;
  signout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ComponentChildren }) => {
  // Add unique identifier to track if AuthContext is being recreated
  const contextId = useRef(Math.random().toString(36).substring(2, 11));
  
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    error: null
  });

  const [activeOrg, setActiveOrg] = useState<unknown | null>(null);

  // Check if user is authenticated on mount
  useEffect(() => {
    const checkAuth = async () => {
      console.log('🔍 checkAuth - starting authentication check');
      const isAuthenticated = await backendClient.isAuthenticated();
      console.log('🔍 checkAuth - isAuthenticated:', isAuthenticated);
      
      if (isAuthenticated) {
        try {
          console.log('🔍 checkAuth - loading user data from IndexedDB');
          const userData = await loadUserDataFromIndexedDB();
          if (import.meta?.env?.DEV) console.log('🔍 checkAuth - loaded user data:', userData);
          
          if (userData) {
            // Validate user data structure before using it
            if (isUser(userData)) {
              try {
                // Retrieve the actual token from IndexedDB
                const token = await backendClient.getToken();
                if (token) {
                  // Use stored user data with real token
                  setAuthState({
                    user: userData,
                    token,
                    isLoading: false,
                    error: null
                  });
                } else {
                  // No token found, fall back to getSession() flow
                  console.log('🔍 checkAuth - no token found, falling back to getSession()');
                  try {
                    const response = await backendClient.getSession();
                    if (import.meta?.env?.DEV) console.log('🔍 checkAuth - getSession response:', { hasUser: !!response?.user, hasToken: !!response?.token });
                    
                    // Validate user data from backend response
                    if (response?.user && isUser(response.user)) {
                      setAuthState({
                        user: response.user,
                        token: response.token,
                        isLoading: false,
                        error: null
                      });
                    } else {
                      console.warn('Invalid user data structure from getSession:', response?.user);
                      setAuthState({
                        user: null,
                        token: null,
                        isLoading: false,
                        error: null
                      });
                    }
                  } catch (sessionError) {
                    console.error('🔍 checkAuth - getSession fallback failed:', sessionError);
                    setAuthState({
                      user: null,
                      token: null,
                      isLoading: false,
                      error: null
                    });
                  }
                }
              } catch (tokenError) {
                console.error('🔍 checkAuth - token retrieval failed:', tokenError);
                // Fall back to getSession() flow
                try {
                  const response = await backendClient.getSession();
                  if (import.meta?.env?.DEV) console.log('🔍 checkAuth - getSession fallback response:', { hasUser: !!response?.user, hasToken: !!response?.token });
                  
                  // Validate user data from backend response
                  if (response?.user && isUser(response.user)) {
                    setAuthState({
                      user: response.user,
                      token: response.token,
                      isLoading: false,
                      error: null
                    });
                  } else {
                    console.warn('Invalid user data structure from getSession fallback:', response?.user);
                    setAuthState({
                      user: null,
                      token: null,
                      isLoading: false,
                      error: null
                    });
                  }
                } catch (sessionError) {
                  console.error('🔍 checkAuth - getSession fallback failed:', sessionError);
                  setAuthState({
                    user: null,
                    token: null,
                    isLoading: false,
                    error: null
                  });
                }
              }
            } else {
              // Invalid user data, treat as no user
              console.warn('Invalid user data structure from IndexedDB:', userData);
              setAuthState({
                user: null,
                token: null,
                isLoading: false,
                error: null
              });
            }
          } else {
            // Fallback: try to fetch from backend (may fail)
            try {
              console.log('🔍 checkAuth - fetching user from backend');
              const response = await backendClient.getSession();
              if (import.meta?.env?.DEV) console.log('🔍 checkAuth - user response:', { hasUser: !!response?.user, hasToken: !!response?.token });
              
              // Validate user data from backend response
              if (response?.user && isUser(response.user)) {
                setAuthState({
                  user: response.user,
                  token: response.token,
                  isLoading: false,
                  error: null
                });
              } else {
                console.warn('Invalid user data structure from backend:', response?.user);
                setAuthState({
                  user: null,
                  token: null,
                  isLoading: false,
                  error: null
                });
              }
            } catch (backendError) {
              console.error('🔍 checkAuth - backend session check failed:', backendError);
              setAuthState({
                user: null,
                token: null,
                isLoading: false,
                error: null
              });
            }
          }
        } catch (error) {
          console.error('🔍 checkAuth - IndexedDB user data load failed:', error);
          setAuthState({
            user: null,
            token: null,
            isLoading: false,
            error: null
          });
        }
      } else {
        console.log('🔍 checkAuth - not authenticated, setting null state');
        setAuthState({
          user: null,
          token: null,
          isLoading: false,
          error: null
        });
      }
    };

    checkAuth();
  }, []);

  const signin = useCallback(async (email: string, password: string) => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const response = await backendClient.signin({ email, password });
      
      // Use Railway API response with token
      setAuthState({
        user: response.user,
        token: response.token,
        isLoading: false,
        error: null
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Sign in failed';
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }));
      throw error;
    }
  }, []);

  const signup = useCallback(async (email: string, password: string, firstName?: string, lastName?: string, name?: string) => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // Send firstName, lastName, or name to backend
      const response = await backendClient.signup({ 
        email, 
        password, 
        firstName,
        lastName,
        name: name || email.split('@')[0] || 'User'
      });
      
      if (import.meta?.env?.DEV) {
        console.log('🔍 Signup response:', { hasUser: !!response?.user, hasToken: !!response?.token });
      }
      
      // Use Railway API response with token
      setAuthState({
        user: response.user,
        token: response.token,
        isLoading: false,
        error: null
      });
      
      console.log('🔍 AuthState updated after signup');
    } catch (error: unknown) {
      console.error('🔍 Signup error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Sign up failed';
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }));
      throw error;
    }
  }, []);

  const signout = useCallback(async () => {
    try {
      await backendClient.signout();
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setAuthState({
        user: null,
        token: null,
        isLoading: false,
        error: null
      });
      setActiveOrg(null);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (await backendClient.isAuthenticated()) {
      try {
        const response = await backendClient.getSession();
        setAuthState(prev => ({
          ...prev,
          user: response.user,
          token: response.token,
          error: null
        }));
      } catch (error) {
        console.error('Session refresh failed:', error);
        setAuthState(prev => ({
          ...prev,
          user: null,
          token: null,
          error: 'Session expired'
        }));
      }
    }
  }, []);

  const contextValue: AuthContextType = {
    session: {
      data: authState,
      isPending: authState.isLoading
    },
    activeOrg: {
      data: activeOrg,
      isPending: false
    },
    signin,
    signup,
    signout,
    refreshSession
  };
  
  // Debug logging for context value
  if (import.meta?.env?.DEV) {
    console.log('🔍 AuthContext - contextId:', contextId.current);
    console.log('🔍 AuthContext - authState:', { isLoading: authState.isLoading, hasUser: !!authState.user, hasToken: !!authState.token });
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Export session hook for backwards compatibility
export const useSession = () => {
  const { session } = useAuth();
  return session;
};

// Export active organization hook for backwards compatibility
export const useActiveOrganization = () => {
  const { activeOrg } = useAuth();
  return activeOrg;
};