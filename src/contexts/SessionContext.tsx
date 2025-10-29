import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ComponentChildren } from 'preact';
import { z } from 'zod';
import { authClient } from '../lib/authClient';
import { useOrganization } from './OrganizationContext';

// Zod schema for runtime validation of QuotaCounter
const quotaCounterSchema = z.object({
  used: z.number().int().min(0),
  limit: z.number().int().min(-1), // Allow -1 for unlimited
  remaining: z.number().int().min(0).nullable(),
  unlimited: z.boolean(),
}).refine(
  (data) => data.unlimited === (data.limit === -1),
  {
    message: "unlimited must be true when limit is -1, and false otherwise",
    path: ["unlimited"]
  }
);

// Zod schema for runtime validation of QuotaSnapshot with strengthened resetDate validation
const quotaSnapshotSchema = z.object({
  messages: quotaCounterSchema,
  files: quotaCounterSchema,
  resetDate: z.string().datetime({
    message: "resetDate must be a valid ISO datetime string (e.g., '2024-01-01T00:00:00.000Z')"
  }),
  tier: z.string().min(1),
});

// Export TypeScript types derived from Zod schemas to prevent type drift
export type QuotaCounter = z.infer<typeof quotaCounterSchema>;
export type QuotaSnapshot = z.infer<typeof quotaSnapshotSchema>;

// Type for API response
interface QuotaApiResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface SessionContextValue {
  session: ReturnType<typeof authClient.useSession>['data'];
  isAnonymous: boolean;
  activeOrganizationId: string | null;
  activeOrganizationSlug: string | null;
  quota: QuotaSnapshot | null;
  quotaLoading: boolean;
  quotaError: string | null;
  refreshQuota: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ComponentChildren }) {
  const { data: sessionData } = authClient.useSession();
  const activeOrganization = authClient.useActiveOrganization();
  const { organizationId: organizationSlug } = useOrganization();

  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const isAnonymous = !sessionData?.user;

  const activeOrganizationId: string | null =
    (activeOrganization?.data as { organization?: { id?: string } } | undefined)?.organization?.id ??
    (activeOrganization?.data as { id?: string } | undefined)?.id ??
    null;

  const resolvedOrgIdentifier = activeOrganizationId ?? organizationSlug ?? null;

  const fetchQuota = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!resolvedOrgIdentifier) {
      setQuota(null);
      setQuotaError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setQuotaLoading(true);
    setQuotaError(null);

    try {
      const quotaUrl = new URL('/api/usage/quota', window.location.origin);
      quotaUrl.searchParams.set('organizationId', resolvedOrgIdentifier);

      const response = await fetch(quotaUrl.toString(), {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMessage = `Failed to load usage quota (${response.status})`;
        try {
          const errorJson = await response.json() as { error?: string };
          errorMessage = errorJson?.error ?? errorMessage;
        } catch {
          // ignore parse failure
        }
        throw new Error(errorMessage);
      }

      const json = await response.json() as QuotaApiResponse;
      if (!json?.success) {
        throw new Error(json?.error || 'Failed to load usage quota');
      }

      // Validate the quota data before setting it
      const validationResult = quotaSnapshotSchema.safeParse(json.data);
      if (validationResult.success) {
        setQuota(validationResult.data);
      } else {
        console.error('Invalid quota data received:', validationResult.error.issues);
        throw new Error('Invalid quota data format received from server');
      }
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') {
        return;
      }
      setQuotaError(error instanceof Error ? error.message : String(error));
      setQuota(null);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setQuotaLoading(false);
    }
  }, [resolvedOrgIdentifier]);

  useEffect(() => {
    fetchQuota();
    return () => abortRef.current?.abort();
  }, [fetchQuota]);

  // Ensure active org is set after login
  // Note: We rely on our custom organization management instead of Better Auth's setActive
  // This avoids 403 FORBIDDEN errors since our custom org creation doesn't sync with Better Auth's members table

  const value = useMemo<SessionContextValue>(() => ({
    session: sessionData ?? null,
    isAnonymous,
    activeOrganizationId,
    activeOrganizationSlug: organizationSlug ?? null,
    quota,
    quotaLoading,
    quotaError,
    refreshQuota: fetchQuota,
  }), [sessionData, isAnonymous, activeOrganizationId, organizationSlug, quota, quotaLoading, quotaError, fetchQuota]);

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }
  return context;
}
