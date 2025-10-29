/**
 * BusinessSetupPrompt - Organism Component
 * 
 * Refactored from BusinessSetupModal.
 * Uses atomic components for consistent styling.
 */

import { useNavigation } from '../../../utils/navigation';
import Modal from '../../Modal';
import { Button } from '../../ui/Button';
import { 
  BuildingOfficeIcon, 
  UserGroupIcon, 
  Cog6ToothIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { useTranslation } from '../../../i18n/hooks';
import { FeatureList } from '../molecules/FeatureList';
import { OnboardingActions } from '../molecules/OnboardingActions';

interface BusinessSetupPromptProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BusinessSetupPrompt = ({ isOpen, onClose }: BusinessSetupPromptProps) => {
  const { navigate } = useNavigation();
  const { t } = useTranslation('onboarding');

  const handleSkip = () => {
    onClose();
    // Remove the flag so modal doesn't show again
    try {
      localStorage.removeItem('businessSetupPending');
    } catch (error) {
      console.warn('Failed to remove business setup flag:', error);
    }
  };

  const handleContinue = () => {
    onClose();
    // Remove the flag and navigate to organization settings
    try {
      localStorage.removeItem('businessSetupPending');
    } catch (error) {
      console.warn('Failed to remove business setup flag:', error);
    }
    navigate('/settings/organization');
  };

  const setupSteps = [
    {
      text: t('businessSetup.steps.businessInfo.description'),
      icon: <BuildingOfficeIcon className="w-5 h-5" />,
      variant: 'default' as const
    },
    {
      text: t('businessSetup.steps.branding.description'),
      icon: <Cog6ToothIcon className="w-5 h-5" />,
      variant: 'default' as const
    },
    {
      text: t('businessSetup.steps.practiceAreas.description'),
      icon: <UserGroupIcon className="w-5 h-5" />,
      variant: 'default' as const
    }
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircleIcon className="h-8 w-8 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">{t('businessSetup.title')}</h2>
          <p className="text-gray-600 dark:text-gray-400">
            {t('businessSetup.subtitle')}
          </p>
        </div>

        <div className="space-y-4 mb-8">
          <FeatureList items={setupSteps} />
        </div>

        <OnboardingActions
          onContinue={handleContinue}
          onBack={handleSkip}
          continueLabel={t('businessSetup.actions.continue')}
          backLabel={t('businessSetup.actions.skip')}
        />
      </div>
    </Modal>
  );
};
