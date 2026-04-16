/**
 * ClientEngagementReviewPage
 *
 * Route: /client/:practiceSlug/engagements/:engagementId/review
 *
 * Authenticated (no magic link). By engagement_sent, the client is already
 * authenticated through the intake invite flow. Normal auth redirects apply.
 *
 * Actions:
 * - Accept → calls backend acceptance endpoint → redirects into conversation
 * - Ask a Question → routes to existing conversation surface
 */
import { FunctionComponent } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  ScaleIcon,
  CurrencyDollarIcon,
  BriefcaseIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { Button } from '@/shared/ui/Button';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { cn } from '@/shared/utils/cn';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { getEngagement, acceptEngagement } from '../api/engagementsApi';
import type { EngagementDetail, ProposalData } from '../types/engagement';

// ── Fee helpers ────────────────────────────────────────────────────────────────

function formatMoney(amount?: number | null, currency = 'USD') {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount / 100);
  } catch {
    return `${amount / 100} ${currency}`;
  }
}

// ── Card component ─────────────────────────────────────────────────────────────

const ReviewCard: FunctionComponent<{
  title: string;
  icon?: typeof BriefcaseIcon;
  children: preact.ComponentChildren;
}> = ({ title, icon: IconComp, children }) => (
  <section className="glass-card p-6 space-y-4">
    <header className="flex items-center gap-2">
      {IconComp && <Icon icon={IconComp} className="w-4 h-4 text-input-placeholder" />}
      <h2 className="text-xs font-semibold uppercase tracking-widest text-input-placeholder">{title}</h2>
    </header>
    {children}
  </section>
);

// ── Scope section ─────────────────────────────────────────────────────────────

