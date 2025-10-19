import { useState } from 'preact/hooks';
import { useTranslation, Trans } from '@/i18n/hooks';
import Modal from '../Modal';
import { Button } from '../ui/Button';
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
  const { t } = useTranslation('common');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleComplete = async () => {
    setIsSubmitting(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    onComplete();
    setIsSubmitting(false);
  };

  const tips = [
    {
      id: 'askAway',
      icon: ChatBubbleLeftRightIcon,
      iconColor: 'text-green-500',
      bgColor: 'bg-green-100 dark:bg-green-900/20'
    },
    {
      id: 'privacy',
      icon: ShieldCheckIcon,
      iconColor: 'text-purple-500',
      bgColor: 'bg-purple-100 dark:bg-purple-900/20'
    },
    {
      id: 'accuracy',
      icon: ExclamationTriangleIcon,
      iconColor: 'text-orange-500',
      bgColor: 'bg-orange-100 dark:bg-orange-900/20'
    }
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      type="modal"
      showCloseButton={false}
    >
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-left mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {t('onboarding.welcome.title')}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('onboarding.welcome.subtitle')}
          </p>
        </div>

        {/* Tips */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          {tips.map((tip) => {
            const Icon = tip.icon;
            
            return (
              <div key={tip.id} className="text-left">
                <div className={`w-12 h-12 rounded-full ${tip.bgColor} flex items-center justify-center mb-4`}>
                  <Icon className={`h-6 w-6 ${tip.iconColor}`} />
                </div>
                <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2">
                  {t(`onboarding.welcome.tips.${tip.id}.title`)}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {tip.id === 'privacy' ? (
                    <Trans
                      i18nKey={`onboarding.welcome.tips.${tip.id}.description`}
                      components={{
                        helpCenterLink: (
                          <a 
                            href="/help" 
                            className="text-accent-600 dark:text-accent-400 hover:text-accent-500 dark:hover:text-accent-300 underline"
                          >
                            {t('onboarding.welcome.helpCenter')}
                          </a>
                        )
                      }}
                    />
                  ) : (
                    t(`onboarding.welcome.tips.${tip.id}.description`)
                  )}
                </p>
              </div>
            );
          })}
        </div>

        {/* Action Button */}
        <div className="flex justify-end">
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
        </div>
      </div>
    </Modal>
  );
};

export default WelcomeModal;
