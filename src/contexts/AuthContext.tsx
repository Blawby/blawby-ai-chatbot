import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'preact/compat';
import { ComponentChildren } from 'preact';
import { backendClient } from '../lib/backendClient';
import { loadUserData as loadUserDataFromIndexedDB } from '../lib/indexedDBStorage';
import type { User, Session, AuthResponse } from '../types/backend';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  error: string | null;
}

interface AuthContextType {
  session: {
    data: AuthState | null;
    isPending: boolean;
  };
  activeOrg: {
    data: any | null;
    isPending: boolean;
  };
  signin: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  signout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ComponentChildren }) => {
  // Add unique identifier to track if AuthContext is being recreated
  const contextId = useRef(Math.random().toString(36).substring(2, 11));
  
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    error: null
  });

  const [activeOrg, setActiveOrg] = useState<any | null>(null);

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
          console.log('🔍 checkAuth - loaded user data:', userData);
          
          if (userData) {
            // Use stored user data directly, don't fabricate sessions
            setAuthState({
              user: userData,
              session: null,
              isLoading: false,
              error: null
            });
          } else {
            // Fallback: try to fetch from backend (may fail)
            try {
              console.log('🔍 checkAuth - fetching session from backend');
              const response = await backendClient.getSession();
              console.log('🔍 checkAuth - session response:', response);
              setAuthState({
                user: response.user,
                session: response.session,
                isLoading: false,
                error: null
              });
            } catch (backendError) {
              console.error('🔍 checkAuth - backend session check failed:', backendError);
              setAuthState({
                user: null,
                session: null,
                isLoading: false,
                error: null
              });
            }
          }
        } catch (error) {
          console.error('🔍 checkAuth - IndexedDB user data load failed:', error);
          setAuthState({
            user: null,
            session: null,
            isLoading: false,
            error: null
          });
        }
      } else {
        console.log('🔍 checkAuth - not authenticated, setting null state');
        setAuthState({
          user: null,
          session: null,
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
      
      // Use backend session data directly, don't fabricate
      setAuthState({
        user: response.user,
        session: response.session,
        isLoading: false,
        error: null
      });
    } catch (error: any) {
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Sign in failed'
      }));
      throw error;
    }
  }, []);

  const signup = useCallback(async (email: string, password: string, name?: string) => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // Only send required fields to backend
      const response = await backendClient.signup({ 
        email, 
        password, 
        name: name || email.split('@')[0] || 'User'
      });
      
      console.log('🔍 Signup response:', response);
      console.log('🔍 User data:', response.user);
      console.log('🔍 Session data:', response.session);
      
      // Use backend session data directly, don't fabricate
      setAuthState({
        user: response.user,
        session: response.session,
        isLoading: false,
        error: null
      });
      
      console.log('🔍 AuthState updated after signup');
    } catch (error: any) {
      console.error('🔍 Signup error:', error);
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Sign up failed'
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
        session: null,
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
          session: response.session,
          error: null
        }));
      } catch (error) {
        console.error('Session refresh failed:', error);
        setAuthState(prev => ({
          ...prev,
          user: null,
          session: null,
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
  console.log('🔍 AuthContext - contextId:', contextId.current);
  console.log('🔍 AuthContext - authState:', authState);
  console.log('🔍 AuthContext - contextValue:', contextValue);

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