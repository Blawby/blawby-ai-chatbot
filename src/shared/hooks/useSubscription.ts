import { useEffect, useMemo, useState } from 'preact/hooks';
import { getClient } from '@/shared/lib/authClient';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { type AuthSubscriptionListItem, type CurrentSubscription } from '@/shared/lib/apiClient';

interface UseSubscriptionOptions {
  enabled?: boolean;
  referenceId?: string | null;
}

export interface UseSubscriptionResult {
  subscription: CurrentSubscription | null;
  isPracticeEnabled: boolean;
  isLoading: boolean;
  error: string | null;
}

const subscriptionCache = new Map<string, CurrentSubscription | null>();
const subscriptionErrorCache = new Map<string, string | null>();
const subscriptionInFlight = new Map<string, Promise<AuthSubscriptionListItem[]>>();
let subscriptionCacheUserId: string | null = null;

export function useSubscription(options: UseSubscriptionOptions = {}): UseSubscriptionResult {
  const {
    session,
    activeOrganizationId,
    activePracticeId,
    preferredPracticeId,
    isPending: sessionIsPending
  } = useSessionContext();
  const [subscription, setSubscription] = useState<CurrentSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const referenceId = options.referenceId ?? activeOrganizationId ?? activePracticeId ?? preferredPracticeId ?? null;
  const userId = session?.user?.id ?? null;
  const hasUser = Boolean(session?.user);
  const shouldFetch = (options.enabled ?? true) && hasUser && Boolean(referenceId) && !sessionIsPending;

  useEffect(() => {
    let isMounted = true;

    if (subscriptionCacheUserId && userId && subscriptionCacheUserId !== userId) {
      subscriptionCache.clear();
      subscriptionErrorCache.clear();
      subscriptionInFlight.clear();
    }
    if (userId) {
      subscriptionCacheUserId = userId;
    }

    if (sessionIsPending) {
      setIsLoading(true);
      setError(null);
      return () => {
        isMounted = false;
      };
    }

    if (!shouldFetch) {
      setSubscription(null);
      setIsLoading(false);
      if (hasUser && !referenceId) {
        setError('Missing active organization referenceId for subscription lookup');
      } else {
        setError(null);
      }
      return () => {
        isMounted = false;
      };
    }

    const cached = subscriptionCache.get(referenceId as string);
    if (cached !== undefined) {
      setSubscription(cached);
      setIsLoading(false);
      setError(subscriptionErrorCache.get(referenceId as string) ?? null);
      return () => {
        isMounted = false;
      };
    }

    setIsLoading(true);
    setError(null);

    const listPromise = getSubscriptionList(referenceId as string);

    listPromise
      .then((items: AuthSubscriptionListItem[]) => {
        if (!isMounted) return;
        const normalized = normalizeSubscription(items);
        subscriptionCache.set(referenceId as string, normalized);
        subscriptionErrorCache.set(referenceId as string, null);
        setSubscription(normalized);
      })
      .catch((fetchError) => {
        if (!isMounted) return;
        const message = fetchError instanceof Error ? fetchError.message : 'Failed to fetch subscription';
        setError(message);
        setSubscription(null);
        subscriptionCache.set(referenceId as string, null);
        subscriptionErrorCache.set(referenceId as string, message);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [hasUser, referenceId, sessionIsPending, shouldFetch, userId]);

  const isPracticeEnabled = useMemo(() => {
    if (!subscription) return false;
    const status = subscription.status?.toLowerCase() ?? '';
    if (status === 'active' || status === 'trialing') return true;
    if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd) {
      const periodEnd = new Date(subscription.currentPeriodEnd).getTime();
      return Number.isFinite(periodEnd) && Date.now() < periodEnd;
    }
    return false;
  }, [subscription]);

  return { subscription, isPracticeEnabled, isLoading, error };
}

const getSubscriptionList = async (referenceId: string): Promise<AuthSubscriptionListItem[]> => {
  const inFlight = subscriptionInFlight.get(referenceId);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const client = getClient();
    const response = await client.subscription.list({
      query: { referenceId }
    });

    if (response?.error) {
      throw new Error(response.error.message || 'Failed to fetch subscription');
    }

    return response?.data ?? [];
  })();

  subscriptionInFlight.set(referenceId, promise);
  try {
    return await promise;
  } finally {
    subscriptionInFlight.delete(referenceId);
  }
};

const normalizeSubscription = (items: AuthSubscriptionListItem[]): CurrentSubscription | null => {
  if (!items.length) return null;
  const eligibleStatuses = new Set(['active', 'trialing', 'paused', 'past_due', 'unpaid']);
  const validItems = items.filter((item) => {
    const status = typeof item.status === 'string' ? item.status.toLowerCase() : '';
    return eligibleStatuses.has(status);
  });
  if (!validItems.length) return null;
  const active = validItems.find((item) => {
    const status = typeof item.status === 'string' ? item.status.toLowerCase() : '';
    return status === 'active' || status === 'trialing';
  });
  const candidate = active ?? validItems[0];
  const plan = isPlanRecord(candidate.plan)
    ? {
      id: toNullableString(candidate.plan.id),
      name: toNullableString(candidate.plan.name),
      displayName: toNullableString(candidate.plan.displayName ?? candidate.plan.display_name),
      isActive: typeof candidate.plan.isActive === 'boolean'
        ? candidate.plan.isActive
        : typeof candidate.plan.is_active === 'boolean'
          ? candidate.plan.is_active
          : null
    }
    : null;

  return {
    id: toNullableString(candidate.id),
    status: toNullableString(candidate.status),
    plan,
    cancelAtPeriodEnd: typeof candidate.cancelAtPeriodEnd === 'boolean'
      ? candidate.cancelAtPeriodEnd
      : typeof candidate.cancel_at_period_end === 'boolean'
        ? candidate.cancel_at_period_end
        : null,
    currentPeriodEnd: toNullableString(candidate.currentPeriodEnd ?? candidate.current_period_end)
  };
};

const isPlanRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};
