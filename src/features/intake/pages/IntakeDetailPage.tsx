import { FunctionComponent } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useMessageHandling } from '@/shared/hooks/useMessageHandling';
import {
  CheckCircleIcon,
  UserIcon,
  ScaleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CreditCardIcon,
  MapPinIcon,
  ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid';
import { Icon } from '@/shared/ui/Icon';
import { Button } from '@/shared/ui/Button';
import { UserCard } from '@/shared/ui/profile';
import { EditorShell, DetailHeader } from '@/shared/ui/layout';
import { Page } from '@/shared/ui/layout/Page';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/input';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import {
  getPracticeIntake,
  updateIntakeTriageStatus,
  type PracticeIntakeDetail,
} from '@/features/intake/api/intakesApi';
import {
  fetchConversationMessages,
  postConversationMessage,
  postSystemMessage,
  updateConversationMetadata,
} from '@/shared/lib/conversationApi';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import VirtualMessageList from '@/features/chat/components/VirtualMessageList';
import MessageComposer from '@/features/chat/components/MessageComposer';
import type { ChatMessageUI } from '../../../../worker/types';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { resolvePracticeServiceLabel } from '@/features/matters/utils/matterUtils';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';
import { applyConsultationPatchToMetadata } from '@/shared/utils/consultationState';

// ── Helpers ──────────────────────────────────────────────────────────────────

// Stat cell for use inside CSS grids — no border treatment
type StatCellProps = { label: string; value?: string | null; icon?: typeof UserIcon };
const StatCell: FunctionComponent<StatCellProps> = ({ label, value, icon: IconComp }) => {
  const resolvedValue = value && value.trim().length > 0 ? value : null;
  return (
    <div className="flex items-start gap-2.5">
      {IconComp && (
        <div className="mt-0.5 flex-shrink-0 text-input-placeholder">
          <Icon icon={IconComp} className="w-4 h-4" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder mb-0.5">{label}</p>
        <p className={`text-sm break-words ${resolvedValue ? 'text-input-text' : 'text-input-placeholder'}`}>
          {resolvedValue ?? 'Not provided'}
        </p>
      </div>
    </div>
  );
};

type SummaryRowProps = { label: string; value?: string | number | null; icon: typeof UserIcon };
const SummaryRow: FunctionComponent<SummaryRowProps> = ({ label, value, icon: IconComp }) => {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-4 py-4 first:pt-0 last:pb-0">
      <div className="pt-1 text-input-text">
        <Icon icon={IconComp} className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <dt className="mt-1 text-sm font-medium leading-tight text-input-placeholder">{label}</dt>
        <dd className="break-words text-lg font-semibold leading-tight text-input-text">{value}</dd>
      </div>
    </div>
  );
};

function formatAmount(amount?: number, currency?: string) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount / 100);
  } catch {
    return `${amount / 100} ${currency || 'USD'}`;
  }
}

function urgencyLabel(u?: string | null) {
  if (u === 'emergency') return 'Emergency';
  if (u === 'time_sensitive') return 'Time Sensitive';
  if (u === 'routine') return 'Routine';
  return u ?? null;
}

function triageLabel(status?: string) {
  if (status === 'pending_review') return 'Pending Review';
  if (status === 'accepted') return 'Accepted';
  if (status === 'declined') return 'Declined';
  if (status === 'rejected') return 'Rejected';
  if (status === 'spam') return 'Spam';
  return status ?? 'Unknown';
}

// ── Main component ────────────────────────────────────────────────────────────

type IntakeDetailPageProps = {
  practiceId: string | null;
  intakeId: string;
  conversationsBasePath?: string | null;
  practiceName: string;
  practiceLogo: string | null;
  onBack: () => void;
  onTriageComplete?: () => void;
};

