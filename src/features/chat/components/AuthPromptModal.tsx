import { FunctionComponent } from 'preact';
import { Button } from '@/shared/ui/Button';
import { useTranslation } from '@/shared/i18n/hooks';
import { THEME } from '@/shared/utils/constants';

interface AuthPromptModalProps {
  isOpen: boolean;
  onSignIn: () => void;
  onClose: () => void;
  practiceName?: string | null;
}

const AuthPromptModal: FunctionComponent<AuthPromptModalProps> = ({
  isOpen,
  onSignIn,
  onClose,
  practiceName
}) => {
  const { t } = useTranslation('auth');

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      style={{ zIndex: THEME.zIndex.modal }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-prompt-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-dark-card-bg"
      >
        <div className="mb-4">
          <h2 id="auth-prompt-title" className="text-xl font-semibold text-gray-900 dark:text-white">
            {t('authPrompt.title')}
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {t('authPrompt.description')}
            {practiceName && ' '}
            {practiceName && t('authPrompt.notificationWithPractice', { practiceName })}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            onClick={onSignIn}
            variant="primary"
            size="md"
            className="w-full"
            aria-label={t('authPrompt.primaryCta')}
          >
            {t('authPrompt.primaryCta')}
          </Button>
          <Button
            onClick={onClose}
            variant="ghost"
            size="md"
            className="w-full text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
            aria-label={t('authPrompt.secondaryCta')}
          >
            {t('authPrompt.secondaryCta')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AuthPromptModal;
