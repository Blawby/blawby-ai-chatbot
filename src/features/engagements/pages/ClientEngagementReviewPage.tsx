/**
 * ClientEngagementReviewPage
 *
 * Route: /client/:practiceSlug/engagements/:engagementId/review
 *
 * Renders the engagement letter as a printed-paper document with a 3-check
 * acknowledgment card and a 200px signature pad. On sign, calls
 * `acceptEngagement` and redirects to the conversation.
 *
 * Layout mirrors `design_handoff_blawby_chat_first/screens/EngagementReview.html`:
 *
 *   [brand topbar] BrandMark · For: {client} · encrypted · audit-logged
 *   [greeting band] Avatar · serif H1 with accent · warm intro
 *   [status strip] Matter · Sent · Fee · Status
 *   [letter] LetterPaper-wrapped EngagementLetter
 *   [AI question card] AIRibbon observation — "Ask a question"
 *   [acknowledgments card] 3 checks (read · scope · guarantee)
 *   [signature card] 200px pad + baseline + audit footer
 *   [decide row] Decline · Accept
 *   [public flow footer] tls · audit-logged + Privacy · Terms · escape decline
 */
import { FunctionComponent } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AlertTriangle, CheckCircle2, ChevronLeft, Download, MessageCircle } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { cn } from '@/shared/utils/cn';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';

import { AIRibbon } from '@/design-system/patterns/AIRibbon';
import { LetterPaper, type LetterPaperFeeRow } from '@/design-system/patterns/LetterPaper';
import { StatStrip, type StatStripCell } from '@/design-system/patterns/StatStrip';

import { acceptEngagement, declineEngagement } from '../api/engagementsApi';
import type { EngagementDetail, ProposalData, ProposalFees } from '../types/engagement';
import { useEngagementDetail } from '../hooks/useEngagementDetail';

import { ClientEngagementBrandTopbar } from '../components/ClientEngagementBrandTopbar';
import { ClientEngagementGreetingBand } from '../components/ClientEngagementGreetingBand';
import {
  ClientEngagementAcknowledgmentsCard,
  type AcknowledgmentChecks,
  type AcknowledgmentKey,
} from '../components/ClientEngagementAcknowledgmentsCard';
import { ClientEngagementSignatureCard } from '../components/ClientEngagementSignatureCard';
import { ClientEngagementDecideRow } from '../components/ClientEngagementDecideRow';
import { ClientEngagementPublicFlowFooter } from '../components/ClientEngagementPublicFlowFooter';

// ── Helpers ──────────────────────────────────────────────────────────────────

const firstNameOf = (full?: string | null): string => {
  if (!full) return '';
  const trimmed = full.trim();
  if (!trimmed) return '';
  const first = trimmed.split(/\s+/)[0];
  return first.includes('@') ? first.split('@')[0] : first;
};

const formatRelative = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '—';
  const diffMs = Date.now() - ts;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatLongDate(iso);
};

const STATUS_LABEL: Record<EngagementDetail['status'], string> = {
  draft: 'Draft',
  sent: 'Awaiting your signature',
  accepted: 'Accepted',
  declined: 'Declined',
};

/** Single-line fee summary for the StatStrip cell. */
const formatFeeSummary = (fees: ProposalFees | null | undefined): { display: string; emphasis?: string } => {
  if (!fees) return { display: '—' };
  const t = (fees.billing_type ?? '').toLowerCase();
  if ((t === 'flat' || t === 'fixed' || t === 'flat_fee') && typeof fees.fixed_fee_amount === 'number') {
    return { display: `${formatCurrency(fees.fixed_fee_amount)} fixed`, emphasis: formatCurrency(fees.fixed_fee_amount) };
  }
  if (t === 'hourly' && typeof fees.hourly_rate_attorney === 'number') {
    return { display: `${formatCurrency(fees.hourly_rate_attorney)}/hr`, emphasis: `${formatCurrency(fees.hourly_rate_attorney)}/hr` };
  }
  if (t === 'retainer' && typeof fees.retainer_amount === 'number') {
    return { display: `${formatCurrency(fees.retainer_amount)} retainer`, emphasis: formatCurrency(fees.retainer_amount) };
  }
  if (t === 'contingency' && typeof fees.contingency_percentage === 'number') {
    return { display: `${fees.contingency_percentage}% contingency`, emphasis: `${fees.contingency_percentage}%` };
  }
  return { display: 'To be confirmed' };
};

