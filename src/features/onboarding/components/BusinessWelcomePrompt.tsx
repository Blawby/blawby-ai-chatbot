/**
 * BusinessWelcomePrompt - Organism Component
 * 
 * Refactored from BusinessWelcomeDialog.
 * Uses atomic components for consistent styling.
 */

import { InfoListDialog, type InfoListDialogItem } from '@/shared/ui/dialog';
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
 const { t } = useTranslation('common');
 const handleGoToSettings = () => {
  // Parent wires onClose to the route-specific settings navigation action.
  onClose();
 };

 const features: InfoListDialogItem[] = [
  {
   id: 'intake',
   icon: DocumentTextIcon,
   title: t('businessWelcome.features.intake.title'),
   description: t('businessWelcome.features.intake.description')
  },
  {
   id: 'messaging',
   icon: ChatBubbleLeftRightIcon,
   title: t('businessWelcome.features.messaging.title'),
   description: t('businessWelcome.features.messaging.description')
  },
  {
   id: 'matters',
   icon: BriefcaseIcon,
   title: t('businessWelcome.features.matters.title'),
   description: t('businessWelcome.features.matters.description')
  },
  {
   id: 'billing',
   icon: CreditCardIcon,
   title: t('businessWelcome.features.billing.title'),
   description: t('businessWelcome.features.billing.description')
  }
 ];

 return (
  <InfoListDialog
   isOpen={isOpen}
   onClose={onClose}
   title={t('businessWelcome.title')}
   description={t('businessWelcome.subtitle')}
   items={features}
   actionLabel={t('businessWelcome.goToSettings')}
   onAction={handleGoToSettings}
   actionFullWidth={false}
   contentClassName="max-w-4xl"
  />
 );
};
