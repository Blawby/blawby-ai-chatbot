import { FunctionComponent, type ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  BriefcaseIcon,
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
  ScaleIcon,
  UserIcon,
  CurrencyDollarIcon,
  ShieldExclamationIcon,
  PaperAirplaneIcon,
  ClockIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { Button } from '@/shared/ui/Button';
import { UserCard } from '@/shared/ui/profile';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/input';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { fetchConversationMessages } from '@/shared/lib/conversationApi';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import VirtualMessageList from '@/features/chat/components/VirtualMessageList';
import type { ChatMessageUI } from '../../../../worker/types';
import {
  getEngagement,
  sendEngagementToClient,
  withdrawEngagement,
} from '../api/engagementsApi';
import type { EngagementDetail, ProposalData, ConflictStatus } from '../types/engagement';

// ── Status display utilities ──────────────────────────────────────────────────

const ENGAGEMENT_CHIP: Record<string, string> = {
  intake_accepted:    'bg-blue-500/10 text-blue-700 ring-blue-500/20 dark:text-blue-300',
  engagement_draft:   'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300',
  engagement_sent:    'bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300',
  engagement_pending: 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300',
  engagement_accepted:'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300',
  active:             'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300',
};
const NEUTRAL_CHIP = 'bg-surface-overlay/60 text-input-placeholder ring-line-glass/30';

function statusChipClass(status?: string) {
  return ENGAGEMENT_CHIP[status ?? ''] ?? NEUTRAL_CHIP;
}

function statusLabel(status?: string) {
  if (status === 'intake_accepted') return 'Intake Accepted';
  if (status === 'engagement_draft') return 'Draft';
  if (status === 'engagement_sent') return 'Sent to client';
  if (status === 'engagement_pending') return 'Under review';
  if (status === 'engagement_accepted') return 'Client accepted';
  if (status === 'active') return 'Active';
  if (status === 'withdrawn') return 'Withdrawn';
  return status ?? 'Unknown';
}

// ── Conflict / jurisdiction indicators ────────────────────────────────────────

const CONFLICT_CHIP: Record<ConflictStatus, string> = {
  clear:             'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300',
  review_required:   'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300',
  conflicted:        'bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300',
  unknown:           'bg-surface-overlay/60 text-input-placeholder ring-line-glass/30',
  insufficient_data: 'bg-surface-overlay/60 text-input-placeholder ring-line-glass/30',
};

function conflictChipClass(status?: ConflictStatus) {
  return CONFLICT_CHIP[status ?? 'unknown'] ?? CONFLICT_CHIP.unknown;
}

function conflictLabel(status?: ConflictStatus) {
  if (status === 'clear') return 'Clear';
  if (status === 'review_required') return 'Review Required';
  if (status === 'conflicted') return 'Conflicted';
  if (status === 'insufficient_data') return 'Insufficient Data';
  return 'Unknown';
}

// ── Currency formatting ────────────────────────────────────────────────────────

function formatMoney(amount?: number | null, currency = 'USD') {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount / 100);
  } catch {
    return `${amount / 100} ${currency}`;
  }
}

// ── Stat cell (used inside CSS grids) ─────────────────────────────────────────

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

// ── Section card ───────────────────────────────────────────────────────────────

const SectionCard: FunctionComponent<{ title: string; icon?: typeof UserIcon; children: ComponentChildren }> = ({
  title,
  icon: IconComp,
  children,
}) => (
  <section className="glass-card p-6 sm:p-8 space-y-4">
    <header className="flex items-center gap-2">
      {IconComp && <Icon icon={IconComp} className="w-4 h-4 text-input-placeholder" />}
      <h3 className="text-xs font-semibold uppercase tracking-widest text-input-placeholder">{title}</h3>
    </header>
    {children}
  </section>
);

// ── Conflict / jurisdiction panel ──────────────────────────────────────────────