/** Build the fee-box rows for LetterPaper.Fee from ProposalFees. */
const buildFeeRows = (fees: ProposalFees | null | undefined): LetterPaperFeeRow[] => {
  if (!fees) return [];
  const rows: LetterPaperFeeRow[] = [];
  const t = (fees.billing_type ?? '').toLowerCase();
  if (t === 'hourly') {
    if (typeof fees.hourly_rate_attorney === 'number') {
      rows.push({ label: 'Attorney hourly rate', amount: `${formatCurrency(fees.hourly_rate_attorney)} / hr` });
    }
    if (typeof fees.hourly_rate_admin === 'number') {
      rows.push({ label: 'Paralegal / admin hourly rate', amount: `${formatCurrency(fees.hourly_rate_admin)} / hr` });
    }
  }
  if (typeof fees.retainer_amount === 'number' && fees.retainer_amount > 0) {
    rows.push({ label: 'Initial retainer · held in trust', amount: formatCurrency(fees.retainer_amount) });
  }
  if (typeof fees.fixed_fee_amount === 'number' && (t === 'flat' || t === 'fixed' || t === 'flat_fee')) {
    rows.push({ label: 'Fixed fee', amount: formatCurrency(fees.fixed_fee_amount) });
  }
  if (typeof fees.contingency_percentage === 'number' && t === 'contingency') {
    rows.push({ label: 'Contingency percentage', amount: `${fees.contingency_percentage}%` });
  }
  if (fees.payment_frequency) {
    rows.push({ label: 'Invoice cadence', amount: fees.payment_frequency.replace(/_/g, ' ') });
  }
  return rows;
};

/** Pull a multi-line firm address from practice details. Returns [] when nothing is known. */
const buildFirmAddress = (details: Record<string, unknown> | null | undefined): string[] => {
  if (!details) return [];
  const parts: string[] = [];
  const address = typeof details.address === 'string' ? details.address.trim() : '';
  const city = typeof details.city === 'string' ? details.city.trim() : '';
  const state = typeof details.state === 'string' ? details.state.trim() : '';
  const postal = typeof details.postalCode === 'string' ? details.postalCode.trim() : '';
  const phone = typeof details.businessPhone === 'string' ? details.businessPhone.trim() : '';
  const email = typeof details.businessEmail === 'string' ? details.businessEmail.trim() : '';
  if (address) parts.push(address);
  const csz = [city, state, postal].filter(Boolean).join(', ');
  if (csz) parts.push(csz);
  if (phone) parts.push(phone);
  if (email) parts.push(email);
  return parts;
};

// ── EngagementLetter (LetterPaper-wrapped) ───────────────────────────────────

