/**
 * TierBadge - Atom Component
 * Subscription tier label styled like original main.
 */

import { getTierDisplayName } from '../../../../utils/stripe-products';
import { type SubscriptionTier } from '../../../../types/user';

interface TierBadgeProps {
  tier: SubscriptionTier;
  variant?: 'default' | 'enterprise';
  className?: string;
}

export const TierBadge = ({ tier, variant = 'default', className = '' }: TierBadgeProps) => {
  const tierDisplay = getTierDisplayName(tier);

  if (variant === 'enterprise') {
    return (
      <span className={`px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full flex-shrink-0 ${className}`}>
        Enterprise
      </span>
    );
  }

  // Compact, subtle label with very tight spacing
  return (
    <span className={`text-xs leading-none text-gray-400 dark:text-gray-400 truncate ${className}`}>
      {tierDisplay}
    </span>
  );
};


