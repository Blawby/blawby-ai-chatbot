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
        const hasCompletedOnboarding = prefs?.completed === true;
        const hasSeenWelcome = Boolean(prefs?.welcome_modal_shown);
        if (isMounted) {
          setShouldShow(hasCompletedOnboarding && !hasSeenWelcome);
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
      const prefs = await getPreferencesCategory<OnboardingPreferences>('onboarding').catch(() => null);
      await updatePreferencesCategory('onboarding', {
        birthday: prefs?.birthday,
        primary_use_case: prefs?.primary_use_case,
        use_case_additional_info: prefs?.use_case_additional_info,
        completed: prefs?.completed,
        product_usage: prefs?.product_usage,
        practice_welcome_shown: prefs?.practice_welcome_shown,
        welcome_modal_shown: true
      });
    } catch (err) {
      console.error('[WELCOME_MODAL] Failed to update preferences', err);
    }
  }, [isAnonymous, session?.user?.id]);

  return { shouldShow, markAsShown };
}