const EngagementLetter: FunctionComponent<{
  engagement: EngagementDetail;
  proposal: ProposalData | null;
  practiceName: string;
  firmAddress: readonly string[];
  attorneyFirstName?: string | null;
}> = ({ engagement, proposal, practiceName, firmAddress, attorneyFirstName }) => {
  const clientName = proposal?.client_summary?.client_name ?? engagement.client_name ?? 'Client';
  const contractBody = engagement.contract_body?.trim();
  const scope = proposal?.representation?.scope_summary;
  const includedServices = proposal?.representation?.included_services ?? [];
  const excludedServices = proposal?.representation?.excluded_services ?? [];
  const acknowledgments = proposal?.acknowledgment_language;
  const noGuarantee = proposal?.no_guarantee_language;
  const feeRows = useMemo(() => buildFeeRows(proposal?.fees), [proposal?.fees]);
  const dateLine = engagement.sent_at
    ? formatLongDate(engagement.sent_at)
    : formatLongDate(engagement.created_at);

  // Doc-meta lives in LetterPaper's `address` slot — the canonical doc-meta
  // (Engagement letter · Ref · Date) sits on the right of the letterhead.
  const docMeta = (
    <>
      <div className="font-medium text-[10.5px] uppercase tracking-[0.06em] text-ink">
        Engagement letter
      </div>
      <div className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-dim">
        Ref · {engagement.id.slice(0, 12).toUpperCase()}
      </div>
      <div className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-dim">
        Date · {dateLine}
      </div>
      {firmAddress.length > 0 && (
        <div className="mt-3 font-mono text-[10.5px] uppercase leading-[1.55] tracking-[0.06em] text-dim">
          {firmAddress.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </>
  );

  const firmBlock = attorneyFirstName ? (
    <>
      Law Offices of <em>{attorneyFirstName}</em>
      {practiceName && practiceName !== attorneyFirstName ? ` · ${practiceName}` : ''}
    </>
  ) : (
    practiceName
  );

  return (
    <LetterPaper firm={firmBlock} address={docMeta}>
      <p className="letter-paper-intro">Dear {clientName},</p>

      {contractBody ? (
        <div style={{ whiteSpace: 'pre-wrap' }}>{contractBody}</div>
      ) : (
        <>
          <p>
            This letter confirms the terms of representation between you and {practiceName}.
            Once you sign below, this letter becomes our agreement.
          </p>

          <h2>Scope of representation</h2>
          {scope ? <p>{scope}</p> : (
            <p>
              <LetterPaper.Placeholder>scope summary</LetterPaper.Placeholder>
            </p>
          )}
          {includedServices.length > 0 && (
            <p>This firm will represent you in connection with the following work:</p>
          )}
          {includedServices.length > 0 && (
            <ul style={{ margin: '6px 0 14px 18px', padding: 0 }}>
              {includedServices.map((service, i) => (
                <li key={i} style={{ listStyle: 'disc', margin: '4px 0' }}>{service}</li>
              ))}
            </ul>
          )}
          {excludedServices.length > 0 && (
            <p>
              This engagement does <em>not</em> include {excludedServices.join(', ')}.
              These would require a separate, written agreement.
            </p>
          )}

          <h2>Fees &amp; billing</h2>
          {feeRows.length > 0 ? (
            <LetterPaper.Fee head="Fee summary" rows={feeRows} />
          ) : (
            <p>
              <LetterPaper.Placeholder>fee terms</LetterPaper.Placeholder> will be confirmed prior to commencement of services.
            </p>
          )}

          {acknowledgments && (
            <>
              <h2>Acknowledgments</h2>
              <p>{acknowledgments}</p>
            </>
          )}

          {noGuarantee && (
            <>
              <h2>No guarantee of outcome</h2>
              <p>{noGuarantee}</p>
            </>
          )}
        </>
      )}

      <p style={{ marginTop: 22 }}>
        Please review the acknowledgments below and sign when ready.
      </p>
      <p style={{ marginTop: 14 }}><em>Sincerely,</em></p>

      <div
        style={{
          marginTop: 36,
          paddingTop: 22,
          borderTop: '1px solid var(--rule)',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 48,
        }}
        className="max-sm:!grid-cols-1 max-sm:!gap-7"
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--dim)',
              marginBottom: 24,
            }}
          >
            Attorney
          </span>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 22,
              fontStyle: 'italic',
              color: 'var(--ink)',
              lineHeight: 1,
              paddingBottom: 6,
              borderBottom: '1px solid var(--ink)',
              minHeight: 32,
            }}
          >
            {attorneyFirstName ?? practiceName}
          </div>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--dim)',
              marginTop: 8,
            }}
          >
            For {practiceName}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--dim)',
              marginBottom: 24,
            }}
          >
            Client
          </span>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 14,
              fontStyle: 'italic',
              color: 'var(--dim-2)',
              paddingBottom: 4,
              borderBottom: '1px solid var(--ink)',
              minHeight: 32,
            }}
          >
            <LetterPaper.Placeholder>sign below to accept</LetterPaper.Placeholder>
          </div>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--dim)',
              marginTop: 8,
            }}
          >
            {clientName} · electronic signature
          </span>
        </div>
      </div>
    </LetterPaper>
  );
};

// ── Main page ────────────────────────────────────────────────────────────────

type ClientEngagementReviewPageProps = {
  practiceId: string;
  engagementId: string;
  practiceName: string;
  conversationsBasePath?: string | null;
  onBack?: () => void;
};

