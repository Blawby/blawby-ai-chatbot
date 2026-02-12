/**
 * BusinessWelcomePrompt - Organism Component
 * 
 * Refactored from BusinessWelcomeModal.
 * Uses atomic components for consistent styling.
 */

import { useNavigation } from '@/shared/utils/navigation';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import { 
  ChatBubbleLeftRightIcon, 
  DocumentTextIcon, 
  BriefcaseIcon, 
  CreditCardIcon 
} from '@heroicons/react/24/outline';
import { useTranslation } from '@/shared/i18n/hooks';

interface BusinessWelcomePromptProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BusinessWelcomePrompt = ({ isOpen, onClose }: BusinessWelcomePromptProps) => {
  const { navigate } = useNavigation();
  const { t } = useTranslation('common');

  const handleGoToSettings = () => {
    onClose();
    navigate('/settings/practice');
  };

  const features = [
    {
      id: 'intake',
      icon: <DocumentTextIcon className="w-6 h-6" />,
      title: t('businessWelcome.features.intake.title'),
      text: t('businessWelcome.features.intake.description'),
      color: { bg: 'bg-blue-500/20', text: 'text-blue-400', shadow: 'shadow-blue-500/10' }
    },
    {
      id: 'messaging',
      icon: <ChatBubbleLeftRightIcon className="w-6 h-6" />,
      title: t('businessWelcome.features.messaging.title'),
      text: t('businessWelcome.features.messaging.description'),
      color: { bg: 'bg-green-500/20', text: 'text-green-400', shadow: 'shadow-green-500/10' }
    },
    {
      id: 'matters',
      icon: <BriefcaseIcon className="w-6 h-6" />,
      title: t('businessWelcome.features.matters.title'),
      text: t('businessWelcome.features.matters.description'),
      color: { bg: 'bg-purple-500/20', text: 'text-purple-400', shadow: 'shadow-purple-500/10' }
    },
    {
      id: 'billing',
      icon: <CreditCardIcon className="w-6 h-6" />,
      title: t('businessWelcome.features.billing.title'),
      text: t('businessWelcome.features.billing.description'),
      color: { bg: 'bg-orange-500/20', text: 'text-orange-400', shadow: 'shadow-orange-500/10' }
    }
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-8">
        <h2 className="text-2xl font-bold mb-4 text-input-text">{t('businessWelcome.title')}</h2>
        <p className="text-input-placeholder mb-8">
          {t('businessWelcome.subtitle')}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {features.map((feature) => (
            <div key={feature.id} className="flex space-x-4">
              <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${feature.color.bg} flex items-center justify-center shadow-lg ${feature.color.shadow}`}>
                <div className={`h-6 w-6 ${feature.color.text}`}>{feature.icon}</div>
              </div>
              <div>
                <h3 className="font-bold text-input-text">{feature.title}</h3>
                <p className="text-sm text-input-placeholder mt-1">{feature.text}</p>
              </div>
            </div>
          ))}
        </div>

        <Button variant="primary" className="w-full mt-4" onClick={handleGoToSettings}>
          {t('businessWelcome.goToSettings')}
        </Button>
      </div>
    </Modal>
  );
};
