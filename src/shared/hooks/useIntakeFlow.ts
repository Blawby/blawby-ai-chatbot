import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks';
import axios from 'axios';
import { postSystemMessage } from '@/shared/lib/conversationApi';
import { fetchIntakePaymentStatus, isPaidIntakeStatus, isTerminalUnpaidStatus } from '@/shared/utils/intakePayments';
import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';
import type { ContactData } from '@/features/intake/components/ContactForm';
import type { ConversationMetadata, ConversationMessage } from '@/shared/types/conversation';
import type { FileAttachment, MinorAmount } from '../../../worker/types';
import {
  initialIntakeState,
  type IntakeConversationState,
  type SlimContactDraft,
  type IntakeFieldsPayload,
  type DerivedIntakeStatus,
  type IntakeFieldChangeOptions,
} from '@/shared/types/intake';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { linkConversationToUser } from '@/shared/lib/apiClient';
import {
  clearConversationAnonymousParticipant,
} from '@/shared/utils/anonymousIdentity';
import { withWidgetAuthHeaders } from '@/shared/utils/widgetAuth';
import { resolveAllowedParentOrigins } from '@/shared/utils/widgetEvents';
import {
  applyConsultationPatchToMetadata,
  deriveIntakeStatusFromConsultation,
  resolveConsultationState,
} from '@/shared/utils/consultationState';
import { quickActionDebugLog } from '@/shared/utils/quickActionDebug';
import { getPracticeClientIntakeSettingsEndpoint } from '@/config/api';

/** Minimal sanitizer for user-provided name in greeting — no XSS risk in system messages but keeps intent clear */
const sanitizeName = (name: string): string =>
  name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const INTAKE_FIELD_LABELS: Partial<Record<keyof IntakeFieldsPayload, string>> = {
  practiceArea: 'Practice area',
  description: 'Case summary',
  urgency: 'Urgency',
  opposingParty: 'Opposing party',
  city: 'City',
  state: 'State',
  postalCode: 'Postal code',
  addressLine1: 'Address line 1',
  desiredOutcome: 'Desired outcome',
  courtDate: 'Court date',
  income: 'Income',
  householdSize: 'Household size',
  hasDocuments: 'Supporting documents',
};

const WIDGET_ATTRIBUTION_STORAGE_KEY = 'blawby:widget:attribution';

const readWidgetAttributionFromStorage = (): Record<string, string> | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(WIDGET_ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      result[key] = trimmed;
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
};



const emitWidgetLeadSubmitted = (payload: {
  intakeUuid: string;
  status: string;
  requiresPayment: boolean;
}) => {
  if (typeof window === 'undefined') return;
  if (window.parent === window) return;

  const attribution = readWidgetAttributionFromStorage();
  const message = {
    type: 'blawby:lead-submitted',
    intakeUuid: payload.intakeUuid,
    status: payload.status,
    requiresPayment: payload.requiresPayment,
    ...(attribution ? { attribution } : {})
  };

  const allowedOrigins = resolveAllowedParentOrigins();

  // If we cannot determine a trusted parent origin, do not emit the event.
  // This avoids broadcasting intake identifiers to an unknown embedding context.
  if (allowedOrigins.length === 0) {
    console.warn('[Intake] Skipping parent lead-submitted event; no trusted parent origin detected');
    return;
  }

  try {
    for (const origin of allowedOrigins) {
      window.parent.postMessage(message, origin);
    }
  } catch (error) {
    console.warn('[Intake] Failed to notify parent frame about lead submission', error);
  }
};

