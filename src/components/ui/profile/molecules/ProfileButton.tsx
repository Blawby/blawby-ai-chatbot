/**
 * ProfileButton - Molecule Component
 * Main profile trigger combining avatar, name, and tier.
 * Styled to match original main look/feel.
 */

import { Avatar } from '../atoms/Avatar';
import { TierBadge } from '../atoms/TierBadge';
import { UpgradeButton } from '../atoms/UpgradeButton';
import { type SubscriptionTier } from '../../../../types/user';

interface ProfileButtonProps {
  name: string;
  image?: string | null;
  tier: SubscriptionTier;
  isCollapsed: boolean;
  onClick: () => void;
  onUpgrade?: () => void;
  className?: string;
}

export const ProfileButton = ({
  name,
  image,
  tier,
  isCollapsed,
  onClick,
  onUpgrade,
  className = ''
}: ProfileButtonProps) => {
  if (isCollapsed) {
    return (
      <button
        onClick={onClick}
        className={`w-8 h-8 rounded-full bg-gray-600 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mx-auto ${className}`}
        title={name}
        aria-label={`User profile for ${name}`}
      >
        <Avatar src={image} name={name} size="sm" />
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`}>
      <button
        onClick={onClick}
        className="flex items-center gap-2 flex-1 text-left hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg p-2 transition-colors"
        aria-label={`User profile for ${name}`}
      >
        <Avatar src={image} name={name} size="md" />
        <div className="flex-1 min-w-0 overflow-hidden text-left">
          <p className="text-sm font-medium leading-none text-gray-900 dark:text-white truncate" title={name}>
            {name}
          </p>
          <div className="-mt-0.5">
            <TierBadge tier={tier} />
          </div>
        </div>
      </button>

      {/* Upgrade Button - unified for all non-enterprise tiers */}
      {tier !== 'enterprise' && onUpgrade && (
        <UpgradeButton onClick={onUpgrade} variant="short" />
      )}

      {/* Enterprise Badge - non-clickable for max tier users */}
      {tier === 'enterprise' && (
        <TierBadge tier={tier} variant="enterprise" />
      )}
    </div>
  );
};