export const ClientEngagementReviewPage: FunctionComponent<ClientEngagementReviewPageProps> = ({
  practiceId,
  engagementId,
  practiceName,
  conversationsBasePath,
  onBack,
}) => {
  const { navigate } = useNavigation();
  const { showSuccess, showError, showInfo } = useToastContext();

  const {
    data: engagementData,
    isLoading,
    error: loadError,
  } = useEngagementDetail(practiceId, engagementId);
  const engagement: EngagementDetail | null = engagementData ?? null;

  // Practice details — pre-seeded by usePracticeConfig in the parent route, so
  // this is normally a free store read. We pull firm address + logo for the
  // LetterPaper letterhead and greeting band avatar.
  const { details: practiceDetails } = usePracticeDetails(practiceId, null, true);
  const practiceLogo = (practiceDetails as Record<string, unknown> | null | undefined)?.profileImage as string | null | undefined;
  const firmAddress = useMemo(
    () => buildFirmAddress(practiceDetails as Record<string, unknown> | null | undefined),
    [practiceDetails],
  );

  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [acknowledgments, setAcknowledgments] = useState<AcknowledgmentChecks>({
    read: false,
    scope: false,
    guarantee: false,
  });
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [acceptedClick, setAcceptedClick] = useState(false);
  const [declinedClick, setDeclinedClick] = useState(false);

  const accepted = acceptedClick || engagement?.status === 'accepted';
  const declined = declinedClick || engagement?.status === 'declined';
  const allAcksChecked = acknowledgments.read && acknowledgments.scope && acknowledgments.guarantee;

  const isMountedRef = useRef(true);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (navigationTimeoutRef.current) clearTimeout(navigationTimeoutRef.current);
    };
  }, []);

  const handleAckToggle = useCallback((key: AcknowledgmentKey, checked: boolean) => {
    setAcknowledgments((prev) => ({ ...prev, [key]: checked }));
  }, []);

  const handleSign = useCallback(async () => {
    if (isAccepting || !engagement) return;
    if (!signatureData || !allAcksChecked) return;
    setIsAccepting(true);
    try {
      const updated = await acceptEngagement(practiceId, engagement.id);
      if (!updated.matter_id) {
        throw new Error('Engagement was accepted, but the backend response did not include a matter_id.');
      }
      if (!isMountedRef.current) return;
      setAcceptedClick(true);
      showSuccess('Engagement signed', 'Your engagement is confirmed. Redirecting…');
      const conversationId = updated.conversation_id ?? engagement.conversation_id;
      if (conversationId && conversationsBasePath) {
        navigationTimeoutRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          navigate(`${conversationsBasePath}/${encodeURIComponent(conversationId)}`);
        }, 1200);
      }
    } catch (err) {
      if (isMountedRef.current) {
        showError('Signing failed', err instanceof Error ? err.message : 'Could not sign the engagement letter.');
      }
    } finally {
      if (isMountedRef.current) setIsAccepting(false);
    }
  }, [allAcksChecked, conversationsBasePath, engagement, isAccepting, navigate, practiceId, showError, showSuccess, signatureData]);

  const handleDecline = useCallback(async () => {
    if (isDeclining || !engagement || accepted || declined) return;
    setIsDeclining(true);
    try {
      await declineEngagement(practiceId, engagement.id);
      if (!isMountedRef.current) return;
      setDeclinedClick(true);
      showSuccess('Engagement declined', 'The firm has been notified. You can close this page.');
    } catch (err) {
      if (isMountedRef.current) {
        showError('Decline failed', err instanceof Error ? err.message : 'Could not decline the engagement letter.');
      }
    } finally {
      if (isMountedRef.current) setIsDeclining(false);
    }
  }, [engagement, isDeclining, accepted, declined, practiceId, showError, showSuccess]);

  const handleDownloadPdf = useCallback(() => {
    if (!engagement?.signed_pdf_s3_key) {
      showInfo('PDF not yet available', 'The signed PDF will be available after signature.');
      return;
    }
    // TODO(backend): expose a presigned-URL endpoint for client engagement PDF downloads.
    showInfo('Download starting', 'Your engagement letter PDF is being prepared.');
  }, [engagement?.signed_pdf_s3_key, showInfo]);

  /**
   * Ask-a-question handoff — navigates back to the firm conversation when one
   * exists. When no conversation exists yet, we show an info toast.
   *
   * TODO(backend): expose `POST /api/engagement-contracts/.../questions` so a
   * client can ask without leaving the review page. The chip should then open
   * an inline composer here instead of navigating away.
   */
  const handleAskQuestion = useCallback(() => {
    const convoId = engagement?.conversation_id;
    if (convoId && conversationsBasePath) {
      navigate(`${conversationsBasePath}/${encodeURIComponent(convoId)}`);
      return;
    }
    showInfo(
      'Send your question by email',
      'We will set up an in-page composer for engagement questions in the next release. For now, please reach out by email.',
    );
  }, [engagement?.conversation_id, conversationsBasePath, navigate, showInfo]);

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
        <div className="card max-w-md w-full p-8 text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto" />
          <h1 className="text-lg font-bold text-ink">Unable to load engagement</h1>
          <p className="text-sm text-dim-2">{loadError ?? 'This engagement could not be found.'}</p>
        </div>
      </div>
    );
  }

  const proposal = engagement.proposal_data ?? null;
  const clientFullName = proposal?.client_summary?.client_name ?? engagement.client_name ?? 'Client';
  const clientFirst = firstNameOf(clientFullName);
  const attorneyFirst = firstNameOf(engagement.created_by ?? null) || firstNameOf(practiceName);
  const canSign = Boolean(signatureData && allAcksChecked) && !accepted && !declined && !isAccepting;
  const todayLong = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const matterTitle =
    proposal?.client_summary?.matter_summary
    ?? engagement.title
    ?? engagement.proposal_data?.representation?.scope_summary?.slice(0, 60)
    ?? 'Engagement';
  const feeSummary = formatFeeSummary(proposal?.fees);
  const sentDisplay = engagement.sent_at ? formatRelative(engagement.sent_at) : 'Not sent yet';
  const statusLabel = accepted ? STATUS_LABEL.accepted : declined ? STATUS_LABEL.declined : STATUS_LABEL[engagement.status];

  const statusCells: StatStripCell[] = [
    { label: 'Matter', value: matterTitle },
    { label: 'Sent', value: sentDisplay },
    {
      label: 'Fee',
      value: feeSummary.emphasis
        ? (
          <>
            <em className="text-accent" style={{ fontStyle: 'italic' }}>{feeSummary.emphasis}</em>
            {feeSummary.display.replace(feeSummary.emphasis, '') ? (
              <span className="ml-1">{feeSummary.display.replace(feeSummary.emphasis, '')}</span>
            ) : null}
          </>
        )
        : feeSummary.display,
    },
    { label: 'Status', value: statusLabel },
  ];

  return (
    <div
      className="min-h-dvh bg-app-background"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 900px 600px at 80% -10%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 60%), radial-gradient(rgba(15,30,54,0.025) 1px, transparent 1.2px)',
        backgroundSize: 'auto, 3px 3px',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Optional back affordance — preserved from previous implementation. */}
      {onBack && (
        <div className="mx-auto flex max-w-[900px] items-center px-4 pt-3 sm:px-8">
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-dim-2 hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            aria-label="Back"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        </div>
      )}

      <ClientEngagementBrandTopbar recipientName={clientFullName} />

      <ClientEngagementGreetingBand
        clientFirstName={clientFirst}
        practiceName={practiceName}
        practiceLogo={practiceLogo ?? null}
        attorneyFirstName={attorneyFirst}
        kicker={engagement.sent_at ? `Sent ${sentDisplay}` : undefined}
      />

      {/* Status strip — Matter · Sent · Fee · Status (4 cells; StatStrip grid
          auto-fills). Wrapped to constrain to the canonical 900px column. */}
      <div className="mx-auto mb-6 max-w-[900px] px-4 sm:px-8">
        <StatStrip cells={statusCells} />
      </div>

      {/* Bottom padding (mobile): adds env(safe-area-inset-bottom) on top of
          the ~96px sticky Accept bar so the last actionable card clears the
          iOS home indicator. Reset to 0 on sm: where the bar is hidden. */}
      <main className="client-engagement-review-main pb-24 sm:pb-0">
        {/* Letter */}
        <section className="mx-auto mb-8 max-w-[900px] px-3 sm:px-4">
          <EngagementLetter
            engagement={engagement}
            proposal={proposal}
            practiceName={practiceName}
            firmAddress={firmAddress}
            attorneyFirstName={attorneyFirst}
          />
        </section>

        {/* AI question prompt — inline observation ribbon. Only meaningful while
            the document is actionable; once accepted/declined we don't surface
            the chip. */}
        {!accepted && !declined && (
          <div className="mx-auto mb-6 max-w-[900px] px-4 sm:px-8">
            <AIRibbon
              variant="observation"
              title="Want to ask a question?"
              body={
                <span className="italic">
                  &ldquo;What happens if we settle before the first court date?&rdquo; — I can answer in plain English and loop {attorneyFirst} in if it changes anything.
                </span>
              }
              actions={[
                {
                  id: 'ask',
                  label: 'Ask a question ↗',
                  variant: 'primary',
                  onClick: handleAskQuestion,
                },
              ]}
            />
          </div>
        )}

        {/* Acknowledgments + signature + decide — only while actionable. */}
        {!accepted && !declined && (
          <>
            <div className="mx-auto mb-6 max-w-[900px] px-4 sm:px-8">
              <ClientEngagementAcknowledgmentsCard
                checks={acknowledgments}
                onToggle={handleAckToggle}
                disabled={isAccepting || isDeclining}
              />
            </div>

            <div className="mx-auto mb-6 max-w-[900px] px-4 sm:px-8">
              <ClientEngagementSignatureCard
                signatureData={signatureData}
                todayLong={todayLong}
                onChange={setSignatureData}
                disabled={isAccepting || isDeclining}
              />
            </div>

            <div className="mx-auto mb-6 max-w-[900px] px-4 sm:px-8">
              <ClientEngagementDecideRow
                attorneyName={attorneyFirst}
                practiceName={practiceName}
                description={`On accept, your matter opens with ${attorneyFirst}, the engagement letter is countersigned automatically, and any required initial deposit is requested. You'll receive a portal link by email within a minute.`}
                disabled={isAccepting || isDeclining}
                canSign={canSign}
                isAccepting={isAccepting}
                onAccept={handleSign}
                onDecline={handleDecline}
              />
            </div>
          </>
        )}

        {/* Accepted state — replaces the sign/decline stack. */}
        {accepted && (
          <div className="mx-auto mb-6 max-w-[900px] px-4 sm:px-8">
            <div className="card flex flex-col items-center gap-2 px-6 py-8 text-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
              <p className="font-serif text-[22px] font-normal leading-[1.15] text-ink">Engagement signed.</p>
              <p className="text-[14px] text-dim-2">
                Thank you. {attorneyFirst} will be in touch shortly.
              </p>
              <Button
                type="button"
                variant="secondary"
                size="md"
                icon={Download}
                onClick={handleDownloadPdf}
                disabled={!engagement.signed_pdf_s3_key}
                className="mt-2"
              >
                Download PDF
              </Button>
            </div>
          </div>
        )}

        {/* Declined state. */}
        {declined && !accepted && (
          <div className="mx-auto mb-6 max-w-[900px] px-4 sm:px-8">
            <div className="card flex flex-col items-center gap-2 px-6 py-8 text-center">
              <MessageCircle className="h-9 w-9 text-dim-2" />
              <p className="font-serif text-[22px] font-normal leading-[1.15] text-ink">Engagement declined.</p>
              <p className="text-[14px] text-dim-2">
                We&apos;ve let {attorneyFirst} know. You can close this page.
              </p>
            </div>
          </div>
        )}
      </main>

      <ClientEngagementPublicFlowFooter
        privacyHref="https://blawby.com/privacy"
        termsHref="https://blawby.com/terms"
        onDecline={!accepted && !declined ? handleDecline : undefined}
      />

      {/* Mobile-first sticky bottom Accept bar — only shown while actionable +
          on small screens. Honors env(safe-area-inset-bottom) so the button
          clears the iOS home indicator. When the user can't sign yet
          (missing acks or sig) the button scrolls to the acknowledgments
          card so they can fix what's missing without hunting for it.
          (Button size="lg" = 16+15+16 = ~47px tall — meets 44px touch target.) */}
      {!accepted && !declined && (
        <div
          className={cn(
            'fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-card/95 px-4 pt-3 backdrop-blur-xl sm:hidden',
          )}
          style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
        >
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={isAccepting}
            onClick={() => {
              if (canSign) {
                void handleSign();
                return;
              }
              document.getElementById('ack-card-heading')?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
            }}
          >
            {isAccepting
              ? 'Signing…'
              : canSign
                ? `Accept & engage ${attorneyFirst} ↗`
                : 'Sign & accept'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default ClientEngagementReviewPage;
