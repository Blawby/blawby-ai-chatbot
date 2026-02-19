import { FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { Button } from '@/shared/ui/Button';
import { Switch } from '@/shared/ui/input';
import { PlusIcon } from '@heroicons/react/24/outline';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { PlanFeaturesList, type PlanFeature } from '@/features/settings/components/PlanFeaturesList';
import { fetchPlans, type SubscriptionPlan } from '@/shared/utils/fetchPlans';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { i18n } from '@/shared/i18n';
import { usePaymentUpgrade } from '@/shared/hooks/usePaymentUpgrade';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';

interface PricingViewProps {
  onUpgrade?: (priceId: string) => Promise<boolean | void> | boolean | void;
  className?: string;
}

const mapFeatures = (plan: SubscriptionPlan): PlanFeature[] => {
  if (!Array.isArray(plan.features)) return [];
  return plan.features
    .filter((feature): feature is string => typeof feature === 'string' && feature.trim().length > 0)
    .map((feature) => ({ icon: PlusIcon, text: feature }));
};

const PricingView: FunctionComponent<PricingViewProps> = ({ className, onUpgrade }) => {
  const { t } = useTranslation(['pricing', 'common']);
  const { showError } = useToastContext();
  const { submitUpgrade, submitting } = usePaymentUpgrade();
  const { currentPractice } = usePracticeManagement();

  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isYearly, setIsYearly] = useState(false);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    (async () => {
      try {
        const availablePlans = await fetchPlans({ signal: controller.signal });

        if (!mounted) return;

        const visiblePlans = availablePlans.filter((plan) => plan.isActive && plan.isPublic);
        if (visiblePlans.length === 0) {
          throw new Error('No active public subscription plans were returned by /api/subscriptions/plans.');
        }
        if (visiblePlans.length !== 1) {
          throw new Error(`Expected exactly 1 active public plan but received ${visiblePlans.length}.`);
        }

        setPlan(visiblePlans[0]);
        setLoadError(null);
      } catch (error) {
        if (controller.signal.aborted || !mounted) return;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[PricingView] Failed to load plans:', error);
        setLoadError(errorMsg);
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  if (loadError) {
    return (
      <div className="flex items-center justify-center p-6 text-center">
        <div className="space-y-4">
          <p className="text-lg font-semibold text-red-500">{t('common:errors.tryAgainLater')}</p>
          <p className="text-sm text-input-placeholder">{t('pricing:errorGeneric')}</p>
        </div>
      </div>
    );
  }
  if (!plan) {
    return null;
  }

  const handleUpgrade = async (plan: SubscriptionPlan) => {
    const hasYearly = Boolean(plan.stripeYearlyPriceId && plan.yearlyPrice);
    const selectedPriceId = isYearly && hasYearly
      ? plan.stripeYearlyPriceId
      : plan.stripeMonthlyPriceId;
    try {
      if (!selectedPriceId) {
        throw new Error('Missing Stripe price ID for the selected billing period.');
      }
      if (onUpgrade) {
        const result = await onUpgrade(selectedPriceId);
        if (result === false) {
          return;
        }
      }
      await submitUpgrade({
        practiceId: currentPractice?.id || undefined,
        plan: selectedPriceId,
        annual: isYearly && hasYearly
      });
    } catch (error) {
      console.error('Error during upgrade process:', error);
      const message = error instanceof Error ? error.message : t('common:errors.tryAgainLater');
      showError(t('pricing:upgradeFailed'), message);
    }
  };

  const features = mapFeatures(plan);
  const hasYearly = Boolean(plan.stripeYearlyPriceId && plan.yearlyPrice);
  const monthlyPriceValue = Number.parseFloat(plan.monthlyPrice);
  const yearlyPriceValue = plan.yearlyPrice ? Number.parseFloat(plan.yearlyPrice) : NaN;
  const selectedPriceValue = isYearly && hasYearly ? yearlyPriceValue : monthlyPriceValue;
  const resolvedPriceValue = Number.isFinite(selectedPriceValue) ? selectedPriceValue : 0;
  const billingDescription = isYearly && hasYearly
    ? t('pricing:billing.billedAnnually')
    : t('pricing:billing.billedMonthly');
  const planImageSrc = plan.imageUrl && plan.imageUrl.trim().length > 0
    ? plan.imageUrl
    : '/blawby-favicon-iframe.png';

  return (
    <div className={`w-full text-input-text ${className ?? ''}`}>
      <div className="w-full px-1 pt-1 pb-2 md:px-2 md:pt-2 md:pb-3">
        <div className="flex flex-col items-center text-center">
          <img
            src={planImageSrc}
            alt={plan.displayName || plan.name}
            className="h-12 w-12 rounded-xl object-cover"
          />
          <h1 data-testid="pricing-page-title" className="mt-5 text-4xl font-semibold tracking-tight text-input-text">
            {plan.displayName || plan.name}
          </h1>
          {plan.description ? (
            <p className="mt-3 max-w-md text-lg leading-7 text-input-placeholder">
              {plan.description}
            </p>
          ) : null}
        </div>

        <div className="mt-7 rounded-3xl border border-line-glass/30 bg-surface-glass/20 p-4 md:p-5">
          {features.length > 0 ? (
            <PlanFeaturesList features={features} />
          ) : (
            <p className="text-sm text-input-placeholder">{t('pricing:noFeatures')}</p>
          )}
        </div>

        <div className="mt-5 rounded-3xl border border-line-glass/30 bg-surface-glass/20 px-4 py-2 md:px-5">
          <Switch
            id="pricing-billing-period"
            label={`${t('pricing:billing.monthly')} / ${t('pricing:billing.yearly')}`}
            description={billingDescription}
            value={hasYearly ? isYearly : false}
            onChange={(nextValue) => setIsYearly(hasYearly ? nextValue : false)}
            disabled={!hasYearly || submitting}
          />
        </div>

        <div className="mt-7">
          <Button
            onClick={() => handleUpgrade(plan)}
            variant="primary"
            size="lg"
            className="h-14 w-full rounded-full"
            disabled={submitting}
          >
            {submitting
              ? t('pricing:modal.openingBilling')
              : t('pricing:upgradeButton', {
                  price: formatCurrency(
                    resolvedPriceValue,
                    plan.currency,
                    i18n.language
                  )
                })}
          </Button>
          <p className="mt-3 text-center text-sm text-input-placeholder">
            {billingDescription}
          </p>
        </div>
      </div>
    </div>
  );
};

export default PricingView;
