/**
 * UpgradeButton - Atom Component
 * 
 * Pure upgrade CTA button.
 * No state management, just renders the button with proper styling.
 */

import { useTranslation } from '@/shared/i18n/hooks';

interface UpgradeButtonProps {
  onClick: () => void;
  variant?: 'default' | 'short';
  className?: string;
}

export const UpgradeButton = ({ 
  onClick, 
  variant = 'default',
  className = ''
}: UpgradeButtonProps) => {
  const { t } = useTranslation(['profile', 'common']);
  
  const buttonText = variant === 'short' 
    ? t('profile:menu.upgradeShort')
    : t('profile:menu.upgrade');

  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs font-medium text-input-text bg-transparent border border-line-glass/30 rounded-full hover:bg-surface-glass/50 transition-colors flex-shrink-0 ${className}`}
      title={t('profile:menu.upgradeTooltip')}
    >
      {buttonText}
    </button>
  );
};
