import { useEffect, useMemo } from 'preact/hooks';
import { InfoCard } from '../components/InfoCard';
import type { StripeConnectStatus } from '../types';

interface StripeOnboardingStepProps {
  status?: StripeConnectStatus | null;
  loading?: boolean;
  clientSecret?: string | null;
  onActionLoadingChange?: (loading: boolean) => void;
  showIntro?: boolean;
  showInfoCard?: boolean;
  showStatus?: boolean;
}

export function StripeOnboardingStep({
  status,
  loading = false,
  clientSecret: _clientSecret,
  onActionLoadingChange,
  showIntro = true,
  showInfoCard = true,
  showStatus = true
}: StripeOnboardingStepProps) {
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

  const actionLoading = loading;

  useEffect(() => {
    onActionLoadingChange?.(actionLoading);
  }, [actionLoading, onActionLoadingChange]);

  return (
    <div className="space-y-6">
      {showIntro && (
        <div className="text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Start Stripe onboarding to verify your trust account and enable payouts.
          </p>
        </div>
      )}

      {showInfoCard && (
        <InfoCard
          variant="blue"
          icon="💳"
          title="Connect with Stripe"
        >
          <p className="text-center text-sm">
            Secure payment processing for your legal practice
          </p>
        </InfoCard>
      )}

      {showStatus && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-2 bg-white dark:bg-gray-900/40">
          {statusItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
