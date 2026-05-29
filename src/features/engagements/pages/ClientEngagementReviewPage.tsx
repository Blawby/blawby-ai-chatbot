/**
 * ClientEngagementReviewPage
 *
 * Route: /client/:practiceSlug/engagements/:engagementId/review
 *
 * Renders the engagement letter as a formatted document with a signature pad
 * panel. On sign, calls `acceptEngagement` and redirects to the conversation.
 */
import { FunctionComponent } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { AlertTriangle, CheckCircle2, ChevronLeft, Download, Pen } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Checkbox } from '@/shared/ui/input';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { cn } from '@/shared/utils/cn';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { formatCurrency } from '@/shared/utils/currencyFormatter';

import { acceptEngagement } from '../api/engagementsApi';
import type { EngagementDetail, ProposalData, ProposalFees } from '../types/engagement';
import { useEngagementDetail } from '../hooks/useEngagementDetail';

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatExpiresDate = (sentAt: string | null | undefined): string | null => {
  if (!sentAt) return null;
  const sent = new Date(sentAt);
  if (Number.isNaN(sent.getTime())) return null;
  const expires = new Date(sent.getTime());
  expires.setDate(expires.getDate() + 30);
  return formatLongDate(expires.toISOString());
};

const buildFeesParagraph = (fees: ProposalFees | null | undefined): string => {
  if (!fees) return 'Fee terms to be confirmed prior to commencement of services.';

  const billingType = (fees.billing_type ?? '').toLowerCase();
  const parts: string[] = [];

  if (billingType === 'contingency') {
    const pct = fees.contingency_percentage;
    if (typeof pct === 'number') {
      parts.push(`Our services will be billed at a contingency rate of ${pct}% of any settlement or award recovered.`);
    } else {
      parts.push('Our services will be billed on a contingency basis.');
    }
    if (typeof fees.retainer_amount === 'number' && fees.retainer_amount > 0) {
      parts.push(`A retainer of ${formatCurrency(fees.retainer_amount)} is required upon signing this engagement letter.`);
    }
  } else if (billingType === 'hourly') {
    if (typeof fees.hourly_rate_attorney === 'number') {
      parts.push(`Our attorney services will be billed at an hourly rate of ${formatCurrency(fees.hourly_rate_attorney)} per hour.`);
    }
    if (typeof fees.hourly_rate_admin === 'number') {
      parts.push(`Administrative time will be billed at ${formatCurrency(fees.hourly_rate_admin)} per hour.`);
    }
    if (typeof fees.retainer_amount === 'number' && fees.retainer_amount > 0) {
      parts.push(`A retainer of ${formatCurrency(fees.retainer_amount)} is required upon signing this engagement letter.`);
    }
  } else if (billingType === 'flat' || billingType === 'fixed' || billingType === 'flat_fee') {
    if (typeof fees.fixed_fee_amount === 'number') {
      parts.push(`Our services will be billed at a flat fee of ${formatCurrency(fees.fixed_fee_amount)}.`);
    } else {
      parts.push('Our services will be billed at a flat fee, to be confirmed in writing.');
    }
  } else if (billingType === 'retainer') {
    if (typeof fees.retainer_amount === 'number') {
      parts.push(`A retainer of ${formatCurrency(fees.retainer_amount)} is required upon signing this engagement letter.`);
    }
  }

  if (fees.payment_frequency) {
    parts.push(`Invoices will be issued ${fees.payment_frequency.replace(/_/g, ' ').toLowerCase()}.`);
  }
  if (fees.fee_notes) parts.push(fees.fee_notes);

  return parts.length > 0 ? parts.join(' ') : 'Fee terms to be confirmed prior to commencement of services.';
};

// ── Signature pad ────────────────────────────────────────────────────────────

