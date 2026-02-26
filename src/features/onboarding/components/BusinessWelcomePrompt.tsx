/**
 * BusinessWelcomePrompt - Organism Component
 * 
 * Refactored from BusinessWelcomeModal.
 * Uses atomic components for consistent styling.
 */

import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import { 
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  BriefcaseIcon,
  CreditCardIcon
} from '@heroicons/react/24/outline';
import { useTranslation } from '@/shared/i18n/hooks';
import TipCard from '@/features/modals/components/TipCard';

interface BusinessWelcomePromptProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BusinessWelcomePrompt = ({ isOpen, onClose }: BusinessWelcomePromptProps) => {
  const { t } = useTranslation('common');
  const handleGoToSettings = () => {
    // Parent wires onClose to the route-specific settings navigation action.
    onClose();
  };

  const features = [
    {
      id: 'intake',
      icon: DocumentTextIcon,
      title: t('businessWelcome.features.intake.title'),
      text: t('businessWelcome.features.intake.description')
    },
    {
      id: 'messaging',
      icon: ChatBubbleLeftRightIcon,
      title: t('businessWelcome.features.messaging.title'),
      text: t('businessWelcome.features.messaging.description')
    },
    {
      id: 'matters',
      icon: BriefcaseIcon,
      title: t('businessWelcome.features.matters.title'),
      text: t('businessWelcome.features.matters.description')
    },
    {
      id: 'billing',
      icon: CreditCardIcon,
      title: t('businessWelcome.features.billing.title'),
      text: t('businessWelcome.features.billing.description')
    }
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-8 glass-panel">
        <h2 className="text-2xl font-bold mb-4 text-input-text">{t('businessWelcome.title')}</h2>
        <p className="text-input-placeholder mb-8">
          {t('businessWelcome.subtitle')}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {features.map((feature) => (
            <TipCard
              key={feature.id}
              icon={feature.icon}
              title={feature.title}
              description={feature.text}
            />
          ))}
        </div>

        <Button variant="primary" className="w-full mt-4" onClick={handleGoToSettings}>
          {t('businessWelcome.goToSettings')}
        </Button>
      </div>
    </Modal>
  );
};
