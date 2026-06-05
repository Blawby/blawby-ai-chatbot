import { CheckCircle2 } from 'lucide-preact';
import { Icon } from '@/shared/ui/Icon';
import type { OnboardingDraft } from '../types';

interface PaymentsStepProps {
  draft: OnboardingDraft;
}

/**
 * Step 4 body — Stripe Connect handoff.
 *
 * TODO(stripe): wiring Stripe Connect inside onboarding requires the org to
 * exist before the connected-account API can be called (createConnectedAccount
 * needs a practiceUuid). The existing flow at /practice/:slug/setup mints the
 * account *after* org creation. To keep onboarding linear and non-blocking,
 * step 4 renders an explainer + handoff: payouts get set up immediately after
 * the user lands in their workspace, via the existing StripeCheckpointCard.
 * Reusing that surface unmodified avoids forking Stripe state machines.
 */
export const PaymentsStep = (_: PaymentsStepProps) => {
  return (
    <section className="card" style={{ padding: '28px' }}>
      <h2
        style={{
          fontFamily: 'var(--serif)',
          fontWeight: 400,
          fontSize: '28px',
          lineHeight: 1.15,
          letterSpacing: '-0.01em',
          margin: '0 0 18px',
          color: 'var(--ink)'
        }}
      >
        Payments &amp; payouts
      </h2>

      <div
        className="flex items-center gap-4 rounded-md border p-4"
        style={{
          background: 'var(--card)',
          borderColor: 'var(--rule)',
          borderRadius: 'var(--r-md)'
        }}
      >
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded"
          style={{
            background: 'var(--ink)',
            color: 'var(--paper)',
            fontWeight: 700,
            fontFamily: 'var(--sans)',
            fontSize: '18px'
          }}
          aria-hidden="true"
        >
          S
        </div>
        <div className="min-w-0 flex-1">
          <h4
            style={{
              fontFamily: 'var(--serif)',
              fontWeight: 400,
              fontSize: '18px',
              margin: 0,
              lineHeight: 1.2,
              color: 'var(--ink)'
            }}
          >
            Set up payouts to get paid
          </h4>
          <p className="mt-1 text-sm" style={{ color: 'var(--dim)', maxWidth: '50ch' }}>
            Connect your bank account with Stripe so you can accept payments and
            receive payouts.
          </p>
        </div>
      </div>

      <div
        className="mt-6 rounded-md border p-4 text-sm"
        style={{
          background: 'var(--accent-soft)',
          borderColor: 'color-mix(in oklab, var(--accent) 30%, var(--rule))',
          borderRadius: 'var(--r-md)',
          color: 'var(--ink-2)'
        }}
      >
        You&apos;ll finish Stripe setup from your workspace after onboarding. We&apos;ll
        take you there next so you can start or resume verification.
      </div>

      <ul className="mt-6 flex flex-col gap-3 text-sm" style={{ color: 'var(--ink-2)' }}>
        <li className="flex items-start gap-2">
          <Icon icon={CheckCircle2} className="h-4 w-4 mt-0.5" style={{ color: 'var(--pos)' }} />
          <span>Connect Stripe to receive payouts for your practice</span>
        </li>
        <li className="flex items-start gap-2">
          <Icon icon={CheckCircle2} className="h-4 w-4 mt-0.5" style={{ color: 'var(--pos)' }} />
          <span>Stripe will verify your business and representative details before enabling payouts</span>
        </li>
        <li className="flex items-start gap-2">
          <Icon icon={CheckCircle2} className="h-4 w-4 mt-0.5" style={{ color: 'var(--pos)' }} />
          <span>You can start or finish setup from the workspace banner when you&apos;re ready</span>
        </li>
      </ul>
    </section>
  );
};

/** Step 4 is always continueable — Stripe is handed off post-onboarding. */
export const isPaymentsComplete = (_draft: OnboardingDraft): boolean => true;

export default PaymentsStep;
