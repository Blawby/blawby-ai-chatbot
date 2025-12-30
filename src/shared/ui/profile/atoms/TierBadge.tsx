/**
 * TierBadge - Atom Component
 * Subscription tier label styled like original main.
 * 
 * @param tier - The subscription tier to display (required)
 * @param variant - Display variant: 'default' (compact) or 'enterprise' (badge style)
 * @param className - Additional CSS classes
 * 
 * Note: Both variants use the computed tier display name from getTierDisplayName().
 * The 'enterprise' variant shows the tier in a styled badge format, while 'default'
 * shows it as compact text.
 */

import { getTierDisplayName } from '@/shared/utils/stripe-products';
import { type SubscriptionTier } from '@/shared/types/user';

interface TierBadgeProps {
  /** The subscription tier to display - always required and used by both variants */
  tier: SubscriptionTier;
  /** Display variant: 'default' shows compact text, 'enterprise' shows styled badge */
  variant?: 'default' | 'enterprise';
  /** Additional CSS classes to apply */
  className?: string;
}

export const TierBadge = ({ tier, variant = 'default', className = '' }: TierBadgeProps) => {
  const tierDisplay = getTierDisplayName(tier);

  if (variant === 'enterprise') {
    return (
      <span className={`px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full flex-shrink-0 ${className}`}>
        {tierDisplay}
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


