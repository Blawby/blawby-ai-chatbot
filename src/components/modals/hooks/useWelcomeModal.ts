import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { useSession } from '../../../lib/authClient';

interface UseWelcomeModalResult {
  shouldShow: boolean;
  markAsShown: () => Promise<void>;
}

export function useWelcomeModal(): UseWelcomeModalResult {
  const { data: session, isPending: sessionIsPending } = useSession();
  const [shouldShow, setShouldShow] = useState(false);
  const bcRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      bcRef.current = new BroadcastChannel('welcome');
      const handler = (e: MessageEvent) => {
        if (e?.data === 'shown' && session?.user?.id) {
          const sessionKey = `welcomeModalShown_v1_${session.user.id}`;
          try { sessionStorage.setItem(sessionKey, '1'); } catch (err) {
            console.warn('[WELCOME_MODAL] Failed to set sessionStorage sessionKey', err);
          }
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
  }, [session?.user?.id]);

  useEffect(() => {
    if (sessionIsPending || !session?.user?.id) {
      setShouldShow(false);
      return;
    }
    const user = session.user as typeof session.user & {
      onboardingCompleted?: boolean;
      welcomedAt?: string | null | boolean;
    };
    const sessionKey = `welcomeModalShown_v1_${session.user.id}`;
    const alreadyShown = typeof window !== 'undefined' ? sessionStorage.getItem(sessionKey) : null;
    const hasCompletedOnboarding = user.onboardingCompleted === true;
    const hasBeenWelcomed = Boolean(user.welcomedAt);
    if (alreadyShown) {
      setShouldShow(false);
      return;
    }
    if (hasCompletedOnboarding && !hasBeenWelcomed) {
      setShouldShow(true);
    } else {
      setShouldShow(false);
    }
  }, [session?.user, sessionIsPending]);

  const markAsShown = useCallback(async () => {
    if (!session?.user?.id) {
      setShouldShow(false);
      return;
    }
    const userId = session.user.id;
    const sessionKey = `welcomeModalShown_v1_${userId}`;
    try { sessionStorage.setItem(sessionKey, '1'); } catch (err) {
      console.warn('[WELCOME_MODAL] Failed to set sessionStorage sessionKey', err);
    }
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
