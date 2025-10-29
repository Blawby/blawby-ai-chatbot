import { useState, useMemo, useEffect } from 'preact/hooks';
import { Button } from '../../ui/Button';
import { useToastContext } from '../../../contexts/ToastContext';
import { useNavigation } from '../../../utils/navigation';
import { authClient, hasTwoFactorPlugin, type TwoFactorClient } from '../../../lib/authClient';
import { useTranslation } from '@/i18n/hooks';

export interface MFAEnrollmentPageProps {
  className?: string;
}

/**
 * Error thrown when MFA is not configured/available on the account
 */
export class MFAConfigurationError extends Error {
  constructor(message: string = 'MFA is not configured on this account') {
    super(message);
    this.name = 'MFAConfigurationError';
  }
}

/**
 * Error thrown when MFA verification fails (invalid code, etc.)
 */
export class MFAVerificationError extends Error {
  constructor(message: string = 'MFA verification failed') {
    super(message);
    this.name = 'MFAVerificationError';
  }
}

export const MFAEnrollmentPage = ({
  className = ''
}: MFAEnrollmentPageProps) => {
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isMFAConfigured, setIsMFAConfigured] = useState<boolean | null>(null);
  const { t } = useTranslation(['settings', 'common']);

  // Check for twoFactor availability during component initialization
  useEffect(() => {
    const checkMFAAvailability = () => {
      if (hasTwoFactorPlugin(authClient)) {
        setIsMFAConfigured(true);
      } else {
        setIsMFAConfigured(false);
      }
    };

    checkMFAAvailability();
  }, []);

  // Mock QR code data - in real app, this would come from your backend
  const manualCode = 'JBSWY3DPEHPK3PXP';

  // Generate a stable QR pattern that doesn't change on re-renders
  const qrPattern = useMemo(() => {
    // Use a deterministic seed based on the manual code to ensure consistency
    const seed = manualCode.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const pattern = Array.from({ length: 64 }, (_, i) => {
      // Simple pseudo-random function using the seed and index
      const x = (seed + i * 17) % 1000;
      return x > 500;
    });
    return pattern;
  }, [manualCode]);

  const handleVerification = async () => {
    if (!verificationCode.trim()) {
      showError(
        t('settings:mfa.errors.codeRequired.title'),
        t('settings:mfa.errors.codeRequired.body')
      );
      return;
    }

    if (verificationCode.length < 6) {
      showError(
        t('settings:mfa.errors.codeInvalid.title'),
        t('settings:mfa.errors.codeInvalid.body')
      );
      return;
    }

    setIsVerifying(true);
    try {
      // Double-check configuration before attempting verification
      if (!hasTwoFactorPlugin(authClient)) {
        throw new MFAConfigurationError();
      }
      // Here you would verify the code with your backend
      // await authService.verifyMFACode(verificationCode);
      
      // Simulate API call with conditional rejection for testing
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          // Randomly reject ~30% of the time to test error flow
          if (Math.random() < 0.3) {
            reject(new MFAVerificationError('Invalid verification code. Please check your authenticator app and try again.'));
          } else {
            resolve(undefined);
          }
        }, 1000);
      });
      
      // Enable MFA using Better Auth twoFactor plugin
      // Type guard ensures twoFactor is available
      if (!hasTwoFactorPlugin(authClient)) {
        throw new MFAConfigurationError();
      }

      const twoFactorClient: TwoFactorClient = authClient.twoFactor;
      await twoFactorClient.enable({ code: verificationCode });
      
      showSuccess(
        t('settings:security.mfa.toastEnabled.title'),
        t('settings:security.mfa.toastEnabled.body')
      );
      navigate('/settings/security');
    } catch (error) {
      // Distinguish between configuration errors and verification failures
      if (error instanceof MFAConfigurationError) {
        showError(
          t('settings:mfa.errors.configurationError.title'),
          t('settings:mfa.errors.configurationError.body')
        );
      } else if (error instanceof MFAVerificationError) {
        showError(
          t('settings:mfa.errors.verifyFailed.title'),
          t('settings:mfa.errors.verifyFailed.body')
        );
      } else {
        // Fallback for unexpected errors - check if it's a configuration issue
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('not available') || errorMessage.includes('not configured')) {
          showError(
            t('settings:mfa.errors.configurationError.title'),
            t('settings:mfa.errors.configurationError.body')
          );
        } else {
          // Assume it's a verification failure for other errors
          showError(
            t('settings:mfa.errors.verifyFailed.title'),
            t('settings:mfa.errors.verifyFailed.body')
          );
        }
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCopyManualCode = async () => {
    // Check if clipboard API is supported
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      showError(
        t('settings:mfa.errors.clipboardUnsupported.title'),
        t('settings:mfa.errors.clipboardUnsupported.body')
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(manualCode);
      showSuccess(t('settings:mfa.copied.title'), t('settings:mfa.copied.body'));
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '';
      const message = rawMessage || t('settings:mfa.errors.copyFailed.unknown');
      showError(
        t('settings:mfa.errors.copyFailed.title'),
        t('settings:mfa.errors.copyFailed.body', { message })
      );
    }
  };

  return (
    <div className={`min-h-screen bg-white dark:bg-dark-bg ${className}`}>
      {/* Header */}
      <div className="px-6 py-8">
        <div className="max-w-md mx-auto">
          <button
            onClick={() => navigate('/settings/security')}
            className="mb-6 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex items-center"
          >
            {t('settings:mfa.back')}
          </button>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 text-center">
            {t('settings:mfa.title')}
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 pb-8">
        <div className="max-w-md mx-auto text-center space-y-8">
          {/* Configuration Error Banner */}
          {isMFAConfigured === false && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                    {t('settings:mfa.errors.configurationError.title')}
                  </h3>
                  <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                    <p>{t('settings:mfa.errors.configurationError.body')}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="space-y-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('settings:mfa.instructions')}
            </p>
          </div>

          {/* QR Code */}
          <div className="flex justify-center">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              {/* Mock QR Code - in real app, you'd use a QR code library */}
              <div className="w-48 h-48 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                <div className="text-center">
                  <div className="w-32 h-32 bg-black dark:bg-white rounded grid grid-cols-8 gap-1 p-2">
                    {/* Mock QR pattern - stable pattern that doesn't flicker */}
                    {qrPattern.map((isWhite, i) => (
                      <div
                        key={i}
                        className={`w-full h-full rounded-sm ${
                          isWhite ? 'bg-white dark:bg-black' : 'bg-black dark:bg-white'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {t('settings:mfa.qrLabel')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Troubleshooting Link */}
          <div>
            <button
              onClick={handleCopyManualCode}
              className="text-sm text-accent-600 dark:text-accent-400 hover:text-accent-700 dark:hover:text-accent-300 underline"
            >
              {t('settings:mfa.troubleScanning')}
            </button>
          </div>

          {/* Separator */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-dark-bg text-gray-500 dark:text-gray-400">
                {t('settings:mfa.then')}
              </span>
            </div>
          </div>

          {/* Code Input */}
          <div className="space-y-4">
            <div className="text-left">
              <label htmlFor="verification-code" className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                {t('settings:mfa.codeLabel')}
              </label>
              <input
                id="verification-code"
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.currentTarget.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t('settings:mfa.codePlaceholder')}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-input-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent text-center text-lg tracking-widest"
                maxLength={6}
              />
            </div>

            {/* Continue Button */}
            <Button
              variant="primary"
              size="lg"
              onClick={handleVerification}
              disabled={isVerifying || verificationCode.length !== 6 || isMFAConfigured === false}
              className="w-full"
            >
              {isVerifying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  {t('settings:mfa.verifying')}
                </>
              ) : (
                t('settings:mfa.verifyButton')
              )}
            </Button>
          </div>

          {/* Footer Links */}
          <div className="pt-8 border-t border-gray-200 dark:border-dark-border">
            <div className="flex justify-center space-x-4 text-sm">
              <button
                type="button"
                className="text-accent-600 dark:text-accent-400 hover:text-accent-700 dark:hover:text-accent-300"
              >
                {t('settings:mfa.footer.terms')}
              </button>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <button
                type="button"
                className="text-accent-600 dark:text-accent-400 hover:text-accent-700 dark:hover:text-accent-300"
              >
                {t('settings:mfa.footer.privacy')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
