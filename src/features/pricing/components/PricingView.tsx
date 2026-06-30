import { FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { Button } from '@/shared/ui/Button';
import { Check } from 'lucide-preact';

import { Icon } from '@/shared/ui/Icon';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { fetchPlans, type SubscriptionPlan } from '@/shared/utils/fetchPlans';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { i18n } from '@/shared/i18n';
import { usePaymentUpgrade } from '@/shared/hooks/usePaymentUpgrade';

type BillingPeriod = 'monthly' | 'yearly';

interface PricingViewProps {
  onUpgrade?: (planName: string) => Promise<boolean | void> | boolean | void;
  practiceId?: string | null;
  planOverride?: SubscriptionPlan | null;
  variant?: 'default' | 'onboarding';
  className?: string;
}

const DISPLAY_PLAN_NAME = 'blawby_practice';

const PricingView: FunctionComponent<PricingViewProps> = ({
  className,
  onUpgrade,
  practiceId = null,
  planOverride = null,
  variant = 'default'
}) => {
  const { t } = useTranslation(['pricing', 'common']);
  const { showError } = useToastContext();
  const { submitUpgrade, submitting } = usePaymentUpgrade();

  const [plan, setPlan] = useState<SubscriptionPlan | null>(planOverride);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');

  useEffect(() => {
    if (planOverride) {
      setPlan(planOverride);
      setLoadError(null);
      return;
    }

    let mounted = true;
    const controller = new AbortController();

    (async () => {
      try {
        const availablePlans = await fetchPlans({ signal: controller.signal });

        if (!mounted) return;

        const visiblePlans = availablePlans.filter((plan) => plan.isActive && plan.isPublic);
        const displayPlan = visiblePlans.find((candidate) => candidate.name === DISPLAY_PLAN_NAME);

        if (!displayPlan) {
          throw new Error(
            `Pricing page requires public plan "${DISPLAY_PLAN_NAME}" but received: ${visiblePlans.map((candidate) => candidate.name).join(', ')}.`
          );
        }

        setPlan(displayPlan);
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
  }, [planOverride]);

  if (loadError) {
    return (
      <div className="flex items-center justify-center p-6 text-center">
        <div className="space-y-4">
          <p className="text-lg font-semibold text-red-500">{t('common:errors.tryAgainLater')}</p>
          <p className="text-sm text-dim-2">{t('pricing:errorGeneric')}</p>
        </div>
      </div>
    );
  }
  if (!plan) {
    return (
      <div className="flex items-center justify-center p-6 text-center">
        <p className="text-sm text-dim-2">{t('pricing:loading')}</p>
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
        practiceId: practiceId ?? undefined,
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
  const hasMonthlyPrice = Boolean(plan.monthlyPrice);
  const monthlyPriceValue = plan.monthlyPrice ? Number.parseFloat(plan.monthlyPrice) : NaN;
  const yearlyPriceValue = plan.yearlyPrice ? Number.parseFloat(plan.yearlyPrice) : NaN;
  const selectedPriceValue = isYearly && hasYearly
    ? yearlyPriceValue
    : monthlyPriceValue;
  const hasDisplayPrice = Number.isFinite(selectedPriceValue);
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
  const showBillingSelector = hasMonthlyPrice && hasYearly;
  const isOnboarding = variant === 'onboarding';
  const billingToggleButtonClass = (active: boolean) => [
    'inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-50',
    active
      ? 'bg-[var(--ink)] text-[var(--paper)]'
      : 'text-dim-2 hover:bg-[var(--paper)] hover:text-ink'
  ].join(' ');

  return (
    <div className={`w-full text-ink ${className ?? ''}`}>
      <div className={`mx-auto w-full max-w-xl ${isOnboarding ? '' : 'px-2 pt-2 pb-2 md:px-3 md:pt-3 md:pb-3'}`}>
        {showBillingSelector ? (
          <div className={`flex justify-center ${isOnboarding ? 'pb-0' : 'pb-1'}`}>
            <div
              role="group"
              aria-label="Payment frequency"
              className="inline-flex rounded-full border border-[var(--rule)] bg-[var(--card)]/40 p-1"
            >
              <button
                type="button"
                aria-pressed={billingPeriod === 'monthly'}
                disabled={submitting}
                className={billingToggleButtonClass(billingPeriod === 'monthly')}
                onClick={() => setBillingPeriod('monthly')}
              >
                {monthlyLabel}
              </button>
              <button
                type="button"
                aria-pressed={billingPeriod === 'yearly'}
                disabled={submitting}
                className={billingToggleButtonClass(billingPeriod === 'yearly')}
                onClick={() => setBillingPeriod('yearly')}
              >
                <span>{annuallyLabel}</span>
                {yearlyDiscountPercent ? (
                  <span
                    className={billingPeriod === 'yearly'
                      ? 'text-[11px] font-semibold text-[var(--paper)]/75'
                      : 'text-[11px] font-semibold text-[var(--accent-deep)]'}
                  >
                    Save {yearlyDiscountPercent}%
                  </span>
                ) : null}
              </button>
            </div>
          </div>
        ) : null}

        <div
          className={isOnboarding ? 'mt-5 rounded-[20px] border bg-[var(--card)] px-6 py-7 shadow-[var(--shadow-2)] md:px-8 md:py-8' : 'mt-6 card px-5 py-6 md:px-7 md:py-8'}
          style={isOnboarding ? { borderColor: 'var(--rule)' } : undefined}
        >
          <div className="flex flex-col items-start text-left">
            <h1
              data-testid="pricing-page-title"
              className={isOnboarding ? 'text-[40px] tracking-[-0.03em] text-ink md:text-[52px]' : 'text-3xl font-semibold tracking-tight text-ink md:text-4xl'}
              style={isOnboarding ? { fontFamily: 'var(--serif)', fontWeight: 400, lineHeight: 0.95 } : undefined}
            >
              {plan.displayName || plan.name}
            </h1>
            {plan.description ? (
              <p
                className={isOnboarding ? 'mt-4 max-w-[34ch] text-lg leading-8 text-ink-2' : 'mt-4 max-w-xl text-base leading-7 text-dim-2'}
              >
                {plan.description}
              </p>
            ) : null}
            {hasDisplayPrice && plan.currency ? (
              <div className={`flex items-end gap-1.5 ${isOnboarding ? 'mt-8' : 'mt-7'}`}>
                <span
                  className={isOnboarding ? 'text-[54px] tracking-[-0.04em] text-ink md:text-[68px]' : 'text-5xl font-semibold tracking-tight text-ink md:text-6xl'}
                  style={isOnboarding ? { fontFamily: 'var(--serif)', fontWeight: 400, lineHeight: 0.95 } : undefined}
                >
                  {formatCurrency(selectedPriceValue, plan.currency, i18n.language)}
                </span>
                <span
                  className={isOnboarding ? 'pb-1 text-lg text-dim md:pb-2 md:text-xl' : 'pb-1 text-xl font-semibold text-dim-2 md:pb-2 md:text-2xl'}
                  style={isOnboarding ? { fontFamily: 'var(--mono)', letterSpacing: '0.08em', textTransform: 'uppercase' } : undefined}
                >
                  /{periodLabel}
                </span>
              </div>
            ) : null}
          </div>

          <div className={isOnboarding ? 'mt-8 rounded-[16px] border border-[var(--rule)] bg-[var(--paper)]/70 px-5 py-5' : 'mt-8'}>
            {features.length > 0 ? (
              <ul className={isOnboarding ? 'space-y-3 text-[15px] text-ink-2' : 'space-y-3 text-base text-dim-2'}>
                {features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Icon
                      icon={Check}
                      className={isOnboarding ? 'mt-0.5 h-4 w-4 flex-none text-[var(--accent-deep)]' : 'mt-0.5 h-5 w-5 flex-none text-accent'}
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-base text-dim-2">{t('pricing:noFeatures')}</p>
            )}
          </div>

          <div className={isOnboarding ? 'mt-7' : 'mt-8'}>
            <Button
              onClick={() => handleUpgrade(plan)}
              variant="primary"
              size="lg"
              className={isOnboarding ? 'h-14 w-full text-base' : 'h-14 w-full'}
              disabled={submitting}
            >
              {submitting
                ? t('pricing:modal.openingBilling')
                : hasDisplayPrice && plan.currency
                  ? t('pricing:upgradeButton', {
                      price: formatCurrency(
                        selectedPriceValue,
                        plan.currency,
                        i18n.language
                      )
                    })
                  : plan.displayName || plan.name}
            </Button>
            {hasDisplayPrice ? (
              <p
                className={isOnboarding ? 'mt-4 text-center text-xs uppercase tracking-[0.14em] text-dim' : 'mt-4 text-center text-sm text-dim-2'}
              >
                {billingDescription}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingView;
