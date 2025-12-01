import { FunctionComponent, createContext, useContext, useEffect, useState, useMemo, useCallback } from 'preact/compat';
import { ComponentChildren } from 'preact';
import { authClient } from '../lib/authClient';
import { usePracticeManagement } from '../hooks/usePracticeManagement';
import { DEFAULT_PRACTICE_ID } from '../utils/constants';

// Simplified quota types
export interface SimpleQuota {
  used: number;
  limit: number;
  unlimited: boolean;
}

interface SessionContextValue {
  session: ReturnType<typeof authClient.useSession>['data'];
  isAnonymous: boolean;
  activePracticeId: string | null;
  quota: SimpleQuota | null;
  refreshQuota: () => Promise<void>;
}

interface PracticeConfig extends Record<string, unknown> {
  quotaUsed?: number;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ComponentChildren }) {
  const { data: sessionData } = authClient.useSession();
  const [quota, setQuota] = useState<SimpleQuota | null>(null);

  const isAnonymous = !sessionData?.user;
  const { practices, currentPractice } = usePracticeManagement();

  const activePracticeIdFromSession =
    (sessionData?.user as { practiceId?: string; activePracticeId?: string })?.practiceId ?? 
    (sessionData?.user as { practiceId?: string; activePracticeId?: string })?.activePracticeId ?? 
    null;

  const activePracticeId = currentPractice?.id ?? activePracticeIdFromSession ?? null;

  // Simplified quota logic - derive from practice config
  const refreshQuota = useCallback(async () => {
    if (!currentPractice) {
      setQuota(null);
      return;
    }

    const config = (currentPractice.config ?? undefined) as PracticeConfig | undefined;
    const quotaUsed =
      typeof config?.quotaUsed === 'number' && Number.isFinite(config.quotaUsed)
        ? config.quotaUsed
        : 0;
    const tier = currentPractice.subscriptionTier ?? 'free';
    
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
  }, [currentPractice]);

  // Update quota when practice changes
  useEffect(() => {
    refreshQuota();
  }, [refreshQuota]);

  const value = useMemo<SessionContextValue>(() => ({
    session: sessionData ?? null,
    isAnonymous,
    activePracticeId,
    quota,
    refreshQuota,
  }), [sessionData, isAnonymous, activePracticeId, quota, refreshQuota]);

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
