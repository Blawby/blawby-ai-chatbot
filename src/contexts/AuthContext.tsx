import { createContext, useContext } from 'preact/compat';
import { ComponentChildren } from 'preact';
import { authClient } from '../lib/authClient';

// Export Better Auth's hooks directly as documented
export const useSession = authClient.useSession;
export const useActiveOrganization = authClient.useActiveOrganization;

type AuthContextType = {
  session: ReturnType<typeof useSession>;
  activeOrg: ReturnType<typeof useActiveOrganization>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ComponentChildren }) => {
  const session = useSession();
  // Call useActiveOrganization unconditionally - Better Auth handles authentication internally
  const activeOrg = useActiveOrganization();

  return (
    <AuthContext.Provider value={{ session, activeOrg }}>
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