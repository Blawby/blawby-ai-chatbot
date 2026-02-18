import { FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { Button } from '@/shared/ui/Button';
import { PlusIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePaymentUpgrade } from '@/shared/hooks/usePaymentUpgrade';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { PlanFeaturesList, type PlanFeature } from '@/features/settings/components/PlanFeaturesList';
import { fetchPlans, type SubscriptionPlan } from '@/shared/utils/fetchPlans';
import { getCurrentSubscription } from '@/shared/lib/apiClient';

interface PricingViewProps {
  onUpgrade?: (tier: 'business') => Promise<boolean | void> | boolean | void;
  className?: string;
}

const MANAGED_STATUSES = new Set(['active', 'trialing', 'paused', 'past_due', 'unpaid']);

const formatPlanPrice = (plan: SubscriptionPlan): string => {
  const monthly = plan.monthlyPrice ? `$${plan.monthlyPrice}/mo` : null;
  const yearly = plan.yearlyPrice ? `$${plan.yearlyPrice}/yr` : null;
  if (monthly && yearly) return `${monthly} or ${yearly}`;
  if (monthly) return monthly;
  if (yearly) return yearly;
  return 'Pricing unavailable';
};

const mapFeatures = (plan: SubscriptionPlan): PlanFeature[] => {
  if (!Array.isArray(plan.features)) return [];
  return plan.features
    .filter((feature): feature is string => typeof feature === 'string' && feature.trim().length > 0)
    .map((feature) => ({ icon: PlusIcon, text: feature }));
};

const PricingView: FunctionComponent<PricingViewProps> = ({ className, onUpgrade }) => {
  const { t } = useTranslation(['pricing', 'common']);
  const { navigate } = useNavigation();
  const { currentPractice } = usePracticeManagement();
  const { openBillingPortal } = usePaymentUpgrade();
  const { showError } = useToastContext();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<string>('none');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isBillingLoading, setIsBillingLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    (async () => {
      try {
        const [availablePlans, subscription] = await Promise.all([
          fetchPlans(),
          getCurrentSubscription({ signal: controller.signal })
        ]);

        if (!mounted) return;

        const visiblePlans = availablePlans.filter((plan) => plan.isActive && plan.isPublic);
        if (visiblePlans.length === 0) {
          throw new Error('No active public subscription plans were returned by /api/subscriptions/plans.');
        }

        if (subscription && !subscription.plan?.id) {
          throw new Error('Current subscription exists but is missing plan.id in /api/subscriptions/current response.');
        }

        setPlans(visiblePlans);
        setCurrentPlanId(subscription?.plan?.id ?? null);
        setCurrentStatus((subscription?.status ?? 'none').toLowerCase());
        setLoadError(null);
      } catch (error) {
        if (controller.signal.aborted || !mounted) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-input-placeholder">Loading pricing data...</div>;
  }

  if (loadError) {
    throw new Error(loadError);
  }

  const handleUpgrade = async (plan: SubscriptionPlan) => {
    try {
      if (onUpgrade) {
        const result = await onUpgrade('business');
        if (result === false) {
          return;
        }
      }
      navigate(`/cart?planId=${encodeURIComponent(plan.id)}`);
    } catch (error) {
      console.error('Error during upgrade process:', error);
      const message = error instanceof Error ? error.message : t('common:errors.tryAgainLater');
      showError(t('pricing:upgradeFailed'), message);
    }
  };

  const handleManageBilling = async () => {
    try {
      const practiceId = currentPractice?.id;
      if (!practiceId) {
        throw new Error('No current practice selected for billing management.');
      }
      setIsBillingLoading(true);
      await openBillingPortal({ practiceId });
    } catch (error) {
      console.error('Failed to open billing portal:', error);
      const message = error instanceof Error ? error.message : t('common:errors.tryAgainLater');
      showError(t('pricing:billing.unableOpenPortal'), message);
    } finally {
      setIsBillingLoading(false);
    }
  };

  return (
    <div className={`min-h-screen bg-transparent text-input-text ${className ?? ''}`}>
      <div className="relative p-6 border-b border-line-glass/30">
        <div className="flex flex-col items-center space-y-6">
          <h1 data-testid="pricing-page-title" className="text-2xl font-semibold text-input-text">{t('modal.title')}</h1>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full mx-auto">
          {plans.map((plan) => {
            const isCurrentPlan = Boolean(currentPlanId && plan.id === currentPlanId);
            const isManagedCurrentPlan = isCurrentPlan && MANAGED_STATUSES.has(currentStatus);
            const features = mapFeatures(plan);

            return (
              <div key={plan.id} className="relative glass-card p-6 transition-all duration-200 flex flex-col h-full">
                <div className="mb-6">
                  <h3 className="text-2xl font-bold mb-2 text-input-text">{plan.displayName || plan.name}</h3>
                  <div className="text-3xl font-bold mb-2 text-input-text">{formatPlanPrice(plan)}</div>
                  <p className="text-input-placeholder">{plan.description || 'Stripe-backed subscription plan'}</p>
                </div>
                <div className="mb-6">
                  {isManagedCurrentPlan ? (
                    <Button onClick={handleManageBilling} variant="secondary" size="lg" className="w-full" disabled={isBillingLoading}>
                      {isBillingLoading ? t('modal.openingBilling') : t('modal.manageBilling')}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleUpgrade(plan)}
                      disabled={isCurrentPlan}
                      variant={isCurrentPlan ? 'secondary' : 'primary'}
                      size="lg"
                      className="w-full"
                    >
                      {isCurrentPlan ? t('modal.currentPlan') : t('plans.business.buttonText')}
                    </Button>
                  )}
                </div>
                {features.length > 0 && (
                  <div className="space-y-3 flex-1">
                    <PlanFeaturesList features={features} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="border-t border-line-glass/30 px-6 py-2 mt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <UserGroupIcon className="w-4 h-4 text-input-placeholder" />
              <span className="text-sm text-input-placeholder">{t('footer.enterprise.question')}</span>
              <Button variant="link" size="sm" className="px-0 py-0 h-auto" onClick={() => navigate('/enterprise')}>
                {t('footer.enterprise.link')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingView;
