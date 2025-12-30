import { useState } from 'preact/hooks';
import { useTranslation, Trans } from '@/shared/i18n/hooks';
import { Button } from '@/shared/ui/Button';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { 
  ChatBubbleLeftRightIcon, 
  ShieldCheckIcon, 
  ExclamationTriangleIcon 
} from '@heroicons/react/24/outline';

interface WelcomeStepProps {
  onComplete: () => void;
}

const WelcomeStep = ({ onComplete }: WelcomeStepProps) => {
  const { t } = useTranslation('common');
  const { showError } = useToastContext();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleComplete = async () => {
    setIsSubmitting(true);
    
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      try {
        onComplete();
      } catch (error) {
        console.error('Error in onComplete callback:', error);
        showError(
          'Setup Error',
          'There was a problem completing the setup. Please try again.'
        );
      }
    } finally {
      // Ensure isSubmitting is always reset, whether the API call succeeds or throws
      setIsSubmitting(false);
    }
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
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          {t('onboarding.welcome.title')}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          {t('onboarding.welcome.subtitle')}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="bg-white dark:bg-dark-card-bg py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="space-y-6">
            {/* Tips */}
            <div className="space-y-4">
              {tips.map((tip) => {
                const Icon = tip.icon;
                
                return (
                  <div key={tip.id} className="flex items-start space-x-4">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full ${tip.bgColor} flex items-center justify-center`}>
                      <Icon className={`h-5 w-5 ${tip.iconColor}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                        {t(`onboarding.welcome.tips.${tip.id}.title`)}
                      </h3>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
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
                  </div>
                );
              })}
            </div>

            {/* Action Button */}
            <div className="pt-4">
              <Button
                onClick={handleComplete}
                disabled={isSubmitting}
                variant="primary"
                size="lg"
                className="w-full"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  t('onboarding.welcome.letsGo')
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeStep;