export const IntakeDetailPage: FunctionComponent<IntakeDetailPageProps> = ({
  practiceId,
  intakeId,
  practiceName,
  practiceLogo,
  onBack,
  onTriageComplete,
}) => {
  const { showSuccess, showError } = useToastContext();
  const { session } = useSessionContext();

  const [intake, setIntake] = useState<PracticeIntakeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localTriageStatus, setLocalTriageStatus] = useState<string | null>(null);
  const [triageDialogAction, setTriageDialogAction] = useState<'accepted' | 'declined' | null>(null);
  const [triageReason, setTriageReason] = useState('');
  const [previewMessages, setPreviewMessages] = useState<ChatMessageUI[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Use canonical conversation flow state
  const {
    conversationMetadata,
    updateConversationMetadata: updateConversationMetadataPatch,
    intakeConversationState,
  } = useMessageHandling({
    practiceId: practiceId ?? undefined,
    conversationId: intake?.conversation_id,
  });

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Restore initial previewMessages loading
  useEffect(() => {
    const conversationId = intake?.conversation_id;
    const targetPracticeId = intake?.organization_id;
    if (!conversationId || !targetPracticeId) {
      setPreviewMessages([]);
      setPreviewLoading(false);
      return;
    }
    const controller = new AbortController();
    setPreviewMessages([]);
    setPreviewLoading(true);
    fetchConversationMessages(conversationId, targetPracticeId, { limit: 100, signal: controller.signal })
      .then((messages) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        const mappedMessages = messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          timestamp: new Date(message.created_at).getTime(),
          reply_to_message_id: message.reply_to_message_id ?? null,
          metadata: message.metadata ?? undefined,
          isUser: message.user_id === session?.user?.id,
          seq: message.seq,
        } satisfies ChatMessageUI));
        setPreviewMessages(mappedMessages);
      })
      .catch((err) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        console.warn('[IntakeDetailPage] Failed to load conversation preview', err);
        setPreviewMessages([]);
      })
      .finally(() => {
        if (isMountedRef.current && !controller.signal.aborted) {
          setPreviewLoading(false);
        }
      });
    return () => controller.abort();
  }, [intake?.conversation_id, intake?.organization_id, session?.user?.id]);

  const [composerValue, setComposerValue] = useState('');
  const [composerSubmitting, setComposerSubmitting] = useState(false);
  const [gatherDetailsSubmitting, setGatherDetailsSubmitting] = useState(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  const {
    details: practiceDetails,
    hasDetails: hasPracticeDetails,
    fetchDetails: fetchPracticeDetails,
  } = usePracticeDetails(practiceId, null, false);

  // Load intake detail
  useEffect(() => {
    if (!practiceId || !intakeId) return;
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(null);

    getPracticeIntake(practiceId, intakeId, { signal: controller.signal })
      .then((data) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        setIntake(data);
        setLocalTriageStatus(data.triage_status ?? null);
      })
      .catch((err: unknown) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load intake');
      })
      .finally(() => {
        if (isMountedRef.current && !controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [practiceId, intakeId]);

  useEffect(() => {
    if (!practiceId || hasPracticeDetails) return;
    fetchPracticeDetails().catch((err) => {
      console.warn('[IntakeDetailPage] Failed to load practice services', err);
    });
  }, [fetchPracticeDetails, hasPracticeDetails, practiceId]);

  const closeTriageDialog = useCallback(() => {
    if (isSubmitting) return;
    setTriageDialogAction(null);
    setTriageReason('');
  }, [isSubmitting]);

  const openTriageDialog = useCallback((action: 'accepted' | 'declined') => {
    if (isSubmitting) return;
    setTriageDialogAction(action);
    setTriageReason('');
  }, [isSubmitting]);

  const runTriage = useCallback(async (action: 'accepted' | 'declined', reason?: string) => {
    if (isSubmitting || !intake) return;

    setIsSubmitting(true);
    try {
      const trimmedReason = typeof reason === 'string' && reason.trim().length > 0
        ? reason.trim()
        : undefined;
      let participantFailed = false;
      const result = await updateIntakeTriageStatus(intakeId, {
        status: action,
        reason: trimmedReason,
      });

      const responseConversationId =
        result?.conversation_id ?? result?.conversationId ?? intake.conversation_id;
      const targetPracticeId = intake.organization_id;

      // On accept: add practitioner as participant and post system message
      if (action === 'accepted' && session?.user?.id && responseConversationId && targetPracticeId) {
        try {
          await updateConversationMetadata(responseConversationId, targetPracticeId, { status: 'active' });
        } catch (conversationErr) {
          console.warn('[IntakeDetailPage] Failed to mark conversation active', conversationErr);
        }

        try {
          const participantRes = await fetch(
            `/api/conversations/${encodeURIComponent(responseConversationId)}/participants?practiceId=${encodeURIComponent(targetPracticeId)}`,
            {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ participantUserIds: [session.user.id] }),
            }
          );
          if (!participantRes.ok) {
            participantFailed = true;
          }
        } catch (participantErr) {
          participantFailed = true;
          console.warn('[IntakeDetailPage] Failed to add participant', participantErr);
        }

        try {
          const userName = session.user.name?.trim() || session.user.email?.trim() || 'Someone';
          await postSystemMessage(responseConversationId, targetPracticeId, {
            clientId: 'system-lead-accepted',
            content: `${userName} has joined the conversation`,
            metadata: {
              systemMessageKey: 'lead_accepted',
              intakeUuid: intakeId,
              triageStatus: 'accepted',
              triage_status: 'accepted',
            },
          });
        } catch (msgErr) {
          console.warn('[IntakeDetailPage] Failed to post join message', msgErr);
        }

        if (trimmedReason) {
          try {
            await postConversationMessage(responseConversationId, targetPracticeId, {
              content: trimmedReason,
              metadata: {
                intakeUuid: intakeId,
                triageStatus: 'accepted',
                triage_status: 'accepted',
                triageReason: trimmedReason,
                triage_reason: trimmedReason,
                source: 'intake-triage',
              },
            });
          } catch (msgErr) {
            console.warn('[IntakeDetailPage] Failed to post intake triage note', msgErr);
          }
        }
      }

      if (action === 'declined' && responseConversationId && targetPracticeId) {
        try {
          await postSystemMessage(responseConversationId, targetPracticeId, {
            clientId: 'system-lead-declined',
            content: 'Your consultation request was reviewed and could not be accepted at this time.',
            metadata: {
              systemMessageKey: 'lead_declined',
              intakeUuid: intakeId,
              triageStatus: action,
              triage_status: action,
            },
          });
        } catch (msgErr) {
          console.warn('[IntakeDetailPage] Failed to post decline message', msgErr);
        }
      }

      if (isMountedRef.current) {
        setLocalTriageStatus(action);
        setIntake((prev) => prev ? { ...prev, triage_status: action, conversation_id: responseConversationId ?? prev.conversation_id } : prev);
        setTriageDialogAction(null);
        setTriageReason('');
        showSuccess(
          action === 'accepted' ? 'Consultation accepted' : 'Consultation declined',
          action === 'accepted'
            ? (participantFailed
              ? 'The conversation is now active, but you may need to join it manually.'
              : (trimmedReason
                ? 'The conversation is now active and your note was added.'
                : 'The conversation is now active.'))
            : 'Your response has been recorded.'
        );
        onTriageComplete?.();
      }
    } catch (err) {
      if (isMountedRef.current) {
        showError('Action failed', err instanceof Error ? err.message : 'Failed to update intake');
      }
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  }, [intake, intakeId, isSubmitting, onTriageComplete, session?.user, showError, showSuccess]);

  const submitConversationReply = useCallback(async () => {
    const conversationId = intake?.conversation_id;
    const targetPracticeId = intake?.organization_id;
    const content = composerValue.trim();
    if (!conversationId || !targetPracticeId || !content || composerSubmitting) return;

    setComposerSubmitting(true);
    try {
      const message = await postConversationMessage(conversationId, targetPracticeId, {
        content,
        metadata: {
          source: 'intake-detail',
          intakeUuid: intakeId,
          senderType: 'team_member',
        },
      });
      setComposerValue('');
      if (composerTextareaRef.current) {
        composerTextareaRef.current.value = '';
        composerTextareaRef.current.style.height = '32px';
      }
      if (message) {
        setPreviewMessages((current) => [
          ...current,
          {
            id: message.id,
            role: message.role,
            content: message.content,
            timestamp: new Date(message.created_at).getTime(),
            reply_to_message_id: message.reply_to_message_id ?? null,
            metadata: message.metadata ?? undefined,
            isUser: true,
            seq: message.seq,
          } satisfies ChatMessageUI,
        ]);
      }
    } catch (error) {
      showError('Message failed', error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      if (isMountedRef.current) setComposerSubmitting(false);
    }
  }, [composerSubmitting, composerValue, intake?.conversation_id, intake?.organization_id, intakeId, showError]);

  const startGatherDetailsFlow = useCallback(async () => {
    const conversationId = intake?.conversation_id;
    const targetPracticeId = intake?.organization_id;
    if (!conversationId || !targetPracticeId || gatherDetailsSubmitting) return;

    const currentCase = intakeConversationState;
    const nextMetadata = applyConsultationPatchToMetadata(
      conversationMetadata,
      { case: { ...(currentCase ?? {}), enrichmentMode: true } },
      { mirrorLegacyFields: true }
    );

    const metadata = (intake?.metadata ?? {}) as Record<string, unknown>;
    const representedParty = typeof metadata.on_behalf_of === 'string' && metadata.on_behalf_of.trim().length > 0
      ? metadata.on_behalf_of.trim()
      : null;
    const otherParty = typeof metadata.opposing_party === 'string' && metadata.opposing_party.trim().length > 0
      ? metadata.opposing_party.trim()
      : null;
    const desiredOutcome = typeof intake?.desired_outcome === 'string' && intake.desired_outcome.trim().length > 0
      ? intake.desired_outcome.trim()
      : null;

    // These are intentionally static follow-up prompts so the intake detail
    // screen can gather a few missing fields deterministically without
    // invoking the full AI planning flow again.
    const missingPrompts = [
      {
        missing: !representedParty,
        content: 'I can gather a little more detail for the attorney. Are you reaching out for yourself, or on behalf of someone else?',
      },
      {
        missing: !otherParty,
        content: 'I can gather a little more detail for the attorney. Is there a specific person or organization on the other side of this issue?',
      },
      {
        missing: !desiredOutcome,
        content: 'I can gather a little more detail for the attorney. What outcome are you hoping for from this consultation?',
      },
    ];
    const prompt = missingPrompts.find((item) => item.missing)?.content
      ?? 'To help the attorney, may I ask—are you seeking assistance for yourself, or on behalf of someone else?';

    setGatherDetailsSubmitting(true);
    try {
      await updateConversationMetadataPatch(nextMetadata, conversationId);
      const message = await postSystemMessage(conversationId, targetPracticeId, {
        clientId: 'system-intake-gather-details',
        content: prompt,
        metadata: {
          source: 'ai',
          systemMessageKey: 'intake_gather_details',
          intakeUuid: intakeId,
          enrichmentMode: true,
        },
      });
      if (message) {
        setPreviewMessages((current) => [
          ...current,
          {
            id: message.id,
            role: message.role,
            content: message.content,
            timestamp: new Date(message.created_at).getTime(),
            reply_to_message_id: message.reply_to_message_id ?? null,
            metadata: message.metadata ?? undefined,
            isUser: false,
            seq: message.seq,
          } satisfies ChatMessageUI,
        ]);
      }
      showSuccess('Blawby is gathering details', 'A follow-up question was added to the conversation.');
    } catch (error) {
      showError('Could not start detail gathering', error instanceof Error ? error.message : 'Failed to update the intake conversation');
    } finally {
      if (isMountedRef.current) setGatherDetailsSubmitting(false);
    }
  }, [
    conversationMetadata,
    gatherDetailsSubmitting,
    intake?.conversation_id,
    intake?.desired_outcome,
    intake?.metadata,
    intake?.organization_id,
    intakeConversationState,
    intakeId,
    showError,
    showSuccess,
    updateConversationMetadataPatch,
  ]);

  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col min-h-0">
        <DetailHeader title="Consultation Request" showBack onBack={onBack} />
        <div className="flex-1 min-h-0 p-6">
          <LoadingBlock className="rounded-2xl h-64" />
        </div>
      </div>
    );
  }

  if (loadError || !intake) {
    return (
      <div className="flex h-full flex-col min-h-0">
        <DetailHeader title="Consultation Request" showBack onBack={onBack} />
        <Page>
          <div className="glass-card p-6 text-sm text-rose-400">
            {loadError ?? 'Intake not found.'}
          </div>
        </Page>
      </div>
    );
  }

  const meta = (intake.metadata ?? {}) as Record<string, unknown>;
  const name = typeof meta.name === 'string' ? meta.name : null;
  const email = typeof meta.email === 'string' ? meta.email : null;
  const phone = typeof meta.phone === 'string' ? meta.phone : null;
  const description = typeof meta.description === 'string' ? meta.description : null;
  const practiceServiceUuid = typeof meta.practice_service_uuid === 'string' ? meta.practice_service_uuid : null;
  const onBehalfOf = typeof meta.on_behalf_of === 'string' ? (meta.on_behalf_of.trim() || null) : null;
  const opposingParty = typeof meta.opposing_party === 'string' ? (meta.opposing_party.trim() || null) : null;
  const services = Array.isArray(practiceDetails?.services) ? practiceDetails.services : [];
  const matchingService = services.find((service) => (
    service
      && typeof service === 'object'
      && service.id === practiceServiceUuid
      && typeof service.name === 'string'
  ));
  const matchingServiceName = typeof matchingService?.name === 'string' ? matchingService.name : undefined;
  const practiceServiceName = practiceServiceUuid
    ? resolvePracticeServiceLabel(practiceServiceUuid, matchingServiceName)
    : null;
  const address = meta.address && typeof meta.address === 'object' && !Array.isArray(meta.address)
    ? meta.address as Record<string, unknown>
    : null;
  const city = typeof address?.city === 'string' ? address.city : null;
  const state = typeof address?.state === 'string' ? address.state : null;
  const dateLabel = formatLongDate(intake.created_at);
  const caseStrength = typeof intake.case_strength === 'number' ? `${intake.case_strength}%` : null;
  const feeAmount = formatAmount(intake.amount, intake.currency);
  const householdSize = typeof intake.household_size === 'number' ? intake.household_size : (typeof meta.household_size === 'number' ? meta.household_size : null);
  const income = typeof intake.income === 'number' ? formatAmount(intake.income, intake.currency) : (typeof meta.income === 'number' ? formatAmount(meta.income, intake.currency) : null);
  const hasDocs = intake.has_documents === true || meta.has_documents === true ? 'Yes' : 'No';
  const effectiveTriageStatus = localTriageStatus ?? intake.triage_status;
  const isPendingReview = effectiveTriageStatus === 'pending_review' || !effectiveTriageStatus;
  const intakeTitle = resolveIntakeTitle(
    {
      ...meta,
      title: conversationMetadata?.title ?? meta.title,
      intake_title: conversationMetadata?.intake_title ?? meta.intake_title,
    },
    name ? `${name} intake` : 'Untitled intake'
  );
  const locationLabel = [city, state].filter(Boolean).join(', ') || null;
  const paymentLabel = feeAmount ? `${feeAmount} ${intake.stripe_charge_id ? 'paid' : 'consultation'}` : null;
  const canReplyInIntake = Boolean(intake.conversation_id && effectiveTriageStatus === 'accepted');
  const hasMissingLegalDetails =
    !onBehalfOf ||
    !opposingParty ||
    (typeof intake.desired_outcome === 'string' ? intake.desired_outcome.trim() === '' : !intake.desired_outcome);

  const statusChipClass = (status: string) => {
    if (status === 'accepted') return 'bg-emerald-500/10 text-emerald-500 ring-emerald-500/20';
    if (status === 'declined' || status === 'rejected') return 'bg-rose-500/10 text-rose-500 ring-rose-500/20';
    if (status === 'spam') return 'bg-gray-500/10 text-input-placeholder ring-gray-500/20';
    return 'bg-accent/10 text-accent ring-accent/20';
  };

  return (
    <EditorShell
      title={intake.client_name ?? name ?? 'Intake Details'}
      subtitle={intake.practice_area ?? practiceServiceName ?? undefined}
      showBack
      onBack={onBack}
      actions={
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${statusChipClass(effectiveTriageStatus || 'pending_review')}`}>
            {triageLabel(effectiveTriageStatus || 'pending_review')}
        </span>
      }
      contentMaxWidth={null}
      preview={
        <div className="space-y-6">
          {/* Triage actions */}
          <div className="px-1 space-y-3">
            {isPendingReview && (
              <div className="space-y-3">
                <Button
                  id="intake-accept-btn"
                  variant="primary"
                  className="w-full"
                  disabled={isSubmitting}
                  onClick={() => openTriageDialog('accepted')}
                >
                  {isSubmitting ? (
                    <span className="inline-flex items-center">
                      <LoadingSpinner size="sm" className="mr-2" ariaLabel="Accepting consultation" />
                      Accepting...
                    </span>
                  ) : 'Approve consultation'}
                </Button>
                <div className="w-full">
                  <Button
                    id="intake-reject-btn"
                    variant="secondary"
                    className="w-full"
                    disabled={isSubmitting}
                    onClick={() => openTriageDialog('declined')}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            )}

            {effectiveTriageStatus === 'accepted' && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-5 text-center">
                <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">Intake Approved</p>
                <p className="text-xs text-input-placeholder mt-2">This lead has been converted to a client or matter.</p>
              </div>
            )}

            {effectiveTriageStatus === 'declined' && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-5 text-center">
                <p className="text-base font-bold text-rose-700 dark:text-rose-300">Intake Rejected</p>
              </div>
            )}
          </div>

          <div className="px-1 space-y-6">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-input-placeholder mb-3">About</h3>
              <div className="space-y-4">
                {intake.payment_verified && (
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <Icon icon={CheckCircleIconSolid} className="h-4 w-4" />
                    Payment method verified
                  </div>
                )}
                <UserCard
                  name={name}
                  secondary={null}
                  className="px-0 py-0"
                  size="md"
                />
              </div>
            </div>

            {(email || phone) && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-input-placeholder mb-3">Contact Information</h3>
                <dl className="space-y-3 text-sm">
                  {email && (
                    <div className="flex flex-col">
                      <dt className="text-input-placeholder text-xs mb-0.5">Email</dt>
                      <dd className="text-input-text font-medium truncate">{email}</dd>
                    </div>
                  )}
                  {phone && (
                    <div className="flex flex-col">
                      <dt className="text-input-placeholder text-xs mb-0.5">Phone</dt>
                      <dd className="text-input-text font-medium">{phone}</dd>
                    </div>
                  )}
                  {locationLabel && (
                    <div className="flex flex-col">
                      <dt className="text-input-placeholder text-xs mb-0.5">Location</dt>
                      <dd className="text-input-text font-medium truncate capitalize">{locationLabel}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </div>

          {/* Conversation preview */}
          {intake.conversation_id && (
            <section className="glass-card flex flex-col h-[600px] overflow-hidden mx-1">
              <header className="p-4 border-b border-line-glass/10 shrink-0">
                <h3 className="text-sm font-semibold text-input-text uppercase tracking-widest">
                  Conversation Preview
                </h3>
              </header>
              <div className="flex-1 min-h-0 overflow-hidden bg-surface-overlay/20 touch-pan-y">
                {previewLoading && previewMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                    <LoadingBlock label="Loading conversation history..." />
                  </div>
                ) : previewMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                    <p className="text-sm text-input-placeholder">No conversation history found for this intake.</p>
                  </div>
                ) : (
                  <VirtualMessageList
                    messages={previewMessages}
                    conversationTitle={intakeTitle}
                    viewerContext="practice"
                    practiceConfig={{
                      name: practiceDetails?.name ?? practiceName ?? 'Practice',
                      profileImage: practiceDetails?.logo ?? practiceLogo ?? null,
                      practiceId: intake.organization_id,
                    }}
                    practiceId={intake.organization_id}
                  />
                )}
              </div>
              
              {canReplyInIntake ? (
                <div className="shrink-0 border-t border-line-glass/10 px-4 py-5">
                  <MessageComposer
                    inputValue={composerValue}
                    setInputValue={setComposerValue}
                    previewFiles={[]}
                    uploadingFiles={[]}
                    removePreviewFile={() => undefined}
                    handleFileSelect={async () => undefined}
                    handleCameraCapture={async () => undefined}
                    cancelUpload={() => undefined}
                    isRecording={false}
                    handleMediaCapture={() => undefined}
                    setIsRecording={() => undefined}
                    onSubmit={() => void submitConversationReply()}
                    onKeyDown={(event) => {
                      if ((event as KeyboardEvent & { isComposing?: boolean }).isComposing || event.repeat) return;
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void submitConversationReply();
                      }
                    }}
                    textareaRef={composerTextareaRef}
                    isReadyToUpload={false}
                    isSessionReady={!composerSubmitting}
                    isSocketReady={!composerSubmitting}
                    disabled={composerSubmitting}
                    hideAttachmentControls
                    mentionCandidates={[]}
                  />
                </div>
              ) : null}
            </section>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Main header card */}
        <section className="glass-card overflow-hidden p-6 sm:p-10">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
            <header className="min-w-0">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-input-placeholder">
                Intake details
              </h2>
              <h1 className="break-words text-2xl font-bold leading-tight text-input-text sm:text-4xl">
                {intakeTitle}
              </h1>
              <p className="mt-3 text-sm text-input-placeholder">
                Posted {dateLabel}{practiceServiceName ? ` · ${practiceServiceName}` : ''}
              </p>

              {description ? (
                <div className="mt-8">
                  <p className={`whitespace-pre-wrap text-base leading-relaxed text-input-text ${descriptionExpanded ? '' : 'line-clamp-6'}`}>
                    {description}
                  </p>
                  {description.length > 350 ? (
                    <Button
                      variant="link"
                      size="sm"
                      type="button"
                      onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                      className="mt-3 px-0"
                    >
                      {descriptionExpanded ? 'Show less' : 'Read more'}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="mt-8 text-sm text-input-placeholder">No description yet.</p>
              )}
            </header>

            <aside className="lg:border-l lg:border-line-glass/10 lg:pl-6">
              <dl className="divide-y divide-line-glass/10 text-sm">
                <SummaryRow label="Status" value={triageLabel(effectiveTriageStatus)} icon={CheckCircleIcon} />
                <SummaryRow label="Consultation" value={paymentLabel} icon={CreditCardIcon} />
                <SummaryRow label="Location" value={locationLabel} icon={MapPinIcon} />
                <SummaryRow label="Urgency" value={intake.urgency ? urgencyLabel(intake.urgency) : null} icon={ExclamationTriangleIcon} />
                <SummaryRow label="Court date" value={intake.court_date ? (formatLongDate(intake.court_date) ?? intake.court_date) : null} icon={ClockIcon} />
                <SummaryRow label="Documents" value={hasDocs} icon={ClipboardDocumentCheckIcon} />
                <SummaryRow label="AI case strength" value={caseStrength} icon={ScaleIcon} />
                <SummaryRow label="Household income" value={income} icon={CreditCardIcon} />
                <SummaryRow label="Household size" value={householdSize} icon={UserIcon} />
              </dl>
            </aside>
          </div>
        </section>

        <section className="glass-card p-6 sm:p-8">
          <h2 className="mb-6 text-xs font-semibold uppercase tracking-widest text-input-placeholder">
            Legal details
          </h2>
          <dl className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <StatCell label="On behalf of" value={onBehalfOf} icon={UserIcon} />
            <StatCell label="Opposing party" value={opposingParty} icon={ScaleIcon} />
            <StatCell label="Desired outcome" value={intake.desired_outcome} icon={CheckCircleIcon} />
          </dl>
          {hasMissingLegalDetails && intake.conversation_id ? (
            <div className="mt-6 flex flex-col gap-3 border-t border-line-glass/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-relaxed text-input-placeholder">
                Blawby can ask the client for the missing legal details and add them to this thread.
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void startGatherDetailsFlow()}
                disabled={gatherDetailsSubmitting}
                className="shrink-0"
              >
                {gatherDetailsSubmitting ? 'Starting...' : 'Ask Blawby to gather details'}
              </Button>
            </div>
          ) : null}
        </section>

        {/* ── Custom template fields ── */}
        {(() => {
          const customFields = intakeConversationState?.customFields;
          if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) return null;
          // Normalize: trim string values, filter out empty after trim
          const entries = Object.entries(customFields)
            .filter(([key, v]) => {
              if (key.startsWith('_')) return false;
              if (typeof v === 'string') {
                return v.trim() !== '';
              }
              return v !== null && v !== undefined;
            });
          if (entries.length === 0) return null;
          // Humanize label: replace _/- with space, split camel, capitalize
          const humanize = (key: string) => {
            return key
              .replace(/[_-]/g, ' ')
              .replace(/([a-z])([A-Z])/g, '$1 $2')
              .replace(/^./, (s) => s.toUpperCase());
          };
          return (
            <section className="glass-card p-6 sm:p-8">
              <h2 className="mb-6 text-xs font-semibold uppercase tracking-widest text-input-placeholder">
                Custom fields
              </h2>
              <dl className="grid grid-cols-1 gap-5 md:grid-cols-3">
                {entries.map(([key, value]) => (
                  <StatCell
                    key={key}
                    label={humanize(key)}
                    value={typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                    icon={ClipboardDocumentCheckIcon}
                  />
                ))}
              </dl>
            </section>
          );
        })()}
      </div>

      <Dialog
        isOpen={triageDialogAction !== null}
        onClose={closeTriageDialog}
        title={triageDialogAction === 'accepted' ? 'Approve consultation' : 'Reject consultation'}
        description={
          triageDialogAction === 'accepted'
            ? "This will approve the lead and prepare for onboarding."
            : "This will mark the intake as rejected."
        }
        disableBackdropClick={isSubmitting}
      >
        <DialogBody className="space-y-4">
          <Textarea
            label="Internal note (optional)"
            value={triageReason}
            onChange={setTriageReason}
            rows={3}
            placeholder="Add reasoning for this triage decision…"
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={closeTriageDialog} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant={triageDialogAction === 'accepted' ? 'primary' : 'danger'}
            disabled={isSubmitting}
            onClick={() => {
              if (triageDialogAction) void runTriage(triageDialogAction, triageReason);
            }}
          >
            {isSubmitting ? 'Updating...' : (triageDialogAction === 'accepted' ? 'Confirm approval' : 'Confirm')}
          </Button>
        </DialogFooter>
      </Dialog>
    </EditorShell>
  );
};

export default IntakeDetailPage;
