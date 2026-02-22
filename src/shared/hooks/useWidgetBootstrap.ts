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
        // ── 1. Fetch fresh bootstrap data from worker ──────────────────────
        // We intentionally do NOT use the sessionStorage cache as a fast-path
        // for isLoading=false. The stale cache causes two problems:
        //
        //   a) A stale conversationId from a previous session will cause
        //      useConversationSetup to try loading messages for a conversation
        //      the current anonymous user cannot access, producing a 403 error
        //      and a stuck "Loading..." state.
        //
        //   b) The old session.user may no longer be valid. Downstream hooks
        //      (useConversationSetup, useChatComposer) check sessionReady before
        //      acting. If they read stale "ready" state and then the real session
        //      fetch returns a different user, the composer's waitForSessionReady
        //      may resolve against the wrong session.
        //
        // The cache is still written on every successful fetch so it warms up
        // correctly for future page loads. We just don't act on it before the
        // fresh fetch completes.

        const cacheKey = `blawby_widget_bootstrap_${slug}`;

        const res = await fetch(`/api/widget/bootstrap?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) {
          throw new Error(`Failed to bootstrap widget (HTTP ${res.status})`);
        }

        const freshData = (await res.json()) as WidgetBootstrapData;

        // Write to cache for next page load (read back is just for reference, not fast-path).
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(freshData));
        } catch {
          // sessionStorage may be unavailable in some iframe contexts — ignore.
        }

        // ── 2. Sync session into better-auth client ────────────────────────
        // The worker issued a new anonymous session cookie in Set-Cookie headers.
        // We must tell the better-auth client to re-fetch its session so that
        // useSessionContext picks up the new user before useConversationSetup
        // or useChatComposer check sessionReady.
        //
        // We AWAIT getSession() here rather than fire-and-forget because any
        // code that reads sessionReady (useChatComposer.waitForSessionReady,
        // useConversationSetup) runs immediately after setIsLoading(false).
        // If we dispatch auth:session-updated before the fetch completes, those
        // hooks will read the old (null) session and block or error.
        if (freshData.session?.user) {
          try {
            await getClient().getSession();
          } catch (sessionError) {
            // Non-fatal: the cookie was still set by the worker.
            // The next call that requires auth will pick it up automatically.
            console.warn('[WidgetBootstrap] Failed to refresh auth session after bootstrap', sessionError);
          }
          // Notify SessionContext to re-read from the better-auth client.
          // This must fire AFTER getSession() resolves.
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('auth:session-updated'));
          }
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