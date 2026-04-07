import { useMemo, useCallback, useEffect, useRef } from 'preact/hooks';
import { postSystemMessage } from '@/shared/lib/conversationApi';
import {
  fetchIntakeCheckoutSession,
} from '@/shared/utils/intakePayments';
import type { ContactData } from '@/features/intake/components/ContactForm';
import type { ConversationMetadata, ConversationMessage } from '@/shared/types/conversation';
import type { FileAttachment } from '../../../worker/types';
import {
  initialIntakeState,
  type IntakeConversationState,
  type SlimContactDraft,
  type IntakeFieldsPayload,
  type DerivedIntakeStatus,
  type IntakeFieldChangeOptions,
} from '@/shared/types/intake';
import { withWidgetAuthHeaders } from '@/shared/utils/widgetAuth';
import { resolveAllowedParentOrigins } from '@/shared/utils/widgetEvents';
import {
  applyConsultationPatchToMetadata,
  deriveIntakeStatusFromConsultation,
  resolveConsultationState,
} from '@/shared/utils/consultationState';
import { quickActionDebugLog } from '@/shared/utils/quickActionDebug';
import {
  getPracticeClientIntakeSettingsEndpoint,
} from '@/config/api';

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
  desiredOutcome: 'Desired outcome',
  courtDate: 'Court date',
  hasDocuments: 'Supporting documents',
};

const PERSISTED_INTAKE_FIELD_KEYS = [
  'practiceArea',
  'description',
  'urgency',
  'opposingParty',
  'city',
  'state',
  'desiredOutcome',
  'courtDate',
  'hasDocuments',
  'ctaShown',
] as const satisfies ReadonlyArray<keyof IntakeConversationState & keyof IntakeFieldsPayload>;

type PersistedIntakeFieldKey = (typeof PERSISTED_INTAKE_FIELD_KEYS)[number];




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
  enabled?: boolean;
  conversationId: string | undefined;
  practiceId: string | undefined;
  practiceSlug?: string | null;
  onEnsureConversation?: () => Promise<string | null>;
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
   */
}

export interface UseIntakeFlowResult {
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
   * Phase 2: call the submit-intake API and post the success message.
   * Called by the parent after payment is confirmed, or immediately if no payment needed.
   */
  handleFinalizeSubmit: (options?: { generatePaymentLinkOnly?: boolean }) => Promise<{ paymentLinkUrl: string | null; intakeUuid: string | null }>;
  /** Backward-compat alias: runs the full confirm+finalize flow (used where no payment UI is wired) */
  handleSubmitNow: () => Promise<void>;
  /** Apply fields extracted by AI or manual edits */
  applyIntakeFields: (payload: IntakeFieldsPayload, options?: IntakeFieldChangeOptions) => Promise<void>;
  /** Legacy alias or specialized form submit if needed */
  handleContactFormSubmit: (data: ContactData) => Promise<void>;
}