interface UseIntakeFlowOptions {
  conversationId: string | undefined;
  practiceId: string | undefined;
  practiceSlug?: string | null;
  conversationMetadata: ConversationMetadata | null;
  slimContactDraft: SlimContactDraft | null;
  conversationMetadataRef: React.MutableRefObject<ConversationMetadata | null>;
  updateConversationMetadata: (
    patch: ConversationMetadata,
    conversationId?: string,
  ) => Promise<unknown>;
  applyServerMessages: (messages: ConversationMessage[]) => void;
  /** Send a user-visible message through WebSocket */
  sendMessage: (
    content: string,
    attachments?: FileAttachment[],
    replyToMessageId?: string | null,
    options?: { additionalContext?: string }
  ) => Promise<void>;
  /** Send a raw frame over WebSocket */
  sendMessageOverWs: (
    content: string,
    attachments: FileAttachment[],
    metadata?: Record<string, unknown> | null,
    replyToMessageId?: string | null,
    conversationId?: string | null
  ) => Promise<unknown>;
  onError?: (error: unknown) => void;
  /**
   * Called when payment is required before intake creation.
   * The host renders the payment UI; after payment succeeds it calls handleFinalizeSubmit.
   */
  onOpenPayment?: (request: IntakePaymentRequest) => void;
}

interface UseIntakeFlowResult {
  /** Derived intake status for UI orchestration */
  intakeStatus: DerivedIntakeStatus;
  /** Live intake state from metadata */
  intakeConversationState: IntakeConversationState;
  /** Contact draft from metadata */
  slimContactDraft: SlimContactDraft | null;
  /** Called when user submits the slim contact form (name/email/phone) */
  handleSlimFormContinue: (draft: ContactData) => Promise<void>;
  /** Called when user wants to add more detail to an already-captured brief */
  handleBuildBrief: () => Promise<void>;
  /** Handle CTA response (ready / not_yet) */
  handleIntakeCtaResponse: (response: 'ready' | 'not_yet') => Promise<void>;
  /** Reset CTA state */
  resetIntakeCta: () => Promise<void>;
  /**
   * Phase 1: validate contact, link user, then delegate to handleFinalizeSubmit.
   */
  handleConfirmSubmit: () => Promise<void>;
  /**
   * Phase 2: call the submit-intake API and post the success/payment-prompt message.
   * Called by the parent after payment is confirmed, or immediately if no payment needed.
   */
  handleFinalizeSubmit: (options?: { generatePaymentLinkOnly?: boolean }) => Promise<{ paymentLinkUrl: string | null }>;
  /** Backward-compat alias: runs the full confirm+finalize flow (used where no payment UI is wired) */
  handleSubmitNow: () => Promise<void>;
  /** Apply fields extracted by AI or manual edits */
  applyIntakeFields: (payload: IntakeFieldsPayload, options?: IntakeFieldChangeOptions) => Promise<void>;
  /** Legacy alias or specialized form submit if needed */
  handleContactFormSubmit: (data: ContactData) => Promise<void>;
}

