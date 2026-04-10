import { useState, useEffect } from 'preact/hooks';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { FormActions } from '@/shared/ui/form';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { handleError } from '@/shared/utils/errorHandler';
import { useTranslation } from 'react-i18next';

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
          {/* Warning Content */}
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
              
              {/* Confirmation Input */}
              <div className="space-y-2">
                <label htmlFor="confirmation-input" className="block text-sm font-medium text-input-text">
                  {confirmationLabel}
                  <span className="font-mono text-sm bg-white/5 border border-line-glass/30 px-2 py-1 rounded ml-2">
                    {confirmationValue}
                  </span>
                </label>
                <input
                  id="confirmation-input"
                  type="text"
                  value={inputValue}
                  onChange={handleInputChange}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  placeholder={`Type "${confirmationValue}" to confirm`}
                  className={`w-full px-3 py-2 border rounded-lg text-sm bg-input-bg text-input-text placeholder:text-input-placeholder border-input-border focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 ${
                    error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''
                  }`}
                  disabled={isLoading}
                />
                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {error}
                  </p>
                )}

                {/* Success Message */}
                {showSuccessMessage && successMessage && (
                  <div className="mt-4 rounded-lg status-success p-3">
                    {successMessage.title && (
                      <p className="text-sm font-medium text-input-text mb-2">
                        {successMessage.title}
                      </p>
                    )}
                    <p className="text-sm text-input-text">
                      {successMessage.body}
                    </p>
                  </div>
                )}

                {/* Password Input */}
                {requirePassword && (
                  <div className="space-y-2 pt-4">
                    <label htmlFor="confirmation-password" className="block text-sm font-medium text-input-text">
                      {passwordLabel}
                    </label>
                    <input
                      id="confirmation-password"
                      type="password"
                      value={passwordValue}
                      onChange={handlePasswordChange}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      placeholder={passwordPlaceholder}
                      className={`w-full px-3 py-2 border rounded-lg text-sm bg-input-bg text-input-text placeholder:text-input-placeholder border-input-border focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 ${
                        passwordError ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''
                      }`}
                      disabled={isLoading}
                      autoComplete="current-password"
                    />
                    {passwordError && (
                      <p className="text-sm text-red-600 dark:text-red-400">
                        {passwordError}
                      </p>
                    )}
                  </div>
                )}
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
                  ariaLabel={t('common.processing', { defaultValue: 'Processing...' })}
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
