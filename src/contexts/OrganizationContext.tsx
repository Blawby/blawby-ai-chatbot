import { createContext, useContext, type ReactNode } from 'preact/compat';
import { useOrganizationConfig } from '../hooks/useOrganizationConfig.js';

export interface OrganizationContextValue {
  organizationId: string;
  organizationConfig: {
    name: string;
    profileImage: string;
    introMessage: string | null;
    description: string | null;
    availableServices: string[];
    serviceQuestions: Record<string, string[]>;
    jurisdiction: {
      type: string;
      description: string;
      supportedStates: string[];
      supportedCountries: string[];
    };
    voice: {
      enabled: boolean;
      provider: string;
      voiceId: string | null;
      displayName: string | null;
      previewUrl: string | null;
    };
  };
  organizationNotFound: boolean;
  isLoading: boolean;
  handleRetryOrganizationConfig: () => void;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export interface OrganizationProviderProps {
  children: ReactNode;
  onError?: (error: string) => void;
}

/**
 * OrganizationProvider that wraps the app and provides organization context
 * to all child components, eliminating the need for prop drilling
 */
export function OrganizationProvider({ children, onError }: OrganizationProviderProps) {
  const {
    organizationId,
    organizationConfig,
    organizationNotFound,
    isLoading,
    handleRetryOrganizationConfig
  } = useOrganizationConfig({
    onError: (error) => {
      console.error('Organization config error:', error);
      onError?.(error);
    }
  });

  const contextValue: OrganizationContextValue = {
    organizationId,
    organizationConfig,
    organizationNotFound,
    isLoading,
    handleRetryOrganizationConfig
  };

  return (
    <OrganizationContext.Provider value={contextValue}>
      {children}
    </OrganizationContext.Provider>
  );
}

/**
 * Hook to access organization context
 * Must be used within an OrganizationProvider
 */
export function useOrganization(): OrganizationContextValue {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}

/**
 * Hook to get just the organization ID
 * Convenience hook for components that only need the ID
 */
export function useOrganizationId(): string {
  return useOrganization().organizationId;
}

/**
 * Hook to get just the organization config
 * Convenience hook for components that only need the config
 */
export function useOrganizationConfigData(): OrganizationContextValue['organizationConfig'] {
  return useOrganization().organizationConfig;
}

/**
 * Hook to check if organization is loading
 * Convenience hook for loading states
 */
export function useOrganizationLoading(): boolean {
  return useOrganization().isLoading;
}

/**
 * Hook to check if organization was not found
 * Convenience hook for error states
 */
export function useOrganizationNotFound(): boolean {
  return useOrganization().organizationNotFound;
}