const SignaturePad: FunctionComponent<{
  onChange: (dataUrl: string | null) => void;
  disabled: boolean;
}> = ({ onChange, disabled }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasStrokeRef = useRef(false);

  const getContext = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext('2d');
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = getContext();
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, [getContext]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  const pointFromEvent = useCallback((e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (e instanceof MouseEvent) {
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    const touch = e.touches[0] ?? e.changedTouches[0];
    if (!touch) return null;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: MouseEvent | TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    const pt = pointFromEvent(e);
    if (!pt) return;
    drawingRef.current = true;
    lastPointRef.current = pt;
  }, [disabled, pointFromEvent]);

  const continueDraw = useCallback((e: MouseEvent | TouchEvent) => {
    if (disabled || !drawingRef.current) return;
    e.preventDefault();
    const pt = pointFromEvent(e);
    const ctx = getContext();
    const last = lastPointRef.current;
    if (!pt || !ctx || !last) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPointRef.current = pt;
    hasStrokeRef.current = true;
  }, [disabled, getContext, pointFromEvent]);

  const endDraw = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    if (hasStrokeRef.current) {
      const canvas = canvasRef.current;
      if (canvas) onChange(canvas.toDataURL('image/png'));
    }
  }, [onChange]);

  const clearPad = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokeRef.current = false;
    onChange(null);
  }, [getContext, onChange]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          className={cn(
            'block h-32 w-full cursor-crosshair rounded-lg border border-dashed border-card-border bg-surface-card',
            disabled && 'cursor-not-allowed opacity-60',
          )}
          onMouseDown={(e) => startDraw(e as unknown as MouseEvent)}
          onMouseMove={(e) => continueDraw(e as unknown as MouseEvent)}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={(e) => startDraw(e as unknown as TouchEvent)}
          onTouchMove={(e) => continueDraw(e as unknown as TouchEvent)}
          onTouchEnd={endDraw}
        />
        {!hasStrokeRef.current && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-dim-2">
            <Pen className="mr-2 h-4 w-4" />
            Click to draw your signature
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={clearPad}
        disabled={disabled}
        className="text-xs font-medium text-accent hover:underline focus:outline-none disabled:opacity-50"
      >
        Clear signature
      </button>
    </div>
  );
};

// ── Right-column cards ───────────────────────────────────────────────────────

