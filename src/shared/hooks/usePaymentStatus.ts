/**
 * usePaymentStatus
 *
 * Owns all Stripe payment lifecycle concerns:
 *   1. On mount, reads `intakePaymentSuccess:*` keys from sessionStorage
 *      (written by the Stripe return URL handler) and posts a confirmation
 *      system message.
 *   2. For pending payments, checks the backend intake status endpoint
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
import { getPracticeClientIntakeStatusEndpoint } from '@/config/api';
import { isPaidIntakeStatus } from '@/shared/utils/intakePayments';
import { postSystemMessage } from '@/shared/lib/conversationApi';

// ─── types ────────────────────────────────────────────────────────────────────

export interface LatestIntakeSubmission {
  intakeUuid: string | null;
  paymentRequired: boolean;
}

export interface UsePaymentStatusOptions {
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

const fetchIntakePaidStatus = async (intakeUuid: string, signal?: AbortSignal): Promise<boolean> => {
  const response = await fetch(getPracticeClientIntakeStatusEndpoint(intakeUuid), {
    credentials: 'include',
    signal,
  });
  if (!response.ok) throw new Error(`Failed to fetch intake status (${response.status})`);
  const payload = await response.json() as {
    success?: boolean;
    data?: { status?: string; succeeded_at?: string | null };
  };
  if (!payload?.success || !payload.data) return false;
  return isPaidIntakeStatus(payload.data.status, payload.data.succeeded_at);
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseStoredFlag = (raw: string | null): { practiceName?: string; practiceId?: string; conversationId?: string } | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as { practiceName?: string }; }
  catch (err) { console.warn('[usePaymentStatus] Failed to parse payment flag', err); return null; }
};

// ─── hook ─────────────────────────────────────────────────────────────────────

export const usePaymentStatus = ({
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
  ) => {
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
        content: `Payment received. ${practiceName} will review your intake and follow up here shortly.`,
        metadata: { intakePaymentUuid: uuid, paymentStatus: 'succeeded' },
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
  }, [applyServerMessages, conversationId, onError, onPaymentConfirmed, practiceId]);

  // ── sessionStorage reconciliation (Stripe return) ─────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const controller = new AbortController();
    let cancelled = false;

    // Collect keys written by the Stripe return URL handler
    const paymentSuccessKeys: string[] = [];
    const paymentPendingKeys: string[] = [];

    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (!key) continue;
      if (key.startsWith('intakePaymentSuccess:')) paymentSuccessKeys.push(key);
      if (key.startsWith('intakePaymentPending:')) paymentPendingKeys.push(key);
    }

    // Clean up stale "pending" keys — these are written before the Stripe redirect
    // and should always be removed once we're back on the page.
    paymentPendingKeys.forEach(key => window.sessionStorage.removeItem(key));

    // Process confirmed payments
    paymentSuccessKeys.forEach(key => {
      const uuid = key.split(':')[1];
      if (!uuid || !UUID_PATTERN.test(uuid)) {
        console.warn('[usePaymentStatus] Skipping malformed payment confirmation key', { key });
        return;
      }

      let practiceName = 'the practice';
      const raw = window.sessionStorage.getItem(key);
      const parsed = parseStoredFlag(raw);
      if (parsed?.practiceName?.trim()) practiceName = parsed.practiceName.trim();

      postPaymentConfirmation(uuid, practiceName, controller.signal)
        .then(() => { if (!cancelled) window.sessionStorage.removeItem(key); })
        .catch(err => { console.warn('[usePaymentStatus] Payment confirmation retry failed, keeping session key', err); });
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  // Run once on mount (and on conversation/practice change in case of navigation)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, practiceId]);

  // ── backend payment reconciliation ────────────────────────────────────────
  // Runs whenever the latest intake submission changes — handles the case
  // where a user paid but sessionStorage was cleared (different device, tab crash, etc.)

  useEffect(() => {
    const { intakeUuid, paymentRequired } = latestIntakeSubmission;
    if (!intakeUuid || !paymentRequired) return;
    if (!conversationId || !practiceId) return;

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const isPaid = await fetchIntakePaidStatus(intakeUuid, controller.signal);
        if (!isPaid || cancelled) return;
        await postPaymentConfirmation(intakeUuid, practiceName || 'the practice', controller.signal);
      } catch (error) {
        if (controller.signal.aborted || cancelled) return;
        const errorMessage = error instanceof Error ? error.message : String(error);
        onError?.(errorMessage, { source: 'fetchIntakePaidStatus', intakeUuid });
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