import { FunctionComponent } from 'preact';
import { getBusinessPrices } from '../utils/stripe-products';
import { type SubscriptionTier } from '../types/user';
import { 
  ChatBubbleLeftRightIcon, 
  DocumentTextIcon, 
  UserGroupIcon, 
  ShieldCheckIcon,
  ClockIcon,
  CloudIcon
} from '@heroicons/react/24/outline';

interface PricingComparisonProps {
  currentTier?: SubscriptionTier;
  onUpgrade?: (tier: SubscriptionTier) => void;
  showAllPlans?: boolean;
  className?: string;
}

const PricingComparison: FunctionComponent<PricingComparisonProps> = ({
  currentTier = 'free',
  onUpgrade,
  showAllPlans = true,
  className = ''
}) => {
  const prices = getBusinessPrices();
  
  const allPlans = [
    {
      id: 'free',
      name: 'Free',
      price: '$0 USD / month',
      description: 'Legal AI assistance for everyday needs',
      features: [
        {
          icon: ChatBubbleLeftRightIcon,
          text: 'Basic AI chat assistance',
          description: 'Get help with general legal questions'
        },
        {
          icon: DocumentTextIcon,
          text: 'Document analysis',
          description: 'Upload and analyze up to 3 documents per month'
        },
        {
          icon: ClockIcon,
          text: 'Standard response time',
          description: 'Responses within 24 hours'
        }
      ],
      buttonText: 'Your current plan',
      isRecommended: false,
      popular: false,
      limitations: [
        'Limited to 3 document uploads per month',
        'No team collaboration features',
        'Basic AI responses only',
        'No priority support'
      ],
      benefits: [
        'Perfect for personal use',
        'No credit card required',
        'Full access to basic features'
      ]
    },
    {
      id: 'business',
      name: 'Business',
      price: prices.monthly,
      description: 'Secure, collaborative workspace for organizations',
      features: [
        {
          icon: UserGroupIcon,
          text: 'Team collaboration',
          description: 'Unlimited team members and shared workspaces'
        },
        {
          icon: DocumentTextIcon,
          text: 'Unlimited document analysis',
          description: 'Upload and analyze unlimited documents'
        },
        {
          icon: ShieldCheckIcon,
          text: 'Advanced security',
          description: 'Enterprise-grade security and compliance'
        },
        {
          icon: CloudIcon,
          text: 'Cloud storage',
          description: 'Secure cloud storage for all documents'
        },
        {
          icon: ClockIcon,
          text: 'Priority support',
          description: '24/7 priority customer support'
        }
      ],
      buttonText: 'Get Business',
      isRecommended: currentTier !== 'business',
      popular: true,
      limitations: [],
      benefits: [
        'Unlimited document processing',
        'Team collaboration tools',
        'Advanced AI capabilities',
        'Priority customer support',
        'Custom integrations available'
      ]
    }
  ];

  // Filter plans based on showAllPlans prop
  const plans = showAllPlans ? allPlans : allPlans.filter(plan => plan.id !== 'free');

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${className}`}>
      {plans.map((plan) => (
        <div
          key={plan.id}
          className={`relative rounded-xl p-6 transition-all duration-200 ${
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

          {/* Popular Badge */}
          {plan.popular && (
            <div className="absolute -top-3 right-6">
              <span className="bg-blue-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                POPULAR
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
          <button
            onClick={() => onUpgrade?.(plan.id as SubscriptionTier)}
            disabled={plan.id === currentTier}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-colors mb-6 ${
              plan.id === currentTier
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : plan.isRecommended
                ? 'bg-accent-500 text-gray-900 hover:bg-accent-600'
                : 'bg-transparent border border-dark-border text-white hover:bg-dark-hover'
            }`}
          >
            {plan.id === currentTier ? 'Your current plan' : plan.buttonText}
          </button>

          {/* Features List */}
          <div className="space-y-3">
            {plan.features.map((feature, index) => (
              <div key={index} className="flex items-start gap-3">
                <feature.icon className="w-5 h-5 mt-0.5 flex-shrink-0 text-gray-400" />
                <div>
                  <span className="text-sm text-gray-300">{feature.text}</span>
                  {feature.description && (
                    <p className="text-xs text-gray-500 mt-1">{feature.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Benefits */}
          {plan.benefits && plan.benefits.length > 0 && (
            <div className="mt-6 pt-4 border-t border-dark-border">
              <h4 className="text-sm font-medium text-white mb-2">Benefits:</h4>
              <ul className="space-y-1">
                {plan.benefits.map((benefit, index) => (
                  <li key={index} className="text-xs text-gray-400 flex items-center gap-2">
                    <span className="w-1 h-1 bg-accent-500 rounded-full" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Limitations */}
          {plan.limitations && plan.limitations.length > 0 && (
            <div className="mt-4 pt-4 border-t border-dark-border">
              <h4 className="text-sm font-medium text-white mb-2">Limitations:</h4>
              <ul className="space-y-1">
                {plan.limitations.map((limitation, index) => (
                  <li key={index} className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="w-1 h-1 bg-gray-500 rounded-full" />
                    {limitation}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default PricingComparison;