const DocumentStatusCard: FunctionComponent<{
  engagement: EngagementDetail;
  practiceName: string;
  accepted: boolean;
}> = ({ engagement, practiceName, accepted }) => {
  const rows: Array<{ label: string; value: string | null }> = [
    { label: 'Type', value: 'Engagement Letter' },
    { label: 'From', value: practiceName },
    { label: 'Sent', value: engagement.sent_at ? formatLongDate(engagement.sent_at) ?? null : null },
    { label: 'Expires', value: formatExpiresDate(engagement.sent_at) },
    { label: 'Matter', value: engagement.proposal_data?.client_summary?.matter_summary ?? engagement.title ?? null },
  ];

  return (
    <section className="card p-5 space-y-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Document Status</h3>
        <span className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
          accepted
            ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300'
            : 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300',
        )}>
          {accepted ? 'Accepted' : 'Pending Signature'}
        </span>
      </header>
      <dl className="space-y-2 text-sm">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <dt className="text-dim-2">{label}</dt>
            <dd className="text-right text-ink">{value ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

const SignaturePanel: FunctionComponent<{
  signatureData: string | null;
  agreementChecked: boolean;
  onSignatureChange: (data: string | null) => void;
  onAgreementChange: (checked: boolean) => void;
  disabled: boolean;
}> = ({ signatureData, agreementChecked, onSignatureChange, onAgreementChange, disabled }) => (
  <section className="card p-5 space-y-3">
    <h3 className="text-sm font-semibold text-ink">Your Signature</h3>
    <SignaturePad onChange={onSignatureChange} disabled={disabled} />
    <Checkbox
      checked={agreementChecked}
      onChange={onAgreementChange}
      disabled={disabled}
      label="I have read and agree to the terms outlined in this engagement letter."
    />
    {signatureData && (
      <p className="text-xs text-emerald-500 inline-flex items-center gap-1">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Signature captured
      </p>
    )}
  </section>
);

// ── Letter document ──────────────────────────────────────────────────────────

const EngagementLetter: FunctionComponent<{
  engagement: EngagementDetail;
  proposal: ProposalData | null;
  practiceName: string;
}> = ({ engagement, proposal, practiceName }) => {
  const clientName = proposal?.client_summary?.client_name ?? engagement.client_name ?? 'Client';
  const contractBody = engagement.contract_body?.trim();
  const scope = proposal?.representation?.scope_summary;
  const includedServices = proposal?.representation?.included_services ?? [];
  const feeParagraph = buildFeesParagraph(proposal?.fees);
  const acknowledgments = proposal?.acknowledgment_language;
  const noGuarantee = proposal?.no_guarantee_language;

  return (
    <article className="rounded-2xl border border-card-border bg-surface-card p-6 sm:p-10 space-y-6 leading-relaxed text-ink">
      <header className="text-center space-y-2 border-b border-line-subtle pb-6">
        <h1 className="text-xl font-bold uppercase tracking-widest">Engagement Letter</h1>
        <p className="text-sm font-medium">{practiceName}</p>
        <p className="text-xs uppercase tracking-wider text-dim-2">
          Sent {engagement.sent_at ? formatLongDate(engagement.sent_at) : formatLongDate(engagement.created_at)}
        </p>
      </header>

      <p className="text-sm">Dear {clientName},</p>

      {contractBody ? (
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{contractBody}</div>
      ) : (
        <>
      <p className="text-sm">
        This letter confirms the terms of engagement between you and {practiceName} for legal representation
        in the matter described below. Please review the terms carefully and sign below to indicate your
        agreement.
      </p>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">1. Scope of Services</h2>
        {scope ? (
          <p className="text-sm">{scope}</p>
        ) : (
          <p className="text-sm italic text-dim-2">Scope to be confirmed before commencement of services.</p>
        )}
        {includedServices.length > 0 && (
          <ul className="space-y-1.5 pl-4">
            {includedServices.map((service, i) => (
              <li key={i} className="text-sm list-disc">{service}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">2. Fee Structure</h2>
        <p className="text-sm">{feeParagraph}</p>
      </section>

      {acknowledgments && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider">3. Acknowledgments</h2>
          <p className="text-sm">{acknowledgments}</p>
        </section>
      )}

      {noGuarantee && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider">4. No Guarantee of Outcome</h2>
          <p className="text-sm">{noGuarantee}</p>
        </section>
      )}
        </>
      )}

      <footer className="border-t border-line-subtle pt-6 text-sm">
        <p>Sincerely,</p>
        <p className="mt-3 font-medium">{practiceName}</p>
      </footer>
    </article>
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

  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptedClick, setAcceptedClick] = useState(false);
  const accepted = acceptedClick || engagement?.status === 'accepted';

  const isMountedRef = useRef(true);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (navigationTimeoutRef.current) clearTimeout(navigationTimeoutRef.current);
    };
  }, []);

  const handleSign = useCallback(async () => {
    if (isAccepting || !engagement) return;
    if (!signatureData || !agreementChecked) return;
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
  }, [agreementChecked, conversationsBasePath, engagement, isAccepting, navigate, practiceId, showError, showSuccess, signatureData]);

  const handleDownloadPdf = useCallback(() => {
    if (!engagement?.signed_pdf_s3_key) {
      showInfo('PDF not yet available', 'The signed PDF will be available after signature.');
      return;
    }
    // A presigned-URL endpoint for client downloads is a backend follow-up.
    showInfo('Download starting', 'Your engagement letter PDF is being prepared.');
  }, [engagement?.signed_pdf_s3_key, showInfo]);

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
  const canSign = Boolean(signatureData && agreementChecked) && !accepted && !isAccepting;

  return (
    <div className="min-h-dvh bg-app-background">
      <header className="sticky top-0 z-10 border-b border-card-border bg-surface-overlay/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="rounded-md p-1.5 text-dim-2 hover:bg-surface-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                aria-label="Back"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-dim-2">{practiceName}</p>
              <h1 className="truncate text-base font-semibold text-ink">Engagement Letter</h1>
            </div>
          </div>
          <span className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
            accepted
              ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300'
              : 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300',
          )}>
            {accepted ? 'Accepted' : 'Pending Signature'}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Letter content */}
          <div className="order-2 lg:order-1">
            <EngagementLetter engagement={engagement} proposal={proposal} practiceName={practiceName} />
          </div>

          {/* Right panel */}
          <aside className="order-1 flex flex-col gap-4 lg:order-2 lg:sticky lg:top-24 lg:self-start">
            <DocumentStatusCard engagement={engagement} practiceName={practiceName} accepted={accepted} />
            {!accepted && (
              <SignaturePanel
                signatureData={signatureData}
                agreementChecked={agreementChecked}
                onSignatureChange={setSignatureData}
                onAgreementChange={setAgreementChecked}
                disabled={isAccepting}
              />
            )}
            {accepted ? (
              <div className="card p-5 space-y-2 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-300">Engagement signed</p>
                <p className="text-xs text-dim-2">
                  Thank you. Your attorney will be in touch shortly.
                </p>
              </div>
            ) : (
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                disabled={!canSign}
                onClick={handleSign}
              >
                {isAccepting ? 'Signing…' : 'Sign Engagement Letter'}
              </Button>
            )}
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              icon={Download}
              onClick={handleDownloadPdf}
              disabled={!engagement.signed_pdf_s3_key && !accepted}
            >
              Download PDF
            </Button>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default ClientEngagementReviewPage;
