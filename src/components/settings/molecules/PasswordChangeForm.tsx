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
  className = ''
}: PasswordChangeFormProps) => {
  const { t } = useTranslation(['settings']);

  if (!isOpen) return null;

  return (
    <div className={cn('mt-4 space-y-4', className)}>
      <div>
        <Input
          type="password"
          value={currentPassword}
          onChange={onCurrentPasswordChange}
          label={t('settings:security.password.fields.current.label')}
          placeholder={t('settings:security.password.fields.current.placeholder')}
          id="current-password"
        />
      </div>
      
      <div>
        <Input
          type="password"
          value={newPassword}
          onChange={onNewPasswordChange}
          label={t('settings:security.password.fields.new.label')}
          placeholder={t('settings:security.password.fields.new.placeholder')}
          id="new-password"
        />
      </div>
      
      <div>
        <Input
          type="password"
          value={confirmPassword}
          onChange={onConfirmPasswordChange}
          label={t('settings:security.password.fields.confirm.label')}
          placeholder={t('settings:security.password.fields.confirm.placeholder')}
          id="confirm-password"
        />
      </div>
      
      <div className="flex gap-2 pt-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onCancel}
        >
          {t('settings:security.password.cancelButton')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSubmit}
        >
          {t('settings:security.password.submit')}
        </Button>
      </div>
    </div>
  );
};

