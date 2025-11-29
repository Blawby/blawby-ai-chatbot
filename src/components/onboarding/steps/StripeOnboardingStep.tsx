/**
 * Stripe Onboarding Step Component
 */

import { useEffect, useMemo, useState } from 'preact/hooks';
import { ConnectAccountOnboarding, ConnectComponentsProvider } from '@stripe/react-connect-js';
import { loadConnectAndInitialize, type ConnectInstance } from '@stripe/connect-js';
import { InfoCard } from '../atoms/InfoCard';
import { OnboardingActions } from '../molecules/OnboardingActions';
import type { StripeConnectStatus } from '../types';

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

interface StripeOnboardingStepProps {
  onContinue: () => void;
  onBack: () => void;
  onSkip?: () => void;
  status?: StripeConnectStatus | null;
  loading?: boolean;
  clientSecret?: string | null;
}

export function StripeOnboardingStep({
  onContinue,
  onBack,
  onSkip,
  status,
  loading = false,
  clientSecret
}: StripeOnboardingStepProps) {
  const [connectInstance, setConnectInstance] = useState<ConnectInstance | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let instance: ConnectInstance | null = null;

    if (typeof window === 'undefined') {
      return () => {
        instance?.destroy?.();
      };
    }

    if (!clientSecret || !STRIPE_PUBLISHABLE_KEY) {
      setConnectInstance(null);
      setConnectLoading(false);
      if (!STRIPE_PUBLISHABLE_KEY) {
        setConnectError('Stripe publishable key is not configured.');
      } else {
        setConnectError(null);
      }
      return () => {
        instance?.destroy?.();
      };
    }

    setConnectError(null);
    setConnectLoading(true);
    setConnectInstance(null);

    loadConnectAndInitialize({
      publishableKey: STRIPE_PUBLISHABLE_KEY,
      fetchClientSecret: async () => clientSecret,
    })
      .then((connect) => {
        if (cancelled) {
          connect.destroy();
          return;
        }
        instance = connect;
        setConnectInstance(connect);
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to initialize Stripe Connect';
          setConnectError(message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setConnectLoading(false);
        }
      });

    return () => {
      cancelled = true;
      instance?.destroy?.();
    };
  }, [clientSecret]);

  const statusItems = useMemo(
    () => [
      {
        label: 'Stripe account',
        value: status?.stripe_account_id ? 'Provisioned' : 'Not created yet'
      },
      {
        label: 'Charges',
        value: status?.charges_enabled ? 'Enabled' : 'Pending verification'
      },
      {
        label: 'Payouts',
        value: status?.payouts_enabled ? 'Enabled' : 'Pending verification'
      }
    ],
    [status]
  );

  const showConnectEmbed = Boolean(clientSecret && connectInstance && !connectError);
  const showPublishableKeyWarning = !STRIPE_PUBLISHABLE_KEY;
  const actionLoading = loading || connectLoading;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Start Stripe onboarding to verify your trust account and enable payouts.
        </p>
      </div>
      
      <InfoCard
        variant="blue"
        icon="💳"
        title="Connect with Stripe"
      >
        <p className="text-center text-sm">
          Secure payment processing for your legal practice
        </p>
      </InfoCard>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-2 bg-white dark:bg-gray-900/40">
        {statusItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {item.value}
            </span>
          </div>
        ))}
        {clientSecret && (
          <p className="text-xs text-gray-500 dark:text-gray-400 pt-2">
            A secure Stripe onboarding session is ready. Complete the embedded form to finish verification.
          </p>
        )}
      </div>

      {showPublishableKeyWarning && (
        <div className="rounded-lg border border-red-500 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          Stripe publishable key is not configured. Set VITE_STRIPE_PUBLISHABLE_KEY to enable embedded onboarding.
        </div>
      )}

      {connectError && (
        <div className="rounded-lg border border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 p-4 text-sm text-yellow-800 dark:text-yellow-200">
          {connectError}
        </div>
      )}

      {showConnectEmbed && connectInstance && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/40 p-4">
          <ConnectComponentsProvider connectInstance={connectInstance}>
            <ConnectAccountOnboarding />
          </ConnectComponentsProvider>
        </div>
      )}

      <OnboardingActions
        onContinue={onContinue}
        onBack={onBack}
        onSkip={onSkip}
        loading={actionLoading}
      />
    </div>
  );
}
