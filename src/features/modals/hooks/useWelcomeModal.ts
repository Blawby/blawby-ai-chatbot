import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { getPreferencesCategory } from '@/shared/lib/preferencesApi';
import type { OnboardingPreferences } from '@/shared/types/preferences';

interface UseWelcomeModalOptions {
  enabled?: boolean;
}

interface UseWelcomeModalResult {
  shouldShow: boolean;
  markAsShown: () => Promise<void>;
}

export function useWelcomeModal(options: UseWelcomeModalOptions = {}): UseWelcomeModalResult {
  const { enabled = true } = options;
  const { session, isPending: sessionIsPending } = useSessionContext();
  const [shouldShow, setShouldShow] = useState(false);
  const bcRef = useRef<BroadcastChannel | null>(null);

  const getStoredShown = (userId: string): string | null => {
    if (typeof window === 'undefined') return null;
    const key = `welcomeModalShown_v1_${userId}`;
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  };

  const setStoredShown = (userId: string) => {
    if (typeof window === 'undefined') return;
    const key = `welcomeModalShown_v1_${userId}`;
    try { localStorage.setItem(key, '1'); } catch (err) {
      console.warn('[WELCOME_MODAL] Failed to set localStorage key', err);
    }
    try { sessionStorage.setItem(key, '1'); } catch (err) {
      console.warn('[WELCOME_MODAL] Failed to set sessionStorage key', err);
    }
  };

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    try {
      bcRef.current = new BroadcastChannel('welcome');
      const handler = (e: MessageEvent) => {
        if (e?.data === 'shown' && session?.user?.id) {
          setStoredShown(session.user.id);
          setShouldShow(false);
        }
      };
      bcRef.current.addEventListener('message', handler as never);
      return () => {
        try { bcRef.current?.removeEventListener('message', handler as never); } catch (err) {
          console.warn('[WELCOME_MODAL] Failed to remove event listener', err);
        }
        try { bcRef.current?.close(); } catch (err) {
          console.warn('[WELCOME_MODAL] BroadcastChannel close failed', err);
        }
      };
    } catch (err) {
      console.error('[WELCOME_MODAL] Failed to initialize BroadcastChannel', err);
    }
  }, [enabled, session?.user?.id]);

  useEffect(() => {
    if (!enabled) {
      setShouldShow(false);
      return;
    }
    if (sessionIsPending || !session?.user?.id) {
      setShouldShow(false);
      return;
    }
    const alreadyShown = getStoredShown(session.user.id);
    if (alreadyShown) {
      setShouldShow(false);
      return;
    }

    let isMounted = true;

    const checkPreferences = async () => {
      try {
        const prefs = await getPreferencesCategory<OnboardingPreferences>('onboarding');
        const hasCompletedOnboarding = prefs?.completed === true;
        if (isMounted) {
          setShouldShow(hasCompletedOnboarding);
        }
      } catch (error) {
        console.warn('[WELCOME_MODAL] Failed to load onboarding preferences', error);
        if (isMounted) {
          setShouldShow(false);
        }
      }
    };

    void checkPreferences();

    return () => {
      isMounted = false;
    };
  }, [enabled, session, session?.user, sessionIsPending]);

  const markAsShown = useCallback(async () => {
    if (!session?.user?.id) {
      setShouldShow(false);
      return;
    }
    const userId = session.user.id;
    setStoredShown(userId);
    setShouldShow(false);
    try { bcRef.current?.postMessage('shown'); } catch (err) {
      console.warn('[WELCOME_MODAL] BroadcastChannel postMessage failed', err);
    }
    try {
      const res = await fetch('/api/users/welcome', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn('[WELCOME_MODAL] /api/users/welcome returned non-OK', { status: res.status, body: text });
      }
    } catch (err) {
      console.error('[WELCOME_MODAL] Failed to fetch /api/users/welcome', err);
    }
  }, [session?.user?.id]);

  return { shouldShow, markAsShown };
}
