/**
 * BusinessWelcomePrompt - Organism Component
 * 
 * Refactored from BusinessWelcomeModal.
 * Uses atomic components for consistent styling.
 */

import { useNavigation } from '../../../utils/navigation';
import Modal from '../../Modal';
import { Button } from '../../ui/Button';
import { UserGroupIcon, BuildingOfficeIcon, KeyIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '../../../i18n/hooks';

interface BusinessWelcomePromptProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BusinessWelcomePrompt = ({ isOpen, onClose }: BusinessWelcomePromptProps) => {
  const { navigate } = useNavigation();
  const { t } = useTranslation('common');

  const handleGoToSettings = () => {
    onClose();
    navigate('/settings/organization');
  };

  const features = [
    {
      text: t('businessWelcome.features.teamManagement.description'),
      icon: <UserGroupIcon className="w-6 h-6" />,
      title: t('businessWelcome.features.teamManagement.title'),
      color: { bg: 'bg-blue-500/20', text: 'text-blue-400' }
    },
    {
      text: t('businessWelcome.features.organizationSettings.description'),
      icon: <BuildingOfficeIcon className="w-6 h-6" />,
      title: t('businessWelcome.features.organizationSettings.title'),
      color: { bg: 'bg-green-500/20', text: 'text-green-400' }
    },
    {
      text: t('businessWelcome.features.apiAccess.description'),
      icon: <KeyIcon className="w-6 h-6" />,
      title: t('businessWelcome.features.apiAccess.title'),
      color: { bg: 'bg-purple-500/20', text: 'text-purple-400' }
    }
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-8">
        <h2 className="text-2xl font-bold mb-4">{t('businessWelcome.title')}</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t('businessWelcome.subtitle')}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {features.map((feature, index) => (
            <div key={index} className="text-center">
              <div className={`w-12 h-12 rounded-full ${feature.color.bg} flex items-center justify-center mx-auto mb-3`}>
                <div className={`h-6 w-6 ${feature.color.text}`}>{feature.icon}</div>
              </div>
              <h3 className="font-medium mb-1">{feature.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{feature.text}</p>
            </div>
          ))}
        </div>

        <Button variant="primary" className="w-full" onClick={handleGoToSettings}>
          {t('businessWelcome.goToSettings')}
        </Button>
      </div>
    </Modal>
  );
};
