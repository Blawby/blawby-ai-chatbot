import { FunctionComponent } from 'preact';
import { getBusinessPrices, TIER_FEATURES } from '../utils/stripe-products';
// import { type SubscriptionTier } from '../types/user'; // Unused

interface FeatureComparisonTableProps {
  className?: string;
}

const FeatureComparisonTable: FunctionComponent<FeatureComparisonTableProps> = ({
  className = ''
}) => {
  const prices = getBusinessPrices();
  const plans = [
    { id: 'free', name: 'Free', price: '$0 USD / month' },
    { id: 'business', name: 'Business', price: prices.monthly },
  ] as const;

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-dark-border">
            <th className="text-left py-4 px-6 text-white font-medium">Features</th>
            {plans.map((plan) => (
              <th key={plan.id} className="text-center py-4 px-6 text-white font-medium">
                <div>
                  <div className="text-lg font-bold">{plan.name}</div>
                  <div className="text-sm text-gray-400">{plan.price}</div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(() => {
            // Create a unified list of unique features by text
            const allFeatures = new Map<string, typeof TIER_FEATURES.free[0]>();
            
            // Add features from all tiers, using text as unique key
            (['free', 'business'] as const).forEach(tierKey => {
              TIER_FEATURES[tierKey].forEach(feature => {
                allFeatures.set(feature.text, feature);
              });
            });
            
            // Convert to array and render
            return Array.from(allFeatures.values()).map((feature, idx) => (
              <tr key={`feature-${idx}`} className="border-b border-dark-border">
                <td className="py-4 px-6">
                  <div className="flex items-center gap-3">
                    <feature.icon className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-white font-medium">{feature.text}</div>
                    </div>
                  </div>
                </td>
                {plans.map((plan) => {
                  const hasFeature = TIER_FEATURES[plan.id as keyof typeof TIER_FEATURES]
                    .some(f => f.text === feature.text);
                  return (
                    <td key={plan.id} className="text-center py-4 px-6">
                      {hasFeature ? (
                        <span className="text-accent-500 text-lg">✓</span>
                      ) : (
                        <span className="text-gray-500 text-lg">✗</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ));
          })()}
        </tbody>
      </table>
    </div>
  );
};

export default FeatureComparisonTable;
