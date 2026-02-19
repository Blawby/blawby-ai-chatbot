import type { ComponentChildren } from 'preact';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';

type FormActionSize = 'xs' | 'sm' | 'md' | 'lg';
type SubmitVariant = 'primary' | 'danger' | 'warning' | 'danger-ghost';
type CancelVariant = 'secondary' | 'ghost';

export interface FormActionsProps {
  className?: string;
  size?: FormActionSize;
  onCancel?: () => void;
  onSubmit?: () => void;
  cancelText?: ComponentChildren;
  submitText?: ComponentChildren;
  submitType?: 'button' | 'submit' | 'reset';
  submitVariant?: SubmitVariant;
  cancelVariant?: CancelVariant;
  disabled?: boolean;
  isLoading?: boolean;
  submitDisabled?: boolean;
  cancelDisabled?: boolean;
  destructive?: boolean;
}

export const FormActions = ({
  className,
  size = 'md',
  onCancel,
  onSubmit,
  cancelText = 'Cancel',
  submitText = 'Save',
  submitType = 'submit',
  submitVariant = 'primary',
  cancelVariant = 'secondary',
  disabled = false,
  isLoading = false,
  submitDisabled,
  cancelDisabled,
  destructive = false
}: FormActionsProps) => {
  const resolvedSubmitDisabled = submitDisabled ?? (disabled || isLoading);
  const resolvedCancelDisabled = cancelDisabled ?? (disabled || isLoading);

  const cancelButton = onCancel ? (
    <Button
      type="button"
      variant={cancelVariant}
      size={size}
      onClick={onCancel}
      disabled={resolvedCancelDisabled}
    >
      {cancelText}
    </Button>
  ) : null;

  const submitButton = submitText ? (
    <Button
      type={submitType}
      variant={submitVariant}
      size={size}
      onClick={submitType === 'button' ? onSubmit : undefined}
      disabled={resolvedSubmitDisabled}
    >
      {submitText}
    </Button>
  ) : null;

  return (
    <div className={cn('flex gap-3 pt-4', className)}>
      {destructive ? submitButton : cancelButton}
      {destructive ? cancelButton : submitButton}
    </div>
  );
};
