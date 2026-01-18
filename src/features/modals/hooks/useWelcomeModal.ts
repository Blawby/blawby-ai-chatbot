import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { getPreferencesCategory, updatePreferencesCategory } from '@/shared/lib/preferencesApi';
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
  const { session, isPending: sessionIsPending, isAnonymous } = useSessionContext();
  const [shouldShow, setShouldShow] = useState(false);
  const bcRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    try {
      bcRef.current = new BroadcastChannel('welcome');
      const handler = (e: MessageEvent) => {
        if (e?.data === 'shown') {
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
    if (sessionIsPending || isAnonymous || !session?.user?.id) {
      setShouldShow(false);
      return;
    }

    let isMounted = true;

    const checkPreferences = async () => {
      try {
        const prefs = await getPreferencesCategory<OnboardingPreferences>('onboarding');
        const hasSeenWelcome = Boolean(prefs?.welcome_modal_shown_at);
        if (isMounted) {
          setShouldShow(!hasSeenWelcome);
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
  }, [enabled, isAnonymous, session?.user?.id, sessionIsPending]);

  const markAsShown = useCallback(async () => {
    if (isAnonymous || !session?.user?.id) {
      setShouldShow(false);
      return;
    }
    setShouldShow(false);
    try { bcRef.current?.postMessage('shown'); } catch (err) {
      console.warn('[WELCOME_MODAL] BroadcastChannel postMessage failed', err);
    }
    try {
      await updatePreferencesCategory('onboarding', {
        welcome_modal_shown_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('[WELCOME_MODAL] Failed to update preferences', err);
    }
  }, [isAnonymous, session?.user?.id]);

  return { shouldShow, markAsShown };
}
