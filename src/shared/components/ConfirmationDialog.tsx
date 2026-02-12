import { useState, useEffect } from 'preact/hooks';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import { handleError } from '@/shared/utils/errorHandler';

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      showCloseButton={true}
      type="modal"
      disableBackdropClick={true}
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="space-y-4 pb-4">
          {/* Warning Content */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <ExclamationTriangleIcon className="w-6 h-6 text-red-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {description}
              </p>
              
              {/* Warning Items List */}
              {warningItems.length > 0 && (
                <div className="bg-surface-card rounded-lg p-3 mb-4">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <strong>This will permanently delete:</strong>
                  </p>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 mt-2 space-y-1">
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
                  <span className="font-mono text-sm bg-surface-card px-2 py-1 rounded ml-2">
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
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
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
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end pt-4 border-t border-line-default">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="min-w-[80px]"
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={
              isLoading ||
              inputValue.trim() !== confirmationValue.trim() ||
              (requirePassword && !passwordValue)
            }
            className="bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700 focus:ring-red-500 min-w-[80px] disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={(e) => e.stopPropagation()}
          >
            {isLoading ? 'Processing...' : confirmText}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
