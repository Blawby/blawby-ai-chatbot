import { useState } from 'preact/hooks';
import { useTranslation, Trans } from '@/shared/i18n/hooks';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import ModalBody from './ModalBody';
import ModalHeader from './ModalHeader';
import ModalFooter from './ModalFooter';
import TipCard from './TipCard';
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
      title: t('welcome.client.tips.messaging.title'),
      description: t('welcome.client.tips.messaging.description')
    },
    {
      id: 'matters',
      icon: BriefcaseIcon,
      title: t('welcome.client.tips.matters.title'),
      description: t('welcome.client.tips.matters.description')
    },
    {
      id: 'payments',
      icon: CreditCardIcon,
      title: t('welcome.client.tips.payments.title'),
      description: t('welcome.client.tips.payments.description')
    }
  ] : [
    {
      id: 'askAway',
      icon: ChatBubbleLeftRightIcon,
      title: t('onboarding.welcome.tips.askAway.title'),
      description: t('onboarding.welcome.tips.askAway.description')
    },
    {
      id: 'privacy',
      icon: ShieldCheckIcon,
      title: t('onboarding.welcome.tips.privacy.title'),
      description: t('onboarding.welcome.tips.privacy.description')
    },
    {
      id: 'accuracy',
      icon: ExclamationTriangleIcon,
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
            const description =
              tip.id === 'privacy'
                ? (
                  <Trans
                    i18nKey="onboarding.welcome.tips.privacy.description"
                    components={{
                      helpCenterLink: (
                        <a
                          href="https://blawby.com/help"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-500 hover:text-accent-400 underline"
                        >
                          {t('onboarding.welcome.helpCenter')}
                        </a>
                      )
                    }}
                  />
                )
                : tip.description;

            return (
              <TipCard
                key={tip.id}
                icon={Icon}
                title={tip.title}
                description={description}
              />
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
