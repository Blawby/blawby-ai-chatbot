import { FunctionComponent } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  CheckCircleIcon,
  UserIcon,
  ScaleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CreditCardIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid';
import { Icon } from '@/shared/ui/Icon';
import { Button } from '@/shared/ui/Button';
import { UserCard } from '@/shared/ui/profile';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { Page } from '@/shared/ui/layout/Page';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/input';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import {
  getPracticeIntake,
  triggerIntakeInvite,
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
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import type { ChatMessageUI } from '../../../../worker/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

// Stat cell for use inside CSS grids — no border treatment
type StatCellProps = { label: string; value?: string | null; icon?: typeof UserIcon };
const StatCell: FunctionComponent<StatCellProps> = ({ label, value, icon: IconComp }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      {IconComp && (
        <div className="mt-0.5 flex-shrink-0 text-input-placeholder">
          <Icon icon={IconComp} className="w-4 h-4" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder mb-0.5">{label}</p>
        <p className="text-sm text-input-text break-words">{value}</p>
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

const TRIAGE_CHIP: Record<string, string> = {
  pending_review: 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300',
  accepted:  'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300',
  declined:  'bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300',
};
const NEUTRAL_CHIP = 'bg-surface-overlay/60 text-input-placeholder ring-line-glass/30';

function triageChipClass(status?: string) {
  return TRIAGE_CHIP[status ?? ''] ?? NEUTRAL_CHIP;
}
function triageLabel(status?: string) {
  if (status === 'pending_review') return 'Pending Review';
  if (status === 'accepted') return 'Accepted';
  if (status === 'declined') return 'Declined';
  return status ?? 'Unknown';
}

// ── Main component ────────────────────────────────────────────────────────────

type IntakeDetailPageProps = {
  practiceId: string | null;
  intakeId: string;
  basePath?: string;
  onBack: () => void;
  onTriageComplete?: () => void;
};

export const IntakeDetailPage: FunctionComponent<IntakeDetailPageProps> = ({
  practiceId,
  intakeId,
  basePath = '/practice/intakes',
  onBack,
  onTriageComplete,
}) => {
  const { navigate } = useNavigation();
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
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

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

  const conversationsBasePath = basePath.endsWith('/intakes')
    ? `${basePath.slice(0, -'/intakes'.length)}/conversations`
    : `${basePath}/conversations`;

  useEffect(() => {
    const conversationId = intake?.conversation_id;
    const targetPracticeId = intake?.organization_id;
    if (!conversationId || !targetPracticeId) {
      setPreviewMessages([]);
      setPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    setPreviewLoading(true);

    fetchConversationMessages(conversationId, targetPracticeId, { limit: 100 })
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

  const runTriage = useCallback(async (action: 'accepted' | 'declined', reason?: string) => {
    if (isSubmitting || !intake) return;

    setIsSubmitting(true);
    try {
      const trimmedReason = typeof reason === 'string' && reason.trim().length > 0
        ? reason.trim()
        : undefined;
      let inviteErrorMessage: string | null = null;
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
            console.warn('[IntakeDetailPage] Failed to add participant', {
              status: participantRes.status,
              statusText: participantRes.statusText,
              conversationId: responseConversationId,
              practiceId: targetPracticeId,
              userId: session.user.id,
            });
          }
        } catch (participantErr) {
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

      if (action === 'accepted') {
        try {
          await triggerIntakeInvite(intakeId);
        } catch (inviteErr) {
          inviteErrorMessage = inviteErr instanceof Error ? inviteErr.message : 'Failed to send client invite';
          console.warn('[IntakeDetailPage] Failed to trigger intake invite', inviteErr);
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
              triageStatus: 'declined',
              triage_status: 'declined',
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
        if (action === 'accepted' && inviteErrorMessage) {
          showError('Consultation accepted, but invite failed', inviteErrorMessage);
        } else {
          showSuccess(
            action === 'accepted' ? 'Consultation accepted' : 'Consultation declined',
            action === 'accepted'
              ? (trimmedReason
                ? 'The client has been notified, the conversation is now active, and your note was added.'
                : 'The client has been notified and the conversation is now active.')
              : 'The client has been notified.'
          );
        }
        if (action === 'accepted' && responseConversationId) {
          navigate(`${conversationsBasePath}/${encodeURIComponent(responseConversationId)}`);
          return;
        }
        onTriageComplete?.();
      }
    } catch (err) {
      if (isMountedRef.current) {
        showError('Action failed', err instanceof Error ? err.message : 'Failed to update intake');
      }
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  }, [conversationsBasePath, intake, intakeId, isSubmitting, navigate, onTriageComplete, session?.user, showError, showSuccess]);

  // ── Render ────────────────────────────────────────────────────────────────

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
  const name = typeof meta.name === 'string' ? meta.name : '—';
  const email = typeof meta.email === 'string' ? meta.email : null;
  const phone = typeof meta.phone === 'string' ? meta.phone : null;
  const description = typeof meta.description === 'string' ? meta.description : null;
  const practiceArea = typeof meta.practice_area === 'string' ? meta.practice_area : (typeof meta.practiceArea === 'string' ? meta.practiceArea : null);
  const onBehalfOf = typeof meta.on_behalf_of === 'string' ? meta.on_behalf_of : null;
  const opposingParty = typeof meta.opposing_party === 'string' ? meta.opposing_party : null;
  const city = typeof meta.city === 'string' ? meta.city : null;
  const state = typeof meta.state === 'string' ? meta.state : null;
  const dateLabel = formatLongDate(intake.created_at);
  const caseStrength = typeof intake.case_strength === 'number' ? `${intake.case_strength}%` : null;
  const feeAmount = formatAmount(intake.amount, intake.currency);
  const householdSize = typeof intake.household_size === 'number' ? intake.household_size : (typeof meta.household_size === 'number' ? meta.household_size : null);
  const income = typeof intake.income === 'number' ? formatAmount(intake.income, intake.currency) : (typeof meta.income === 'number' ? formatAmount(meta.income, intake.currency) : null);
  const hasDocs = intake.has_documents === true || meta.has_documents === true ? 'Yes' : 'No';
  const effectiveTriageStatus = localTriageStatus ?? intake.triage_status;
  const isPendingReview = effectiveTriageStatus === 'pending_review' || !effectiveTriageStatus;
  const isAccepted = effectiveTriageStatus === 'accepted';
  const isDeclined = effectiveTriageStatus === 'declined';

  return (
    <div className="flex h-full flex-col min-h-0">
      <DetailHeader
        title="Consultation Request"
        subtitle={name}
        showBack
        onBack={onBack}
        actions={
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${triageChipClass(effectiveTriageStatus)}`}>
            {triageLabel(effectiveTriageStatus)}
          </span>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left column: document ───────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">
            <section className="glass-card p-6 sm:p-10 min-h-[600px]">
              {/* Top area */}
              <header className="mb-6 sm:mb-10">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-input-placeholder mb-2">
                  Intake details
                </h2>
                <h1 className="text-2xl sm:text-3xl font-bold text-input-text mb-4">
                  {name}
                </h1>
                <div className="flex items-center flex-wrap gap-3 mb-6 sm:mb-8">
                  {practiceArea ? (
                    <div className="bg-accent/10 border border-accent/20 text-[rgb(var(--accent-foreground))] px-2 py-0.5 rounded-md text-xs font-semibold">
                      {practiceArea}
                    </div>
                  ) : null}
                  <span className="text-sm text-input-placeholder">
                    Posted {dateLabel}
                  </span>
                </div>

                {/* Intake Description prominent */}
                {description && (
                  <div className="mt-6 sm:mt-10">
                    <div className="relative">
                      <p className={`text-base text-input-text leading-relaxed ${descriptionExpanded ? '' : 'line-clamp-6'}`}>
                        {description}
                      </p>
                      {description.length > 350 && (
                        <Button
                          variant="link"
                          size="sm"
                          type="button"
                          onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                          className="mt-3 px-0"
                        >
                          {descriptionExpanded ? 'Show less' : 'Read more'}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </header>

              {/* Facts grid (replacing Matter Summary section) */}
              <div className="pt-6 sm:pt-10 border-t border-line-glass/10">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {intake.court_date ? <StatCell label="Court date" value={formatLongDate(intake.court_date) ?? intake.court_date} icon={ClockIcon} /> : null}
                  {intake.urgency ? (
                    <StatCell label="Urgency" value={urgencyLabel(intake.urgency)} icon={ExclamationTriangleIcon} />
                  ) : null}
                  {caseStrength ? <StatCell label="AI case strength" value={caseStrength} icon={ScaleIcon} /> : null}
                  {feeAmount ? <StatCell label="Consultation fee" value={feeAmount} icon={CreditCardIcon} /> : null}
                  {income ? <StatCell label="Household income" value={income} icon={CreditCardIcon} /> : null}
                  {householdSize != null ? <StatCell label="Household size" value={String(householdSize)} icon={UserIcon} /> : null}
                  <StatCell label="Documents provided" value={hasDocs} icon={CheckCircleIcon} />
                </div>
              </div>
            </section>

            {/* Facts Card 2 (Inlined as requested: no glass-card border/bg) */}
            {(opposingParty || intake.desired_outcome) && (
              <section className="glass-card p-6 sm:p-10">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-input-placeholder mb-6">Conflicts & Goals</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
                  {opposingParty ? <StatCell label="Opposing party" value={opposingParty} icon={ScaleIcon} /> : null}
                  {intake.desired_outcome ? <StatCell label="Desired outcome" value={intake.desired_outcome} icon={CheckCircleIcon} /> : null}
                </div>
              </section>
            )}

            {/* Conversation History Card */}
            {intake.conversation_id && (
              <div className="space-y-4">
                <section className="glass-card flex flex-col h-[500px] sm:h-[700px] overflow-hidden">
                  <header className="p-4 sm:p-6 lg:p-10 pb-4 sm:pb-6 border-b border-line-glass/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon icon={ChatBubbleLeftRightIcon} className="w-5 h-5 text-input-placeholder" />
                      <h3 className="text-sm font-semibold text-input-text uppercase tracking-widest">
                        Intake Conversation
                      </h3>
                    </div>
                  </header>
                  <div className="flex-1 min-h-0 overflow-hidden bg-surface-overlay/20 touch-pan-y">
                    {previewLoading && previewMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                        <LoadingBlock />
                        <p className="text-xs text-input-placeholder mt-4">Loading conversation history...</p>
                      </div>
                    ) : previewMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                        <p className="text-sm text-input-placeholder">No conversation history found for this intake.</p>
                      </div>
                    ) : (
                      <VirtualMessageList
                        messages={previewMessages}
                        practiceId={intake.organization_id}
                      />
                    )}
                  </div>
                </section>

                <div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => intake.conversation_id && navigate(`${conversationsBasePath}/${encodeURIComponent(intake.conversation_id)}`)}
                    disabled={!intake.conversation_id}
                  >
                    Join conversation
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Right column: action panel ──────────────────────── */}
          <div className="space-y-6">
            {/* Action Section */}
            {/* Action Section: Inline layout */}
            <div className="px-1 mb-4">
              {isPendingReview && (
                <div className="space-y-3">
                  <Button
                    id="intake-accept-btn"
                    variant="primary"
                    className="w-full"
                    disabled={isSubmitting}
                    onClick={() => openTriageDialog('accepted')}
                  >
                    {isSubmitting ? 'Accepting…' : 'Accept Consultation'}
                  </Button>
                  <Button
                    id="intake-decline-btn"
                    variant="danger"
                    className="w-full"
                    disabled={isSubmitting}
                    onClick={() => openTriageDialog('declined')}
                  >
                    {isSubmitting ? 'Declining…' : 'Decline'}
                  </Button>
                  <p className="text-xs text-input-placeholder text-center leading-relaxed">
                    Accepting will move this conversation into your inbox and notify the client.
                  </p>
                </div>
              )}

              {isAccepted && (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-5 text-center">
                  <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                    Consultation Accepted
                  </p>
                  <p className="text-xs text-input-placeholder mt-2">
                    This conversation is now active in your inbox.
                  </p>
                </div>
              )}

              {isDeclined && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-5 text-center">
                  <p className="text-base font-bold text-rose-700 dark:text-rose-300">
                    Consultation Declined
                  </p>
                  <p className="text-xs text-input-placeholder mt-2">
                    The client has been notified.
                  </p>
                </div>
              )}
            </div>

            {/* Client Context Section (Standard Rows) */}
            <div className="space-y-6">
              {/* About section: Identity and Verification */}
              <div className="px-1 space-y-6">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-input-placeholder mb-3">About</h3>
                  <div className="space-y-4">
                    {/* Payment verification text only with solid icon */}
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      <Icon icon={CheckCircleIconSolid} className="h-4 w-4" />
                      Payment method verified
                    </div>

                    <UserCard
                      name={name}
                      secondary={null}
                      className="px-0 py-0"
                      size="md"
                    />
                  </div>
                </div>

                {/* Contact Information on right side */}
                <div className="pt-2">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-input-placeholder mb-3">Contact Information</h3>
                  <dl className="space-y-3 text-sm">
                    <div className="flex flex-col">
                      <dt className="text-input-placeholder text-xs mb-0.5">Email</dt>
                      <dd className="text-input-text font-medium truncate">{email || '—'}</dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-input-placeholder text-xs mb-0.5">Phone</dt>
                      <dd className="text-input-text font-medium">{phone || '—'}</dd>
                    </div>
                    {(city || state) && (
                      <div className="flex flex-col">
                        <dt className="text-input-placeholder text-xs mb-0.5">Location</dt>
                        <dd className="text-input-text font-medium truncate capitalize">
                          {[city, state].filter(Boolean).join(', ')}
                        </dd>
                      </div>
                    )}
                    {onBehalfOf && (
                      <div className="flex flex-col">
                        <dt className="text-input-placeholder text-xs mb-0.5">On behalf of</dt>
                        <dd className="text-input-text font-medium">{onBehalfOf}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        isOpen={triageDialogAction !== null}
        onClose={closeTriageDialog}
        title={triageDialogAction === 'accepted' ? 'Accept consultation' : 'Decline consultation'}
        description={
          triageDialogAction === 'accepted'
            ? 'You can include an optional note. If you do, it will be posted into the conversation after you join.'
            : 'You can include an optional reason to send with this triage decision.'
        }
        disableBackdropClick={isSubmitting}
      >
        <DialogBody className="space-y-4">
          <div className="rounded-xl border border-line-glass/10 bg-white/[0.03] p-4">
            <p className="text-sm text-input-placeholder">
              {triageDialogAction === 'accepted'
                ? 'Accepting will notify the client and move this conversation into your active inbox.'
                : 'Declining will notify the client and mark this intake as declined.'}
            </p>
          </div>

          <Textarea
            label={triageDialogAction === 'accepted' ? 'Optional note to client' : 'Optional decline reason'}
            value={triageReason}
            onChange={setTriageReason}
            rows={4}
            maxLength={1000}
            showCharCount
            placeholder={
              triageDialogAction === 'accepted'
                ? 'Thanks for reaching out. I just joined this conversation and will review your intake shortly.'
                : 'We are unable to take this consultation at this time.'
            }
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={closeTriageDialog} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant={triageDialogAction === 'declined' ? 'danger' : 'primary'}
            disabled={isSubmitting || !triageDialogAction}
            onClick={() => {
              if (!triageDialogAction) return;
              void runTriage(triageDialogAction, triageReason);
            }}
          >
            {isSubmitting
              ? (triageDialogAction === 'accepted' ? 'Accepting…' : 'Declining…')
              : (triageDialogAction === 'accepted' ? 'Confirm acceptance' : 'Confirm decline')}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
};

export default IntakeDetailPage;