const ScopeSection: FunctionComponent<{ proposal: ProposalData }> = ({ proposal }) => {
  const { scope_summary, included_services, excluded_services } = proposal.representation ?? {};
  return (
    <ReviewCard title="What We Will Handle" icon={BriefcaseIcon}>
      <p className="text-base text-input-text leading-relaxed">{scope_summary}</p>
      {included_services && included_services.length > 0 && (
        <ul className="space-y-2 mt-2">
          {included_services.map((s, i) => (
            <li key={i} className="flex items-center gap-2.5 text-sm text-input-text">
              <CheckCircleIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              {s}
            </li>
          ))}
        </ul>
      )}
      {excluded_services && excluded_services.length > 0 && (
        <div className="pt-2 border-t border-line-glass/10">
          <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder mb-2">Not included</p>
          <ul className="space-y-2">
            {excluded_services.map((s, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm text-input-placeholder">
                <XCircleIcon className="w-4 h-4 text-rose-500/70 flex-shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </ReviewCard>
  );
};

// ── Fees section ──────────────────────────────────────────────────────────────

const FeesSection: FunctionComponent<{ proposal: ProposalData; engagement: EngagementDetail }> = ({
  proposal,
  engagement,
}) => {
  const fees = proposal.fees;
  const currency = fees?.currency ?? engagement.currency ?? 'USD';

  const rows: Array<{ label: string; value: string | null }> = [
    { label: 'Billing type', value: fees?.billing_type?.replace(/_/g, ' ') ?? null },
    { label: 'Rate', value: fees?.rate != null ? formatMoney(fees.rate, currency) : null },
    { label: 'Retainer', value: fees?.retainer != null ? formatMoney(fees.retainer, currency) : null },
    { label: 'Flat fee', value: fees?.flat_fee != null ? formatMoney(fees.flat_fee, currency) : null },
    { label: 'Contingency', value: fees?.contingency_pct != null ? `${fees.contingency_pct}%` : null },
    { label: 'Payment terms', value: fees?.payment_terms ?? null },
  ].filter((row) => row.value !== null);

  if (rows.length === 0) return null;
  return (
    <ReviewCard title="Fees & Billing" icon={CurrencyDollarIcon}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex flex-col">
            <dt className="text-xs text-input-placeholder mb-0.5">{label}</dt>
            <dd className="text-sm text-input-text font-semibold capitalize">{value}</dd>
          </div>
        ))}
      </dl>
    </ReviewCard>
  );
};

// ── Goals section ──────────────────────────────────────────────────────────────

const GoalsSection: FunctionComponent<{ proposal: ProposalData }> = ({ proposal }) => {
  const goals = proposal.client_summary?.goals_summary;
  if (!goals) return null;
  return (
    <ReviewCard title="Your Goals" icon={ScaleIcon}>
      <p className="text-sm text-input-text leading-relaxed">{goals}</p>
    </ReviewCard>
  );
};

// ── Representation parties ─────────────────────────────────────────────────────

const PartiesSection: FunctionComponent<{ proposal: ProposalData; practiceName: string }> = ({
  proposal,
  practiceName,
}) => {
  const { client_name, co_clients, non_clients } = proposal.client_summary ?? {};
  const hasParties = client_name || (co_clients && co_clients.length > 0) || (non_clients && non_clients.length > 0);
  if (!hasParties) return null;

  return (
    <ReviewCard title="Representation" icon={CheckCircleIcon}>
      <p className="text-sm text-input-placeholder">
        <span className="font-medium text-input-text">{practiceName}</span> represents:
      </p>
      {client_name && (
        <p className="text-sm text-input-text font-semibold">{client_name}</p>
      )}
      {co_clients && co_clients.length > 0 && (
        <div>
          <p className="text-xs text-input-placeholder mb-1">Also represented</p>
          <ul className="text-sm text-input-text space-y-0.5">
            {co_clients.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}
      {non_clients && non_clients.length > 0 && (
        <div className="mt-2 p-3 rounded-lg bg-rose-500/5 border border-rose-500/15">
          <div className="flex items-start gap-2">
            <ExclamationTriangleIcon className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-rose-400 space-y-0.5">
              <p className="font-medium">NOT represented in this matter:</p>
              {non_clients.map((c, i) => <p key={i}>{c}</p>)}
            </div>
          </div>
        </div>
      )}
    </ReviewCard>
  );
};

// ── Acknowledgments ────────────────────────────────────────────────────────────

const AcknowledgmentsSection: FunctionComponent<{ proposal: ProposalData }> = ({ proposal }) => {
  const ack = proposal.acknowledgment_language;
  const noGuar = proposal.no_guarantee_language;
  if (!ack && !noGuar) return null;

  return (
    <ReviewCard title="Acknowledgments">
      <div className="space-y-4 text-sm text-input-placeholder leading-relaxed">
        {ack && <p>{ack}</p>}
        {noGuar && (
          <div className="p-3 rounded-lg border border-line-glass/20 bg-surface-utility/40 dark:bg-surface-utility/10">
            <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder mb-1">No guarantee of outcome</p>
            <p>{noGuar}</p>
          </div>
        )}
      </div>
    </ReviewCard>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

type ClientEngagementReviewPageProps = {
  practiceId: string;
  engagementId: string;
  practiceName: string;
  conversationsBasePath?: string | null;
};

export const ClientEngagementReviewPage: FunctionComponent<ClientEngagementReviewPageProps> = ({
  practiceId,
  engagementId,
  practiceName,
  conversationsBasePath,
}) => {
  const { navigate } = useNavigation();
  const { showSuccess, showError } = useToastContext();

  const [engagement, setEngagement] = useState<EngagementDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const isMountedRef = useRef(true);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (navigationTimeoutRef.current) clearTimeout(navigationTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!practiceId || !engagementId) return;
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(null);

    getEngagement(practiceId, engagementId, { signal: controller.signal })
      .then((data) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        setEngagement(data);
        if (data.status === 'engagement_accepted' || data.status === 'active') {
          setAccepted(true);
        }
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

  const handleAccept = async () => {
    if (isAccepting || !engagement) return;
    setIsAccepting(true);
    try {
      await acceptEngagement(engagement.id);
      if (isMountedRef.current) {
        setAccepted(true);
        showSuccess('Accepted!', 'Your engagement has been confirmed. Opening your conversation…');
        if (engagement.conversation_id && conversationsBasePath) {
          navigationTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              navigate(`${conversationsBasePath}/${encodeURIComponent(engagement.conversation_id!)}`);
            }
          }, 1200);
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        showError('Acceptance failed', err instanceof Error ? err.message : 'Could not accept the engagement. Please try again.');
      }
    } finally {
      if (isMountedRef.current) setIsAccepting(false);
    }
  };

  const handleAskQuestion = () => {
    if (!engagement?.conversation_id || !conversationsBasePath) return;
    navigate(`${conversationsBasePath}/${encodeURIComponent(engagement.conversation_id)}`);
  };

  // ── Loading / error states ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6">
        <LoadingBlock className="w-full max-w-lg rounded-2xl h-80" />
      </div>
    );
  }

  if (loadError || !engagement) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6">
        <div className="glass-card max-w-md w-full p-8 text-center space-y-4">
          <ExclamationTriangleIcon className="w-10 h-10 text-rose-400 mx-auto" />
          <h1 className="text-lg font-bold text-input-text">Unable to load engagement</h1>
          <p className="text-sm text-input-placeholder">{loadError ?? 'This engagement could not be found.'}</p>
        </div>
      </div>
    );
  }

  const proposal = engagement.proposal_data ?? null;

  return (
    <div className="min-h-dvh bg-app-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-line-glass/10 bg-surface-overlay/80 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-input-placeholder font-medium">{practiceName}</p>
            <h1 className="text-base font-bold text-input-text">Engagement Review</h1>
          </div>
          <span className={cn(
            "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
            accepted 
              ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300"
              : "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300"
          )}>
            {accepted ? 'Accepted' : 'Pending your review'}
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Intro */}
        <div className="text-center space-y-2 pb-2">
          <p className="text-sm text-input-placeholder">
            {practiceName} has prepared an engagement proposal for you.
            Please review the terms below before accepting.
          </p>
          {proposal?.draft_meta && (
            <p className="text-xs text-input-placeholder/70">
              Draft v{proposal.draft_meta.version} · {formatLongDate(proposal.draft_meta.generated_at) ?? proposal.draft_meta.generated_at}
            </p>
          )}
        </div>

        {/* Content sections — only render from proposal_data */}
        {proposal ? (
          <>
            <PartiesSection proposal={proposal} practiceName={practiceName} />
            <ScopeSection proposal={proposal} />
            <FeesSection proposal={proposal} engagement={engagement} />
            <GoalsSection proposal={proposal} />
            <AcknowledgmentsSection proposal={proposal} />
          </>
        ) : (
          <div className="glass-card p-6 text-center text-sm text-input-placeholder">
            The engagement details are being prepared. Please check back shortly.
          </div>
        )}

        {/* Action section */}
        <div className="pt-4 space-y-3">
          {accepted ? (
            <div className="glass-card p-6 text-center space-y-3">
              <CheckCircleIcon className="w-10 h-10 text-emerald-400 mx-auto" />
              <p className="text-base font-bold text-emerald-600 dark:text-emerald-300">Engagement Accepted</p>
              <p className="text-sm text-input-placeholder">
                Thank you! Your attorney will be in touch shortly.
              </p>
              {engagement.conversation_id && conversationsBasePath && (
                <Button variant="primary" className="w-full mt-2" onClick={handleAskQuestion}>
                  <span className="inline-flex items-center gap-2">
                    <ChatBubbleLeftRightIcon className="w-4 h-4" />
                    Open Conversation
                  </span>
                </Button>
              )}
            </div>
          ) : (
            <>
              <Button
                id="engagement-accept-btn"
                variant="primary"
                className="w-full"
                disabled={isAccepting || !proposal}
                onClick={handleAccept}
              >
                {isAccepting ? (
                  <span className="inline-flex items-center">
                    <LoadingSpinner size="sm" className="mr-2" ariaLabel="Accepting" />
                    Accepting…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <CheckCircleIcon className="w-4 h-4" />
                    Accept Engagement
                  </span>
                )}
              </Button>

              {engagement.conversation_id && conversationsBasePath && (
                <Button
                  id="engagement-ask-question-btn"
                  variant="secondary"
                  className="w-full"
                  onClick={handleAskQuestion}
                >
                  <span className="inline-flex items-center gap-2">
                    <ChatBubbleLeftRightIcon className="w-4 h-4" />
                    Ask a Question
                  </span>
                </Button>
              )}

              <p className="text-xs text-center text-input-placeholder leading-relaxed px-2">
                By accepting, you acknowledge that you have read and agree to the engagement terms above.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default ClientEngagementReviewPage;
