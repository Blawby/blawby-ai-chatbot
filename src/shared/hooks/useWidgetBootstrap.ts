import { useState, useEffect } from 'preact/hooks';
import { getClient } from '@/shared/lib/authClient';

export interface WidgetBootstrapData {
  practiceDetails: Record<string, unknown> | null;
  session: {
    user?: Record<string, unknown> | null;
  } | null;
  conversationId: string | null;
  conversations: Array<Record<string, unknown>>;
}

export function useWidgetBootstrap(slug: string, isWidget: boolean) {
  const [data, setData] = useState<WidgetBootstrapData | null>(null);
  const [isLoading, setIsLoading] = useState(isWidget && !!slug);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!isWidget || !slug) return;

    let mounted = true;

    async function load() {
      try {
        // Check sessionStorage cache
        const cacheKey = `blawby_widget_bootstrap_${slug}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (mounted) {
              setData(parsed);
              setIsLoading(false); // fast path
            }
          } catch {
            // ignore
          }
        }

        const res = await fetch(`/api/widget/bootstrap?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) {
          throw new Error('Failed to bootstrap widget');
        }

        const freshData = (await res.json()) as WidgetBootstrapData;
        sessionStorage.setItem(cacheKey, JSON.stringify(freshData));
        
        // Let better-auth know session changed if it did
        if (freshData.session?.user) {
           // Force a session refresh so useTypedSession/useSessionContext can
           // observe the newly-issued anonymous cookie from bootstrap.
           try {
             await getClient().getSession();
           } catch (sessionError) {
             console.warn('[WidgetBootstrap] Failed to refresh auth session after bootstrap', sessionError);
           }
           window.dispatchEvent(new CustomEvent('auth:session-updated'));
        }

        if (mounted) {
          setData(freshData);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [slug, isWidget]);

  return { data, isLoading, error };
}
