import { useEffect, useRef, useState } from 'preact/hooks';
import { useTranslation, Trans } from '@/shared/i18n/hooks';
import { InfoListDialog, type InfoListDialogItem } from '@/shared/ui/dialog';
import {
  ChatBubbleLeftRightIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  BriefcaseIcon,
  CreditCardIcon,
} from '@heroicons/react/24/outline';

interface WelcomeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void | Promise<void>;
  workspace: 'client' | 'practice';
}

const WelcomeDialog = ({ isOpen, onClose, onComplete, workspace }: WelcomeDialogProps) => {
  const { t } = useTranslation('common');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isClient = workspace === 'client';

  const items: InfoListDialogItem[] = (isClient
    ? [
        {
          id: 'messaging',
          icon: ChatBubbleLeftRightIcon,
          title: t('welcome.client.tips.messaging.title'),
          description: t('welcome.client.tips.messaging.description'),
        },
        {
          id: 'matters',
          icon: BriefcaseIcon,
          title: t('welcome.client.tips.matters.title'),
          description: t('welcome.client.tips.matters.description'),
        },
        {
          id: 'payments',
          icon: CreditCardIcon,
          title: t('welcome.client.tips.payments.title'),
          description: t('welcome.client.tips.payments.description'),
        },
      ]
    : [
        {
          id: 'askAway',
          icon: ChatBubbleLeftRightIcon,
          title: t('onboarding.welcome.tips.askAway.title'),
          description: t('onboarding.welcome.tips.askAway.description'),
        },
        {
          id: 'privacy',
          icon: ShieldCheckIcon,
          title: t('onboarding.welcome.tips.privacy.title'),
          description: (
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
                ),
              }}
            />
          ),
        },
        {
          id: 'accuracy',
          icon: ExclamationTriangleIcon,
          title: t('onboarding.welcome.tips.accuracy.title'),
          description: t('onboarding.welcome.tips.accuracy.description'),
        },
      ]) satisfies InfoListDialogItem[];

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await onComplete();
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <InfoListDialog
      isOpen={isOpen}
      onClose={onClose}
      title={isClient ? t('welcome.client.title') : t('welcome.lawyer.title')}
      description={isClient ? t('welcome.client.subtitle') : t('welcome.lawyer.subtitle')}
      items={items}
      actionLabel={isSubmitting ? (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
          />
          <span>{t('onboarding.welcome.letsGo')}</span>
        </span>
      ) : (
        t('onboarding.welcome.letsGo')
      )}
      onAction={() => { void handleComplete(); }}
      actionDisabled={isSubmitting}
      actionSize="sm"
      actionFullWidth={false}
      contentClassName="max-w-2xl"
    />
  );
};

export default WelcomeDialog;
