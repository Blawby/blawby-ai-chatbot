import { useState, useEffect } from 'preact/hooks';
import { useId } from 'preact/hooks';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { FormActions } from '@/shared/ui/form';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { handleError } from '@/shared/utils/errorHandler';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/utils/cn';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (options?: { password?: string }) => Promise<void>;
  title: string;
  description: string;
  confirmText: string;
  cancelText?: string;
  confirmationValue: string; // Exact text user must type
  confirmationLabel: string; // Label showing what to type
  warningItems?: string[]; // List of consequences
  successMessage?: { title: string; body: string };
  showSuccessMessage?: boolean;
  requirePassword?: boolean;
  passwordLabel?: string;
  passwordPlaceholder?: string;
  passwordMissingMessage?: string;
}

export default function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  cancelText = 'Cancel',
  confirmationValue,
  confirmationLabel,
  warningItems = [],
  successMessage,
  showSuccessMessage = false,
  requirePassword = false,
  passwordLabel = 'Enter your password to confirm deletion.',
  passwordPlaceholder = 'Current password',
  passwordMissingMessage = 'Please enter your password to continue.'
}: ConfirmationDialogProps) {
  const { t } = useTranslation();
  const confirmationInputId = useId();
  const confirmationPasswordId = useId();
  
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Clear input and error when modal closes
  useEffect(() => {
    if (!isOpen) {
      setInputValue('');
      setError(null);
      setIsLoading(false);
      setPasswordValue('');
      setPasswordError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    
    if (inputValue.trim() !== confirmationValue.trim()) {
      setError('Please type the confirmation text exactly as shown.');
      return;
    }

    if (requirePassword && !passwordValue) {
      setPasswordError(passwordMissingMessage);
      return;
    }

    setIsLoading(true);
    setError(null);
    setPasswordError(null);

    try {
      await onConfirm({ password: passwordValue });
    } catch (err) {
      handleError(err, {
        component: 'ConfirmationDialog',
        action: 'confirmation-failed'
      });
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    setInputValue(target.value);
    setError(null); // Clear error when user types
  };

  const handlePasswordChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    setPasswordValue(target.value);
    setPasswordError(null);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      showCloseButton={true}
      disableBackdropClick={true}
      contentClassName="max-w-lg"
    >
      <form onSubmit={handleSubmit} noValidate>
        <DialogBody className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <Icon icon={ExclamationTriangleIcon} className="w-6 h-6 text-red-500"  />
            </div>
            <div className="flex-1">
              {/* Warning Items List */}
              {warningItems.length > 0 && (
                <div className="mb-4 space-y-2">
                  <p className="text-sm font-medium text-input-text">
                    This will permanently delete:
                  </p>
                  <ul className="space-y-1 text-sm text-input-placeholder">
                    {warningItems.map((item, idx) => (
                      <li key={idx}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-4 pt-2">
                {/* Confirmation Input */}
                <div className="space-y-2">
                  <label htmlFor={confirmationInputId} className="block text-sm font-medium text-input-text">
                    {confirmationLabel}
                    <span className="font-mono text-sm bg-surface-utility/10 border border-line-glass/30 px-2 py-1 rounded ml-2">
                      {confirmationValue}
                    </span>
                  </label>
                  <input
                    id={confirmationInputId}
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    placeholder={`Type "${confirmationValue}" to confirm`}
                    className={cn(
                      'glass-input w-full rounded-xl px-3 py-2 text-sm',
                      error ? 'isError' : ''
                    )}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${confirmationInputId}-error` : undefined}
                    disabled={isLoading}
                  />
                  {error && (
                    <p id={`${confirmationInputId}-error`} className="text-sm text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  )}
                </div>

                {/* Success Message */}
                {showSuccessMessage && successMessage && (
                  <div className="status-success rounded-xl py-2.5 px-3 text-sm">
                    {successMessage.title && (
                      <p className="mb-1 text-sm font-semibold">
                        {successMessage.title}
                      </p>
                    )}
                    <p className="text-sm opacity-90">
                      {successMessage.body}
                    </p>
                  </div>
                )}

                {/* Password Input */}
                {requirePassword && (
                  <div className="space-y-2">
                    <label htmlFor={confirmationPasswordId} className="block text-sm font-medium text-input-text">
                      {passwordLabel}
                    </label>
                    <input
                      id={confirmationPasswordId}
                      type="password"
                      value={passwordValue}
                      onChange={handlePasswordChange}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      placeholder={passwordPlaceholder}
                      className={cn(
                        'glass-input w-full rounded-xl px-3 py-2 text-sm',
                        passwordError ? 'isError' : ''
                      )}
                      aria-invalid={Boolean(passwordError)}
                      aria-describedby={passwordError ? `${confirmationPasswordId}-error` : undefined}
                      disabled={isLoading}
                      autoComplete="current-password"
                    />
                    {passwordError && (
                      <p id={`${confirmationPasswordId}-error`} className="text-sm text-red-600 dark:text-red-400">
                        {passwordError}
                      </p>
                    )}
                  </div>
                )}
              </div>
              </div>
            </div>
          </div>
        </DialogBody>

        {/* Action Buttons */}
        <DialogFooter className="p-0">
          <FormActions
            className="w-full justify-end border-0 px-5 py-4 sm:px-6"
            size="sm"
            onCancel={onClose}
            cancelText={cancelText}
            submitText={isLoading ? (
              <span className="inline-flex items-center">
                <LoadingSpinner
                  size="sm"
                  className="mr-2"
                  ariaLabel={t('common.processing')}
                />
                {confirmText}
              </span>
            ) : confirmText}
            submitType="submit"
            submitVariant="danger"
            submitDisabled={
              isLoading ||
              inputValue.trim() !== confirmationValue.trim() ||
              (requirePassword && !passwordValue)
            }
            cancelDisabled={isLoading}
          />
        </DialogFooter>
      </form>
    </Dialog>
  );
}
