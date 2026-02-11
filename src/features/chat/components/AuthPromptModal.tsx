import { FunctionComponent } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import Modal from '@/shared/components/Modal';
import AuthForm from '@/shared/components/AuthForm';

interface AuthPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  practiceName?: string | null;
  title?: string;
  description?: string;
  callbackURL?: string;
}

const AuthPromptModal: FunctionComponent<AuthPromptModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  practiceName,
  title,
  description,
  callbackURL
}) => {
  const { t } = useTranslation('auth');
  const [currentMode, setCurrentMode] = useState<'signin' | 'signup'>('signup');
  const resolvedDescription = description ?? t('authPrompt.description');
  const shouldAppendPractice = Boolean(practiceName && !description);

  useEffect(() => {
    if (isOpen) {
      setCurrentMode('signup');
    }
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title ?? t('authPrompt.title')}
      type="modal"
      showCloseButton
      disableBackdropClick={false}
    >
      <div className="w-full max-w-xl mx-auto space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {resolvedDescription}
            {shouldAppendPractice && ' '}
            {shouldAppendPractice && t('authPrompt.notificationWithPractice', { practiceName })}
          </p>
        </div>

        <AuthForm
          mode={currentMode}
          defaultMode="signup"
          onModeChange={(mode) => setCurrentMode(mode)}
          callbackURL={callbackURL}
          onSuccess={async () => {
            if (onSuccess) {
              await onSuccess();
            }
            onClose();
          }}
          showHeader={false}
        />

        <div className="flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100 transition-colors"
            aria-label={t('authPrompt.secondaryCta')}
          >
            {t('authPrompt.secondaryCta')}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default AuthPromptModal;
