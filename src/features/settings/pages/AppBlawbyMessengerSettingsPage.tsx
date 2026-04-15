import { useMemo, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Input, LogoUploadInput, Textarea } from '@/shared/ui/input';
import { SectionDivider, SettingsPage } from '@/shared/ui/layout';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import { WidgetPreviewFrame } from '@/features/settings/components/WidgetPreviewFrame';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { Tabs } from '@/shared/ui/tabs';
import { normalizeAccentColor } from '@/shared/utils/accentColors';
import { uploadPracticeLogo } from '@/shared/utils/practiceLogoUpload';
import { buildPracticeProfilePayloads } from '@/shared/utils/practiceProfile';

type MessengerDraft = {
  name?: string;
  logo?: string;
  accentColor?: string;
  introMessage?: string;
  legalDisclaimer?: string;
};

type AppBlawbyMessengerSettingsPageProps = {
  onBack?: () => void;
};

type MessengerSettingsTab = 'branding' | 'disclaimer' | 'opening';

const MESSENGER_TABS = [
  { id: 'branding', label: 'Branding' },
  { id: 'disclaimer', label: 'Disclaimer' },
  { id: 'opening', label: 'Opening message' },
];

const normalizeOptionalText = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export default function AppBlawbyMessengerSettingsPage({
  onBack,
}: AppBlawbyMessengerSettingsPageProps) {
  const { currentPractice, updatePractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const { details: practiceDetails, updateDetails } = usePracticeDetails(currentPractice?.id, currentPractice?.slug, false);
  const { showSuccess, showError } = useToastContext();
  const [draft, setDraft] = useState<MessengerDraft>({});
  const [isSaving, setIsSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadProgress, setLogoUploadProgress] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<MessengerSettingsTab>('branding');

  const currentAccentColor = normalizeAccentColor(practiceDetails?.accentColor ?? currentPractice?.accentColor) ?? '#0057FF';
  const values = useMemo(() => ({
    name: draft.name ?? currentPractice?.name ?? 'Blawby Messenger',
    logo: draft.logo ?? currentPractice?.logo ?? '',
    accentColor: draft.accentColor ?? currentAccentColor,
    introMessage: draft.introMessage ?? practiceDetails?.introMessage ?? '',
    legalDisclaimer: draft.legalDisclaimer ?? practiceDetails?.legalDisclaimer ?? '',
  }), [
    currentAccentColor,
    currentPractice?.logo,
    currentPractice?.name,
    draft,
    practiceDetails?.introMessage,
    practiceDetails?.legalDisclaimer,
  ]);

  const previewConfig = useMemo(() => {
    const base = {
      name: values.name.trim() || 'Blawby Messenger',
      profileImage: values.logo.trim() || null,
      accentColor: normalizeAccentColor(values.accentColor) ?? currentAccentColor,
    };

    if (activeTab === 'disclaimer') {
      return {
        ...base,
        introMessage: '',
        legalDisclaimer: values.legalDisclaimer || 'Add your practice disclaimer text to preview this step.',
      };
    }

    if (activeTab === 'opening') {
      return {
        ...base,
        introMessage: values.introMessage || 'Add an opening message to preview the first assistant message.',
        legalDisclaimer: '',
      };
    }

    return {
      ...base,
      introMessage: '',
      legalDisclaimer: '',
    };
  }, [
    activeTab,
    currentAccentColor,
    values.accentColor,
    values.introMessage,
    values.legalDisclaimer,
    values.logo,
    values.name,
  ]);

  const hasChanges = useMemo(() => {
    if (!currentPractice) return false;
    return values.name.trim() !== (currentPractice.name ?? '').trim()
      || values.logo.trim() !== (currentPractice.logo ?? '').trim()
      || normalizeAccentColor(values.accentColor) !== currentAccentColor
      || normalizeOptionalText(values.introMessage) !== normalizeOptionalText(practiceDetails?.introMessage ?? '')
      || normalizeOptionalText(values.legalDisclaimer) !== normalizeOptionalText(practiceDetails?.legalDisclaimer ?? '');
  }, [
    currentAccentColor,
    currentPractice,
    practiceDetails?.introMessage,
    practiceDetails?.legalDisclaimer,
    values,
  ]);

  const handleReset = () => {
    setDraft({});
    setLogoUploadProgress(null);
    setLogoUploading(false);
  };

  const handleLogoChange = async (files: FileList | File[]) => {
    if (!currentPractice) return;
    const [file] = Array.isArray(files) ? files : Array.from(files);
    if (!file) return;

    setLogoUploading(true);
    setLogoUploadProgress(0);
    try {
      const logoUrl = await uploadPracticeLogo(file, currentPractice.id, setLogoUploadProgress);
      setDraft((prev) => ({ ...prev, logo: logoUrl }));
    } catch (error) {
      showError('Logo upload failed', error instanceof Error ? error.message : 'Unable to upload logo.');
    } finally {
      setLogoUploading(false);
      setLogoUploadProgress(null);
    }
  };

  const handleAccentColorChange = (value: string) => {
    setDraft((prev) => ({ ...prev, accentColor: normalizeAccentColor(value) ?? value.toUpperCase() }));
  };

  const handleSave = async () => {
    if (!currentPractice) return;
    const trimmedName = values.name.trim();
    if (!trimmedName) {
      showError('Brand name is required');
      return;
    }

    const normalizedAccentColor = normalizeAccentColor(values.accentColor);
    if (!normalizedAccentColor) {
      showError('Brand color', 'Brand color must be a valid hex value.');
      return;
    }

    setIsSaving(true);
    try {
      const { practicePayload, detailsPayload } = buildPracticeProfilePayloads({
        name: trimmedName,
        logo: values.logo.trim() || null,
        accentColor: normalizedAccentColor,
        introMessage: values.introMessage,
        legalDisclaimer: values.legalDisclaimer,
      }, {
        compareTo: {
          name: currentPractice.name,
          logo: currentPractice.logo ?? null,
          accentColor: currentAccentColor,
          introMessage: practiceDetails?.introMessage ?? null,
          legalDisclaimer: practiceDetails?.legalDisclaimer ?? null,
        },
      });

      const updatePracticePromise = Object.keys(practicePayload).length > 0
        ? updatePractice(currentPractice.id, practicePayload)
        : Promise.resolve();
      const updateDetailsPromise = Object.keys(detailsPayload).length > 0
        ? updateDetails(detailsPayload)
        : Promise.resolve();

      await Promise.all([updatePracticePromise, updateDetailsPromise]);

      setDraft({});
      showSuccess('Messenger updated', 'Your widget settings were saved.');
    } catch (error) {
      showError('Messenger update failed', error instanceof Error ? error.message : 'Unable to save widget settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentPractice) {
    return (
      <SettingsPage title="Blawby Messenger" showBack={Boolean(onBack)} onBack={onBack}>
        <p className="text-sm text-input-placeholder">No practice selected.</p>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      title="Blawby Messenger"
      subtitle="Widget brand, opening message, and disclaimer"
      showBack={Boolean(onBack)}
      backVariant="close"
      onBack={onBack}
      contentMaxWidth={null}
      previewVariant="widget"
      actions={(
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleReset}
            disabled={!hasChanges || isSaving || logoUploading}
          >
            Reset
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || isSaving || logoUploading}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      )}
      preview={(
        <WidgetPreviewFrame
          practiceSlug={currentPractice.slug}
          scenario="messenger-start"
          title="Blawby Messenger preview"
          config={previewConfig}
        />
      )}
    >
      <div className="space-y-6">
        <Tabs
          items={MESSENGER_TABS}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as MessengerSettingsTab)}
        />

        {activeTab === 'branding' ? (
          <SettingSection title="Public identity">
            <SettingRow
              label="Brand name"
              description="Shown in the widget header and assistant fallback name."
              layout="stacked"
            >
              <Input
                value={values.name}
                onChange={(value) => setDraft((prev) => ({ ...prev, name: value }))}
                placeholder="Your Law Firm Name"
                disabled={isSaving}
              />
            </SettingRow>

            <SectionDivider />

            <SettingRow
              label="Brand avatar"
              description="Shown in the widget header and assistant avatar fallback."
              layout="stacked"
            >
              <LogoUploadInput
                imageUrl={values.logo.trim() ? values.logo : null}
                name={values.name || 'Practice'}
                label="Upload brand avatar"
                description="Upload a square image. Maximum 5 MB."
                accept="image/*"
                multiple={false}
                onChange={handleLogoChange}
                disabled={isSaving || logoUploading}
                progress={logoUploading ? logoUploadProgress : null}
              />
            </SettingRow>

            <SectionDivider />

            <SettingRow
              label="Brand color"
              layout="stacked"
              labelNode={(
                <div>
                  <h3 className="text-sm font-semibold text-input-text">Brand color</h3>
                  <div className="mt-2 flex items-center gap-3">
                    <div
                      className="h-5 w-5 rounded-full"
                      style={{ backgroundColor: normalizeAccentColor(values.accentColor) ?? currentAccentColor }}
                      aria-label={`Current brand color ${values.accentColor}`}
                    />
                    <SettingsHelperText>{values.accentColor}</SettingsHelperText>
                  </div>
                </div>
              )}
            >
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={normalizeAccentColor(values.accentColor) ?? currentAccentColor}
                  onChange={(event) => handleAccentColorChange((event.target as HTMLInputElement).value)}
                  disabled={isSaving}
                  aria-label="Brand color"
                  className="h-10 w-16 rounded-lg border border-line-glass bg-surface-card p-1"
                />
                <Input
                  aria-label="Brand color hex"
                  value={values.accentColor}
                  onChange={handleAccentColorChange}
                  placeholder="#0057FF"
                  maxLength={7}
                  disabled={isSaving}
                  className="w-32"
                />
              </div>
            </SettingRow>
          </SettingSection>
        ) : null}

        {activeTab === 'opening' ? (
          <SettingSection title="Opening message">
            <SettingRow
              label="Widget opening message"
              description="Appears as the first assistant-style message after the widget starts."
              layout="stacked"
            >
              <Textarea
                value={values.introMessage}
                onChange={(value) => setDraft((prev) => ({ ...prev, introMessage: value }))}
                placeholder="I'm Jordan. I'm here to provide information and help answer your questions."
                rows={4}
                maxLength={1000}
                showCharCount
                disabled={isSaving}
              />
            </SettingRow>
          </SettingSection>
        ) : null}

        {activeTab === 'disclaimer' ? (
          <SettingSection title="Legal disclaimer">
            <SettingRow
              label="Legal disclaimer"
              description="Shown as an optional acceptance step before the public widget chat starts."
              layout="stacked"
            >
              <Textarea
                value={values.legalDisclaimer}
                onChange={(value) => setDraft((prev) => ({ ...prev, legalDisclaimer: value }))}
                placeholder="Add your practice's disclaimer text. Leave blank to skip this step."
                rows={7}
                maxLength={4000}
                showCharCount
                disabled={isSaving}
              />
            </SettingRow>
          </SettingSection>
        ) : null}
      </div>
    </SettingsPage>
  );
}