export function useIntakeFlow({
  enabled = true,
  conversationId,
  practiceId,
  practiceSlug,
  onEnsureConversation,
  conversationMetadata,
  slimContactDraft,
  conversationMetadataRef,
  updateConversationMetadata,
  applyServerMessages,
  sendMessage,
  sendMessageOverWs,
  onError,
}: UseIntakeFlowOptions): UseIntakeFlowResult {
  const submitInFlightRef = useRef(false);
  const phase1InFlightRef = useRef(false);
  const finalizeRef = useRef<(options?: { generatePaymentLinkOnly?: boolean }) => Promise<{ paymentLinkUrl: string | null; intakeUuid: string | null }>>(async () => ({ paymentLinkUrl: null, intakeUuid: null }));
  const paymentPollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paymentPollingCancelledRef = useRef(false);

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

  useEffect(() => {
    if (enabled) {
      paymentPollingCancelledRef.current = false;
      return;
    }
    paymentPollingCancelledRef.current = true;
    if (paymentPollingTimerRef.current !== null) {
      clearTimeout(paymentPollingTimerRef.current);
      paymentPollingTimerRef.current = null;
    }
  }, [enabled]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const applyIntakeFields = useCallback(async (payload: IntakeFieldsPayload, options?: IntakeFieldChangeOptions) => {
    if (!enabled) return;

    // Build only the delta — fields that are explicitly provided in payload.
    // updateConversationMetadata reads conversationMetadataRef.current as the base,
    // so we must not pre-merge here (that would cause a double stale-ref spread).
    const delta: Partial<IntakeConversationState> = {};
    const changedFields: string[] = [];

    const currentConsultation = resolveConsultationState(conversationMetadataRef.current);
    const currentCase = currentConsultation?.case ?? intakeConversationState;

    PERSISTED_INTAKE_FIELD_KEYS.forEach((key: PersistedIntakeFieldKey) => {
      const val = payload[key];
      if (val !== undefined) {
        if (currentCase[key] !== val) {
          const label = INTAKE_FIELD_LABELS[key];
          if (label) changedFields.push(label);
        }
        (delta as Record<string, unknown>)[key] = val;
      }
    });

    if (Object.keys(delta).length === 0) return;

    await updateConversationMetadata(
      applyConsultationPatchToMetadata(
        conversationMetadataRef.current,
        { case: { ...(currentCase), ...delta } },
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
  }, [conversationId, enabled, practiceId, conversationMetadataRef, updateConversationMetadata, intakeConversationState]);


  const resetIntakeCta = useCallback(async () => {
    if (!enabled) return;
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
  }, [consultation, conversationMetadataRef, enabled, intakeConversationState, updateConversationMetadata]);

  const handleSlimFormContinue = useCallback(async (draft: ContactData) => {
    if (!enabled) return;
    
    try {
      const newId = onEnsureConversation ? await onEnsureConversation() : conversationId;
      if (!newId) {
        console.error('[Intake] Could not ensure conversation for slim form continue');
        return;
      }

      const nextDraft: SlimContactDraft = {
        name: (draft.name ?? '').trim(),
        email: (draft.email ?? '').trim(),
        phone: (draft.phone ?? '').trim(),
      };

      const practiceContextId = (practiceId ?? '').trim();

      // 1. Write Metadata Patch atomically with status: active
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
      patch.status = 'active';
      await updateConversationMetadata(patch, newId);

      if (!practiceContextId) {
        console.error('[Intake] Metadata updated but practice ID is missing; cannot post system messages');
        throw new Error('Missing practice context after conversation initialization');
      }

      // 2. Post System Messages
      const safeName = sanitizeName(nextDraft.name);
      const safeEmail = sanitizeName(nextDraft.email);
      const safePhone = sanitizeName(nextDraft.phone);
      const emailLine = nextDraft.email ? `Email: ${safeEmail}` : 'Email: Not provided';
      const phoneLine = nextDraft.phone ? `Phone: ${safePhone}` : 'Phone: Not provided';

      const ackMsg = await postSystemMessage(newId, practiceContextId, {
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

      const firstName = nextDraft.name.split(' ')[0] || nextDraft.name;
      const greeting = `Thanks, ${firstName}! I've got your contact info. Can you tell me a bit about your legal situation? Just describe what's going on in your own words and I'll help make sure we connect you with the right attorney.`;
      
      const openingMsg = await postSystemMessage(newId, practiceContextId, {
        clientId: 'system-intake-opening',
        content: greeting,
        metadata: { source: 'ai', intakeOpening: true },
      });
      if (openingMsg) applyServerMessages([openingMsg]);
    } catch (error) {
      console.error('[Intake] Failed slim form continue', error);
    }
  }, [
    enabled,
    conversationId,
    practiceId,
    normalizedPracticeSlug,
    conversationMetadataRef,
    updateConversationMetadata,
    applyServerMessages,
    onEnsureConversation
  ]);

  const handleBuildBrief = useCallback(async () => {
    if (!enabled) return;
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
  }, [conversationMetadataRef, enabled, intakeConversationState, sendMessage, updateConversationMetadata]);

  const handleIntakeCtaResponse = useCallback(async (response: 'ready' | 'not_yet') => {
    if (!enabled) return;
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
  }, [conversationMetadataRef, enabled, intakeConversationState, sendMessage, updateConversationMetadata]);

  const handlePaymentHandoff = useCallback(async (handoffParams: {
    paymentLinkUrl: string | null;
    intakeUuid: string | null;
    practiceSlug: string;
  }) => {
    const { paymentLinkUrl, intakeUuid } = handoffParams;
    if (!intakeUuid || !conversationId || !practiceId) return;

    let checkoutSessionUrl: string | null = null;
    let checkoutSessionId: string | null = null;

    try {
      const checkoutSession = await fetchIntakeCheckoutSession(intakeUuid, { conversationId });
      checkoutSessionUrl = checkoutSession.url;
      checkoutSessionId = checkoutSession.sessionId;
    } catch (fetchError) {
      console.warn('[handlePaymentHandoff] Failed to fetch checkout session, falling back to payment link', fetchError);
      checkoutSessionUrl = null;
      checkoutSessionId = null;
    }

    const paymentUrl = checkoutSessionUrl ?? paymentLinkUrl;
    if (!paymentUrl) {
      const errorMessage = 'Payment could not be initialized. Please try again or contact support.';
      onError?.(errorMessage);
      return;
    }

    if (checkoutSessionId) {
      try {
        await updateConversationMetadata(
          applyConsultationPatchToMetadata(
            conversationMetadataRef.current,
            {
              submission: { checkoutSessionId, intakeUuid },
            },
            { mirrorLegacyFields: true }
          )
        );
      } catch (metadataError) {
        console.warn('[handlePaymentHandoff] Failed to persist checkout session id', metadataError);
      }
    }

    if (typeof window !== 'undefined') {
      // Open Stripe in a new tab. Fire-and-forget: if the browser blocks the popup
      // it will show its own native notification — no fallback navigation needed.
      window.open(paymentUrl, '_blank', 'noopener,noreferrer');
    }
  }, [
    conversationId,
    conversationMetadataRef,
    onError,
    practiceId,
    updateConversationMetadata
  ]);

  /**
   * Phase 1 — validate contact, persist practice slug, and decide whether to
   * continue into payment or create the intake immediately.
   */
  const handleConfirmSubmit = useCallback(async () => {
    if (!enabled) return;
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
      let consultationFee = 0;
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
              settings?: { consultationFee?: number; consultation_fee?: number };
            };
          };
          const settings = settingsPayload.data?.settings;
          consultationFee =
            (typeof settings?.consultationFee === 'number' ? settings.consultationFee : 0) ||
            (typeof settings?.consultation_fee === 'number' ? settings.consultation_fee : 0);
        }
      } catch (settingsError) {
        // Fail open: if we can't fetch settings, proceed without payment gate.
        // This prevents a settings API outage from blocking intake submissions entirely.
        console.warn('[handleConfirmSubmit] Failed to fetch intake settings, proceeding without payment gate', settingsError);
        consultationFee = 0;
      }

      const paymentRequired = consultationFee > 0;
      quickActionDebugLog('payment gate evaluated', { consultationFee, paymentRequired, effectivePracticeSlug });

      if (paymentRequired) {
        // ── Direct payment handoff ──────────────────────────────────────────
        // Step 1: Create the intake record. handleFinalizeSubmit returns the
        // identifiers we need directly so this flow does not race the metadata
        // persistence round-trip.
        const finalizeResult = await finalizeRef.current({ generatePaymentLinkOnly: true });
        await handlePaymentHandoff({
          paymentLinkUrl: finalizeResult?.paymentLinkUrl,
          intakeUuid: finalizeResult?.intakeUuid,
          practiceSlug: effectivePracticeSlug,
        });
        return;
      }

      // No payment pre-calculated — create the intake record immediately.
      // If the backend returns a paymentLinkUrl, we still hand off to payment.
      const finalizeResult = await finalizeRef.current();
      if (finalizeResult?.paymentLinkUrl) {
        await handlePaymentHandoff({
          paymentLinkUrl: finalizeResult.paymentLinkUrl,
          intakeUuid: finalizeResult.intakeUuid,
          practiceSlug: effectivePracticeSlug,
        });
      }
    } catch (error) {
      console.error('[handleConfirmSubmit] Intake submission failed', error);
      onError?.(error instanceof Error ? error.message : 'Failed to submit intake. Please try again.');
    } finally {
      phase1InFlightRef.current = false;
    }
  }, [
    conversationId,
    conversationMetadataRef,
    enabled,
    onError,
    practiceId,
    resolvedSlimContactDraft,
    updateConversationMetadata,
    normalizedPracticeSlug,
    handlePaymentHandoff,
  ]);

  /**
   * Phase 2 — call the submit-intake API and post the success message.
   * Should be invoked:
   *   - directly by handleConfirmSubmit when no payment is required, OR
   *   - by the payment UI's onSuccess callback after payment completes.
   */
  const handleFinalizeSubmit = useCallback(async (options?: { generatePaymentLinkOnly?: boolean }): Promise<{ paymentLinkUrl: string | null; intakeUuid: string | null }> => {
    if (!enabled) return { paymentLinkUrl: null, intakeUuid: null };
    if (!conversationId || !practiceId) return { paymentLinkUrl: null, intakeUuid: null };

    const existingSubmission = conversationMetadataRef.current?.submission as { intakeUuid?: string } | undefined;
    if (existingSubmission?.intakeUuid) {
      if (import.meta.env.DEV) {
        console.info('[handleFinalizeSubmit] Skipping submit: intake record already exists', {
          conversationId,
          practiceId,
          intakeUuid: existingSubmission.intakeUuid,
        });
      }
      return { paymentLinkUrl: null, intakeUuid: existingSubmission.intakeUuid };
    }
    if (submitInFlightRef.current) {
      if (import.meta.env.DEV) {
        console.info('[handleFinalizeSubmit] Skipping duplicate submit while request is in-flight', {
          conversationId,
          practiceId,
        });
      }
      return { paymentLinkUrl: null, intakeUuid: null };
    }
    submitInFlightRef.current = true;
    try {
      const generatePaymentLinkParam = options?.generatePaymentLinkOnly ? '&generatePaymentLinkOnly=true' : '';
      const latestMergedIntakeState = conversationMetadataRef.current?.mergedIntakeState ?? intakeConversationState;
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/submit-intake?practiceId=${encodeURIComponent(practiceId)}${generatePaymentLinkParam}`,
        {
          method: 'POST',
          headers: withWidgetAuthHeaders({ 'Content-Type': 'application/json' }),
          credentials: 'include',
          body: JSON.stringify({ mergedIntakeState: latestMergedIntakeState }),
        },
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `Intake submission failed (HTTP ${response.status})`);
      }
      const result = await response.json() as {
        success: boolean;
        data: {
          intake_uuid: string;
          status: string;
          payment_link_url: string | null;
          organization?: {
            name?: string | null;
          } | null;
        };
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
        const messageId = `system-intake-submit-${intakeUuid}`;
        try {
          const persistedMessage = await postSystemMessage(conversationId, practiceId, {
            clientId: messageId,
            content: 'Thank you, we will be in touch.',
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
      return { paymentLinkUrl: paymentLinkUrl ?? null, intakeUuid };
    } catch (error) {
      console.error('[handleFinalizeSubmit] Intake submission failed', error);
      onError?.(error instanceof Error ? error.message : 'Failed to submit intake. Please try again.');
      return { paymentLinkUrl: null, intakeUuid: null };
    } finally {
      submitInFlightRef.current = false;
    }
  }, [
    applyServerMessages,
    conversationId,
    conversationMetadataRef,
    enabled,
    onError,
    practiceId,
    updateConversationMetadata,
    intakeConversationState,
  ]);

   
  finalizeRef.current = handleFinalizeSubmit as (options?: { generatePaymentLinkOnly?: boolean }) => Promise<{ paymentLinkUrl: string | null; intakeUuid: string | null }>;

  // Cancel any in-flight payment polling when the hook unmounts.
  useEffect(() => {
    return () => {
      paymentPollingCancelledRef.current = true;
      if (paymentPollingTimerRef.current !== null) {
        clearTimeout(paymentPollingTimerRef.current);
        paymentPollingTimerRef.current = null;
      }
    };
   
  }, [handlePaymentHandoff]);

  /** Backward-compat alias for callers that don't have a payment UI wired */
  const handleSubmitNow = useCallback(async () => {
    await handleConfirmSubmit();
  }, [handleConfirmSubmit]);

  const handleContactFormSubmit = useCallback(async (draft: ContactData) => {
    if (!enabled) return;
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
  }, [enabled, handleSlimFormContinue, onError, sendMessageOverWs]);

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
