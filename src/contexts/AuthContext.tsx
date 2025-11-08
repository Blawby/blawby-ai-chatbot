import { createContext, useContext } from 'preact/compat';
import { ComponentChildren } from 'preact';
import { authClient } from '../lib/authClient';

// Export Better Auth's session hook directly
export const useSession = authClient.useSession;

type AuthContextType = {
  session: ReturnType<typeof useSession>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ComponentChildren }) => {
  const session = useSession();

  return (
    <AuthContext.Provider value={{ session }}>
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