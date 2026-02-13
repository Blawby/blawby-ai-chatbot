import { FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { useTranslation, i18n } from '@/shared/i18n/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { Button } from '@/shared/ui/Button';
import { UserGroupIcon } from '@heroicons/react/24/outline';
import BadgeRecommended from '@/features/modals/components/BadgeRecommended';
import { getBusinessPrices, TIER_FEATURES } from '@/shared/utils/stripe-products';
import type { SubscriptionTier } from '@/shared/types/user';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePaymentUpgrade } from '@/shared/hooks/usePaymentUpgrade';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { PlanFeaturesList, type PlanFeature } from '@/features/settings/components/PlanFeaturesList';
import { features } from '@/config/features';

interface PricingViewProps {
  currentTier?: SubscriptionTier;
  onUpgrade?: (tier: SubscriptionTier) => Promise<boolean | void> | boolean | void;
  className?: string;
}

const PricingView: FunctionComponent<PricingViewProps> = ({
  currentTier = 'free',
  onUpgrade,
  className
}) => {
  const { t } = useTranslation(['pricing', 'common']);
  const { navigate } = useNavigation();
  const { currentPractice } = usePracticeManagement();
  const { openBillingPortal } = usePaymentUpgrade();
  const { showError } = useToastContext();
  const [isBillingLoading, setIsBillingLoading] = useState(false);

  const userLocale = i18n.language;
  const prices = getBusinessPrices(userLocale);
  const getFeaturesForTier = (tier: SubscriptionTier) => {
    if (tier === 'business' || tier === 'plus' || tier === 'enterprise') return TIER_FEATURES.business;
    return TIER_FEATURES.free;
  };
  const allPlans = [
    { id: 'free' as SubscriptionTier, name: t('plans.free.name'), price: t('plans.free.price'), description: t('plans.free.description'), features: getFeaturesForTier('free'), buttonText: t('plans.free.buttonText'), isRecommended: currentTier === 'free' },
    { id: 'plus' as SubscriptionTier, name: t('plans.plus.name'), price: t('plans.plus.price'), description: t('plans.plus.description'), features: getFeaturesForTier('plus'), buttonText: t('plans.plus.buttonText'), isRecommended: currentTier === 'free' },
    { id: 'business' as SubscriptionTier, name: t('plans.business.name'), price: prices.monthly, description: t('plans.business.description'), features: getFeaturesForTier('business'), buttonText: t('plans.business.buttonText'), isRecommended: currentTier === 'free' || currentTier === 'plus' },
    { id: 'enterprise' as SubscriptionTier, name: t('plans.enterprise.name'), price: t('plans.enterprise.price'), description: t('plans.enterprise.description'), features: getFeaturesForTier('enterprise'), buttonText: t('plans.enterprise.buttonText'), isRecommended: currentTier === 'business' },
  ];

  const visiblePlans = features.enablePlusTier
    ? allPlans
    : allPlans.filter(p => p.id !== 'plus');

  const upgradeTiers: Record<SubscriptionTier, SubscriptionTier[]> = features.enablePlusTier ? {
    free: ['free', 'plus', 'business'],
    plus: ['plus', 'business'],
    business: ['business', 'enterprise'],
    enterprise: ['enterprise'],
  } : {
    free: ['free', 'business'],
    plus: ['business'],
    business: ['business', 'enterprise'],
    enterprise: ['enterprise'],
  };

  type SimplePlan = { id: SubscriptionTier; name: string; price: string; description: string; features: PlanFeature[]; buttonText: string; isRecommended: boolean; isCurrent?: boolean };

  const mainPlans: SimplePlan[] = (() => {
    const availableTiers = (upgradeTiers[currentTier] || []) as SubscriptionTier[];
    return visiblePlans
      .filter(p => availableTiers.includes(p.id))
      .map(p => ({
        ...p,
        isCurrent: p.id === currentTier,
        buttonText: (p.id === currentTier) ? t('modal.currentPlan') : p.buttonText,
        isRecommended: p.id !== currentTier && p.id === 'business' && (currentTier === 'free' || currentTier === 'plus')
      }));
  })();

  const handleUpgrade = async (tier: SubscriptionTier) => {
    let shouldNavigateToCart = true;
    try {
      if (onUpgrade) {
        const result = await onUpgrade(tier);
        if (result === false) {
          shouldNavigateToCart = false;
        }
      }
      if (shouldNavigateToCart) {
        navigate(`/cart?tier=${tier}`);
      }
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
        console.error(t('pricing:billing.noPracticeSelected'));
        showError(t('pricing:billing.noPracticeSelected'), t('pricing:billing.selectPracticeToManage'));
        return;
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
          {mainPlans.map((plan) => (
            <div key={plan.id} className={`relative glass-card p-6 transition-all duration-200 flex flex-col h-full ${plan.isRecommended ? 'ring-2 ring-accent-500 shadow-lg shadow-accent-500/10' : ''}`}>
              {plan.isRecommended && (
                <div className="absolute -top-3 left-6">
                  <BadgeRecommended>{t('modal.recommended').toUpperCase()}</BadgeRecommended>
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-2xl font-bold mb-2 text-input-text">{plan.name}</h3>
                <div className="text-3xl font-bold mb-2 text-input-text">{plan.price}</div>
                <p className="text-input-placeholder">{plan.description}</p>
              </div>
              <div className="mb-6">
                {plan.isCurrent && (plan.id === 'business' || plan.id === 'enterprise' || plan.id === 'plus') ? (
                  <Button onClick={handleManageBilling} variant="secondary" size="lg" className="w-full" disabled={isBillingLoading}>
                    {isBillingLoading ? t('modal.openingBilling') : t('modal.manageBilling')}
                  </Button>
                ) : (
                  <Button onClick={() => handleUpgrade(plan.id)} disabled={plan.isCurrent} variant={plan.isCurrent ? 'secondary' : 'primary'} size="lg" className="w-full">
                    {plan.buttonText}
                  </Button>
                )}
              </div>
              <div className="space-y-3 flex-1">
                <PlanFeaturesList features={plan.features} />
              </div>
              {plan.id === 'free' && (
                <div className="mt-6 pt-4 border-t border-line-glass/30">
                  <p className="text-xs text-input-placeholder">
                    {t('plans.free.footer.existingPlan')}{' '}
                    <Button variant="link" size="sm" onClick={() => navigate('/help/billing')} className="px-0 py-0 h-auto font-normal">
                      {t('plans.free.footer.billingHelp')}
                    </Button>
                  </p>
                </div>
              )}
              {plan.id === 'business' && (
                <div className="mt-6 pt-4 border-t border-line-glass/30">
                  <p className="text-xs text-input-placeholder mb-1">{t('plans.business.footer.billing')}</p>
                  <p className="text-xs text-input-placeholder">
                    {t('plans.business.footer.unlimited')}{' '}
                    <Button variant="link" size="sm" onClick={() => navigate('/business/features')} className="px-0 py-0 h-auto font-normal">
                      {t('plans.business.footer.learnMore')}
                    </Button>
                  </p>
                </div>
              )}
            </div>
          ))}
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
