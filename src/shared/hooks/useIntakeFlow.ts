import { useCallback, useMemo, useRef } from 'preact/hooks';
import axios from 'axios';
import { postSystemMessage } from '@/shared/lib/conversationApi';
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
  isIntakeReadyForSubmission,
  resolveConsultationState,
} from '@/shared/utils/consultationState';
import { quickActionDebugLog } from '@/shared/utils/quickActionDebug';

/** Minimal sanitizer for user-provided name in greeting — no XSS risk in system messages but keeps intent clear */
const sanitizeName = (name: string): string =>
  name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const INTAKE_FIELD_LABELS: Partial<Record<keyof IntakeFieldsPayload, string>> = {
  practiceAreaName: 'Practice area',
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
  /** Final intake submission via worker bridge */
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
}: UseIntakeFlowOptions): UseIntakeFlowResult {
  const { session, isAnonymous } = useSessionContext();
  const currentUserId = session?.user?.id ?? null;
  const submitInFlightRef = useRef(false);

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
    next.intakeReady = isIntakeReadyForSubmission(next);

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

  const handleSubmitNow = useCallback(async () => {
    if (!conversationId || !practiceId) return;
    if (!resolvedSlimContactDraft) {
      if (import.meta.env.DEV) {
        console.warn('[handleSubmitNow] Missing slimContactDraft, cannot submit intake.');
      }
      const errMessage = 'We need your contact information before submitting. Please fill out the contact form.';
      if (onError) {
        onError(errMessage);
      } else {
        window.alert(errMessage);
      }
      return;
    }
    if (submitInFlightRef.current) {
      if (import.meta.env.DEV) {
        console.info('[handleSubmitNow] Skipping duplicate submit while request is in-flight', {
          conversationId,
          practiceId,
        });
      }
      return;
    }
    submitInFlightRef.current = true;
    try {
      if (currentUserId && !isAnonymous) {
        try {
          await linkConversationToUser(conversationId, practiceId);
          clearConversationAnonymousParticipant(conversationId);
        } catch (linkError) {
          if (!axios.isAxiosError(linkError) || linkError.response?.status !== 409) {
            console.warn('[handleSubmitNow] Conversation link check failed', linkError);
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

      if (
        effectivePracticeSlug &&
        conversationMetadataRef.current?.practiceSlug !== effectivePracticeSlug
      ) {
        try {
          await updateConversationMetadata({ practiceSlug: effectivePracticeSlug });
        } catch (metadataError) {
          console.warn('[handleSubmitNow] Failed to persist practice slug before submission', metadataError);
        }
      }

      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/submit-intake?practiceId=${encodeURIComponent(practiceId)}`,
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
        requiresPayment: Boolean(paymentLinkUrl)
      });
      if (paymentLinkUrl) {
        const paymentPromptMessageId = `system-intake-payment-${intakeUuid}`;
        const paymentPromptMetadata: Record<string, unknown> = {
          intakeUuid,
          intakeSubmitted: true,
          paymentRequired: true,
          paymentRequest: {
            intakeUuid,
            paymentLinkUrl,
            practiceId,
            conversationId,
            returnTo: typeof window !== 'undefined'
              ? `${window.location.pathname}${window.location.search}`
              : undefined,
          },
        };
        quickActionDebugLog('posting payment prompt system message', {
          conversationId,
          practiceId,
          clientId: paymentPromptMessageId,
          metadataKeys: Object.keys(paymentPromptMetadata),
          hasPaymentRequest: true,
          paymentRequestKeys: Object.keys(
            (paymentPromptMetadata.paymentRequest as Record<string, unknown>) ?? {}
          ),
        });
        try {
          const paymentPromptMessage = await postSystemMessage(conversationId, practiceId, {
            clientId: paymentPromptMessageId,
            content: 'Your request has been submitted. To continue, please complete payment using the button below.',
            metadata: paymentPromptMetadata,
          });
          if (paymentPromptMessage) applyServerMessages([paymentPromptMessage]);
        } catch (msgError) {
          console.warn('[handleSubmitNow] Failed to post payment prompt message', msgError);
        }
      }
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
          console.warn('[handleSubmitNow] Failed to post confirmation message', msgError);
        }
      }
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
    } catch (error) {
      console.error('[handleSubmitNow] Intake submission failed', error);
      onError?.(error instanceof Error ? error.message : 'Failed to submit intake. Please try again.');
    } finally {
      submitInFlightRef.current = false;
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
    intakeConversationState,
  ]);

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
    handleSubmitNow,
    applyIntakeFields,
    handleContactFormSubmit,
  };
}
