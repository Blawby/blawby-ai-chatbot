import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingToggle } from '@/features/settings/components/SettingToggle';
import { SectionDivider } from '@/shared/ui';
import { Button } from '@/shared/ui/Button';
import { useNavigation } from '@/shared/utils/navigation';
import Modal from '@/shared/components/Modal';
import { SettingsPageLayout } from '@/features/settings/components/SettingsPageLayout';
import { SettingsNotice } from '@/features/settings/components/SettingsNotice';
import { buildSettingsPath, resolveSettingsBasePath } from '@/shared/utils/workspace';

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
  const location = useLocation();
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULT_PRIVACY_SETTINGS);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<{ key: keyof PrivacySettings; value: boolean } | null>(null);
  const settingsBasePath = resolveSettingsBasePath(location.path);
  const toSettingsPath = (subPath?: string) => buildSettingsPath(settingsBasePath, subPath);
  const isInitialLoad = useRef(true);
  const shouldPersist = useRef(false);

  // Load settings from localStorage on mount
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
    } finally {
      isInitialLoad.current = false;
    }
  }, []);

  // Sync settings to localStorage when they change (but not on initial load)
  useEffect(() => {
    if (isInitialLoad.current || !shouldPersist.current) {
      return;
    }

    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(settings));
        showSuccess('Privacy updated', 'Your privacy preferences have been saved.');
      }
    } catch (error) {
      console.error('Failed to update privacy settings:', error);
      showError('Update failed', 'We could not save your privacy preferences. Please try again.');
    } finally {
      shouldPersist.current = false;
    }
  }, [settings, showError, showSuccess]);

  const handleToggle = useCallback(async (key: keyof PrivacySettings, value: boolean) => {
    // If disabling a critical consent, show confirmation dialog
    if (!value && CRITICAL_CONSENTS.includes(key)) {
      setPendingToggle({ key, value });
      setShowConfirmDialog(true);
      return;
    }

    // For enabling or non-critical toggles, proceed directly
    shouldPersist.current = true;
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleConfirmToggle = useCallback(() => {
    if (!pendingToggle) return;

    shouldPersist.current = true;
    setSettings(prev => ({ ...prev, [pendingToggle.key]: pendingToggle.value }));

    setShowConfirmDialog(false);
    setPendingToggle(null);
  }, [pendingToggle]);

  const handleCancelToggle = useCallback(() => {
    setShowConfirmDialog(false);
    setPendingToggle(null);
  }, []);

  return (
    <SettingsPageLayout title="Privacy">
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
            onClick={() => navigate(toSettingsPath('account'))}
          >
            Manage account deletion
          </Button>
        </div>
      </SettingSection>

      {/* Confirmation Dialog for Critical Consents */}
      <Modal
        isOpen={showConfirmDialog}
        onClose={handleCancelToggle}
        title="Confirm Privacy Setting Change"
        disableBackdropClick={true}
      >
        <div className="space-y-4">
          <SettingsNotice variant="warning" className="p-4">
            <p className="text-sm font-medium mb-2">
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
          </SettingsNotice>

          <SettingsNotice variant="info">
            <p className="text-sm">
              <strong>Note:</strong> Your existing data will remain stored according to your data retention preferences. 
              You can re-enable this consent at any time.
            </p>
          </SettingsNotice>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={handleCancelToggle}>
              Cancel
            </Button>
            <Button 
              variant="danger-ghost"
              onClick={handleConfirmToggle}
            >
              Disable Anyway
            </Button>
          </div>
        </div>
      </Modal>
    </SettingsPageLayout>
  );
}
