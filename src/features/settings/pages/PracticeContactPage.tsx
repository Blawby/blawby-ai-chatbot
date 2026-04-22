import { useMemo, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Input, LogoUploadInput } from '@/shared/ui/input';
import { AddressExperienceForm } from '@/shared/ui/address/AddressExperienceForm';
import { FormGrid, SectionDivider, EditorShell } from '@/shared/ui/layout';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useToastContext } from '@/shared/contexts/ToastContext';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import type { Address } from '@/shared/types/address';
import { buildPracticeProfilePayloads } from '@/shared/utils/practiceProfile';
import { normalizeAccentColor } from '@/shared/utils/accentColors';
import { uploadPracticeLogo } from '@/shared/utils/practiceLogoUpload';

interface PracticeContactPageProps {
  className?: string;
  onBack?: () => void;
}

type ContactDraft = {
  website?: string;
  businessEmail?: string;
  contactPhone?: string;
  address?: Address;
  logo?: string;
  accentColor?: string;
};

const buildAddress = (source: {
  address?: string | null;
  apartment?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): Address | undefined => {
  const address = source.address?.trim() || '';
  const apartment = source.apartment?.trim() || undefined;
  const city = source.city?.trim() || '';
  const state = source.state?.trim() || '';
  const postalCode = source.postalCode?.trim() || '';
  const country = source.country?.trim() || '';
  const hasAny = Boolean(address || apartment || city || state || postalCode || country);
  if (!hasAny) return undefined;
  return {
    address,
    apartment,
    city,
    state,
    postalCode,
    country,
  };
};

const resolveContactDraft = (
  practice: {
    website?: string | null;
    businessEmail?: string | null;
    businessPhone?: string | null;
    address?: string | null;
    apartment?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  } | null,
  details: PracticeDetails | null
): ContactDraft => {
  const basePractice = practice
    ? {
        website: practice.website ?? undefined,
        businessEmail: practice.businessEmail ?? undefined,
        contactPhone: practice.businessPhone ?? undefined,
        address: buildAddress(practice),
      }
    : {};
  const baseDetails = details
    ? {
        website: details.website ?? undefined,
        businessEmail: details.businessEmail ?? undefined,
        contactPhone: details.businessPhone ?? undefined,
        address: buildAddress(details),
      }
    : {};

  return { ...basePractice, ...baseDetails };
};

export const PracticeContactPage = ({ className, onBack }: PracticeContactPageProps) => {
  const { currentPractice, updatePractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const { details, updateDetails } = usePracticeDetails(currentPractice?.id, currentPractice?.slug, false);
  const { showSuccess, showError } = useToastContext();
  const [draft, setDraft] = useState<Partial<ContactDraft>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadProgress, setLogoUploadProgress] = useState<number | null>(null);
  const currentAccentColor = normalizeAccentColor(details?.accentColor ?? currentPractice?.accentColor) ?? '#D4AF37';

  const contactValues = useMemo(
    () => ({
      ...resolveContactDraft(currentPractice, details),
      logo: draft.logo ?? currentPractice?.logo ?? '',
      accentColor: draft.accentColor ?? currentAccentColor,
      ...draft,
    }),
    [currentAccentColor, currentPractice, details, draft]
  );

  const hasChanges = useMemo(() => {
    const baseline = resolveContactDraft(currentPractice, details);
    return contactValues.website?.trim() !== baseline.website?.trim()
      || contactValues.businessEmail?.trim() !== baseline.businessEmail?.trim()
      || contactValues.contactPhone?.trim() !== baseline.contactPhone?.trim()
      || JSON.stringify(contactValues.address ?? null) !== JSON.stringify(baseline.address ?? null)
      || (contactValues.logo ?? '').trim() !== (currentPractice?.logo ?? '').trim()
      || normalizeAccentColor(contactValues.accentColor) !== currentAccentColor;
  }, [contactValues, currentAccentColor, currentPractice, details]);

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

  const handleSave = async () => {
    if (!currentPractice) return;
    const normalizedAccentColor = normalizeAccentColor(contactValues.accentColor);
    if (!normalizedAccentColor) {
      showError('Brand color', 'Brand color must be a valid hex value.');
      return;
    }
    setIsSaving(true);
    try {
      const { practicePayload, detailsPayload } = buildPracticeProfilePayloads({
        logo: contactValues.logo ?? null,
        accentColor: normalizedAccentColor,
        website: contactValues.website ?? null,
        businessEmail: contactValues.businessEmail ?? null,
        businessPhone: contactValues.contactPhone ?? null,
        address: contactValues.address?.address ?? null,
        apartment: contactValues.address?.apartment ?? null,
        city: contactValues.address?.city ?? null,
        state: contactValues.address?.state ?? null,
        postalCode: contactValues.address?.postalCode ?? null,
        country: contactValues.address?.country ?? null,
      }, {
        compareTo: {
          logo: currentPractice.logo ?? null,
          accentColor: currentAccentColor,
          website: details?.website ?? currentPractice.website ?? null,
          businessEmail: details?.businessEmail ?? currentPractice.businessEmail ?? null,
          businessPhone: details?.businessPhone ?? currentPractice.businessPhone ?? null,
          address: currentPractice.address ?? null,
          apartment: currentPractice.apartment ?? null,
          city: currentPractice.city ?? null,
          state: currentPractice.state ?? null,
          postalCode: currentPractice.postalCode ?? null,
          country: currentPractice.country ?? null,
        },
      });

      if (Object.keys(practicePayload).length > 0) {
        await updatePractice(currentPractice.id, practicePayload);
      }
      if (Object.keys(detailsPayload).length > 0) {
        await updateDetails(detailsPayload);
      }
      setDraft({});
      showSuccess('Contact details updated.');
    } catch (error) {
      showError('Contact details update failed', error instanceof Error ? error.message : 'Unable to save contact details.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentPractice) {
    return (
      <EditorShell title="Contact" showBack={Boolean(onBack)} onBack={onBack}>
        <p className="text-sm text-input-placeholder">No practice selected.</p>
      </EditorShell>
    );
  }

  return (
    <EditorShell
      title="Contact"
      subtitle="Brand, website, business email, phone, and address"
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
    >
      <div className="space-y-6">
        <SettingSection
          title="Brand"
          description="Avatar and accent color used throughout the widget experience."
        >
          <div className="space-y-6">
            <LogoUploadInput
              imageUrl={contactValues.logo?.trim() ? contactValues.logo : null}
              name={currentPractice.name || 'Practice'}
              label="Upload brand avatar"
              description="Upload a square image. Maximum 5 MB."
              accept="image/*"
              multiple={false}
              onChange={handleLogoChange}
              disabled={isSaving || logoUploading}
              progress={logoUploading ? logoUploadProgress : null}
            />

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-input-text">Brand color</h3>
                <div className="mt-2 flex items-center gap-3">
                  <div
                    className="h-5 w-5 rounded-full"
                    style={{ backgroundColor: normalizeAccentColor(contactValues.accentColor) ?? currentAccentColor }}
                    aria-label={`Current brand color ${contactValues.accentColor}`}
                  />
                  <SettingsHelperText>{contactValues.accentColor}</SettingsHelperText>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={normalizeAccentColor(contactValues.accentColor) ?? currentAccentColor}
                  onChange={(event) => setDraft((prev) => ({
                    ...prev,
                    accentColor: normalizeAccentColor((event.target as HTMLInputElement).value) ?? (event.target as HTMLInputElement).value.toUpperCase(),
                  }))}
                  disabled={isSaving}
                  aria-label="Brand color"
                  className="h-10 w-16 rounded-xl border border-line-glass bg-surface-card p-1"
                />
                <Input
                  aria-label="Brand color hex"
                  value={contactValues.accentColor ?? ''}
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
            </div>
          </div>
        </SettingSection>

        <SectionDivider />

        <SettingSection
          title="Contact details"
          description="Website, business email, and phone number for this practice."
        >
          <FormGrid>
            <Input
              label="Website"
              value={contactValues.website || ''}
              onChange={(value) => setDraft((prev) => ({ ...prev, website: value }))}
              disabled={isSaving}
              placeholder="https://example.com"
            />
            <Input
              label="Business email"
              value={contactValues.businessEmail || ''}
              onChange={(value) => setDraft((prev) => ({ ...prev, businessEmail: value }))}
              disabled={isSaving}
              type="email"
              placeholder="business@example.com"
            />
            <Input
              label="Contact phone"
              value={contactValues.contactPhone || ''}
              onChange={(value) => setDraft((prev) => ({ ...prev, contactPhone: value }))}
              disabled={isSaving}
              type="tel"
              placeholder="+1 (555) 123-4567"
            />
          </FormGrid>
        </SettingSection>

        <SectionDivider />

        <SettingSection
          title="Address"
          description="Used in public practice details and intake flows."
        >
          <AddressExperienceForm
            initialValues={{ address: contactValues.address }}
            fields={['address']}
            required={[]}
            onValuesChange={(values) => {
              if (values.address !== undefined) {
                setDraft((prev) => ({
                  ...prev,
                  address: values.address as Address,
                }));
              }
            }}
            showSubmitButton={false}
            variant="plain"
            disabled={isSaving}
          />
          <SettingsHelperText className="mt-3">
            Leave fields blank to clear them.
          </SettingsHelperText>
        </SettingSection>
      </div>
    </EditorShell>
  );
};

export default PracticeContactPage;
