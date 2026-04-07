/**
 * usePaymentStatus
 *
 * Owns all Stripe payment lifecycle concerns:
 *   1. On mount, reads `intakePaymentSuccess:*` keys from sessionStorage
 *      (written by the Stripe return URL handler) and posts a confirmation
 *      system message.
 *   2. For pending payments, checks the backend post-pay status endpoint
 *      on load to reconcile if the user returned without a success flag
 *      (e.g., closed the Stripe tab and refreshed).
 *   3. Exposes `verifiedPaidIntakeUuids` so the rest of the UI can gate
 *      on payment status without re-fetching.
 *   4. Exposes `paymentRetryNotice` for cases where the confirmation message
 *      could not be persisted — the UI can surface a fallback payment link.
 *
 * This hook is intentionally side-effect free outside its own effects.
 * It does NOT know about routing, messages, or intake flow steps.
 */

import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import type { ConversationMessage } from '@/shared/types/conversation';
import {
  fetchPostPayIntakeStatus,
  PAYMENT_CONFIRMED_STORAGE_KEY,
} from '@/shared/utils/intakePayments';
import { postSystemMessage } from '@/shared/lib/conversationApi';

// ─── types ────────────────────────────────────────────────────────────────────

export interface LatestIntakeSubmission {
  intakeUuid: string | null;
  paymentRequired: boolean;
  checkoutSessionId?: string | null;
}

export interface UsePaymentStatusOptions {
  enabled?: boolean;
  conversationId: string | null | undefined;
  practiceId: string | null | undefined;
  latestIntakeSubmission: LatestIntakeSubmission;
  /** Already-verified UUIDs from the current session (prevents duplicate confirms) */
  onPaymentConfirmed: (intakeUuid: string) => void;
  /** Called when a confirmation message is successfully persisted */
  applyServerMessages: (msgs: ConversationMessage[]) => void;
  practiceName?: string;
  onError?: (error: unknown, context?: Record<string, unknown>) => void;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ─── hook ─────────────────────────────────────────────────────────────────────

export const usePaymentStatus = ({
  enabled = true,
  conversationId,
  practiceId,
  latestIntakeSubmission,
  onPaymentConfirmed,
  applyServerMessages,
  practiceName,
  onError,
}: UsePaymentStatusOptions) => {
  const [paymentRetryNotice, setPaymentRetryNotice] = useState<{ message: string; paymentUrl: string } | null>(null);

  // Track UUIDs we've already posted a confirmation message for in this session
  // (prevents double-posting if the effect re-fires)
  const processedPaymentUuidsRef = useRef<Set<string>>(new Set());

  // ── confirmation message helper ───────────────────────────────────────────

  const postPaymentConfirmation = useCallback(async (
    uuid: string,
    practiceName: string,
    signal?: AbortSignal,
    sessionId?: string | null,
  ) => {
    if (!enabled) return;
    if (!conversationId || !practiceId) return;

    const messageId = `system-payment-confirm-${uuid}`;
    if (processedPaymentUuidsRef.current.has(uuid)) return;

    // Check if a confirmation already exists in the current message list
    // (handled by the caller via latestIntakeSubmission / verifiedPaidIntakeUuids)

    try {
      if (signal?.aborted) return;
      processedPaymentUuidsRef.current.add(uuid);

      const persistedMessage = await postSystemMessage(conversationId, practiceId, {
        clientId: messageId,
        content: `Thank you! Your payment was successful and your case details are being processed. A member of our team will contact you at the information you provided.`,
        metadata: {
          intakePaymentUuid: uuid,
          paymentStatus: 'succeeded',
          ...(sessionId ? { checkoutSessionId: sessionId } : {}),
        },
      });

      // After successful persistence, always update client state regardless of abort status
      if (persistedMessage) {
        // Mark as confirmed in parent state ONLY after persistence success
        onPaymentConfirmed(uuid);
        applyServerMessages([persistedMessage]);
        setPaymentRetryNotice(null);
      } else {
        throw new Error('Payment confirmation message could not be saved.');
      }
    } catch (error) {
      processedPaymentUuidsRef.current.delete(uuid);
      console.warn('[usePaymentStatus] Failed to persist payment confirmation message', error);
      onError?.(error);
      throw error;
    }
  }, [applyServerMessages, conversationId, enabled, onError, onPaymentConfirmed, practiceId]);

  // ── sessionStorage & URL reconciliation (Stripe return) ───────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const controller = new AbortController();

    // 1. Process URL parameters (Fast path for direct Stripe returns)
    const url = new URL(window.location.href);
    const sessionIdFromUrl = url.searchParams.get('session_id');
    const uuidFromUrl = url.searchParams.get('uuid');

    if (sessionIdFromUrl && uuidFromUrl && UUID_PATTERN.test(uuidFromUrl)) {
      postPaymentConfirmation(uuidFromUrl, practiceName || 'the practice', controller.signal, sessionIdFromUrl)
        .then(() => {
          // Clear URL params only after successful confirmation to allow retry on error
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.delete('session_id');
          nextUrl.searchParams.delete('uuid');
          window.history.replaceState({}, '', nextUrl.pathname + nextUrl.search);
        })
        .catch(err => {
          console.warn('[usePaymentStatus] URL-based confirmation failed', err);
          // Keep params intact on error to allow user to retry or for debugging
        });
    }
    // 2. Clean up legacy sessionStorage keys (Fallback cleanup)
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (!key) continue;
      if (key.startsWith('intakePaymentSuccess:') || key.startsWith('intakePaymentPending:')) {
        window.sessionStorage.removeItem(key);
      }
    }