export function useIntakeFlow({
  conversationId,
  practiceId,
  practiceSlug,
  conversationMetadata,
  slimContactDraft,
  conversationMetadataRef,
  updateConversationMetadata,
  applyServerMessages,
  sendMessage,
  sendMessageOverWs,
  onError,
  onOpenPayment,
}: UseIntakeFlowOptions): UseIntakeFlowResult {
  const { session, isAnonymous } = useSessionContext();
  const currentUserId = session?.user?.id ?? null;
  const submitInFlightRef = useRef(false);
  const phase1InFlightRef = useRef(false);
  const finalizeRef = useRef<(options?: { generatePaymentLinkOnly?: boolean }) => Promise<{ paymentLinkUrl: string | null }>>(async () => ({ paymentLinkUrl: null }));
  const paymentPollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const normalizedPracticeSlug = (practiceSlug ?? '').trim();
  const consultation = useMemo(
    () => resolveConsultationState(conversationMetadata),
    [conversationMetadata]
  );

  const intakeConversationState = useMemo(() =>
    consultation?.case ?? conversationMetadata?.intakeConversationState ?? initialIntakeState,
    [consultation, conversationMetadata?.intakeConversationState]
  );

  const resolvedSlimContactDraft = useMemo(
    () => consultation?.contact ?? slimContactDraft,
    [consultation, slimContactDraft]
  );

  const intakeStatus = useMemo((): DerivedIntakeStatus => (
    deriveIntakeStatusFromConsultation(conversationMetadata)
  ), [conversationMetadata]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const applyIntakeFields = useCallback(async (payload: IntakeFieldsPayload, options?: IntakeFieldChangeOptions) => {
    const currentConsultation = resolveConsultationState(conversationMetadataRef.current);
    const current = currentConsultation?.case ?? intakeConversationState;
    const next: IntakeConversationState = { ...current };

    const changedFields: string[] = [];
    (Object.keys(payload) as Array<keyof IntakeFieldsPayload>).forEach(key => {
      const val = payload[key];
      if (val !== undefined) {
        if (current[key as keyof IntakeConversationState] !== val) {
          const label = INTAKE_FIELD_LABELS[key];
          if (label) changedFields.push(label);
        }
        (next as unknown as Record<string, unknown>)[key] = val;
      }
    });
    await updateConversationMetadata(
      applyConsultationPatchToMetadata(
        conversationMetadataRef.current,
        {
          case: next,
        },
        { mirrorLegacyFields: true }
      )
    );

    if (options?.sendSystemAck && changedFields.length > 0 && conversationId && practiceId) {
      try {
        const content = changedFields.length === 1
          ? `Updated ${changedFields[0]}`
          : `Updated ${changedFields.join(', ')}`;
        
        await postSystemMessage(conversationId, practiceId, {
          clientId: `system-intake-update-${Date.now()}`,
          content: `Manual update: ${content}`,
          metadata: { intakeUpdate: true, fields: changedFields }
        });
      } catch (err) {
        console.warn('[Intake] Failed to post manual update ack', err);
      }
    }
  }, [conversationId, practiceId, conversationMetadataRef, updateConversationMetadata, intakeConversationState]);

  const resetIntakeCta = useCallback(async () => {
    const current = consultation?.case ?? intakeConversationState;
    await updateConversationMetadata(
      applyConsultationPatchToMetadata(
        conversationMetadataRef.current,
        {
          case: { ...current, ctaShown: false, ctaResponse: null },
        },
        { mirrorLegacyFields: true }
      )
    );
  }, [consultation, conversationMetadataRef, intakeConversationState, updateConversationMetadata]);

  const handleSlimFormContinue = useCallback(async (draft: ContactData) => {
    const nextDraft: SlimContactDraft = {
      name: (draft.name ?? '').trim(),
      email: (draft.email ?? '').trim(),
      phone: (draft.phone ?? '').trim(),
    };

    const patch: ConversationMetadata = applyConsultationPatchToMetadata(
      conversationMetadataRef.current,
      {
        contact: nextDraft,
        status: 'collecting_case',
        mode: 'REQUEST_CONSULTATION',
      },
      { mirrorLegacyFields: true }
    );
    if (normalizedPracticeSlug) {
      patch.practiceSlug = normalizedPracticeSlug;
    }
    await updateConversationMetadata(patch);

    const practiceContextId = (practiceId ?? '').trim();
    if (!conversationId || !practiceContextId) return;

    const safeName = sanitizeName(nextDraft.name);
    const safeEmail = sanitizeName(nextDraft.email);
    const safePhone = sanitizeName(nextDraft.phone);
    const emailLine = nextDraft.email ? `Email: ${safeEmail}` : 'Email: Not provided';
    const phoneLine = nextDraft.phone ? `Phone: ${safePhone}` : 'Phone: Not provided';
    try {
      const ackMsg = await postSystemMessage(conversationId, practiceContextId, {
        clientId: 'system-intake-contact-ack',
        content: [
          'Contact info received',
          'Contact details',
          `Name: ${safeName || 'Not provided'}`,
          emailLine,
          phoneLine,
        ].join('\n'),
        metadata: {
          intakeComplete: true,
          contactDetails: {
            name: nextDraft.name,
            email: nextDraft.email,
            phone: nextDraft.phone,
          },
        },
      });
      if (ackMsg) applyServerMessages([ackMsg]);
    } catch (error) {
      console.error('[Intake] Failed to persist contact ack message', { conversationId, practiceContextId, error });
    }

    const firstName = nextDraft.name.split(' ')[0] || nextDraft.name;
    const greeting = `Thanks, ${firstName}! I've got your contact info. Can you tell me a bit about your legal situation? Just describe what's going on in your own words and I'll help make sure we connect you with the right attorney.`;
    try {
      const openingMsg = await postSystemMessage(conversationId, practiceContextId, {
        clientId: 'system-intake-opening',
        content: greeting,
        metadata: { source: 'ai', intakeOpening: true },
      });
      if (openingMsg) applyServerMessages([openingMsg]);
    } catch (error) {
      console.error('[Intake] Failed to post opening message', error);
    }
  }, [
    applyServerMessages,
    conversationId,
    conversationMetadataRef,
    practiceId,
    updateConversationMetadata,
    normalizedPracticeSlug,
  ]);

  const handleBuildBrief = useCallback(async () => {
    const currentConsultation = resolveConsultationState(conversationMetadataRef.current);
    const current = currentConsultation?.case ?? intakeConversationState;
    const patch: ConversationMetadata = applyConsultationPatchToMetadata(
      conversationMetadataRef.current,
      {
        status: 'collecting_case',
        mode: 'REQUEST_CONSULTATION',
        case: current.ctaResponse !== null ? { ...current, ctaResponse: null } : current,
      },
      { mirrorLegacyFields: true }
    );
    await updateConversationMetadata(patch);

    const state = patch.intakeConversationState ?? current;
    const parts = ['I want to build a stronger brief.'];
    if (state.city && state.state) parts.push(`My location is ${state.city}, ${state.state}.`);
    if (state.opposingParty?.trim()) parts.push(`Opposing party: ${state.opposingParty.trim()}.`);
    if (state.description?.trim()) parts.push(`My current description: ${state.description.trim()}.`);

    try {
      await sendMessage(parts.join(' '), []);
    } catch (error) {
      console.error('[Intake] Failed to start brief-building conversation', error);
    }
  }, [conversationMetadataRef, intakeConversationState, sendMessage, updateConversationMetadata]);

  const handleIntakeCtaResponse = useCallback(async (response: 'ready' | 'not_yet') => {
    const currentConsultation = resolveConsultationState(conversationMetadataRef.current);
    const current = currentConsultation?.case ?? intakeConversationState;
    if (response === 'ready') {
      const next: IntakeConversationState = { ...current, ctaResponse: 'ready' };
      await updateConversationMetadata(
        applyConsultationPatchToMetadata(
          conversationMetadataRef.current,
          { case: next, status: 'ready_to_submit' },
          { mirrorLegacyFields: true }
        )
      );
      return;
    }
    const next: IntakeConversationState = {
      ...current,
      ctaResponse: 'not_yet',
      notYetCount: (current.notYetCount ?? 0) + 1,
    };
    await updateConversationMetadata(
      applyConsultationPatchToMetadata(
        conversationMetadataRef.current,
        { case: next, status: 'collecting_case' },
        { mirrorLegacyFields: true }
      )
    );
    try {
      await sendMessage('Not yet', []);
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[Intake] Failed to send "Not yet" response', error);
    }
  }, [conversationMetadataRef, intakeConversationState, sendMessage, updateConversationMetadata]);

  /**
   * Phase 1 — validate contact, link user identity, persist practice slug.
   * Delegates straight to handleFinalizeSubmit.
   */
  const handleConfirmSubmit = useCallback(async () => {
    if (!conversationId || !practiceId) return;
    if (!resolvedSlimContactDraft) {
      if (import.meta.env.DEV) {
        console.warn('[handleConfirmSubmit] Missing slimContactDraft, cannot submit intake.');
      }
      const errMessage = 'We need your contact information before submitting. Please fill out the contact form.';
      if (onError) {
        onError(errMessage);
      } else {
        window.alert(errMessage);
      }
      return;
    }
    if (phase1InFlightRef.current) {
      if (import.meta.env.DEV) {
        console.info('[handleConfirmSubmit] Skipping duplicate submit while request is in-flight', {
          conversationId,
          practiceId,
        });
      }
      return;
    }

    phase1InFlightRef.current = true;
    try {
      // Link auth identity first so the API call has the right session.
      if (currentUserId && !isAnonymous) {
        try {
          await linkConversationToUser(conversationId, practiceId);
          clearConversationAnonymousParticipant(conversationId);
        } catch (linkError) {
          if (!axios.isAxiosError(linkError) || linkError.response?.status !== 409) {
            console.warn('[handleConfirmSubmit] Conversation link check failed', linkError);
          }
        }
      }

      const effectivePracticeSlug =
        (typeof conversationMetadataRef.current?.practiceSlug === 'string'
          ? conversationMetadataRef.current.practiceSlug.trim()
          : '') || normalizedPracticeSlug;

      if (!effectivePracticeSlug) {
        onError?.('Missing practice information for this intake. Please refresh and try again.');
        return;
      }

      if (conversationMetadataRef.current?.practiceSlug !== effectivePracticeSlug) {
        try {
          await updateConversationMetadata({ practiceSlug: effectivePracticeSlug });
        } catch (metadataError) {
          console.warn('[handleConfirmSubmit] Failed to persist practice slug before submission', metadataError);
        }
      }

      // ── Payment gate ──────────────────────────────────────────────────────
      // Fetch intake settings to determine whether a consultation fee is required
      // BEFORE creating the intake record. The API call (finalizeRef.current) must
      // only happen after payment is confirmed.
      let prefillAmount = 0;
      try {
        const settingsUrl = getPracticeClientIntakeSettingsEndpoint(effectivePracticeSlug);
        const settingsRes = await fetch(settingsUrl, {
          method: 'GET',
          credentials: 'include',
        });
        if (settingsRes.ok) {
          const settingsPayload = await settingsRes.json() as {
            success?: boolean;
            data?: {
              settings?: { prefillAmount?: number; prefill_amount?: number };
            };
          };
          const settings = settingsPayload.data?.settings;
          prefillAmount =
            (typeof settings?.prefillAmount === 'number' ? settings.prefillAmount : 0) ||
            (typeof settings?.prefill_amount === 'number' ? settings.prefill_amount : 0);
        }
      } catch (settingsError) {
        // Fail open: if we can't fetch settings, proceed without payment gate.
        // This prevents a settings API outage from blocking intake submissions entirely.
        console.warn('[handleConfirmSubmit] Failed to fetch intake settings, proceeding without payment gate', settingsError);
        prefillAmount = 0;
      }

      const paymentRequired = prefillAmount > 0;
      quickActionDebugLog('payment gate evaluated', { prefillAmount, paymentRequired, effectivePracticeSlug });

      if (paymentRequired) {
        // ── Conversational payment flow ──────────────────────────────────────
        // Step 1: Create the intake record. handleFinalizeSubmit now returns
        // paymentLinkUrl directly — reading it from conversation metadata was
        // always wrong because handleFinalizeSubmit stores it in the system
        // *message* metadata, not in the conversation metadata object.
        const finalizeResult = await finalizeRef.current({ generatePaymentLinkOnly: true });
        const paymentLinkUrl = finalizeResult?.paymentLinkUrl ?? null;

        // Step 2: Read the intakeUuid that handleFinalizeSubmit just persisted
        // into conversation metadata (updateConversationMetadata runs inside it).
        const latestConsultation = resolveConsultationState(conversationMetadataRef.current);
        const intakeUuid = latestConsultation?.submission?.intakeUuid ?? null;

        if (intakeUuid && paymentLinkUrl && conversationId && practiceId) {
          const formattedAmount = prefillAmount > 0
            ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(prefillAmount / 100)
            : null;
          const practiceName =
            (conversationMetadataRef.current as Record<string, unknown> | null)?.practiceName as string | undefined
            ?? 'The practice';
          const content = formattedAmount
            ? `Your brief looks great. ${practiceName} charges a ${formattedAmount} consultation fee to review your case. Tap below to pay and submit.`
            : `Your brief looks great. ${practiceName} requires a consultation fee to review your case. Tap below to pay and submit.`;

          try {
            const paymentMsg = await postSystemMessage(conversationId, practiceId, {
              clientId: `system-intake-pay-prompt-${intakeUuid}`,
              content,
              metadata: {
                intakeUuid,
                paymentRequired: true,
                quickReplies: [`__pay__:${paymentLinkUrl}`],
              },
            });
            if (paymentMsg) applyServerMessages([paymentMsg]);
          } catch (msgError) {
            console.warn('[handleConfirmSubmit] Failed to post conversational payment prompt', msgError);
          }

          // ── Payment confirmation polling ──────────────────────────────────
          // Uses recursive setTimeout (not setInterval) so slow fetches cannot
          // overlap with the next scheduled check. An inFlight bool adds a
          // second layer of protection. On timeout we surface an error so the
          // user knows to refresh rather than waiting indefinitely.
          if (paymentPollingTimerRef.current !== null) {
            clearTimeout(paymentPollingTimerRef.current);
            paymentPollingTimerRef.current = null;
          }
          const POLL_INTERVAL_MS = 5_000;
          const POLL_TIMEOUT_MS = 10 * 60 * 1_000;
          const pollStart = Date.now();
          let inFlight = false;

          // Dedicated confirmation: only posts the success message and bypasses
          // the intakeUuid existence guard inside handleFinalizeSubmit, which
          // would otherwise cause the callback to return early with no message.
          const capturedConversationId = conversationId;
          const capturedPracticeId = practiceId;
          const postPaymentConfirmedMessage = async () => {
            const name =
              (conversationMetadataRef.current as Record<string, unknown> | null)?.practiceName as string | undefined
              ?? 'the practice';
            const messageId = `system-intake-paid-${intakeUuid}`;
            try {
              const msg = await postSystemMessage(capturedConversationId, capturedPracticeId, {
                clientId: messageId,
                content: `Payment received. ${name} will review your intake and follow up with you here shortly.`,
                metadata: { intakeUuid, intakeSubmitted: true, paymentStatus: 'succeeded' },
              });
              if (msg) applyServerMessages([msg]);
            } catch (msgError) {
              console.warn('[handleConfirmSubmit] Failed to post payment confirmation message', msgError);
            }
          };

          const pollOnce = () => {
            if (Date.now() - pollStart > POLL_TIMEOUT_MS) {
              if (paymentPollingTimerRef.current !== null) {
                clearTimeout(paymentPollingTimerRef.current);
                paymentPollingTimerRef.current = null;
              }
              onError?.('Payment not confirmed after 10 minutes. Please refresh the page to check your status.');
              return;
            }
            if (inFlight) {
              // Previous fetch still running — skip this tick and reschedule.
              paymentPollingTimerRef.current = setTimeout(pollOnce, POLL_INTERVAL_MS) as unknown as ReturnType<typeof setTimeout>;
              return;
            }
            inFlight = true;
            fetchIntakePaymentStatus(intakeUuid)
              .then(async (status) => {
                if (isPaidIntakeStatus(status)) {
                  if (paymentPollingTimerRef.current !== null) {
                    clearTimeout(paymentPollingTimerRef.current);
                    paymentPollingTimerRef.current = null;
                  }
                  await postPaymentConfirmedMessage();
                } else if (isTerminalUnpaidStatus(status)) {
                  if (paymentPollingTimerRef.current !== null) {
                    clearTimeout(paymentPollingTimerRef.current);
                    paymentPollingTimerRef.current = null;
                  }
                  const name =
                    (conversationMetadataRef.current as Record<string, unknown> | null)?.practiceName as string | undefined
                    ?? 'the practice';
                  try {
                    const msg = await postSystemMessage(capturedConversationId, capturedPracticeId, {
                      clientId: `system-intake-pay-failed-${intakeUuid}`,
                      content: `Payment failed or was canceled. Please try again when you're ready, or reach out to ${name} directly.`,
                      metadata: { intakeUuid, paymentStatus: status },
                    });
                    if (msg) applyServerMessages([msg]);
                  } catch (msgError) {
                    console.warn('[handleConfirmSubmit] Failed to post payment failed message', msgError);
                  }
                } else {
                  paymentPollingTimerRef.current = setTimeout(pollOnce, POLL_INTERVAL_MS) as unknown as ReturnType<typeof setTimeout>;
                }
              })
              .catch((pollErr) => {
                console.warn('[handleConfirmSubmit] Payment status poll failed', pollErr);
                paymentPollingTimerRef.current = setTimeout(pollOnce, POLL_INTERVAL_MS) as unknown as ReturnType<typeof setTimeout>;
              })
              .finally(() => { inFlight = false; });
          };

          paymentPollingTimerRef.current = setTimeout(pollOnce, POLL_INTERVAL_MS) as unknown as ReturnType<typeof setTimeout>;
        }

        return;
      }

      // No payment required — create the intake record immediately.
      await finalizeRef.current();
    } catch (error) {
      console.error('[handleConfirmSubmit] Intake submission failed', error);
      onError?.(error instanceof Error ? error.message : 'Failed to submit intake. Please try again.');
    } finally {
      phase1InFlightRef.current = false;
    }
  }, [
    applyServerMessages,
    conversationId,
    conversationMetadataRef,
    currentUserId,
    isAnonymous,
    onError,
    practiceId,
    resolvedSlimContactDraft,
    updateConversationMetadata,
    normalizedPracticeSlug,
  ]);

  /**
   * Phase 2 — call the submit-intake API and post outcome messages.
   * Should be invoked:
   *   - directly by handleConfirmSubmit when no payment is required, OR
   *   - by the payment UI's onSuccess callback after payment completes.
   */
  const handleFinalizeSubmit = useCallback(async (options?: { generatePaymentLinkOnly?: boolean }): Promise<{ paymentLinkUrl: string | null }> => {
    if (!conversationId || !practiceId) return { paymentLinkUrl: null };

    const existingSubmission = conversationMetadataRef.current?.submission as { intakeUuid?: string } | undefined;
    if (existingSubmission?.intakeUuid) {
      if (import.meta.env.DEV) {
        console.info('[handleFinalizeSubmit] Skipping submit: intake record already exists', {
          conversationId,
          practiceId,
          intakeUuid: existingSubmission.intakeUuid,
        });
      }
      return { paymentLinkUrl: null };
    }
    if (submitInFlightRef.current) {
      if (import.meta.env.DEV) {
        console.info('[handleFinalizeSubmit] Skipping duplicate submit while request is in-flight', {
          conversationId,
          practiceId,
        });
      }
      return { paymentLinkUrl: null };
    }
    submitInFlightRef.current = true;
    try {
      const generatePaymentLinkParam = options?.generatePaymentLinkOnly ? '&generatePaymentLinkOnly=true' : '';
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/submit-intake?practiceId=${encodeURIComponent(practiceId)}${generatePaymentLinkParam}`,
        { method: 'POST', headers: withWidgetAuthHeaders({ 'Content-Type': 'application/json' }), credentials: 'include' },
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `Intake submission failed (HTTP ${response.status})`);
      }
      const result = await response.json() as {
        success: boolean;
        data: { intake_uuid: string; status: string; payment_link_url: string | null };
      };
      quickActionDebugLog('submit-intake response received', {
        conversationId,
        practiceId,
        httpOk: response.ok,
        success: result.success,
        intakeUuid: result.data?.intake_uuid ?? null,
        hasPaymentLinkUrl: Boolean(result.data?.payment_link_url),
      });
      if (!result.success || !result.data?.intake_uuid) {
        throw new Error('Intake submission returned an unexpected response');
      }
      const { intake_uuid: intakeUuid, payment_link_url: paymentLinkUrl } = result.data;

      emitWidgetLeadSubmitted({
        intakeUuid,
        status: result.data.status ?? 'submitted',
        requiresPayment: Boolean(paymentLinkUrl),
      });

      // If no payment is required, post the standard success message.
      // (If payment is required, the prompt is handled by handleConfirmSubmit).
      if (!paymentLinkUrl) {
        const practiceName =
          (conversationMetadataRef.current as Record<string, unknown>)?.practiceName as string | undefined
          ?? 'the practice';
        const messageId = `system-intake-submit-${intakeUuid}`;
        try {
          const persistedMessage = await postSystemMessage(conversationId, practiceId, {
            clientId: messageId,
            content: `Your intake has been submitted. ${practiceName} will review it and follow up with you here shortly.`,
            metadata: { intakeUuid, intakeSubmitted: true },
          });
          if (persistedMessage) applyServerMessages([persistedMessage]);
        } catch (msgError) {
          console.warn('[handleFinalizeSubmit] Failed to post confirmation message', msgError);
        }
      }

      // Persist submission state so reload derives step: 'pending_review' correctly.
      const currentConsultation = resolveConsultationState(conversationMetadataRef.current);
      const current = currentConsultation?.case ?? intakeConversationState;
      await updateConversationMetadata(
        applyConsultationPatchToMetadata(
          conversationMetadataRef.current,
          {
            case: { ...current, ctaResponse: 'ready' },
            status: 'submitted',
            submission: {
              intakeUuid,
              submittedAt: new Date().toISOString(),
              paymentRequired: Boolean(paymentLinkUrl),
            },
          },
          { mirrorLegacyFields: true }
        )
      );
      return { paymentLinkUrl: paymentLinkUrl ?? null };
    } catch (error) {
      console.error('[handleFinalizeSubmit] Intake submission failed', error);
      onError?.(error instanceof Error ? error.message : 'Failed to submit intake. Please try again.');
      return { paymentLinkUrl: null };
    } finally {
      submitInFlightRef.current = false;
    }
  }, [
    applyServerMessages,
    conversationId,
    conversationMetadataRef,
    onError,
    practiceId,
    updateConversationMetadata,
    intakeConversationState,
  ]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  finalizeRef.current = handleFinalizeSubmit as (options?: { generatePaymentLinkOnly?: boolean }) => Promise<{ paymentLinkUrl: string | null }>;

  // Cancel any in-flight payment polling when the hook unmounts.
  useEffect(() => {
    return () => {
      if (paymentPollingTimerRef.current !== null) {
        clearTimeout(paymentPollingTimerRef.current);
        paymentPollingTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Backward-compat alias for callers that don't have a payment UI wired */
  const handleSubmitNow = useCallback(async () => {
    await handleConfirmSubmit();
  }, [handleConfirmSubmit]);

  const handleContactFormSubmit = useCallback(async (draft: ContactData) => {
    try {
      const sanitizedContactDetails = {
        name: (draft.name ?? '').trim(),
        email: (draft.email ?? '').trim() || undefined,
        phone: (draft.phone ?? '').trim() || undefined,
      };
      await sendMessageOverWs(
        `Contact form submitted: ${draft.name}`,
        [],
        { isContactFormSubmission: true, contactDetails: sanitizedContactDetails }
      );
      await handleSlimFormContinue(draft);
    } catch (error) {
      console.error('[Intake] Contact form submit failed', error);
      onError?.('Failed to submit contact information.');
    }
  }, [handleSlimFormContinue, onError, sendMessageOverWs]);

  return {
    intakeStatus,
    intakeConversationState,
    slimContactDraft: resolvedSlimContactDraft,
    handleSlimFormContinue,
    handleBuildBrief,
    handleIntakeCtaResponse,
    resetIntakeCta,
    handleConfirmSubmit,
    handleFinalizeSubmit,
    handleSubmitNow,
    applyIntakeFields,
    handleContactFormSubmit,
  };
}
