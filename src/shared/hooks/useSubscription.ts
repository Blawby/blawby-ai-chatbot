import { useEffect, useMemo, useState } from 'preact/hooks';
import { useTypedSession } from '@/shared/lib/authClient';
import { getCurrentSubscription, type CurrentSubscription } from '@/shared/lib/apiClient';

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

    getCurrentSubscription()
      .then((data) => {
        if (!isMounted) return;
        setSubscription(data);
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
    if (status === 'active') return true;
    if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd) {
      const periodEnd = new Date(subscription.currentPeriodEnd).getTime();
      return Number.isFinite(periodEnd) && Date.now() < periodEnd;
    }
    return false;
  }, [subscription]);

  return { subscription, isPracticeEnabled, isLoading, error };
}
