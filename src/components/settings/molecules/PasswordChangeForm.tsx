import { Input } from '../../ui/input';
import { Button } from '../../ui/Button';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '../../../utils/cn';

export interface PasswordChangeFormProps {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isOpen: boolean;
  className?: string;
  isLoading?: boolean;
  error?: string | null;
  fieldErrors?: {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  };
}

export const PasswordChangeForm = ({
  currentPassword,
  newPassword,
  confirmPassword,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  onCancel,
  isOpen,
  className = '',
  isLoading = false,
  error,
  fieldErrors
}: PasswordChangeFormProps) => {
  const { t } = useTranslation(['settings']);

  if (!isOpen) return null;

  return (
    <div className={cn('mt-4 space-y-4', className)}>
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</div>
      )}
      <div>
        <Input
          type="password"
          value={currentPassword}
          onChange={(v) => !isLoading && onCurrentPasswordChange(v)}
          label={t('settings:security.password.fields.current.label')}
          placeholder={t('settings:security.password.fields.current.placeholder')}
          id="current-password"
          error={fieldErrors?.currentPassword}
        />
      </div>
      
      <div>
        <Input
          type="password"
          value={newPassword}
          onChange={(v) => !isLoading && onNewPasswordChange(v)}
          label={t('settings:security.password.fields.new.label')}
          placeholder={t('settings:security.password.fields.new.placeholder')}
          id="new-password"
          error={fieldErrors?.newPassword}
        />
      </div>
      
      <div>
        <Input
          type="password"
          value={confirmPassword}
          onChange={(v) => !isLoading && onConfirmPasswordChange(v)}
          label={t('settings:security.password.fields.confirm.label')}
          placeholder={t('settings:security.password.fields.confirm.placeholder')}
          id="confirm-password"
          error={fieldErrors?.confirmPassword}
        />
      </div>
      
      <div className="flex gap-2 pt-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { if (!isLoading) onCancel(); }}
          disabled={isLoading}
        >
          {t('settings:security.password.cancelButton')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => { if (!isLoading) onSubmit(); }}
          disabled={isLoading}
        >
          {t('settings:security.password.submit')}
        </Button>
      </div>
    </div>
  );
};

