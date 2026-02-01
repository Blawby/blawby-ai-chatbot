import { useState } from 'preact/hooks';
import { useTranslation, Trans } from '@/shared/i18n/hooks';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import ModalBody from './ModalBody';
import ModalHeader from './ModalHeader';
import ModalFooter from './ModalFooter';
import { 
  ChatBubbleLeftRightIcon, 
  ShieldCheckIcon, 
  ExclamationTriangleIcon,
  BriefcaseIcon,
  CreditCardIcon
} from '@heroicons/react/24/outline';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  workspace: 'client' | 'practice';
}

const WelcomeModal = ({ isOpen, onClose, onComplete, workspace }: WelcomeModalProps) => {
  const { t } = useTranslation('common');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isClient = workspace === 'client';

  const tips = isClient ? [
    {
      id: 'messaging',
      icon: ChatBubbleLeftRightIcon,
      iconColor: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/30',
      title: t('welcome.client.tips.messaging.title'),
      description: t('welcome.client.tips.messaging.description')
    },
    {
      id: 'matters',
      icon: BriefcaseIcon,
      iconColor: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/30',
      title: t('welcome.client.tips.matters.title'),
      description: t('welcome.client.tips.matters.description')
    },
    {
      id: 'payments',
      icon: CreditCardIcon,
      iconColor: 'text-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-900/30',
      title: t('welcome.client.tips.payments.title'),
      description: t('welcome.client.tips.payments.description')
    }
  ] : [
    {
      id: 'askAway',
      icon: ChatBubbleLeftRightIcon,
      iconColor: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/30',
      title: t('onboarding.welcome.tips.askAway.title'),
      description: t('onboarding.welcome.tips.askAway.description')
    },
    {
      id: 'privacy',
      icon: ShieldCheckIcon,
      iconColor: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/30',
      title: t('onboarding.welcome.tips.privacy.title'),
      description: t('onboarding.welcome.tips.privacy.description')
    },
    {
      id: 'accuracy',
      icon: ExclamationTriangleIcon,
      iconColor: 'text-yellow-500',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/30',
      title: t('onboarding.welcome.tips.accuracy.title'),
      description: t('onboarding.welcome.tips.accuracy.description')
    },
  ];

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = isClient 
    ? t('welcome.client.title')
    : t('welcome.lawyer.title');
  const subtitle = isClient 
    ? t('welcome.client.subtitle')
    : t('welcome.lawyer.subtitle');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      type="modal"
      showCloseButton={false}
    >
      <ModalBody>
        <ModalHeader
          title={title}
          subtitle={subtitle}
        />

        {/* Tips */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-8">
          {tips.map((tip) => {
            const Icon = tip.icon;
            
            return (
              <div key={tip.id} className="text-left">
                <div className={`w-12 h-12 rounded-full ${tip.bgColor} flex items-center justify-center mb-4`}>
                  <Icon className={`h-6 w-6 ${tip.iconColor}`} />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {tip.title}
                </h4>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {tip.id === 'privacy' ? (
                    <Trans
                      i18nKey="onboarding.welcome.tips.privacy.description"
                      components={{
                        helpCenterLink: (
                          <a 
                            href="https://blawby.com/help"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent-600 dark:text-accent-400 hover:text-accent-500 dark:hover:text-accent-300 underline"
                          >
                            {t('onboarding.welcome.helpCenter')}
                          </a>
                        )
                      }}
                    />
                  ) : (
                    tip.description
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <ModalFooter>
          <Button
            onClick={handleComplete}
            disabled={isSubmitting}
            variant="primary"
            size="sm"
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              t('onboarding.welcome.letsGo')
            )}
          </Button>
        </ModalFooter>
      </ModalBody>
    </Modal>
  );
};

export default WelcomeModal;
