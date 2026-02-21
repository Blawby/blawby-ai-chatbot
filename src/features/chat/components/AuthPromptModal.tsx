import { FunctionComponent } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { Button } from '@/shared/ui/Button';
import Modal from '@/shared/components/Modal';
import AuthForm from '@/shared/components/AuthForm';

interface AuthPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  practiceName?: string | null;
  initialEmail?: string;
  initialName?: string;
  title?: string;
  description?: string;
  callbackURL?: string;
}

const AuthPromptModal: FunctionComponent<AuthPromptModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  practiceName,
  initialEmail,
  initialName,
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
          <p className="text-sm text-input-placeholder">
            {resolvedDescription}
            {shouldAppendPractice && ' '}
            {shouldAppendPractice && t('authPrompt.notificationWithPractice', { practiceName })}
          </p>
        </div>

        <AuthForm
          mode={currentMode}
          defaultMode="signup"
          initialEmail={initialEmail}
          initialName={initialName}
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
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            aria-label={t('authPrompt.secondaryCta')}
          >
            {t('authPrompt.secondaryCta')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AuthPromptModal;
