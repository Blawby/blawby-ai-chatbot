import { FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { useNavigation } from '../utils/navigation';
import Modal from './Modal';
import { Button } from './ui/Button';
import { UserGroupIcon } from '@heroicons/react/24/outline';
import { getBusinessPrices } from '../utils/stripe-products';
import { useSession } from '../contexts/AuthContext';
import type { SubscriptionTier } from '../types/user';

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
  const { navigate } = useNavigation();
  const { data: session } = useSession();
  const [selectedTab, setSelectedTab] = useState<'personal' | 'business'>('business');



  // Build pricing plans from real Stripe config
  const prices = getBusinessPrices();
  const allPlans = [
    {
      id: 'free' as SubscriptionTier,
      name: 'Free',
      price: '$0 USD / month',
      description: 'Legal AI assistance for everyday needs',
      features: [],
      buttonText: 'Your current plan',
      isRecommended: currentTier === 'free',
    },
    // Plus tier temporarily hidden until backend Stripe integration is complete
    // {
    //   id: 'plus' as SubscriptionTier,
    //   name: 'Plus',
    //   price: '$20 USD / month',
    //   description: 'Enhanced AI capabilities for individual professionals',
    //   features: [],
    //   buttonText: 'Get Plus',
    //   isRecommended: currentTier === 'free',
    // },
    {
      id: 'business' as SubscriptionTier,
      name: 'Business',
      price: prices.monthly,
      description: 'Secure, collaborative workspace for organizations',
      features: [],
      buttonText: 'Get Business',
      isRecommended: currentTier === 'free' || currentTier === 'plus',
    },
    {
      id: 'enterprise' as SubscriptionTier,
      name: 'Enterprise',
      price: 'Contact sales',
      description: 'Custom solutions for large organizations',
      features: [],
      buttonText: 'Contact Sales',
      isRecommended: currentTier === 'business',
    },
  ];
  
  // Define upgrade paths - include current tier to show it
  // Plus tier temporarily removed from upgrade paths until backend support is added
  const upgradeTiers = {
    'free': ['free', 'business'],
    'plus': ['plus', 'business'],  // Keep for existing plus users
    'business': ['business', 'enterprise'],
    'enterprise': ['enterprise']
  };
  
  // Show different plans based on selected tab and current tier
  type SimplePlan = { id: SubscriptionTier; name: string; price: string; description: string; features: Array<{ icon?: unknown; text?: string }>; buttonText: string; isRecommended: boolean; isCurrent?: boolean };
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
            buttonText: isCurrent ? 'Your current plan' : plan.buttonText,
            // Recommended = show current for clarity on personal tab
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
            buttonText: isCurrent ? 'Your current plan' : plan.buttonText,
            // Recommended = highlight Business when user is not already on it
            isRecommended: !isCurrent && plan.id === 'business' && (currentTier === 'free' || currentTier === 'plus')
          };
        });
    }
  })();

  // Determine if we should show the tab selector
  // Only show tabs if there are different plans available for each tab
  const shouldShowTabs = (() => {
    // Business, enterprise, and plus users don't need tab selector
    // They can only see their current plan + enterprise upgrade (business)
    // Or just their current plan (enterprise/plus)
    if (currentTier === 'business' || currentTier === 'enterprise' || currentTier === 'plus') return false;
    
    // Free users see tabs for personal vs business upgrade paths
    return true;
  })();

  const handleUpgrade = async (tier: SubscriptionTier) => {
    let shouldNavigateToCart = true;
    try {
      // Call callbacks before navigation to ensure they complete
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
      // Still navigate and close modal even if callback fails
      navigate(`/cart?tier=${tier}`);
      onClose();
    }
  };

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
          {/* Close Button */}
          <Button
            onClick={onClose}
            variant="icon"
            size="sm"
            className="absolute top-4 right-4"
            aria-label="Close modal"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            }
          />
          
          {/* Centered Content */}
          <div className="flex flex-col items-center space-y-6">
            <h1 className="text-2xl font-semibold text-white">Upgrade your plan</h1>
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
                  Personal
                </button>
                <button
                  onClick={() => setSelectedTab('business')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedTab === 'business'
                      ? 'bg-dark-bg text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Business
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
                      RECOMMENDED
                    </span>
                  </div>
                )}

                {/* Plan Header */}
                <div className="mb-6">
                  <h3 className="text-2xl font-bold mb-2 text-white">{plan.name}</h3>
                  <div className="text-3xl font-bold mb-2 text-white">
                    {plan.price.split(' ')[0]}
                    <span className="text-lg font-normal text-gray-300 ml-1">
                      {plan.price.split(' ').slice(1).join(' ')}
                    </span>
                  </div>
                  <p className="text-gray-300">{plan.description}</p>
                </div>

                {/* Action Button */}
                <div className="mb-6">
                  <Button
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={plan.isCurrent}
                    variant={plan.isCurrent ? 'secondary' : 'primary'}
                    size="lg"
                    className="w-full"
                  >
                    {plan.buttonText}
                  </Button>
                </div>

                {/* Features List */}
                <div className="space-y-3 flex-1">
                  {/* Placeholder features moved to AccountPage tier features */}
                </div>

                {/* Footer Text */}
                {plan.id === 'free' && (
                  <div className="mt-6 pt-4 border-t border-dark-border">
                    <p className="text-xs text-gray-400">
                      Have an existing plan?{' '}
                    <button className="underline hover:text-white">
                      See billing help
                    </button>
                    </p>
                  </div>
                )}

                {plan.id === 'business' && (
                  <div className="mt-6 pt-4 border-t border-dark-border">
                    <p className="text-xs text-gray-400 mb-1">
                      For 2+ users, billed annually
                    </p>
                    <p className="text-xs text-gray-400">
                      Unlimited subject to abuse guardrails.{' '}
                    <button className="underline hover:text-white">
                      Learn more
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
                <span className="text-sm text-gray-400">Need more capabilities?</span>
                <button 
                  className="text-sm text-white underline hover:text-gray-300 transition-colors"
                  onClick={() => {
                    // Redirect to enterprise page
                    window.open('/enterprise', '_blank');
                  }}
                >
                  See Blawby Enterprise
                </button>
              </div>
              
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default PricingModal;