const ConflictPanel: FunctionComponent<{ proposal: ProposalData | null | undefined }> = ({ proposal }) => {
  if (!proposal?.risk_review) return null;
  const { conflict_status, jurisdiction_status, open_questions, conflict_note } = proposal.risk_review;

  const jurisdictionChip =
    jurisdiction_status === 'supported'
      ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300'
      : jurisdiction_status === 'unsupported'
        ? 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300'
        : 'bg-surface-overlay/60 text-input-placeholder ring-line-glass/30';

  return (
    <SectionCard title="Conflict & Jurisdiction" icon={ShieldExclamationIcon}>
      <div className="flex flex-wrap gap-3">
        <div>
          <p className="text-xs text-input-placeholder mb-1">Conflict check</p>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${conflictChipClass(conflict_status)}`}>
            {conflictLabel(conflict_status)}
          </span>
        </div>
        <div>
          <p className="text-xs text-input-placeholder mb-1">Jurisdiction</p>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${jurisdictionChip}`}>
            {jurisdiction_status === 'supported' ? 'Supported' : jurisdiction_status === 'unsupported' ? 'Not Supported' : 'Unknown'}
          </span>
        </div>
      </div>
      {conflict_note && (
        <p className="text-sm text-input-text">{conflict_note}</p>
      )}
      {open_questions && open_questions.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder mb-2">Open Questions</p>
          <ul className="space-y-1.5">
            {open_questions.map((q, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-input-text">
                <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
};

// ── Scope card ─────────────────────────────────────────────────────────────────

const ScopeCard: FunctionComponent<{ proposal: ProposalData | null | undefined }> = ({ proposal }) => {
  if (!proposal?.representation?.scope_summary) return null;
  const { scope_summary, included_services, excluded_services } = proposal.representation;

  return (
    <SectionCard title="Scope of Representation" icon={BriefcaseIcon}>
      <p className="text-sm text-input-text leading-relaxed">{scope_summary}</p>
      {included_services && included_services.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder mb-2">Included</p>
          <ul className="space-y-1">
            {included_services.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-input-text">
                <CheckCircleIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
      {excluded_services && excluded_services.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder mb-2">Excluded</p>
          <ul className="space-y-1">
            {excluded_services.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-input-text">
                <XCircleIcon className="w-4 h-4 text-rose-500/70 flex-shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
};

// ── Fees card ──────────────────────────────────────────────────────────────────

const FeesCard: FunctionComponent<{ proposal: ProposalData | null | undefined; engagement: EngagementDetail }> = ({
  proposal,
  engagement,
}) => {
  const fees = proposal?.fees;
  const currency = fees?.currency ?? engagement.currency ?? 'USD';

  const rows: Array<{ label: string; value: string | null }> = [
    { label: 'Billing type', value: fees?.billing_type ?? engagement.billing_type ?? null },
    { label: 'Rate', value: fees?.rate != null ? formatMoney(fees.rate, currency) : (engagement.rate != null ? formatMoney(engagement.rate, currency) : null) },
    { label: 'Retainer', value: fees?.retainer != null ? formatMoney(fees.retainer, currency) : (engagement.retainer != null ? formatMoney(engagement.retainer, currency) : null) },
    { label: 'Flat fee', value: fees?.flat_fee != null ? formatMoney(fees.flat_fee, currency) : null },
    { label: 'Contingency', value: fees?.contingency_pct != null ? `${fees.contingency_pct}%` : null },
    { label: 'Payment terms', value: fees?.payment_terms ?? null },
  ].filter((row) => row.value !== null);

  if (rows.length === 0) return null;

  return (
    <SectionCard title="Fee Terms" icon={CurrencyDollarIcon}>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex flex-col">
            <dt className="text-xs text-input-placeholder mb-0.5">{label}</dt>
            <dd className="text-sm text-input-text font-medium capitalize">{value}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
};

// ── Draft meta ─────────────────────────────────────────────────────────────────

const DraftMetaBadge: FunctionComponent<{ proposal: ProposalData | null | undefined }> = ({ proposal }) => {
  if (!proposal?.draft_meta) return null;
  const { version, generated_at } = proposal.draft_meta;
  return (
    <div className="flex items-center gap-2 text-xs text-input-placeholder">
      <ClockIcon className="w-3.5 h-3.5" />
      <span>Draft v{version} · Generated {formatLongDate(generated_at) ?? generated_at}</span>
    </div>
  );
};

// ── Proposal goals section ─────────────────────────────────────────────────────

const GoalsSection: FunctionComponent<{ proposal: ProposalData | null | undefined }> = ({ proposal }) => {
  const goals = proposal?.client_summary?.goals_summary;
  if (!goals) return null;
  return (
    <SectionCard title="Client Goals" icon={ScaleIcon}>
      <p className="text-sm text-input-text leading-relaxed">{goals}</p>
    </SectionCard>
  );
};

// ── Action dialogs ─────────────────────────────────────────────────────────────

type DialogAction = 'send' | 'withdraw' | null;

// ── Main component ────────────────────────────────────────────────────────────

type EngagementDetailPageProps = {
  practiceId: string | null;
  engagementId: string;
  conversationsBasePath?: string | null;
  practiceName: string;
  practiceLogo: string | null;
  onBack: () => void;
  onActionComplete?: () => void;
};

export const EngagementDetailPage: FunctionComponent<EngagementDetailPageProps> = ({
  practiceId,
  engagementId,
  conversationsBasePath,
  practiceName,
  practiceLogo,
  onBack,
  onActionComplete,
}) => {
  const { navigate } = useNavigation();
  const { showSuccess, showError } = useToastContext();
  const { session } = useSessionContext();

  const [engagement, setEngagement] = useState<EngagementDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogAction, setDialogAction] = useState<DialogAction>(null);
  const [dialogNote, setDialogNote] = useState('');
  const [previewMessages, setPreviewMessages] = useState<ChatMessageUI[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Load engagement detail
  useEffect(() => {
    if (!practiceId || !engagementId) return;
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(null);

    getEngagement(practiceId, engagementId, { signal: controller.signal })
      .then((data) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        setEngagement(data);
        setLocalStatus(data.status ?? null);
      })
      .catch((err: unknown) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load engagement');
      })
      .finally(() => {
        if (isMountedRef.current && !controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [practiceId, engagementId]);

  // Load conversation preview
  useEffect(() => {
    const conversationId = engagement?.conversation_id;
    const targetPracticeId = engagement?.organization_id;
    if (!conversationId || !targetPracticeId) {
      setPreviewMessages([]);
      setPreviewLoading(false);
      return;
    }
    const controller = new AbortController();
    setPreviewMessages([]);
    setPreviewLoading(true);
    setPreviewError(null);

    fetchConversationMessages(conversationId, targetPracticeId, { limit: 100, signal: controller.signal })
      .then((messages) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        setPreviewMessages(messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at ?? m.server_ts).getTime(),
          reply_to_message_id: m.reply_to_message_id ?? null,
          metadata: m.metadata ?? undefined,
          isUser: m.user_id === session?.user?.id,
          seq: m.seq,
        } satisfies ChatMessageUI)));
      })
      .catch((err) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        console.warn('[EngagementDetailPage] Failed to load conversation preview', err);
        setPreviewError(err instanceof Error ? err.message : 'Could not load conversation preview');
      })
      .finally(() => {
        if (isMountedRef.current && !controller.signal.aborted) setPreviewLoading(false);
      });

    return () => controller.abort();
  }, [engagement?.conversation_id, engagement?.organization_id, session?.user?.id]);

  const closeDialog = useCallback(() => {
    if (isSubmitting) return;
    setDialogAction(null);
    setDialogNote('');
  }, [isSubmitting]);

  const openDialog = useCallback((action: DialogAction) => {
    if (isSubmitting) return;
    setDialogAction(action);
    setDialogNote('');
  }, [isSubmitting]);

  const runSendToClient = useCallback(async () => {
    if (isSubmitting || !engagement) return;
    setIsSubmitting(true);
    try {
      await sendEngagementToClient(engagement.id, dialogNote);
      if (isMountedRef.current) {
        setLocalStatus('engagement_sent');
        setEngagement((prev) => prev ? { ...prev, status: 'engagement_sent' } : prev);
        setDialogAction(null);
        setDialogNote('');
        showSuccess('Sent to client', 'The engagement proposal has been sent to the client for review.');
        onActionComplete?.();
      }
    } catch (err) {
      if (isMountedRef.current) {
        showError('Failed to send', err instanceof Error ? err.message : 'Could not send proposal to client');
      }
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  }, [engagement, isSubmitting, onActionComplete, showError, showSuccess, dialogNote]);

  const runWithdraw = useCallback(async () => {
    if (isSubmitting || !engagement) return;
    setIsSubmitting(true);
    try {
      await withdrawEngagement(engagement.id);
      if (isMountedRef.current) {
        setLocalStatus('engagement_draft');
        setEngagement((prev) => prev ? { ...prev, status: 'engagement_draft' } : prev);
        setDialogAction(null);
        setDialogNote('');
        showSuccess('Withdrawn', 'The proposal has been withdrawn.');
        onActionComplete?.();
      }
    } catch (err) {
      if (isMountedRef.current) {
        showError('Failed to withdraw', err instanceof Error ? err.message : 'Could not withdraw proposal');
      }
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  }, [engagement, isSubmitting, onActionComplete, showError, showSuccess]);

  const handleDialogConfirm = useCallback(async () => {
    if (dialogAction === 'send') await runSendToClient();
    else if (dialogAction === 'withdraw') await runWithdraw();
  }, [dialogAction, runSendToClient, runWithdraw]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-full flex-col min-h-0">
        <DetailHeader title="Engagement" showBack onBack={onBack} />
        <div className="flex-1 min-h-0 p-6">
          <LoadingBlock className="rounded-2xl h-64" />
        </div>
      </div>
    );
  }

  if (loadError || !engagement) {
    return (
      <div className="flex h-full flex-col min-h-0">
        <DetailHeader title="Engagement" showBack onBack={onBack} />
        <div className="p-6">
          <div className="glass-card p-6 text-sm text-rose-400">
            {loadError ?? 'Engagement not found.'}
          </div>
        </div>
      </div>
    );
  }

  const effectiveStatus = localStatus ?? engagement.status;
  const proposal = engagement.proposal_data ?? null;
  const isDraft = effectiveStatus === 'engagement_draft' || effectiveStatus === 'intake_accepted';
  const isSent = effectiveStatus === 'engagement_sent';
  const isAccepted = effectiveStatus === 'engagement_accepted' || effectiveStatus === 'active';

  return (
    <div className="flex h-full flex-col min-h-0">
      <DetailHeader
        title="Engagement"
        subtitle={engagement.client_name ?? undefined}
        showBack
        onBack={onBack}
        actions={
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${statusChipClass(effectiveStatus)}`}>
            {statusLabel(effectiveStatus)}
          </span>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left column ──────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">
            {/* Main header card */}
            <section className="glass-card p-6 sm:p-10">
              <header className="mb-6">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-input-placeholder mb-2">
                  Engagement details
                </h2>
                <h1 className="text-2xl sm:text-3xl font-bold text-input-text mb-4">
                  {engagement.client_name ?? 'Unknown Client'}
                </h1>
                <div className="flex items-center flex-wrap gap-3">
                  {engagement.practice_area && (
                    <div className="bg-accent/10 border border-accent/20 text-[rgb(var(--accent-foreground))] px-2 py-0.5 rounded-md text-xs font-semibold">
                      {engagement.practice_area}
                    </div>
                  )}
                  <span className="text-sm text-input-placeholder">
                    Created {formatLongDate(engagement.created_at)}
                  </span>
                </div>
                <div className="mt-4">
                  <DraftMetaBadge proposal={proposal} />
                </div>
              </header>

              {/* Quick facts */}
              {engagement.description && (
                <div className="pt-6 border-t border-line-glass/10">
                  <p className="text-sm text-input-placeholder uppercase tracking-wide font-medium mb-2">Description</p>
                  <p className="text-sm text-input-text leading-relaxed">{engagement.description}</p>
                </div>
              )}

              <div className="pt-6 border-t border-line-glass/10 grid grid-cols-1 md:grid-cols-2 gap-6">
                {engagement.urgency && (
                  <StatCell label="Urgency" value={engagement.urgency} icon={ExclamationTriangleIcon} />
                )}
                {engagement.opposing_party && (
                  <StatCell label="Opposing party" value={engagement.opposing_party} icon={ScaleIcon} />
                )}
                {engagement.desired_outcome && (
                  <StatCell label="Desired outcome" value={engagement.desired_outcome} icon={CheckCircleIcon} />
                )}
                {engagement.case_strength != null && (
                  <StatCell label="AI case strength" value={`${engagement.case_strength}%`} icon={ScaleIcon} />
                )}
              </div>
            </section>

            {/* Proposal cards (from proposal_data) */}
            <ScopeCard proposal={proposal} />
            <FeesCard proposal={proposal} engagement={engagement} />
            <GoalsSection proposal={proposal} />
            <ConflictPanel proposal={proposal} />

            {/* Conversation preview */}
            {engagement.conversation_id && (
              <div className="space-y-4">
                <section className="glass-card flex flex-col h-[500px] sm:h-[700px] overflow-hidden">
                  <header className="p-4 sm:p-6 lg:p-8 pb-4 border-b border-line-glass/10 flex items-center gap-3">
                    <Icon icon={ChatBubbleLeftRightIcon} className="w-5 h-5 text-input-placeholder" />
                    <h3 className="text-sm font-semibold text-input-text uppercase tracking-widest">
                      Intake Conversation
                    </h3>
                  </header>
                  <div className="flex-1 min-h-0 overflow-hidden bg-surface-overlay/20 touch-pan-y">
                    {previewLoading && previewMessages.length === 0 ? (
                      <div className="h-full flex items-center justify-center p-6">
                        <LoadingBlock label="Loading conversation..." />
                      </div>
                    ) : previewError ? (
                      <div className="h-full flex items-center justify-center p-6 text-center">
                        <div className="space-y-4">
                          <Icon icon={ExclamationTriangleIcon} className="w-8 h-8 text-rose-400 mx-auto" />
                          <p className="text-sm text-input-placeholder">{previewError}</p>
                        </div>
                      </div>
                    ) : previewMessages.length === 0 ? (
                      <div className="h-full flex items-center justify-center p-6">
                        <p className="text-sm text-input-placeholder">No conversation history.</p>
                      </div>
                    ) : (
                      <VirtualMessageList
                        messages={previewMessages}
                        conversationTitle={engagement.client_name ?? null}
                        viewerContext="practice"
                        practiceConfig={{
                          name: practiceName,
                          profileImage: practiceLogo,
                          practiceId: engagement.organization_id,
                        }}
                        practiceId={engagement.organization_id}
                      />
                    )}
                  </div>
                </section>

                {conversationsBasePath && (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => navigate(`${conversationsBasePath}/${encodeURIComponent(engagement.conversation_id!)}`)}
                  >
                    Open conversation
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* ── Right column: actions + client info ──────────────────── */}
          <div className="space-y-6">
            {/* Action panel */}
            <div className="px-1 space-y-3">
              {isDraft && (
                <>
                  <Button
                    id="engagement-send-btn"
                    variant="primary"
                    className="w-full"
                    disabled={isSubmitting}
                    onClick={() => openDialog('send')}
                  >
                    {isSubmitting ? (
                      <span className="inline-flex items-center">
                        <LoadingSpinner size="sm" className="mr-2" ariaLabel="Sending" />
                        Send to Client
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <PaperAirplaneIcon className="w-4 h-4" />
                        Send to Client
                      </span>
                    )}
                  </Button>
                  <p className="text-xs text-input-placeholder text-center leading-relaxed">
                    Client will receive an email to review and accept the engagement.
                  </p>
                </>
              )}

              {isSent && (
                <>
                  <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 p-5 text-center">
                    <p className="text-base font-bold text-violet-700 dark:text-violet-300">Sent to Client</p>
                    <p className="text-xs text-input-placeholder mt-2">Awaiting client acceptance.</p>
                  </div>
                  <Button
                    id="engagement-withdraw-btn"
                    variant="secondary"
                    className="w-full"
                    disabled={isSubmitting}
                    onClick={() => openDialog('withdraw')}
                  >
                    Withdraw Proposal
                  </Button>
                </>
              )}

              {isAccepted && (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-5 text-center">
                  <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">Engagement Active</p>
                  <p className="text-xs text-input-placeholder mt-2">
                    The client has accepted the engagement.
                  </p>
                </div>
              )}
            </div>

            {/* Client info */}
            <div className="px-1 space-y-6">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-input-placeholder mb-3">Client</h3>
                <UserCard
                  name={engagement.client_name ?? 'Unknown'}
                  secondary={null}
                  className="px-0 py-0"
                  size="md"
                />
              </div>

              {engagement.client_email && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-input-placeholder mb-3">Contact</h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex flex-col">
                      <dt className="text-input-placeholder text-xs mb-0.5">Email</dt>
                      <dd className="text-input-text font-medium truncate">{engagement.client_email}</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Who is the client / who is not */}
              {proposal?.client_summary?.co_clients && proposal.client_summary.co_clients.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-input-placeholder mb-3">Co-Clients</h3>
                  <ul className="space-y-1 text-sm text-input-text">
                    {proposal.client_summary.co_clients.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
              {proposal?.client_summary?.non_clients && proposal.client_summary.non_clients.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-input-placeholder mb-3">Not Represented</h3>
                  <ul className="space-y-1 text-sm text-rose-400">
                    {proposal.client_summary.non_clients.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Action dialogs ────────────────────────────────────────────── */}
      <Dialog
        isOpen={dialogAction !== null}
        onClose={closeDialog}
        title={dialogAction === 'send' ? 'Send to client' : 'Withdraw proposal'}
        description={
          dialogAction === 'send'
            ? 'The client will receive an email with a link to review and accept the engagement.'
            : 'This will withdraw the proposal and return the engagement to draft status.'
        }
        disableBackdropClick={isSubmitting}
      >
        <DialogBody className="space-y-4">
          <div className="rounded-xl border border-line-glass/10 bg-white/[0.03] p-4">
            <p className="text-sm text-input-placeholder">
              {dialogAction === 'send'
                ? 'Once sent, the client can review the scope, fee terms, and accept online.'
                : 'The client link will no longer be active after withdrawal.'}
            </p>
          </div>
          {dialogAction === 'send' && (
            <Textarea
              label="Optional note to include"
              value={dialogNote}
              onChange={setDialogNote}
              rows={3}
              maxLength={500}
              showCharCount
              placeholder="Any additional context for the client…"
            />
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={closeDialog} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant={dialogAction === 'withdraw' ? 'danger' : 'primary'}
            disabled={isSubmitting || !dialogAction}
            onClick={handleDialogConfirm}
          >
            {isSubmitting
              ? (dialogAction === 'send' ? 'Sending…' : 'Withdrawing…')
              : (dialogAction === 'send' ? 'Confirm & send' : 'Withdraw proposal')}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
};

export default EngagementDetailPage;
