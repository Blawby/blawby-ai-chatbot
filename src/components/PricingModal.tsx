import { FunctionComponent } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useTranslation, i18n } from '@/i18n/hooks';
import { useNavigation } from '../utils/navigation';
import Modal from './Modal';
import { Button } from './ui/Button';
import { Select } from './ui/input/Select';
import { UserGroupIcon } from '@heroicons/react/24/outline';
import { getBusinessPrices } from '../utils/stripe-products';
import type { SubscriptionTier } from '../types/user';
import { useOrganizationManagement } from '../hooks/useOrganizationManagement';
import { usePaymentUpgrade } from '../hooks/usePaymentUpgrade';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTier?: SubscriptionTier;
  onUpgrade?: (tier: SubscriptionTier) => Promise<boolean | void> | boolean | void;
}

const PricingModal: FunctionComponent<PricingModalProps> = ({
  isOpen,
  onClose,
  currentTier = 'free',
  onUpgrade
}) => {
  const { t } = useTranslation(['pricing', 'common']);
  const { navigate } = useNavigation();
  const { currentOrganization } = useOrganizationManagement();
  const { openBillingPortal } = usePaymentUpgrade();
  const [selectedTab, setSelectedTab] = useState<'personal' | 'business'>('business');
  const [selectedCountry, setSelectedCountry] = useState('us');

  // Load user's current country preference
  useEffect(() => {
    // TODO: Get from user profile when available
    setSelectedCountry('us');
  }, []);

  const handleCountryChange = (country: string) => {
    setSelectedCountry(country);
    // TODO: Update user profile with country preference
  };

  // Get active locale from i18n
  const userLocale = i18n.language;
  
  // Build pricing plans from real Stripe config
  const prices = getBusinessPrices(userLocale);
  const allPlans = [
    {
      id: 'free' as SubscriptionTier,
      name: t('plans.free.name'),
      price: t('plans.free.price'),
      description: t('plans.free.description'),
      features: [],
      buttonText: t('plans.free.buttonText'),
      isRecommended: currentTier === 'free',
    },
    {
      id: 'business' as SubscriptionTier,
      name: t('plans.business.name'),
      price: prices.monthly,
      description: t('plans.business.description'),
      features: [],
      buttonText: t('plans.business.buttonText'),
      isRecommended: currentTier === 'free' || currentTier === 'plus',
    },
    {
      id: 'enterprise' as SubscriptionTier,
      name: t('plans.enterprise.name'),
      price: t('plans.enterprise.price'),
      description: t('plans.enterprise.description'),
      features: [],
      buttonText: t('plans.enterprise.buttonText'),
      isRecommended: currentTier === 'business',
    },
  ];
  
  // Define upgrade paths
  const upgradeTiers = {
    'free': ['free', 'business'],
    'plus': ['plus', 'business'],
    'business': ['business', 'enterprise'],
    'enterprise': ['enterprise']
  };
  
  // Show different plans based on selected tab and current tier
  type SimplePlan = { 
    id: SubscriptionTier; 
    name: string; 
    price: string; 
    description: string; 
    features: Array<{ icon?: unknown; text?: string }>; 
    buttonText: string; 
    isRecommended: boolean; 
    isCurrent?: boolean 
  };
  
  const mainPlans: SimplePlan[] = (() => {
    const availableTiers = upgradeTiers[currentTier] || [];
    
    if (selectedTab === 'personal') {
      return allPlans
        .filter(plan => availableTiers.includes(plan.id) && plan.id !== 'business')
        .map(plan => {
          const isCurrent = plan.id === currentTier;
          return {
            ...plan,
            isCurrent,
            buttonText: isCurrent ? t('modal.currentPlan') : plan.buttonText,
            isRecommended: isCurrent
          };
        });
    } else {
      return allPlans
        .filter(plan => availableTiers.includes(plan.id))
        .map(plan => {
          const isCurrent = plan.id === currentTier;
          return {
            ...plan,
            isCurrent,
            buttonText: isCurrent ? t('modal.currentPlan') : plan.buttonText,
            isRecommended: !isCurrent && plan.id === 'business' && (currentTier === 'free' || currentTier === 'plus')
          };
        });
    }
  })();

  // Determine if we should show the tab selector
  const shouldShowTabs = (() => {
    if (currentTier === 'business' || currentTier === 'enterprise' || currentTier === 'plus') return false;
    return true;
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
        onClose();
      }
    } catch (error) {
      console.error('Error during upgrade process:', error);
      navigate(`/cart?tier=${tier}`);
      onClose();
    }
  };

  const handleManageBilling = async () => {
    try {
      const orgId = currentOrganization?.id;
      if (!orgId) return;
      await openBillingPortal({ organizationId: orgId });
    } catch (error) {
      console.error('Failed to open billing portal:', error);
    }
  };

  // Country options via Intl.DisplayNames (locale-aware)
  const regionCodes = ['US','VN','GB','DE','FR','ES','JP','CN'] as const;
  const locale = i18n.language || 'en';
  const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
  const countryOptions = regionCodes.map(code => ({
    value: code.toLowerCase(),
    label: displayNames.of(code) || code
  }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      type="fullscreen"
      showCloseButton={false}
    >
      <div className="h-full bg-dark-bg text-white overflow-y-auto">
        {/* Header */}
        <div className="relative p-6 border-b border-dark-border">
          <Button
            onClick={onClose}
            variant="icon"
            size="sm"
            className="absolute top-4 right-4"
            aria-label={t('common:close')}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            }
          />
          
          <div className="flex flex-col items-center space-y-6">
            <h1 className="text-2xl font-semibold text-white">{t('modal.title')}</h1>
            {shouldShowTabs && (
              <div className="flex bg-dark-card-bg rounded-lg p-1">
                <button
                  onClick={() => setSelectedTab('personal')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedTab === 'personal'
                      ? 'bg-dark-bg text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {t('tabs.personal')}
                </button>
                <button
                  onClick={() => setSelectedTab('business')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedTab === 'business'
                      ? 'bg-dark-bg text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {t('tabs.business')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full mx-auto">
            {mainPlans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-xl p-6 transition-all duration-200 flex flex-col h-full ${
                  plan.isRecommended
                    ? 'bg-dark-card-bg border-2 border-accent-500'
                    : 'bg-dark-card-bg border border-dark-border'
                }`}
              >
                {/* Recommended Badge */}
                {plan.isRecommended && (
                  <div className="absolute -top-3 left-6">
                    <span className="bg-accent-500 text-gray-900 text-xs font-medium px-3 py-1 rounded-full">
                      {t('modal.recommended').toUpperCase()}
                    </span>
                  </div>
                )}

                {/* Plan Header */}
                <div className="mb-6">
                  <h3 className="text-2xl font-bold mb-2 text-white">{plan.name}</h3>
                  <div className="text-3xl font-bold mb-2 text-white">
                    {plan.price}
                  </div>
                  <p className="text-gray-300">{plan.description}</p>
                </div>

                {/* Action Button */}
                <div className="mb-6">
                  {plan.isCurrent && (plan.id === 'business' || plan.id === 'enterprise') ? (
                    <Button
                      onClick={handleManageBilling}
                      variant="secondary"
                      size="lg"
                      className="w-full"
                    >
                      {t('modal.manageBilling', { defaultValue: 'Manage Billing' })}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={plan.isCurrent}
                      variant={plan.isCurrent ? 'secondary' : 'primary'}
                      size="lg"
                      className="w-full"
                    >
                      {plan.buttonText}
                    </Button>
                  )}
                </div>

                {/* Features List */}
                <div className="space-y-3 flex-1">
                  {/* Features moved to AccountPage tier features */}
                </div>

                {/* Footer Text */}
                {plan.id === 'free' && (
                  <div className="mt-6 pt-4 border-t border-dark-border">
                    <p className="text-xs text-gray-400">
                      {t('plans.free.footer.existingPlan')}{' '}
                      <button className="underline hover:text-white">
                        {t('plans.free.footer.billingHelp')}
                      </button>
                    </p>
                  </div>
                )}

                {plan.id === 'business' && (
                  <div className="mt-6 pt-4 border-t border-dark-border">
                    <p className="text-xs text-gray-400 mb-1">
                      {t('plans.business.footer.billing')}
                    </p>
                    <p className="text-xs text-gray-400">
                      {t('plans.business.footer.unlimited')}{' '}
                      <button className="underline hover:text-white">
                        {t('plans.business.footer.learnMore')}
                      </button>
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Modal Footer */}
          <div className="border-t border-dark-border px-6 py-2 mt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* Enterprise Section */}
              <div className="flex items-center gap-2">
                <UserGroupIcon className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-400">{t('footer.enterprise.question')}</span>
                <button 
                  className="text-sm text-white underline hover:text-gray-300 transition-colors"
                  onClick={() => {
                    window.open('/enterprise', '_blank', 'noopener,noreferrer');
                  }}
                >
                  {t('footer.enterprise.link')}
                </button>
              </div>
              
              {/* Country/Region Selector */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">{t('footer.country.label')}</span>
                <Select
                  value={selectedCountry}
                  options={countryOptions}
                  onChange={handleCountryChange}
                  direction="up"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default PricingModal;