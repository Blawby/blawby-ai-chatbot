import { useState } from 'preact/hooks';
import { useTranslation, Trans } from '@/i18n/hooks';
import Modal from '../../Modal';
import { Button } from '../../ui/Button';
import { ModalBody, ModalHeader, ModalFooter } from '../atoms';
import { 
  ChatBubbleLeftRightIcon, 
  ShieldCheckIcon, 
  ExclamationTriangleIcon 
} from '@heroicons/react/24/outline';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const WelcomeModal = ({ isOpen, onClose, onComplete }: WelcomeModalProps) => {
  const { t } = useTranslation(['onboarding']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tips = [
    {
      id: 'chatTips',
      icon: ChatBubbleLeftRightIcon,
      iconColor: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/30',
    },
    {
      id: 'privacy',
      icon: ShieldCheckIcon,
      iconColor: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/30',
    },
    {
      id: 'safety',
      icon: ExclamationTriangleIcon,
      iconColor: 'text-yellow-500',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/30',
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      type="modal"
      showCloseButton={false}
    >
      <ModalBody>
        <ModalHeader
          title={t('onboarding.welcome.title')}
          subtitle={t('onboarding.welcome.subtitle')}
        />

        {/* Tips */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          {tips.map((tip) => {
            const Icon = tip.icon;
            
            return (
              <div key={tip.id} className="text-left">
                <div className={`w-12 h-12 rounded-full ${tip.bgColor} flex items-center justify-center mb-4`}>
                  <Icon className={`h-6 w-6 ${tip.iconColor}`} />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {t(`onboarding.welcome.tips.${tip.id}.title`)}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {tip.id === 'chatTips' ? (
                    <Trans
                      i18nKey={`onboarding.welcome.tips.${tip.id}.description`}
                      components={{1: <span className="font-medium" />}}
                    />
                  ) : (
                    t(`onboarding.welcome.tips.${tip.id}.description`)
                  )}
                </p>
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
