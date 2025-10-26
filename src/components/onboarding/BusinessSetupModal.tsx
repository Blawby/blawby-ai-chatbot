import { useNavigation } from '../../utils/navigation';
import Modal from '../Modal';
import { Button } from '../ui/Button';
import { 
  BuildingOfficeIcon, 
  UserGroupIcon, 
  Cog6ToothIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { useTranslation } from '../../i18n/hooks';

interface BusinessSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BusinessSetupModal = ({ isOpen, onClose }: BusinessSetupModalProps) => {
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
    navigate('/app/settings/organization');
  };

  const setupSteps = [
    {
      id: 'businessInfo',
      icon: BuildingOfficeIcon,
      iconColor: 'text-blue-500',
      bgColor: 'bg-blue-100 dark:bg-blue-900/20',
      title: t('businessSetup.steps.businessInfo.title'),
      description: t('businessSetup.steps.businessInfo.description')
    },
    {
      id: 'branding',
      icon: Cog6ToothIcon,
      iconColor: 'text-purple-500',
      bgColor: 'bg-purple-100 dark:bg-purple-900/20',
      title: t('businessSetup.steps.branding.title'),
      description: t('businessSetup.steps.branding.description')
    },
    {
      id: 'practiceAreas',
      icon: UserGroupIcon,
      iconColor: 'text-green-500',
      bgColor: 'bg-green-100 dark:bg-green-900/20',
      title: t('businessSetup.steps.practiceAreas.title'),
      description: t('businessSetup.steps.practiceAreas.description')
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
          {setupSteps.map((step) => {
            const Icon = step.icon;
            
            return (
              <div key={step.id} className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                <div className={`w-10 h-10 rounded-full ${step.bgColor} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`h-5 w-5 ${step.iconColor}`} />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white mb-1">
                    {step.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <Button 
            variant="secondary" 
            className="flex-1" 
            onClick={handleSkip}
          >
            {t('businessSetup.actions.skip')}
          </Button>
          <Button 
            variant="primary" 
            className="flex-1" 
            onClick={handleContinue}
          >
            {t('businessSetup.actions.continue')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
