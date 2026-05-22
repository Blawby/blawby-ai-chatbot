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
import { Input, Textarea, Combobox, type ComboboxOption } from '@/shared/ui/input';
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
import {
  declineEngagement,
  patchEngagementContract,
  sendEngagementToClient,
} from '../api/engagementsApi';
import type {
  ConflictStatus,
  EngagementDetail,
  EngagementStatus,
  ProposalData,
  ProposalFees,
} from '../types/engagement';
import { useEngagementDetail } from '../hooks/useEngagementDetail';

// ── Status helpers ───────────────────────────────────────────────────────────

const STATUS_VARIANTS: Record<EngagementStatus, { label: string; className: string }> = {
  draft:    { label: 'Draft',    className: 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300' },
  sent:     { label: 'Sent',     className: 'bg-surface-overlay/60 text-input-placeholder ring-line-subtle' },
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
  unknown:           { label: 'Unknown',           className: 'bg-surface-overlay/60 text-input-placeholder ring-line-subtle' },
  insufficient_data: { label: 'Insufficient Data', className: 'bg-surface-overlay/60 text-input-placeholder ring-line-subtle' },
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
      <h3 className="text-xs font-semibold uppercase tracking-widest text-input-placeholder">{title}</h3>
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
    <dt className="text-input-placeholder">{label}</dt>
    <dd className="text-input-text break-words">{value || <span className="text-input-placeholder italic">{fallback}</span>}</dd>
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
        <p className="text-sm leading-relaxed text-input-text">{scope}</p>
      ) : (
        <p className="text-sm italic text-input-placeholder">Not yet drafted</p>
      )}
      {included.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder">Included</p>
          <ul className="space-y-1">
            {included.map((service, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-input-text">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>{service}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {excluded.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder">Excluded</p>
          <ul className="space-y-1">
            {excluded.map((service, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-input-text">
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
        <p className="text-sm italic text-input-placeholder">Not yet drafted</p>
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
        <p className="text-sm italic text-input-placeholder">Not yet drafted</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Fee structure">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        {visible.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-xs text-input-placeholder">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium text-input-text">{value}</dd>
          </div>
        ))}
      </dl>
      {fees.fee_notes && (
        <p className="border-t border-line-subtle pt-3 text-sm text-input-text">{fees.fee_notes}</p>
      )}
    </SectionCard>
  );
};

const ContractBodyCard: FunctionComponent<{ engagement: EngagementDetail }> = ({ engagement }) => (
  <SectionCard title="Contract body">
    {engagement.contract_body?.trim() ? (
      <div className="max-h-[360px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-line-subtle bg-surface-overlay/30 p-3 text-sm leading-relaxed text-input-text">
        {engagement.contract_body}
      </div>
    ) : (
      <p className="text-sm italic text-input-placeholder">Not yet drafted</p>
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
            <dt className="text-input-placeholder">{label}</dt>
            <dd className="text-right text-input-text">{value ?? <span className="italic text-input-placeholder">Pending</span>}</dd>
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
      {risk?.conflict_note && <p className="text-sm text-input-text">{risk.conflict_note}</p>}
      {risk?.open_questions && risk.open_questions.length > 0 && (
        <ul className="space-y-1.5">
          {risk.open_questions.map((q, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-input-text">
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
        <p className="text-sm italic text-input-placeholder">No source context</p>
      ) : (
        <dl className="space-y-2.5">
          {visible.map(({ label, value }) => (
            <div key={label} className="flex items-start justify-between gap-3 text-sm">
              <dt className="text-input-placeholder">{label}</dt>
              <dd className="text-right text-input-text capitalize">{value}</dd>
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
      <p className="text-sm leading-relaxed text-input-text whitespace-pre-wrap">{engagement.engagement_notes}</p>
    ) : (
      <p className="text-sm italic text-input-placeholder">No internal notes yet</p>
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
          <h2 className="text-base font-semibold text-input-text">Messages</h2>
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
        className="flex w-full items-center justify-between gap-3 p-5 text-left transition-colors hover:bg-surface-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:p-6"
      >
        <div className="flex min-w-0 items-center gap-3">
          <MessagesSquare className="h-4 w-4 shrink-0 text-input-placeholder" />
          <h3 className="text-xs font-semibold uppercase tracking-widest text-input-placeholder">Messages</h3>
          {lastActivity && (
            <span className="truncate text-xs text-input-placeholder">
              · {formatRelativeTime(lastActivity)}
            </span>
          )}
        </div>
        {isExpanded ? <ChevronUp className="h-4 w-4 text-input-placeholder" /> : <ChevronDown className="h-4 w-4 text-input-placeholder" />}
      </button>
      {isExpanded && !isMobile && (
        <div className="border-t border-line-subtle">
          <div className="h-[320px] bg-surface-overlay/20">
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

// ── Edit form ────────────────────────────────────────────────────────────────

type EditFormState = {
  contractBody: string;
  clientName: string;
  matterSummary: string;
  locationSummary: string;
  scopeSummary: string;
  includedServicesText: string;
  billingType: string;
  contingencyPercentage: string;
  retainerAmount: string;
  paymentFrequency: string;
  engagementNotes: string;
};

const BILLING_TYPE_OPTIONS: ComboboxOption[] = [
  { value: 'flat', label: 'Flat Fee' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'contingency', label: 'Contingency' },
  { value: 'retainer', label: 'Retainer' },
];

const PAYMENT_FREQUENCY_OPTIONS: ComboboxOption[] = [
  { value: 'one_time', label: 'One time' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'on_completion', label: 'On completion' },
];

const buildEditFormState = (engagement: EngagementDetail): EditFormState => {
  const summary = engagement.proposal_data?.client_summary;
  const rep = engagement.proposal_data?.representation;
  const fees = engagement.proposal_data?.fees;
  return {
    contractBody: engagement.contract_body ?? '',
    clientName: summary?.client_name ?? engagement.client_name ?? '',
    matterSummary: summary?.matter_summary ?? '',
    locationSummary: summary?.location_summary ?? '',
    scopeSummary: rep?.scope_summary ?? '',
    includedServicesText: (rep?.included_services ?? []).join('\n'),
    billingType: fees?.billing_type ?? '',
    contingencyPercentage: fees?.contingency_percentage != null ? String(fees.contingency_percentage) : '',
    retainerAmount: fees?.retainer_amount != null ? String(fees.retainer_amount) : '',
    paymentFrequency: fees?.payment_frequency ?? '',
    engagementNotes: engagement.engagement_notes ?? '',
  };
};

const mergeEditFormIntoProposal = (engagement: EngagementDetail, form: EditFormState): ProposalData => {
  const existing = engagement.proposal_data;
  const baseProposal: ProposalData = existing ?? {
    representation: { scope_summary: '' },
    fees: {},
    risk_review: { conflict_status: 'unknown', jurisdiction_status: 'unknown' },
    client_summary: {},
    draft_meta: { version: 1, generated_at: new Date().toISOString() },
  };

  const includedServices = form.includedServicesText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const fees: ProposalFees = {
    ...baseProposal.fees,
    billing_type: form.billingType || baseProposal.fees.billing_type || null,
    contingency_percentage: form.contingencyPercentage ? Number(form.contingencyPercentage) : null,
    retainer_amount: form.retainerAmount ? Number(form.retainerAmount) : null,
    payment_frequency: form.paymentFrequency || baseProposal.fees.payment_frequency || null,
  };

  return {
    ...baseProposal,
    representation: {
      ...baseProposal.representation,
      scope_summary: form.scopeSummary,
      included_services: includedServices.length > 0 ? includedServices : baseProposal.representation.included_services,
    },
    fees,
    client_summary: {
      ...baseProposal.client_summary,
      client_name: form.clientName || baseProposal.client_summary?.client_name || null,
      matter_summary: form.matterSummary || baseProposal.client_summary?.matter_summary || null,
      location_summary: form.locationSummary || baseProposal.client_summary?.location_summary || null,
    },
    draft_meta: {
      ...baseProposal.draft_meta,
      version: (baseProposal.draft_meta?.version ?? 0) + 1,
      generated_at: new Date().toISOString(),
    },
  };
};

interface EditModeViewProps {
  engagement: EngagementDetail;
  saving: boolean;
  saveError: string | null;
  feesEditingDisabled: boolean;
  onSaveDraft: (form: EditFormState) => Promise<void>;
  onReviewAndSend: (form: EditFormState) => Promise<void>;
  onCancel: () => void;
}

const EditModeView: FunctionComponent<EditModeViewProps> = ({
  engagement,
  saving,
  saveError,
  feesEditingDisabled,
  onSaveDraft,
  onReviewAndSend,
  onCancel,
}) => {
  const [form, setForm] = useState<EditFormState>(() => buildEditFormState(engagement));

  // Refresh form when engagement payload changes (e.g. after save -> re-enter edit).
  // Intentionally narrow the deps to id + updated_at so transient state (localStatus,
  // dialog flags) doesn't clobber unsaved user edits.
  useEffect(() => {
    setForm(buildEditFormState(engagement));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagement.id, engagement.updated_at]);

  const update = useCallback(<K extends keyof EditFormState>(field: K, value: EditFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line-subtle bg-surface-workspace px-4 py-3 sm:px-6">
        <Button variant="ghost" icon={X} onClick={onCancel} disabled={saving} aria-label="Cancel" />
        <h1 className="text-base font-semibold text-input-text">Edit engagement</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => onSaveDraft(form)} disabled={saving}>
            {saving ? 'Saving…' : 'Save draft'}
          </Button>
          <Button variant="primary" icon={Send} iconPosition="right" onClick={() => onReviewAndSend(form)} disabled={saving}>
            Review &amp; send
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <form className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6" onSubmit={(e) => e.preventDefault()}>
          {saveError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {saveError}
            </div>
          )}

          <SectionCard title="Contract body">
            <Textarea
              label="Engagement contract"
              value={form.contractBody}
              onChange={(v) => update('contractBody', v)}
              rows={12}
              disabled={saving}
            />
          </SectionCard>

          <SectionCard title="Client information">
            <div className="space-y-3">
              <Input
                label="Client name"
                value={form.clientName}
                onChange={(v) => update('clientName', v)}
                disabled={saving}
              />
              <Input
                label="Matter"
                value={form.matterSummary}
                onChange={(v) => update('matterSummary', v)}
                disabled={saving}
              />
              <Input
                label="Location"
                value={form.locationSummary}
                onChange={(v) => update('locationSummary', v)}
                disabled={saving}
              />
            </div>
          </SectionCard>

          <SectionCard title="Scope of representation">
            <div className="space-y-3">
              <Textarea
                label="Scope summary"
                value={form.scopeSummary}
                onChange={(v) => update('scopeSummary', v)}
                rows={4}
                disabled={saving}
              />
              <Textarea
                label="Included services (one per line)"
                value={form.includedServicesText}
                onChange={(v) => update('includedServicesText', v)}
                rows={4}
                placeholder="Initial consultation&#10;Document preparation&#10;Court appearances"
                disabled={saving}
              />
            </div>
          </SectionCard>

          <SectionCard title="Fee structure">
            {feesEditingDisabled && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                Billing terms were captured when this engagement was sent. Edits here will not change what the client has already seen.
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Combobox
                label="Billing type"
                options={BILLING_TYPE_OPTIONS}
                value={form.billingType}
                onChange={(v) => update('billingType', v)}
                disabled={saving || feesEditingDisabled}
              />
              <Combobox
                label="Payment frequency"
                options={PAYMENT_FREQUENCY_OPTIONS}
                value={form.paymentFrequency}
                onChange={(v) => update('paymentFrequency', v)}
                disabled={saving || feesEditingDisabled}
              />
              <Input
                label="Contingency rate (%)"
                type="number"
                value={form.contingencyPercentage}
                onChange={(v) => update('contingencyPercentage', v)}
                disabled={saving || feesEditingDisabled}
              />
              <Input
                label="Retainer amount"
                type="number"
                value={form.retainerAmount}
                onChange={(v) => update('retainerAmount', v)}
                disabled={saving || feesEditingDisabled}
              />
            </div>
          </SectionCard>

          <SectionCard title="Engagement notes">
            <Textarea
              label="Internal notes"
              value={form.engagementNotes}
              onChange={(v) => update('engagementNotes', v)}
              rows={4}
              placeholder="Add internal notes for your team…"
              disabled={saving}
            />
          </SectionCard>
        </form>
      </div>
    </div>
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

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const persistProposalChanges = useCallback(async (form: EditFormState): Promise<EngagementDetail | null> => {
    if (!engagement || !practiceId) return null;
    const merged = mergeEditFormIntoProposal(engagement, form);
    const updated = await patchEngagementContract(practiceId, engagement.id, {
      contract_body: form.contractBody.trim(),
      engagement_notes: form.engagementNotes.trim(),
      proposal_data: merged,
    });
    if (isMountedRef.current) {
      setEngagementCache(updated);
    }
    return updated;
  }, [engagement, practiceId, setEngagementCache]);

  const handleSaveDraft = useCallback(async (form: EditFormState) => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await persistProposalChanges(form);
      if (isMountedRef.current) {
        showSuccess('Draft saved', 'Your engagement changes have been saved.');
        handleExitEdit();
      }
    } catch (err) {
      if (isMountedRef.current) {
        setSaveError(err instanceof Error ? err.message : 'Failed to save draft');
      }
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  }, [isSaving, persistProposalChanges, showSuccess, handleExitEdit]);

  const handleReviewAndSend = useCallback(async (form: EditFormState) => {
    if (isSaving) return;
    if (!form.contractBody.trim()) {
      setSaveError('Contract body is required before sending.');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      await persistProposalChanges(form);
      if (isMountedRef.current) {
        handleExitEdit();
        setDialogAction('send');
      }
    } catch (err) {
      if (isMountedRef.current) {
        setSaveError(err instanceof Error ? err.message : 'Failed to save before sending');
      }
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  }, [isSaving, persistProposalChanges, handleExitEdit]);

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
      <EditModeView
        engagement={engagement}
        saving={isSaving}
        saveError={saveError}
        feesEditingDisabled={feesEditingDisabled}
        onSaveDraft={handleSaveDraft}
        onReviewAndSend={handleReviewAndSend}
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
        <div className="rounded-xl border border-line-subtle bg-surface-overlay/40 p-4 text-sm text-input-text">
          <p className="font-medium">Awaiting client response</p>
          <p className="mt-1 text-input-placeholder">The client received this engagement and will accept or decline online.</p>
        </div>
      );
    }
    if (isAccepted) {
      return (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
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
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
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
