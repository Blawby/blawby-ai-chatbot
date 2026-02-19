import { FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { Button } from '@/shared/ui/Button';
import { SegmentedToggle } from '@/shared/ui/input';
import { CheckIcon } from '@heroicons/react/20/solid';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { fetchPlans, type SubscriptionPlan } from '@/shared/utils/fetchPlans';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { i18n } from '@/shared/i18n';
import { usePaymentUpgrade } from '@/shared/hooks/usePaymentUpgrade';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';

type BillingPeriod = 'monthly' | 'yearly';

interface PricingViewProps {
  onUpgrade?: (planName: string) => Promise<boolean | void> | boolean | void;
  className?: string;
}

const PricingView: FunctionComponent<PricingViewProps> = ({ className, onUpgrade }) => {
  const { t } = useTranslation(['pricing', 'common']);
  const { showError } = useToastContext();
  const { submitUpgrade, submitting } = usePaymentUpgrade();
  const { currentPractice } = usePracticeManagement();

  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');

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
    return (
      <div className="flex items-center justify-center p-6 text-center">
        <p className="text-sm text-input-placeholder">Loading…</p>
      </div>
    );
  }

  const handleUpgrade = async (plan: SubscriptionPlan) => {
    const hasYearly = Boolean(plan.stripeYearlyPriceId && plan.yearlyPrice);
    const isYearly = billingPeriod === 'yearly';
    const selectedPlanName = plan.name;
    try {
      if (!selectedPlanName) {
        throw new Error('Missing subscription plan name for upgrade.');
      }
      if (onUpgrade) {
        const result = await onUpgrade(selectedPlanName);
        if (result === false) {
          return;
        }
      }
      await submitUpgrade({
        practiceId: currentPractice?.id || undefined,
        plan: selectedPlanName,
        annual: isYearly && hasYearly
      });
    } catch (error) {
      console.error('Error during upgrade process:', error);
      const message = error instanceof Error ? error.message : t('common:errors.tryAgainLater');
      showError(t('pricing:upgradeFailed'), message);
    }
  };

  const isYearly = billingPeriod === 'yearly';
  const hasYearly = Boolean(plan.stripeYearlyPriceId && plan.yearlyPrice);
  const features = Array.isArray(plan.features)
    ? plan.features.filter((feature): feature is string => typeof feature === 'string' && feature.trim().length > 0)
    : [];
  const monthlyPriceValue = Number.parseFloat(plan.monthlyPrice);
  const yearlyPriceValue = plan.yearlyPrice ? Number.parseFloat(plan.yearlyPrice) : NaN;
  const selectedPriceValue = isYearly && hasYearly
    ? yearlyPriceValue
    : monthlyPriceValue;
  const resolvedPriceValue = Number.isFinite(selectedPriceValue) ? selectedPriceValue : 0;
  const periodLabel = isYearly && hasYearly
    ? t('pricing:billing.yearly')
    : t('pricing:billing.monthly');
  const billingDescription = isYearly && hasYearly
    ? t('pricing:billing.billedAnnually')
    : t('pricing:billing.billedMonthly');
  const monthlyLabel = t('pricing:billing.monthly');
  const annuallyLabel = t('pricing:billing.annually', {
    defaultValue: t('pricing:billing.yearly')
  });
  const yearlyDiscountPercent = (() => {
    if (!hasYearly || !Number.isFinite(monthlyPriceValue) || !Number.isFinite(yearlyPriceValue)) {
      return null;
    }
    const annualizedMonthly = monthlyPriceValue * 12;
    if (annualizedMonthly <= 0 || yearlyPriceValue <= 0 || yearlyPriceValue >= annualizedMonthly) {
      return null;
    }
    const discount = ((annualizedMonthly - yearlyPriceValue) / annualizedMonthly) * 100;
    const roundedDiscount = Math.round(discount);
    return roundedDiscount > 0 ? roundedDiscount : null;
  })();
  const annuallyLabelWithDiscount = yearlyDiscountPercent
    ? `${annuallyLabel} -${yearlyDiscountPercent}%`
    : annuallyLabel;
  const billingOptions: Array<{ value: BillingPeriod; label: string; disabled?: boolean }> = [
    { value: 'monthly', label: monthlyLabel },
    { value: 'yearly', label: annuallyLabelWithDiscount, disabled: !hasYearly }
  ];
  return (
    <div className={`w-full text-input-text ${className ?? ''}`}>
      <div className="mx-auto w-full max-w-xl px-2 pt-2 pb-2 md:px-3 md:pt-3 md:pb-3">
        <div className="flex justify-center pb-1">
          <SegmentedToggle<BillingPeriod>
            className="w-full max-w-[420px]"
            value={billingPeriod}
            options={billingOptions}
            onChange={setBillingPeriod}
            ariaLabel="Payment frequency"
            disabled={submitting}
          />
        </div>

        <div className="mt-6 glass-card px-5 py-6 md:px-7 md:py-8">
          <div className="flex flex-col items-start text-left">
            <h1 data-testid="pricing-page-title" className="text-3xl font-semibold tracking-tight text-input-text md:text-4xl">
              {plan.displayName || plan.name}
            </h1>
            {plan.description ? (
              <p className="mt-4 max-w-xl text-base leading-7 text-input-placeholder">
                {plan.description}
              </p>
            ) : null}
            <div className="mt-7 flex items-end gap-1.5">
              <span className="text-5xl font-semibold tracking-tight text-input-text md:text-6xl">
                {formatCurrency(resolvedPriceValue, plan.currency, i18n.language)}
              </span>
              <span className="pb-1 text-xl font-semibold text-input-placeholder md:pb-2 md:text-2xl">/{periodLabel}</span>
            </div>
          </div>

          <div className="mt-8">
            {features.length > 0 ? (
              <ul className="space-y-3 text-base text-input-placeholder">
                {features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <CheckIcon className="mt-0.5 h-5 w-5 flex-none text-accent-500" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-base text-input-placeholder">{t('pricing:noFeatures')}</p>
            )}
          </div>

          <div className="mt-8">
            <Button
              onClick={() => handleUpgrade(plan)}
              variant="primary"
              size="lg"
              className="h-14 w-full"
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
            <p className="mt-4 text-center text-sm text-input-placeholder">
              {billingDescription}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingView;
