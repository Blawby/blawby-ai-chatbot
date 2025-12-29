import { useCallback, useEffect, useState } from 'preact/hooks';
import { useToastContext } from '../../../contexts/ToastContext';
import { SettingHeader } from '../atoms';
import { SettingSection, SettingToggle } from '../molecules';
import { SectionDivider } from '../../ui';
import { Button } from '../../ui/Button';
import { useNavigation } from '../../../utils/navigation';

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

export default function PrivacyPage() {
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULT_PRIVACY_SETTINGS);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const stored = window.localStorage.getItem(PRIVACY_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<PrivacySettings>;
      setSettings(prev => ({
        ...prev,
        ...parsed
      }));
    } catch (error) {
      console.warn('Failed to load privacy preferences:', error);
    }
  }, []);

  const handleToggle = useCallback(async (key: keyof PrivacySettings, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));

    try {
      if (typeof window !== 'undefined') {
        const nextSettings = { ...settings, [key]: value };
        window.localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(nextSettings));
      }
      showSuccess('Privacy updated', 'Your privacy preferences have been saved.');
    } catch (error) {
      console.error('Failed to update privacy settings:', error);
      showError('Update failed', 'We could not save your privacy preferences. Please try again.');
    }
  }, [settings, showError, showSuccess]);

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
              description="Required for storing intake details and supporting documents."
              value={settings.piiConsentGiven}
              onChange={(value) => handleToggle('piiConsentGiven', value)}
            />
            <SettingToggle
              id="privacy-processing-consent"
              label="Allow data processing for service delivery"
              description="Lets us use your data to provide case analysis and communications."
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
    </div>
  );
}
