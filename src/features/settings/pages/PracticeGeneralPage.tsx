import { useMemo, useState, useCallback } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Input, LogoUploadInput } from '@/shared/ui/input';
import { EditorShell } from '@/shared/ui/layout';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import { buildPracticeProfilePayloads } from '@/shared/utils/practiceProfile';
import { applyAccentColor, normalizeAccentColor } from '@/shared/utils/accentColors';
import { uploadPracticeLogo } from '@/shared/utils/practiceLogoUpload';

import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import { formatSlug } from '@/features/settings/utils/practiceFormHelpers';

interface PracticeGeneralPageProps {
  className?: string;
  onBack?: () => void;
}

type Draft = {
  name?: string;
  slug?: string;
  logo?: string;
  accentColor?: string;
};

export const PracticeGeneralPage = ({ className, onBack }: PracticeGeneralPageProps) => {
  const { currentPractice, updatePractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const { details, updateDetails } = usePracticeDetails(currentPractice?.id, currentPractice?.slug, false);
  const { showSuccess, showError } = useToastContext();
  const { t } = useTranslation(['settings', 'common']);

  const [draft, setDraft] = useState<Draft>({});
  const [isSaving, setIsSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadProgress, setLogoUploadProgress] = useState<number | null>(null);

  const currentAccentColor =
    normalizeAccentColor(details?.accentColor ?? currentPractice?.accentColor) ?? '#D4AF37';

  const values = useMemo(() => ({
    name: draft.name ?? currentPractice?.name ?? '',
    slug: draft.slug ?? currentPractice?.slug ?? '',
    logo: draft.logo ?? currentPractice?.logo ?? '',
    accentColor: draft.accentColor ?? currentAccentColor,
  }), [draft, currentPractice, currentAccentColor]);

  const hasChanges = useMemo(() => {
    return values.name.trim() !== (currentPractice?.name ?? '').trim()
      || values.slug.trim() !== (currentPractice?.slug ?? '').trim()
      || (values.logo ?? '').trim() !== (currentPractice?.logo ?? '').trim()
      || normalizeAccentColor(values.accentColor) !== currentAccentColor;
  }, [values, currentPractice, currentAccentColor]);

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
      showError(
        t('settings:practice.toasts.logoUploadFailed.title', { defaultValue: 'Logo upload failed' }),
        error instanceof Error ? error.message : 'Unable to upload your logo. Please try again.',
      );
    } finally {
      setLogoUploading(false);
      setLogoUploadProgress(null);
    }
  };

  const handleSave = useCallback(async () => {
    if (!currentPractice || isSaving) return;
    const normalizedAccentColor = normalizeAccentColor(values.accentColor);
    if (!normalizedAccentColor) {
      showError(
        t('settings:practice.toasts.brandColorInvalid.title', { defaultValue: 'Brand color' }),
        t('settings:practice.toasts.brandColorInvalid.body', { defaultValue: 'Brand color must be a valid hex value.' }),
      );
      return;
    }
    setIsSaving(true);
    try {
      const { practicePayload, detailsPayload } = buildPracticeProfilePayloads(
        {
          name: values.name,
          slug: values.slug,
          logo: values.logo,
          accentColor: normalizedAccentColor,
        },
        {
          compareTo: {
            logo: currentPractice.logo ?? null,
            name: currentPractice.name ?? null,
            slug: currentPractice.slug ?? null,
            accentColor: currentAccentColor,
          },
        },
      );

      if (Object.keys(practicePayload).length > 0) {
        const safePayload: {
          name?: string;
          slug?: string;
          logo?: string;
        } = {};
        if (typeof practicePayload.name === 'string') safePayload.name = practicePayload.name;
        if (typeof practicePayload.slug === 'string') safePayload.slug = practicePayload.slug;
        if (typeof practicePayload.logo === 'string') safePayload.logo = practicePayload.logo;
        await updatePractice(currentPractice.id, safePayload);
      }

      if (Object.keys(detailsPayload).length > 0) {
        await updateDetails(detailsPayload);
      }

      applyAccentColor(normalizedAccentColor);
      try {
        localStorage.setItem('accent-color', normalizedAccentColor);
        if (currentPractice.slug) localStorage.setItem(`accent-color:${currentPractice.slug}`, normalizedAccentColor);
      } catch (_e) {
        // localStorage may be unavailable; non-fatal.
      }
      setDraft({});
      showSuccess(
        t('settings:practice.toasts.practiceSettingsSaved.title', { defaultValue: 'Practice settings saved' }),
        t('settings:practice.toasts.practiceSettingsSaved.body', { defaultValue: 'Your changes have been saved.' }),
      );
    } catch (error) {
      showError(
        t('settings:practice.toasts.practiceSettingsSaveFailed.title', { defaultValue: 'Save failed' }),
        error instanceof Error ? error.message : 'Unable to save your changes. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  }, [currentPractice, isSaving, values, currentAccentColor, updatePractice, updateDetails, showError, showSuccess, t]);

  if (!currentPractice) {
    return (
      <EditorShell title="Practice" showBack={Boolean(onBack)} onBack={onBack}>
        <p className="text-sm text-input-placeholder">{t('settings:practice.noPracticeSelected', { defaultValue: 'No practice selected.' })}</p>
      </EditorShell>
    );
  }

  return (
    <EditorShell
      title={t('settings:practice.general.title', { defaultValue: 'General' })}
      subtitle={t('settings:practice.general.subtitle', { defaultValue: 'Identity and brand for this practice.' })}
      showBack={Boolean(onBack)}
      backVariant="close"
      onBack={onBack}
      className={className}
      contentMaxWidth={null}
      actions={(
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setDraft({})}
            disabled={!hasChanges || isSaving || logoUploading}
          >
            {t('common:forms.actions.reset')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || isSaving || logoUploading}
          >
            {isSaving ? t('common:forms.actions.saving') : t('common:forms.actions.save')}
          </Button>
        </div>
      )}
    >
      <div className="divide-y divide-line-default">
        <SettingSection
          title={t('settings:practice.identity.title', { defaultValue: 'Identity' })}
          description={t('settings:practice.identity.description', {
            defaultValue: 'Practice name and public slug used in the workspace URL.',
          })}
        >
          <div className="space-y-4">
            <Input
              label={t('settings:practice.identity.nameLabel', { defaultValue: 'Practice name' })}
              value={values.name}
              onChange={(value) => setDraft((prev) => ({ ...prev, name: value }))}
              disabled={isSaving}
              placeholder={t('settings:practice.identity.namePlaceholder', { defaultValue: 'Smith & Associates' })}
            />
            <SlugField
              value={values.slug}
              practiceName={values.name}
              disabled={isSaving}
              onChange={(value) => setDraft((prev) => ({ ...prev, slug: formatSlug(value) }))}
              onAcceptSuggestion={(suggested) => setDraft((prev) => ({ ...prev, slug: suggested }))}
              t={t}
            />
          </div>
        </SettingSection>

        <SettingSection
          title={t('settings:practice.brand.title', { defaultValue: 'Brand' })}
          description={t('settings:practice.brand.description', {
            defaultValue: 'Avatar and accent color used throughout the widget experience.',
          })}
        >
          <div className="space-y-6">
            <LogoUploadInput
              imageUrl={values.logo?.trim() ? values.logo : null}
              name={currentPractice.name || 'Practice'}
              label={t('settings:practice.brand.avatarLabel', { defaultValue: 'Upload brand avatar' })}
              description={t('settings:practice.brand.avatarDescription', { defaultValue: 'Upload a square image. Maximum 5 MB.' })}
              accept="image/*"
              multiple={false}
              onChange={handleLogoChange}
              disabled={isSaving || logoUploading}
              progress={logoUploading ? logoUploadProgress : null}
            />
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={normalizeAccentColor(values.accentColor) ?? currentAccentColor}
                  onChange={(event) => setDraft((prev) => ({
                    ...prev,
                    accentColor:
                      normalizeAccentColor((event.target as HTMLInputElement).value)
                      ?? (event.target as HTMLInputElement).value.toUpperCase(),
                  }))}
                  disabled={isSaving}
                  aria-label={t('settings:practice.brand.colorAriaLabel', { defaultValue: 'Brand color' })}
                  className="h-10 w-16 rounded-xl border border-line-glass bg-surface-card p-1"
                />
                <Input
                  aria-label={t('settings:practice.brand.colorHexAria', { defaultValue: 'Brand color hex' })}
                  value={values.accentColor ?? ''}
                  onChange={(value) => setDraft((prev) => ({
                    ...prev,
                    accentColor: normalizeAccentColor(value) ?? value.toUpperCase(),
                  }))}
                  placeholder="#D4AF37"
                  maxLength={7}
                  disabled={isSaving}
                  className="w-32"
                />
              </div>
              <SettingsHelperText>
                {t('settings:practice.brand.colorHelper', {
                  defaultValue: 'Used for accents, buttons, and links in your client widget.',
                })}
              </SettingsHelperText>
            </div>
          </div>
        </SettingSection>
      </div>
    </EditorShell>
  );
};

type SlugFieldT = ReturnType<typeof useTranslation>['t'];

const SlugField = ({
  value,
  practiceName,
  disabled,
  onChange,
  onAcceptSuggestion,
  t,
}: {
  value: string;
  practiceName: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onAcceptSuggestion: (suggested: string) => void;
  t: SlugFieldT;
}) => {
  const trimmedSlug = value.trim();
  const previewSlug = trimmedSlug || t('settings:practice.identity.slugPlaceholder', { defaultValue: 'smith-associates' });
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const suggested = formatSlug(practiceName);
  const showSuggestion = suggested.length > 0 && suggested !== trimmedSlug;
  return (
    <div>
      <Input
        label={t('settings:practice.identity.slugLabel', { defaultValue: 'Public slug' })}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={t('settings:practice.identity.slugPlaceholder', { defaultValue: 'smith-associates' })}
        description={t('settings:practice.identity.slugDescription', { defaultValue: 'This controls the workspace URL.' })}
      />
      <p className="mt-2 text-xs text-input-placeholder">
        <span>{t('settings:practice.identity.slugUrlLabel', { defaultValue: 'Your URL' })}: </span>
        <span className="font-mono text-input-text">
          {origin}/practice/<span className="text-accent-500">{previewSlug}</span>
        </span>
      </p>
      {showSuggestion ? (
        <button
          type="button"
          onClick={() => onAcceptSuggestion(suggested)}
          disabled={disabled}
          className="mt-1 text-xs text-accent-500 hover:underline disabled:opacity-50"
        >
          {t('settings:practice.identity.slugSuggestPrefix', { defaultValue: 'Use' })}{' '}
          <span className="font-mono">{suggested}</span>{' '}
          {t('settings:practice.identity.slugSuggestSuffix', { defaultValue: 'from your practice name' })}
        </button>
      ) : null}
    </div>
  );
};

export default PracticeGeneralPage;
