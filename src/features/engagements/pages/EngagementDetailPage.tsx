import { FunctionComponent, type ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MessagesSquare,
  Pencil,
  Send,
  X,
  XCircle,
} from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { DetailHeader } from '@/shared/ui/layout';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/input';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { fetchConversationMessages } from '@/shared/lib/conversationApi';
import type { ConversationMessage } from '@/shared/types/conversation';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { cn } from '@/shared/utils/cn';
import VirtualMessageList from '@/features/chat/components/VirtualMessageList';
import type { ChatMessageUI } from '../../../../worker/types';

import { EngagementDetailSkeleton } from '../components/EngagementDetailSkeleton';
import { EngagementWorkbench } from '../components/EngagementWorkbench';
import {
  declineEngagement,
  sendEngagementToClient,
} from '../api/engagementsApi';
import type {
  ConflictStatus,
  EngagementDetail,
  EngagementStatus,
  ProposalData,
} from '../types/engagement';
import { useEngagementDetail } from '../hooks/useEngagementDetail';

// ── Status helpers ───────────────────────────────────────────────────────────

const STATUS_VARIANTS: Record<EngagementStatus, { label: string; className: string }> = {
  draft:    { label: 'Draft',    className: 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300' },
  sent:     { label: 'Sent',     className: 'bg-card/60 text-dim-2 ring-line-subtle' },
  accepted: { label: 'Accepted', className: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300' },
  declined: { label: 'Declined', className: 'bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300' },
};

const StatusPill: FunctionComponent<{ status: EngagementStatus | string | undefined }> = ({ status }) => {
  const variant = STATUS_VARIANTS[status as EngagementStatus] ?? STATUS_VARIANTS.draft;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', variant.className)}>
      {variant.label}
    </span>
  );
};

const CONFLICT_VARIANTS: Record<ConflictStatus, { label: string; className: string }> = {
  clear:             { label: 'Clear',             className: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300' },
  review_required:   { label: 'Review Required',   className: 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300' },
  conflicted:        { label: 'Conflicted',        className: 'bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300' },
  unknown:           { label: 'Unknown',           className: 'bg-card/60 text-dim-2 ring-line-subtle' },
  insufficient_data: { label: 'Insufficient Data', className: 'bg-card/60 text-dim-2 ring-line-subtle' },
};

// ── Display helpers ──────────────────────────────────────────────────────────

const formatFeeAmount = (amount: number | null | undefined): string | null => {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  return formatCurrency(amount);
};

const formatPercent = (value: number | null | undefined): string | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${value}%`;
};

const billingTypeLabel = (type: string | null | undefined): string => {
  if (!type) return '—';
  const t = type.toLowerCase();
  if (t === 'flat' || t === 'fixed' || t === 'flat_fee') return 'Flat Fee';
  if (t === 'hourly') return 'Hourly';
  if (t === 'contingency') return 'Contingency';
  if (t === 'retainer') return 'Retainer';
  return type;
};

const getMatterDisplay = (engagement: EngagementDetail): string => {
  if (engagement.proposal_data?.client_summary?.matter_summary) {
    return engagement.proposal_data.client_summary.matter_summary;
  }
  if (engagement.title) return engagement.title;
  return '—';
};

// ── Section card primitive ──────────────────────────────────────────────────

const SectionCard: FunctionComponent<{
  title: string;
  children: ComponentChildren;
  className?: string;
  action?: ComponentChildren;
}> = ({ title, children, className, action }) => (
  <section className={cn('card p-5 sm:p-6 space-y-4', className)}>
    <header className="flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-dim-2">{title}</h3>
      {action}
    </header>
    {children}
  </section>
);

const InfoRow: FunctionComponent<{
  label: string;
  value: ComponentChildren | null | undefined;
  fallback?: string;
}> = ({ label, value, fallback = 'Not specified' }) => (
  <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 text-sm">
    <dt className="text-dim-2">{label}</dt>
    <dd className="text-ink break-words">{value || <span className="text-dim-2 italic">{fallback}</span>}</dd>
  </div>
);

// ── View-mode left cards ─────────────────────────────────────────────────────

const ClientSummaryCard: FunctionComponent<{ engagement: EngagementDetail }> = ({ engagement }) => {
  const summary = engagement.proposal_data?.client_summary;
  const matter = getMatterDisplay(engagement);
  return (
    <SectionCard title="Client summary">
      <dl className="space-y-2.5">
        <InfoRow label="Client name" value={summary?.client_name ?? engagement.client_name} />
        <InfoRow label="Matter" value={matter} />
        <InfoRow label="Location" value={summary?.location_summary} />
        <InfoRow label="Goals" value={summary?.goals_summary} />
      </dl>
    </SectionCard>
  );
};

const ScopeOfRepresentationCard: FunctionComponent<{ proposal: ProposalData | null }> = ({ proposal }) => {
  const scope = proposal?.representation?.scope_summary;
  const included = proposal?.representation?.included_services ?? [];
  const excluded = proposal?.representation?.excluded_services ?? [];

  return (
    <SectionCard title="Scope of representation">
      {scope ? (
        <p className="text-sm leading-relaxed text-ink">{scope}</p>
      ) : (
        <p className="text-sm italic text-dim-2">Not yet drafted</p>
      )}
      {included.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-dim-2">Included</p>
          <ul className="space-y-1">
            {included.map((service, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>{service}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {excluded.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-dim-2">Excluded</p>
          <ul className="space-y-1">
            {excluded.map((service, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500/70" />
                <span>{service}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
};

const FeeStructureCard: FunctionComponent<{ proposal: ProposalData | null }> = ({ proposal }) => {
  const fees = proposal?.fees;
  if (!fees) {
    return (
      <SectionCard title="Fee structure">
        <p className="text-sm italic text-dim-2">Not yet drafted</p>
      </SectionCard>
    );
  }

  const cells: Array<{ label: string; value: string | null }> = [
    { label: 'Billing type', value: billingTypeLabel(fees.billing_type) },
    { label: 'Contingency rate', value: formatPercent(fees.contingency_percentage) },
    { label: 'Retainer amount', value: formatFeeAmount(fees.retainer_amount) },
    { label: 'Payment frequency', value: fees.payment_frequency ?? null },
    { label: 'Flat fee', value: formatFeeAmount(fees.fixed_fee_amount) },
    { label: 'Attorney rate', value: formatFeeAmount(fees.hourly_rate_attorney) },
  ];
  const visible = cells.filter((c) => c.value !== null && c.value !== '—');

  if (visible.length === 0) {
    return (
      <SectionCard title="Fee structure">
        <p className="text-sm italic text-dim-2">Not yet drafted</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Fee structure">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        {visible.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-xs text-dim-2">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {fees.fee_notes && (
        <p className="border-t border-line-subtle pt-3 text-sm text-ink">{fees.fee_notes}</p>
      )}
    </SectionCard>
  );
};

const ContractBodyCard: FunctionComponent<{ engagement: EngagementDetail }> = ({ engagement }) => (
  <SectionCard title="Contract body">
    {engagement.contract_body?.trim() ? (
      <div className="max-h-[360px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-line-subtle bg-card/30 p-3 text-sm leading-relaxed text-ink">
        {engagement.contract_body}
      </div>
    ) : (
      <p className="text-sm italic text-dim-2">Not yet drafted</p>
    )}
  </SectionCard>
);

// ── View-mode right cards ────────────────────────────────────────────────────

const TimelineCard: FunctionComponent<{ engagement: EngagementDetail }> = ({ engagement }) => {
  const rows: Array<{ label: string; value: string | null }> = [
    { label: 'Created', value: formatLongDate(engagement.created_at) ?? engagement.created_at },
    { label: 'Sent', value: engagement.sent_at ? formatLongDate(engagement.sent_at) ?? engagement.sent_at : null },
    {
      label: 'Response',
      value:
        engagement.accepted_at ? `Accepted ${formatRelativeTime(engagement.accepted_at)}` :
        engagement.declined_at ? `Declined ${formatRelativeTime(engagement.declined_at)}` :
        null,
    },
  ];

  return (
    <SectionCard title="Timeline">
      <dl className="space-y-2.5">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between gap-3 text-sm">
            <dt className="text-dim-2">{label}</dt>
            <dd className="text-right text-ink">{value ?? <span className="italic text-dim-2">Pending</span>}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
};

const RiskReviewCard: FunctionComponent<{ proposal: ProposalData | null }> = ({ proposal }) => {
  const risk = proposal?.risk_review;
  const conflict = CONFLICT_VARIANTS[(risk?.conflict_status ?? 'unknown') as ConflictStatus];
  const jurisdictionLabel =
    risk?.jurisdiction_status === 'supported' ? 'Supported' :
    risk?.jurisdiction_status === 'unsupported' ? 'Unsupported' :
    'Unknown';
  const jurisdictionClass =
    risk?.jurisdiction_status === 'supported' ? STATUS_VARIANTS.accepted.className :
    risk?.jurisdiction_status === 'unsupported' ? STATUS_VARIANTS.draft.className :
    STATUS_VARIANTS.sent.className;

  return (
    <SectionCard title="Risk review">
      <div className="flex flex-wrap gap-2">
        <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', conflict.className)}>
          {conflict.label}
        </span>
        <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', jurisdictionClass)}>
          {jurisdictionLabel}
        </span>
      </div>
      {risk?.conflict_note && <p className="text-sm text-ink">{risk.conflict_note}</p>}
      {risk?.open_questions && risk.open_questions.length > 0 && (
        <ul className="space-y-1.5">
          {risk.open_questions.map((q, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-ink">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>{q}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
};

const SourceInformationCard: FunctionComponent<{ engagement: EngagementDetail }> = ({ engagement }) => {
  const source = engagement.proposal_data?.source_snapshot;
  const rows: Array<{ label: string; value: string | null }> = [
    { label: 'Practice area', value: source?.practice_area ?? engagement.practice_area ?? null },
    { label: 'Urgency', value: source?.urgency ?? engagement.urgency ?? null },
    { label: 'Opposing party', value: source?.opposing_party ?? engagement.opposing_party ?? null },
  ];
  const visible = rows.filter((r) => r.value);

  return (
    <SectionCard title="Source information">
      {visible.length === 0 ? (
        <p className="text-sm italic text-dim-2">No source context</p>
      ) : (
        <dl className="space-y-2.5">
          {visible.map(({ label, value }) => (
            <div key={label} className="flex items-start justify-between gap-3 text-sm">
              <dt className="text-dim-2">{label}</dt>
              <dd className="text-right text-ink capitalize">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </SectionCard>
  );
};

const EngagementNotesCard: FunctionComponent<{ engagement: EngagementDetail }> = ({ engagement }) => (
  <SectionCard title="Engagement notes">
    {engagement.engagement_notes ? (
      <p className="text-sm leading-relaxed text-ink whitespace-pre-wrap">{engagement.engagement_notes}</p>
    ) : (
      <p className="text-sm italic text-dim-2">No internal notes yet</p>
    )}
  </SectionCard>
);

// ── Conversation preview card (collapsible) ──────────────────────────────────

interface ConversationPreviewCardProps {
  engagement: EngagementDetail;
  practiceName: string;
  practiceLogo: string | null;
  conversationsBasePath?: string | null;
  isExpanded: boolean;
  isMobile: boolean;
  onToggle: () => void;
}

const ConversationPreviewCard: FunctionComponent<ConversationPreviewCardProps> = ({
  engagement,
  practiceName,
  practiceLogo,
  conversationsBasePath,
  isExpanded,
  isMobile,
  onToggle,
}) => {
  const { navigate } = useNavigation();
  const { session } = useSessionContext();
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const mapMessage = useCallback((m: ConversationMessage): ChatMessageUI => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.created_at ?? m.server_ts).getTime(),
    reply_to_message_id: m.reply_to_message_id ?? null,
    metadata: m.metadata ?? undefined,
    isUser: m.user_id === session?.user?.id,
    seq: m.seq,
  } satisfies ChatMessageUI), [session?.user?.id]);

  // Lazy-load first page on expand.
  useEffect(() => {
    if (!isExpanded) return;
    if (messages.length > 0) return;
    const conversationId = engagement.conversation_id;
    const targetPracticeId = engagement.organization_id;
    if (!conversationId || !targetPracticeId) return;

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    fetchConversationMessages(conversationId, targetPracticeId, {
      limit: 50,
      signal: controller.signal,
    })
      .then((page) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        setMessages(page.messages.map(mapMessage));
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      })
      .catch((err) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Could not load messages');
      })
      .finally(() => {
        if (isMountedRef.current && !controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [isExpanded, engagement.conversation_id, engagement.organization_id, mapMessage, messages.length]);

  const loadOlder = useCallback(async () => {
    if (!cursor || !hasMore || isLoadingMore) return;
    const conversationId = engagement.conversation_id;
    const targetPracticeId = engagement.organization_id;
    if (!conversationId || !targetPracticeId) return;

    const controller = new AbortController();
    setIsLoadingMore(true);
    try {
      const page = await fetchConversationMessages(conversationId, targetPracticeId, {
        limit: 50,
        cursor,
        signal: controller.signal,
      });
      if (!isMountedRef.current || controller.signal.aborted) return;
      setMessages((current) => {
        const seen = new Set(current.map((m) => m.id));
        const older = page.messages.map(mapMessage).filter((m) => !seen.has(m.id));
        return [...older, ...current];
      });
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) setIsLoadingMore(false);
    }
  }, [cursor, hasMore, isLoadingMore, engagement.conversation_id, engagement.organization_id, mapMessage]);

  const lastActivity = engagement.updated_at ?? engagement.sent_at ?? engagement.created_at;
  const conversationId = engagement.conversation_id;
  const targetPracticeId = engagement.organization_id;

  // Mobile expanded = full-screen overlay
  if (isExpanded && isMobile) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-app-background">
        <header className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
          <h2 className="text-base font-semibold text-ink">Messages</h2>
          <Button variant="ghost" icon={X} onClick={onToggle} aria-label="Close conversation" />
        </header>
        <div className="min-h-0 flex-1">
          <ConversationContent
            isLoading={isLoading}
            error={error}
            messages={messages}
            engagement={engagement}
            practiceName={practiceName}
            practiceLogo={practiceLogo}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadOlder}
          />
        </div>
        {conversationsBasePath && conversationId && (
          <div className="border-t border-line-subtle p-3">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => navigate(`${conversationsBasePath}/${encodeURIComponent(conversationId)}`)}
            >
              Open full conversation
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 p-5 text-left transition-colors hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:p-6"
      >
        <div className="flex min-w-0 items-center gap-3">
          <MessagesSquare className="h-4 w-4 shrink-0 text-dim-2" />
          <h3 className="text-xs font-semibold uppercase tracking-widest text-dim-2">Messages</h3>
          {lastActivity && (
            <span className="truncate text-xs text-dim-2">
              · {formatRelativeTime(lastActivity)}
            </span>
          )}
        </div>
        {isExpanded ? <ChevronUp className="h-4 w-4 text-dim-2" /> : <ChevronDown className="h-4 w-4 text-dim-2" />}
      </button>
      {isExpanded && !isMobile && (
        <div className="border-t border-line-subtle">
          <div className="h-[320px] bg-card/20">
            <ConversationContent
              isLoading={isLoading}
              error={error}
              messages={messages}
              engagement={engagement}
              practiceName={practiceName}
              practiceLogo={practiceLogo}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              onLoadMore={loadOlder}
            />
          </div>
          {conversationsBasePath && conversationId && targetPracticeId && (
            <div className="border-t border-line-subtle p-3">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => navigate(`${conversationsBasePath}/${encodeURIComponent(conversationId)}`)}
              >
                Open full conversation
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const ConversationContent: FunctionComponent<{
  isLoading: boolean;
  error: string | null;
  messages: ChatMessageUI[];
  engagement: EngagementDetail;
  practiceName: string;
  practiceLogo: string | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}> = ({ isLoading, error, messages, engagement, practiceName, practiceLogo, hasMore, isLoadingMore, onLoadMore }) => {
  if (isLoading && messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="sm" ariaLabel="Loading messages" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="text-sm text-rose-400">{error}</p>
      </div>
    );
  }
  if (!engagement.organization_id) return null;
  return (
    <VirtualMessageList
      messages={messages}
      conversationTitle={engagement.client_name ?? null}
      viewerContext="practice"
      practiceConfig={{
        name: practiceName,
        profileImage: practiceLogo,
        practiceId: engagement.organization_id,
      }}
      practiceId={engagement.organization_id}
      hasMoreMessages={hasMore}
      isLoadingMoreMessages={isLoadingMore}
      onLoadMoreMessages={onLoadMore}
    />
  );
};

// ── Action dialogs ───────────────────────────────────────────────────────────

type DialogAction = 'send' | 'decline' | null;

// ── Mobile detection ─────────────────────────────────────────────────────────

const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isMobile;
};

// ── Main component ──────────────────────────────────────────────────────────

type EngagementDetailPageProps = {
  practiceId: string | null;
  engagementId: string;
  conversationsBasePath?: string | null;
  practiceName: string;
  practiceLogo: string | null;
  onBack: () => void;
  onActionComplete?: () => void;
  mode?: 'view' | 'edit';
  basePath?: string;
};

export const EngagementDetailPage: FunctionComponent<EngagementDetailPageProps> = ({
  practiceId,
  engagementId,
  conversationsBasePath,
  practiceName,
  practiceLogo,
  onBack,
  onActionComplete,
  mode = 'view',
  basePath = '/practice/engagements',
}) => {
  const { navigate } = useNavigation();
  const { showSuccess, showError } = useToastContext();
  const isMobile = useIsMobile();

  const {
    data: engagementData,
    isLoading,
    error: loadError,
    setData: setEngagementCache,
  } = useEngagementDetail(practiceId, engagementId);
  const engagement: EngagementDetail | null = engagementData ?? null;

  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [dialogAction, setDialogAction] = useState<DialogAction>(null);
  const [dialogNote, setDialogNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConversationExpanded, setIsConversationExpanded] = useState(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const effectiveStatus = (localStatus ?? engagement?.status) as EngagementStatus | undefined;
  const proposal = engagement?.proposal_data ?? null;
  const isDraft = effectiveStatus === 'draft';
  const isSent = effectiveStatus === 'sent';
  const isAccepted = effectiveStatus === 'accepted';
  const isDeclined = effectiveStatus === 'declined';
  const feesEditingDisabled = !isDraft && effectiveStatus !== undefined;

  const handleEnterEdit = useCallback(() => {
    navigate(`${basePath}/${encodeURIComponent(engagementId)}/edit`);
  }, [basePath, engagementId, navigate]);

  const handleExitEdit = useCallback(() => {
    navigate(`${basePath}/${encodeURIComponent(engagementId)}`);
  }, [basePath, engagementId, navigate]);

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
    if (isSubmitting || !engagement || !practiceId) return;
    setIsSubmitting(true);
    try {
      const updated = await sendEngagementToClient(practiceId, engagement.id, dialogNote);
      if (isMountedRef.current) {
        setEngagementCache(updated);
        setLocalStatus(updated.status);
        setDialogAction(null);
        setDialogNote('');
        showSuccess('Sent to client', 'The client has been notified.');
        onActionComplete?.();
      }
    } catch (err) {
      if (isMountedRef.current) {
        showError('Failed to send', err instanceof Error ? err.message : 'Could not send proposal');
      }
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  }, [engagement, isSubmitting, dialogNote, practiceId, onActionComplete, setEngagementCache, showSuccess, showError]);

  const runDecline = useCallback(async () => {
    if (isSubmitting || !engagement || !practiceId) return;
    setIsSubmitting(true);
    try {
      const updated = await declineEngagement(practiceId, engagement.id);
      if (isMountedRef.current) {
        setEngagementCache(updated);
        setLocalStatus(updated.status);
        setDialogAction(null);
        setDialogNote('');
        showSuccess('Declined', 'The proposal has been marked declined.');
        onActionComplete?.();
      }
    } catch (err) {
      if (isMountedRef.current) {
        showError('Failed to decline', err instanceof Error ? err.message : 'Could not decline proposal');
      }
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  }, [engagement, isSubmitting, practiceId, onActionComplete, setEngagementCache, showSuccess, showError]);

  const handleDialogConfirm = useCallback(async () => {
    if (dialogAction === 'send') await runSendToClient();
    else if (dialogAction === 'decline') await runDecline();
  }, [dialogAction, runSendToClient, runDecline]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-full flex-col min-h-0">
        <DetailHeader title="Engagement" showBack onBack={onBack} />
        <EngagementDetailSkeleton />
      </div>
    );
  }

  if (loadError || !engagement) {
    return (
      <div className="flex h-full flex-col min-h-0">
        <DetailHeader title="Engagement" showBack onBack={onBack} />
        <div className="p-6">
          <div className="card p-6 text-sm text-rose-400">
            {loadError ?? 'Engagement not found.'}
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'edit') {
    return (
      <EngagementWorkbench
        mode="edit"
        practiceId={practiceId}
        engagement={engagement}
        practiceName={practiceName}
        feesEditingDisabled={feesEditingDisabled}
        setEngagementCache={setEngagementCache}
        onSaved={() => {
          showSuccess('Draft saved', 'Your engagement changes have been saved.');
          handleExitEdit();
        }}
        onSavedAndSend={() => {
          handleExitEdit();
          setDialogAction('send');
        }}
        onCancel={handleExitEdit}
      />
    );
  }

  const clientName = engagement.client_name || 'Unknown Client';
  const matterLabel = getMatterDisplay(engagement);
  const detailTitle = matterLabel !== '—' ? `${clientName} — ${matterLabel}` : clientName;
  const canSendEngagement = Boolean(engagement.contract_body?.trim());
  const createdMatterPath = engagement.matter_id
    ? `${basePath.replace(/\/engagements$/, '/matters')}/${encodeURIComponent(engagement.matter_id)}`
    : null;

  const headerActions = (
    <div className="flex items-center gap-2">
      {(isDraft || isSent) && (
        <Button variant="secondary" icon={Pencil} onClick={handleEnterEdit}>
          <span className="hidden sm:inline">Edit</span>
        </Button>
      )}
      {isDraft && (
        <Button variant="primary" icon={Send} onClick={() => openDialog('send')} disabled={isSubmitting || !canSendEngagement}>
          <span className="hidden sm:inline">Send to client</span>
          <span className="sm:hidden">Send</span>
        </Button>
      )}
      {isSent && (
        <Button variant="secondary" onClick={() => openDialog('decline')} disabled={isSubmitting}>
          <span className="hidden sm:inline">Mark declined</span>
          <span className="sm:hidden">Decline</span>
        </Button>
      )}
    </div>
  );

  const statusBanner = (() => {
    if (isSent) {
      return (
        <div className="rounded-r-md border border-line-subtle bg-card/40 p-4 text-sm text-ink">
          <p className="font-medium">Awaiting client response</p>
          <p className="mt-1 text-dim-2">The client received this engagement and will accept or decline online.</p>
        </div>
      );
    }
    if (isAccepted) {
      return (
        <div className="rounded-r-md border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Engagement active</p>
              <p className="mt-1 text-emerald-700/80 dark:text-emerald-200/80">
                {createdMatterPath
                  ? 'The client accepted this engagement and the matter is linked.'
                  : 'The client accepted this engagement, but the backend response has not linked a matter_id.'}
              </p>
            </div>
            {createdMatterPath ? (
              <Button variant="secondary" size="sm" onClick={() => navigate(createdMatterPath)}>
                View matter
              </Button>
            ) : null}
          </div>
        </div>
      );
    }
    if (isDeclined) {
      return (
        <div className="rounded-r-md border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
          <p className="font-medium">Declined</p>
          <p className="mt-1 text-rose-700/80 dark:text-rose-200/80">This engagement was marked declined.</p>
        </div>
      );
    }
    return null;
  })();

  const showConversationCard = Boolean(engagement.conversation_id && engagement.organization_id);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DetailHeader
        title={detailTitle}
        showBack
        onBack={onBack}
        titleBadge={<StatusPill status={effectiveStatus} />}
        actions={headerActions}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* Left column */}
          <div className="flex flex-col gap-4">
            {statusBanner}
            <ClientSummaryCard engagement={engagement} />
            <ContractBodyCard engagement={engagement} />
            <ScopeOfRepresentationCard proposal={proposal} />
            <FeeStructureCard proposal={proposal} />
          </div>

          {/* Right column */}
          <aside className="flex flex-col gap-4">
            <TimelineCard engagement={engagement} />
            <RiskReviewCard proposal={proposal} />
            <SourceInformationCard engagement={engagement} />
            <EngagementNotesCard engagement={engagement} />
            {showConversationCard && (
              <ConversationPreviewCard
                engagement={engagement}
                practiceName={practiceName}
                practiceLogo={practiceLogo}
                conversationsBasePath={conversationsBasePath}
                isExpanded={isConversationExpanded}
                isMobile={isMobile}
                onToggle={() => setIsConversationExpanded((v) => !v)}
              />
            )}
          </aside>
        </div>
      </div>

      <Dialog
        isOpen={dialogAction !== null}
        onClose={closeDialog}
        title={dialogAction === 'send' ? 'Send to client' : 'Mark declined'}
        description={
          dialogAction === 'send'
            ? 'The client will receive an email with a link to review and accept the engagement.'
            : 'This will mark the proposal as declined.'
        }
        disableBackdropClick={isSubmitting}
      >
        <DialogBody className="space-y-4">
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
            variant={dialogAction === 'decline' ? 'danger' : 'primary'}
            disabled={isSubmitting || !dialogAction}
            onClick={handleDialogConfirm}
          >
            {isSubmitting
              ? (dialogAction === 'send' ? 'Sending…' : 'Declining…')
              : (dialogAction === 'send' ? 'Confirm &amp; send' : 'Mark declined')}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
};

export default EngagementDetailPage;
