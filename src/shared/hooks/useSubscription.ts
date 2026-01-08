import { useEffect, useMemo, useState } from 'preact/hooks';
import { useTypedSession } from '@/shared/lib/authClient';
import { listAuthSubscriptions, type AuthSubscriptionListItem, type CurrentSubscription } from '@/shared/lib/apiClient';

interface UseSubscriptionOptions {
  enabled?: boolean;
}

export interface UseSubscriptionResult {
  subscription: CurrentSubscription | null;
  isPracticeEnabled: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useSubscription(options: UseSubscriptionOptions = {}): UseSubscriptionResult {
  const { data: session } = useTypedSession();
  const [subscription, setSubscription] = useState<CurrentSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const shouldFetch = (options.enabled ?? true) && Boolean(session?.user);

  useEffect(() => {
    let isMounted = true;

    if (!shouldFetch) {
      setSubscription(null);
      setIsLoading(false);
      setError(null);
      return () => {
        isMounted = false;
      };
    }

    setIsLoading(true);
    setError(null);

    listAuthSubscriptions()
      .then((items) => {
        if (!isMounted) return;
        const normalized = normalizeSubscription(items);
        setSubscription(normalized);
      })
      .catch((fetchError) => {
        if (!isMounted) return;
        const message = fetchError instanceof Error ? fetchError.message : 'Failed to fetch subscription';
        setError(message);
        setSubscription(null);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [shouldFetch]);

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
