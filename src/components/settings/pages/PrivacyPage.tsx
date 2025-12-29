import { useCallback, useEffect, useState } from 'preact/hooks';
import { useToastContext } from '../../../contexts/ToastContext';
import { SettingHeader } from '../atoms';
import { SettingSection, SettingToggle } from '../molecules';
import { SectionDivider } from '../../ui';
import { Button } from '../../ui/Button';
import { useNavigation } from '../../../utils/navigation';
import Modal from '../../Modal';

type PrivacySettings = {
  piiConsentGiven: boolean;
  dataProcessingConsent: boolean;
  dataRetentionConsent: boolean;
  marketingConsent: boolean;
};

const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  piiConsentGiven: false,
  dataProcessingConsent: false,
  dataRetentionConsent: false,
  marketingConsent: false
};

const PRIVACY_STORAGE_KEY = 'privacyPreferences';

// Critical consents that require confirmation when disabling
const CRITICAL_CONSENTS: (keyof PrivacySettings)[] = ['piiConsentGiven', 'dataProcessingConsent'];

export default function PrivacyPage() {
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULT_PRIVACY_SETTINGS);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<{ key: keyof PrivacySettings; value: boolean } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const stored = window.localStorage.getItem(PRIVACY_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      
      // Validate parsed data before merging
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const validated: Partial<PrivacySettings> = {};
        if (typeof parsed.piiConsentGiven === 'boolean') {
          validated.piiConsentGiven = parsed.piiConsentGiven;
        }
        if (typeof parsed.dataProcessingConsent === 'boolean') {
          validated.dataProcessingConsent = parsed.dataProcessingConsent;
        }
        if (typeof parsed.dataRetentionConsent === 'boolean') {
          validated.dataRetentionConsent = parsed.dataRetentionConsent;
        }
        if (typeof parsed.marketingConsent === 'boolean') {
          validated.marketingConsent = parsed.marketingConsent;
        }
        setSettings(prev => ({ ...prev, ...validated }));
      }
    } catch (error) {
      console.warn('Failed to load privacy preferences:', error);
    }
  }, []);

  const handleToggle = useCallback(async (key: keyof PrivacySettings, value: boolean) => {
    // If disabling a critical consent, show confirmation dialog
    if (!value && CRITICAL_CONSENTS.includes(key)) {
      setPendingToggle({ key, value });
      setShowConfirmDialog(true);
      return;
    }

    // For enabling or non-critical toggles, proceed directly
    setSettings(prev => {
      const nextSettings = { ...prev, [key]: value };
      
      // Persist after state update using the new value
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(nextSettings));
        }
        showSuccess('Privacy updated', 'Your privacy preferences have been saved.');
      } catch (error) {
        console.error('Failed to update privacy settings:', error);
        showError('Update failed', 'We could not save your privacy preferences. Please try again.');
      }
      
      return nextSettings;
    });
  }, [showError, showSuccess]);

  const handleConfirmToggle = useCallback(() => {
    if (!pendingToggle) return;

    setSettings(prev => {
      const nextSettings = { ...prev, [pendingToggle.key]: pendingToggle.value };
      
      // Persist after state update using the new value
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(nextSettings));
        }
        showSuccess('Privacy updated', 'Your privacy preferences have been saved.');
      } catch (error) {
        console.error('Failed to update privacy settings:', error);
        showError('Update failed', 'We could not save your privacy preferences. Please try again.');
      }
      
      return nextSettings;
    });

    setShowConfirmDialog(false);
    setPendingToggle(null);
  }, [pendingToggle, showError, showSuccess]);

  const handleCancelToggle = useCallback(() => {
    setShowConfirmDialog(false);
    setPendingToggle(null);
  }, []);

  return (
    <div className="h-full flex flex-col">
      <SettingHeader title="Privacy" />

      <div className="flex-1 overflow-y-auto px-6">
        <div className="space-y-0">
          <SettingSection
            title="Consent & data use"
            description="Control how Blawby processes and retains your personal data."
          >
            <SettingToggle
              id="privacy-pii-consent"
              label="Allow handling of sensitive personal data"
              description="Required for storing intake details and supporting documents. Disabling may limit service functionality."
              value={settings.piiConsentGiven}
              onChange={(value) => handleToggle('piiConsentGiven', value)}
            />
            <SettingToggle
              id="privacy-processing-consent"
              label="Allow data processing for service delivery"
              description="Required for case analysis and communications. Disabling may limit service functionality."
              value={settings.dataProcessingConsent}
              onChange={(value) => handleToggle('dataProcessingConsent', value)}
            />
            <SettingToggle
              id="privacy-retention-consent"
              label="Allow data retention for ongoing matters"
              description="Keeps your records available across future sessions."
              value={settings.dataRetentionConsent}
              onChange={(value) => handleToggle('dataRetentionConsent', value)}
            />
            <SettingToggle
              id="privacy-marketing-consent"
              label="Allow product updates and marketing"
              description="Receive product updates, tips, and service announcements."
              value={settings.marketingConsent}
              onChange={(value) => handleToggle('marketingConsent', value)}
            />
          </SettingSection>

          <SectionDivider />

          <SettingSection
            title="Data requests"
            description="Need a copy of your data or want to delete your account?"
          >
            <div className="flex flex-col gap-3 py-3 sm:flex-row">
              <Button
                variant="secondary"
                onClick={() => window.open('https://blawby.com/privacy', '_blank', 'noopener,noreferrer')}
              >
                View privacy policy
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate('/settings/account')}
              >
                Manage account deletion
              </Button>
            </div>
          </SettingSection>
        </div>
      </div>

      {/* Confirmation Dialog for Critical Consents */}
      <Modal
        isOpen={showConfirmDialog}
        onClose={handleCancelToggle}
        title="Confirm Privacy Setting Change"
        disableBackdropClick={true}
      >
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <p className="text-sm text-amber-800 dark:text-amber-200 font-medium mb-2">
              ⚠️ Warning: Disabling this consent may limit service functionality
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {pendingToggle?.key === 'piiConsentGiven' && (
                <>
                  Disabling PII handling consent means we cannot store your intake details and supporting documents. 
                  This may prevent you from using core features of the service.
                </>
              )}
              {pendingToggle?.key === 'dataProcessingConsent' && (
                <>
                  Disabling data processing consent means we cannot provide case analysis and communications. 
                  This may significantly limit the service functionality.
                </>
              )}
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <strong>Note:</strong> Your existing data will remain stored according to your data retention preferences. 
              You can re-enable this consent at any time.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={handleCancelToggle}>
              Cancel
            </Button>
            <Button 
              variant="ghost"
              onClick={handleConfirmToggle}
              className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              Disable Anyway
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
