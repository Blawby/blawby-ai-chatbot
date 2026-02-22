import { useCallback, useMemo } from 'preact/hooks';
import { postSystemMessage } from '@/shared/lib/conversationApi';
import type { ContactData } from '@/features/intake/components/ContactForm';
import type { ConversationMetadata, ConversationMessage } from '@/shared/types/conversation';
import type { FileAttachment } from '../../../worker/types';
import {
  initialIntakeState,
  type IntakeConversationState,
  type SlimContactDraft,
  type IntakeFieldsPayload,
  type IntakeStep,
  type DerivedIntakeStatus,
} from '@/shared/types/intake';

/** Minimal sanitizer for user-provided name in greeting — no XSS risk in system messages but keeps intent clear */
const sanitizeName = (name: string): string =>
  name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

interface UseIntakeFlowOptions {
  conversationId: string | undefined;
  practiceId: string | undefined;
  conversationMetadata: ConversationMetadata | null;
  slimContactDraft: SlimContactDraft | null;
  conversationMetadataRef: React.MutableRefObject<ConversationMetadata | null>;
  updateConversationMetadata: (
    patch: ConversationMetadata,
    conversationId?: string,
  ) => Promise<unknown>;
  applyServerMessages: (messages: ConversationMessage[]) => void;
  /** Send a user-visible message through WebSocket */
  sendMessage: (content: string, attachments?: FileAttachment[], replyToMessageId?: string | null) => Promise<void>;
  /** Send a raw frame over WebSocket */
  sendMessageOverWs: (
    content: string,
    attachments: FileAttachment[],
    metadata?: Record<string, unknown> | null,
    replyToMessageId?: string | null
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
  /** Apply fields extracted by AI */
  applyIntakeFields: (payload: IntakeFieldsPayload) => Promise<void>;
  /** Legacy alias or specialized form submit if needed */
  handleContactFormSubmit: (data: ContactData) => Promise<void>;
}

export function useIntakeFlow({
  conversationId,
  practiceId,
  conversationMetadata,
  slimContactDraft,
  conversationMetadataRef,
  updateConversationMetadata,
  applyServerMessages,
  sendMessage,
  sendMessageOverWs,
  onError,
}: UseIntakeFlowOptions): UseIntakeFlowResult {
  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const intakeConversationState = useMemo(() => 
    conversationMetadata?.intakeConversationState ?? initialIntakeState,
    [conversationMetadata?.intakeConversationState]
  );

  const intakeStatus = useMemo((): DerivedIntakeStatus => {
    const meta = conversationMetadata;
    let step: IntakeStep = 'contact_form_slim';
    
    if (meta?.intakeCompleted) step = 'completed';
    else if (meta?.intakeSubmitted) step = 'pending_review';
    else if (meta?.intakeAiBriefActive) step = 'ai_brief';
    else if (meta?.intakeSlimContactDraft) step = 'contact_form_decision';

    return {
      step,
      decision: meta?.intakeDecision as string | undefined,
      intakeUuid: meta?.intakeUuid as string | undefined,
      paymentRequired: meta?.intakePaymentRequired as boolean | undefined,
      paymentReceived: meta?.intakePaymentReceived as boolean | undefined,
    };
  }, [conversationMetadata]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const applyIntakeFields = useCallback(async (payload: IntakeFieldsPayload) => {
    const current = conversationMetadataRef.current?.intakeConversationState ?? initialIntakeState;
    const next: IntakeConversationState = { ...current };

    (Object.keys(payload) as Array<keyof IntakeFieldsPayload>).forEach(key => {
      const val = payload[key];
      if (val !== undefined) {
        (next as unknown as Record<string, unknown>)[key] = val;
      }
    });

    await updateConversationMetadata({ intakeConversationState: next });
  }, [conversationMetadataRef, updateConversationMetadata]);

  const resetIntakeCta = useCallback(async () => {
    const current = conversationMetadata?.intakeConversationState ?? initialIntakeState;
    await updateConversationMetadata({
      intakeConversationState: { ...current, ctaShown: false, ctaResponse: null }
    });
  }, [conversationMetadata, updateConversationMetadata]);

  const handleSlimFormContinue = useCallback(async (draft: ContactData) => {
    const nextDraft: SlimContactDraft = {
      name: (draft.name ?? '').trim(),
      email: (draft.email ?? '').trim(),
      phone: (draft.phone ?? '').trim(),
    };

    const patch: ConversationMetadata = {
      intakeSlimContactDraft: nextDraft,
      intakeAiBriefActive: true,
    };
    if (conversationMetadataRef.current?.mode !== 'REQUEST_CONSULTATION') {
      patch.mode = 'REQUEST_CONSULTATION';
    }
    await updateConversationMetadata(patch);

    const practiceContextId = (practiceId ?? '').trim();
    if (!conversationId || !practiceContextId) return;

    const safeName = sanitizeName(nextDraft.name);
    try {
      const ackMsg = await postSystemMessage(conversationId, practiceContextId, {
        clientId: 'system-intake-contact-ack',
        content: [
          'Contact info received',
          'Contact details',
          `Name: ${safeName}`,
          'Email: REDACTED',
          'Phone: REDACTED',
        ].join('\n'),
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
  ]);

  const handleBuildBrief = useCallback(async () => {
    const patch: ConversationMetadata = { intakeAiBriefActive: true };
    if (conversationMetadataRef.current?.mode !== 'REQUEST_CONSULTATION') {
      patch.mode = 'REQUEST_CONSULTATION';
    }
    const current = conversationMetadataRef.current?.intakeConversationState ?? initialIntakeState;
    if (current.ctaResponse !== null) {
      patch.intakeConversationState = { ...current, ctaResponse: null };
    }
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
  }, [conversationMetadataRef, sendMessage, updateConversationMetadata]);

  const handleIntakeCtaResponse = useCallback(async (response: 'ready' | 'not_yet') => {
    const current = conversationMetadataRef.current?.intakeConversationState ?? initialIntakeState;
    if (response === 'ready') {
      const next: IntakeConversationState = { ...current, ctaResponse: 'ready' };
      await updateConversationMetadata({ intakeConversationState: next });
      return;
    }
    const next: IntakeConversationState = {
      ...current,
      ctaResponse: 'not_yet',
      notYetCount: (current.notYetCount ?? 0) + 1,
    };
    await updateConversationMetadata({ intakeConversationState: next });
    try {
      await sendMessage('Not yet', []);
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[Intake] Failed to send "Not yet" response', error);
    }
  }, [conversationMetadataRef, sendMessage, updateConversationMetadata]);

  const handleSubmitNow = useCallback(async () => {
    if (!slimContactDraft) return;
    if (!conversationId || !practiceId) return;
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/submit-intake?practiceId=${encodeURIComponent(practiceId)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include' },
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `Intake submission failed (HTTP ${response.status})`);
      }
      const result = await response.json() as {
        success: boolean;
        data: { intake_uuid: string; status: string; payment_link_url: string | null };
      };
      if (!result.success || !result.data?.intake_uuid) {
        throw new Error('Intake submission returned an unexpected response');
      }
      const { intake_uuid: intakeUuid, payment_link_url: paymentLinkUrl } = result.data;
      if (paymentLinkUrl) {
        if (typeof window !== 'undefined') {
          const returnTo = `${window.location.pathname}${window.location.search}`;
          window.sessionStorage.setItem(
            `intakePaymentPending:${intakeUuid}`,
            JSON.stringify({ conversationId, practiceId, returnTo }),
          );
          window.location.href = paymentLinkUrl;
        }
        return;
      }
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
      const current = conversationMetadataRef.current?.intakeConversationState ?? initialIntakeState;
      await updateConversationMetadata({
        intakeUuid,
        intakeSubmitted: true,
        intakeConversationState: { ...current, ctaResponse: 'ready' },
      });
    } catch (error) {
      console.error('[handleSubmitNow] Intake submission failed', error);
      onError?.(error instanceof Error ? error.message : 'Failed to submit intake. Please try again.');
    }
  }, [
    applyServerMessages,
    conversationId,
    conversationMetadataRef,
    onError,
    practiceId,
    slimContactDraft,
    updateConversationMetadata,
  ]);

  const handleContactFormSubmit = useCallback(async (draft: ContactData) => {
    try {
      const sanitizedContactDetails = {
        ...draft,
        email: draft.email ? 'REDACTED' : undefined,
        phone: draft.phone ? 'REDACTED' : undefined,
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
    slimContactDraft,
    handleSlimFormContinue,
    handleBuildBrief,
    handleIntakeCtaResponse,
    resetIntakeCta,
    handleSubmitNow,
    applyIntakeFields,
    handleContactFormSubmit,
  };
}

