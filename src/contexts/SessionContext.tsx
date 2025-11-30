import { FunctionComponent, createContext, useContext, useEffect, useState, useMemo, useCallback } from 'preact/compat';
import { ComponentChildren } from 'preact';
import { authClient } from '../lib/authClient';
import { useOrganizationManagement } from '../hooks/useOrganizationManagement';
import { DEFAULT_ORGANIZATION_ID, DEFAULT_PLATFORM_SLUG } from '../utils/constants';
import { PLATFORM_SETTINGS } from '../config/platform';

// Simplified quota types
export interface SimpleQuota {
  used: number;
  limit: number;
  unlimited: boolean;
}

interface SessionContextValue {
  session: ReturnType<typeof authClient.useSession>['data'];
  isAnonymous: boolean;
  activeOrganizationId: string | null;
  activeOrganizationSlug: string | null;
  quota: SimpleQuota | null;
  refreshQuota: () => Promise<void>;
}

interface OrgConfig extends Record<string, unknown> {
  quotaUsed?: number;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ComponentChildren }) {
  const { data: sessionData } = authClient.useSession();
  const [quota, setQuota] = useState<SimpleQuota | null>(null);

  const isAnonymous = !sessionData?.user;
  const { organizations, currentOrganization } = useOrganizationManagement();

  const activeOrganizationIdFromSession =
    sessionData?.user?.organizationId ?? sessionData?.user?.activeOrganizationId ?? null;

  const activeOrganizationId = currentOrganization?.id ?? activeOrganizationIdFromSession ?? null;

  const activeOrganizationSlug = useMemo(() => {
    if (activeOrganizationId === DEFAULT_ORGANIZATION_ID) {
      return PLATFORM_SETTINGS.slug ?? DEFAULT_PLATFORM_SLUG;
    }
    const org = organizations.find(o => o.id === activeOrganizationId);
    return org?.slug ?? null;
  }, [activeOrganizationId, organizations]);

  // Simplified quota logic - derive from organization config
  const refreshQuota = useCallback(async () => {
    if (!currentOrganization) {
      setQuota(null);
      return;
    }

    const config = (currentOrganization.config ?? undefined) as OrgConfig | undefined;
    const quotaUsed =
      typeof config?.quotaUsed === 'number' && Number.isFinite(config.quotaUsed)
        ? config.quotaUsed
        : 0;
    const tier = currentOrganization.subscriptionTier ?? 'free';
    
    // Simple tier-based limits
    const getQuotaLimit = (tier: string) => {
      switch (tier) {
        case 'free': return 100;
        case 'business': return 1000;
        case 'enterprise': return -1; // unlimited
        default: return 100;
      }
    };

    const quotaLimit = getQuotaLimit(tier);
    
    setQuota({
      used: quotaUsed,
      limit: quotaLimit,
      unlimited: quotaLimit < 0
    });
  }, [currentOrganization]);

  // Update quota when organization changes
  useEffect(() => {
    refreshQuota();
  }, [refreshQuota]);

  const value = useMemo<SessionContextValue>(() => ({
    session: sessionData ?? null,
    isAnonymous,
    activeOrganizationId,
    activeOrganizationSlug,
    quota,
    refreshQuota,
  }), [sessionData, isAnonymous, activeOrganizationId, activeOrganizationSlug, quota, refreshQuota]);

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }
  return context;
}