    return () => {
      controller.abort();
    };
  }, [conversationId, practiceId, postPaymentConfirmation, practiceName]);

  // ── Cross-tab payment signal (PaymentResultPage → widget tab) ─────────────
  // PaymentResultPage writes PAYMENT_CONFIRMED_STORAGE_KEY to localStorage after
  // Stripe redirects. localStorage storage events fire on every other same-origin
  // tab, so the widget tab picks this up even though it never navigated to /p/.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== PAYMENT_CONFIRMED_STORAGE_KEY) return;
      if (!event.newValue) return;

      let payload: { intakeUuid?: string; sessionId?: string } | null = null;
      try { payload = JSON.parse(event.newValue); } catch { return; }

      const intakeUuid = payload?.intakeUuid;
      if (!intakeUuid || !UUID_PATTERN.test(intakeUuid)) return;

      postPaymentConfirmation(intakeUuid, practiceName || 'the practice', undefined, payload?.sessionId ?? null)
        .catch(err => console.warn('[usePaymentStatus] Cross-tab payment confirmation failed', err));

      // Clean up so subsequent tabs don't re-process the same event
      try { localStorage.removeItem(PAYMENT_CONFIRMED_STORAGE_KEY); } catch { /* ignore */ }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [postPaymentConfirmation, practiceName]);

  // ── backend payment reconciliation ────────────────────────────────────────
  // Runs whenever the latest intake submission changes — handles the case
  // where a user returned without a persisted payment-success flag.

  useEffect(() => {
    const { checkoutSessionId, paymentRequired } = latestIntakeSubmission;
    if (!checkoutSessionId || !paymentRequired) return;
    if (!conversationId || !practiceId) return;

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const intakeUuid = await fetchPostPayIntakeStatus(checkoutSessionId, { timeoutMs: 8_000, conversationId });
        if (!intakeUuid || cancelled) return;
        await postPaymentConfirmation(intakeUuid, practiceName || 'the practice', controller.signal);
      } catch (error) {
        if (controller.signal.aborted || cancelled) return;
        const errorMessage = error instanceof Error ? error.message : String(error);
        onError?.(errorMessage, { source: 'fetchPostPayIntakeStatus', checkoutSessionId });
        console.warn('[usePaymentStatus] Failed to reconcile payment status on refresh', error);
      }
    })();

    return () => { cancelled = true; controller.abort(); };
  }, [
    conversationId,
    latestIntakeSubmission,
    onError,
    postPaymentConfirmation,
    practiceId,
    practiceName,
  ]);

  return {
    paymentRetryNotice,
    setPaymentRetryNotice,
    verifiedPaidIntakeUuids: processedPaymentUuidsRef.current,
  };
};
