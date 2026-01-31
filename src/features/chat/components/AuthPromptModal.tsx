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
  conversationId?: string | null;
  practiceId?: string | null;
}

const AuthPromptModal: FunctionComponent<AuthPromptModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  practiceName,
  conversationId,
  practiceId
}) => {
  const { t } = useTranslation('auth');
  const [currentMode, setCurrentMode] = useState<'signin' | 'signup'>('signup');

  useEffect(() => {
    if (isOpen) {
      setCurrentMode('signup');
    }
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('authPrompt.title')}
      type="modal"
      showCloseButton
      disableBackdropClick={false}
    >
      <div className="w-full max-w-xl mx-auto space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t('authPrompt.description')}
            {practiceName && ' '}
            {practiceName && t('authPrompt.notificationWithPractice', { practiceName })}
          </p>
        </div>

        <AuthForm
          mode={currentMode}
          defaultMode="signup"
          onModeChange={(mode) => setCurrentMode(mode)}
          onSuccess={async () => {
            if (onSuccess) {
              await onSuccess();
            }
            onClose();
          }}
          conversationContext={{ conversationId: conversationId ?? undefined, practiceId: practiceId ?? undefined }}
          autoInviteOnAuth={true}
          inviteRole="member"
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
