import { useMemo, useRef, useState, useCallback, useEffect } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Input, LogoUploadInput } from '@/shared/ui/input';
import { Combobox } from '@/shared/ui/input/Combobox';
import { AddressExperienceForm } from '@/shared/ui/address/AddressExperienceForm';
import { FormGrid, SectionDivider, EditorShell } from '@/shared/ui/layout';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import type { Address } from '@/shared/types/address';
import { buildPracticeProfilePayloads } from '@/shared/utils/practiceProfile';
import { getPracticeDetails } from '@/shared/lib/apiClient';
import { normalizeAccentColor } from '@/shared/utils/accentColors';
import { uploadPracticeLogo } from '@/shared/utils/practiceLogoUpload';
import ServicesByStateEditor from '@/features/services/components/ServicesByStateEditor';
import { STATE_OPTIONS } from '@/shared/ui/address/AddressFields';

interface PracticePageProps {
  className?: string;
  onBack?: () => void;
}

type ContactDraft = {
  name?: string;
  slug?: string;
  website?: string;
  businessEmail?: string;
  contactPhone?: string;
  address?: Partial<Address>;
  logo?: string;
  accentColor?: string;
};

// ─── helpers ────────────────────────────────────────────────────────────────

const mapAddressSource = (src: string | Record<string, unknown> | null | undefined) => {
  if (typeof src === 'string') return { address: src };
  if (!src || typeof src !== 'object') return {};
  const s = src as Record<string, unknown>;
  return {
    address: (s.address ?? s.line1 ?? s.address_line ?? '') as string | null,
    apartment: (s.apartment ?? s.unit ?? '') as string | null,
    city: (s.city ?? '') as string | null,
    state: (s.state ?? '') as string | null,
    postalCode: (s.postalCode ?? s.postal_code ?? '') as string | null,
    country: (s.country ?? '') as string | null,
  };
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
  return { address, apartment, city, state, postalCode, country };
};

const resolveContactDraft = (
  practice: {
    name?: string | null;
    slug?: string | null;
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
        name: practice.name ?? undefined,
        slug: practice.slug ?? undefined,
        website: practice.website ?? undefined,
        businessEmail: practice.businessEmail ?? undefined,
        contactPhone: practice.businessPhone ?? undefined,
        address: buildAddress(mapAddressSource(practice)),
      }
    : {};
  const baseDetails = details
    ? {
        website: details.website ?? undefined,
        businessEmail: details.businessEmail ?? undefined,
        contactPhone: details.businessPhone ?? undefined,
        address: buildAddress(mapAddressSource({
          ...(typeof details.address === 'object' && details.address !== null
            ? details.address
            : { address: details.address }),
          apartment: details.apartment,
          city: details.city,
          state: details.state,
          postalCode: details.postalCode,
          country: details.country,
        })),
      }
    : {};

  return { ...basePractice, ...baseDetails };
};

/** Parse an opaque settings JSON string safely. */
const parseSettings = (s?: string | null): Record<string, unknown> => {
  if (!s) return {};
  try {
    const p = JSON.parse(s);
    return typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** Merge services_by_state into the opaque settings string. */
const buildSettingsString = (
  existingSettings: string | null | undefined,
  servicesByState: Record<string, string[]>
): string => {
  const base = parseSettings(existingSettings);
  if (Object.keys(servicesByState).length > 0) {
    base.services_by_state = servicesByState;
  } else {
    delete base.services_by_state;
  }
  return JSON.stringify(base);
};

// ─── component ──────────────────────────────────────────────────────────────

export const PracticePage = ({ className, onBack }: PracticePageProps) => {
  const { currentPractice, updatePractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const { details, updateDetails, setDetails } = usePracticeDetails(currentPractice?.id, currentPractice?.slug, false);
  const { showSuccess, showError } = useToastContext();
  const { t } = useTranslation(['settings', 'common']);

  // ── contact / brand draft ──────────────────────────────────────────────────
  const [draft, setDraft] = useState<Partial<ContactDraft>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadProgress, setLogoUploadProgress] = useState<number | null>(null);

  // ── services / states draft ───────────────────────────────────────────────
  // These are the LOCAL source of truth. We never reset them from server
  // responses because the backend does not echo `settings` back.
  const [licensedStates, setLicensedStates] = useState<string[]>([]);
  const [servicesByState, setServicesByState] = useState<Record<string, string[]>>({});
  // Track whether the user has edited states/services since last save.
  const [servicesDirty, setServicesDirty] = useState(false);

  // Seed local state once when details first loads. Never again.
  const lastPracticeIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!details) return;
    const pid = currentPractice?.id ?? null;
    if (lastPracticeIdRef.current === pid) return;
    lastPracticeIdRef.current = pid;
    setLicensedStates(details.serviceStates ?? []);
    setServicesByState(details.servicesByState ?? {});
  }, [details, currentPractice?.id]);

  const currentAccentColor =
    normalizeAccentColor(details?.accentColor ?? currentPractice?.accentColor) ?? '#D4AF37';

  const contactValues = useMemo(
    () => ({
      ...resolveContactDraft(currentPractice, details),
      ...draft,
      name: draft.name ?? currentPractice?.name ?? '',
      slug: draft.slug ?? currentPractice?.slug ?? '',
      logo: draft.logo ?? currentPractice?.logo ?? '',
      accentColor: draft.accentColor ?? currentAccentColor,
    }),
    [currentAccentColor, currentPractice, details, draft]
  );

  // ── i18n ──────────────────────────────────────────────────────────────────
  const practiceText = useMemo(() => ({
    pageTitle: t('settings:practice.page.title', { defaultValue: 'Practice' }),
    pageSubtitle: t('settings:practice.page.subtitle', { defaultValue: 'Identity, brand, contact, services, and states' }),
    identityTitle: t('settings:practice.identity.title', { defaultValue: 'Identity' }),
    identityDescription: t('settings:practice.identity.description', { defaultValue: 'Practice name and public slug used in the workspace URL.' }),
    practiceNameLabel: t('settings:practice.identity.nameLabel', { defaultValue: 'Practice name' }),
    practiceNamePlaceholder: t('settings:practice.identity.namePlaceholder', { defaultValue: 'Smith & Associates' }),
    publicSlugLabel: t('settings:practice.identity.slugLabel', { defaultValue: 'Public slug' }),
    publicSlugPlaceholder: t('settings:practice.identity.slugPlaceholder', { defaultValue: 'smith-associates' }),
    publicSlugDescription: t('settings:practice.identity.slugDescription', { defaultValue: 'This controls the workspace URL.' }),
    brandTitle: t('settings:practice.brand.title', { defaultValue: 'Brand' }),
    brandDescription: t('settings:practice.brand.description', { defaultValue: 'Avatar and accent color used throughout the widget experience.' }),
    avatarLabel: t('settings:practice.brand.avatarLabel', { defaultValue: 'Upload brand avatar' }),
    avatarDescription: t('settings:practice.brand.avatarDescription', { defaultValue: 'Upload a square image. Maximum 5 MB.' }),
    brandColorLabel: t('settings:practice.brand.colorLabel', { defaultValue: 'Brand color' }),
    brandColorAriaLabel: t('settings:practice.brand.colorAriaLabel', { defaultValue: 'Brand color' }),
    currentBrandColorAria: t('settings:practice.brand.currentColorAria', { defaultValue: 'Current brand color {{color}}', color: contactValues.accentColor ?? currentAccentColor }),
    brandColorHexAria: t('settings:practice.brand.colorHexAria', { defaultValue: 'Brand color hex' }),
    brandColorPlaceholder: t('settings:practice.brand.colorPlaceholder', { defaultValue: '#D4AF37' }),
    contactTitle: t('settings:practice.contact.title', { defaultValue: 'Contact details' }),
    contactDescription: t('settings:practice.contact.description', { defaultValue: 'Website, business email, and phone number for this practice.' }),
    websiteLabel: t('settings:practice.contact.websiteLabel', { defaultValue: 'Website' }),
    websitePlaceholder: t('settings:practice.contact.websitePlaceholder', { defaultValue: 'https://example.com' }),
    businessEmailLabel: t('settings:practice.contact.businessEmailLabel', { defaultValue: 'Business email' }),
    businessEmailPlaceholder: t('settings:practice.contact.businessEmailPlaceholder', { defaultValue: 'business@example.com' }),
    contactPhoneLabel: t('settings:practice.contact.phoneLabel', { defaultValue: 'Contact phone' }),
    contactPhonePlaceholder: t('settings:practice.contact.phonePlaceholder', { defaultValue: '+1 (555) 123-4567' }),
    addressTitle: t('settings:practice.address.title', { defaultValue: 'Address' }),
    addressDescription: t('settings:practice.address.description', { defaultValue: 'Used in public practice details and intake flows.' }),
    addressHelper: t('settings:practice.address.helper', { defaultValue: 'Leave fields blank to clear them.' }),
    licensedStatesPlaceholder: t('settings:practice.licensedStates.placeholder', { defaultValue: 'Select states' }),
    reset: t('common:forms.actions.reset'),
    save: t('common:forms.actions.save'),
    saving: t('common:forms.actions.saving'),
    noPracticeSelected: t('settings:practice.noPracticeSelected', { defaultValue: 'No practice selected.' }),
    savedTitle: t('settings:practice.toasts.practiceSettingsSaved.title', { defaultValue: 'Practice settings saved' }),
    savedBody: t('settings:practice.toasts.practiceSettingsSaved.body', { defaultValue: 'Your practice settings have been saved.' }),
    saveFailedTitle: t('settings:practice.toasts.practiceSettingsSaveFailed.title', { defaultValue: 'Practice settings save failed' }),
    saveFailedBody: t('settings:practice.toasts.practiceSettingsSaveFailed.body', { defaultValue: 'Unable to save your practice settings. Please try again.' }),
    logoUploadFailedTitle: t('settings:practice.toasts.logoUploadFailed.title', { defaultValue: 'Logo upload failed' }),
    logoUploadFailedBody: t('settings:practice.toasts.logoUploadFailed.body', { defaultValue: 'Unable to upload your logo. Please try again.' }),
    brandColorInvalidTitle: t('settings:practice.toasts.brandColorInvalid.title', { defaultValue: 'Brand color' }),
    brandColorInvalidBody: t('settings:practice.toasts.brandColorInvalid.body', { defaultValue: 'Brand color must be a valid hex value.' }),
    servicesTitle: t('settings:practice.services.title', { defaultValue: 'Services' }),
    servicesDescription: t('settings:practice.services.description', { defaultValue: 'Add states, then select services offered for each state.' }),
    addStatesHeading: t('settings:practice.services.addStatesHeading', { defaultValue: 'Add your states' }),
    servicesPerStateHeading: t('settings:practice.services.servicesPerStateHeading', { defaultValue: 'Services per state' }),
  }), [contactValues.accentColor, currentAccentColor, t]);

  // ── hasChanges ────────────────────────────────────────────────────────────
  const hasChanges = useMemo(() => {
    const baseline = resolveContactDraft(currentPractice, details);
    const contactChanged =
      contactValues.name?.trim() !== baseline.name?.trim()
      || contactValues.slug?.trim() !== baseline.slug?.trim()
      || contactValues.website?.trim() !== baseline.website?.trim()
      || contactValues.businessEmail?.trim() !== baseline.businessEmail?.trim()
      || contactValues.contactPhone?.trim() !== baseline.contactPhone?.trim()
      || JSON.stringify(contactValues.address ?? null) !== JSON.stringify(baseline.address ?? null)
      || (contactValues.logo ?? '').trim() !== (currentPractice?.logo ?? '').trim()
      || normalizeAccentColor(contactValues.accentColor) !== currentAccentColor;

    return contactChanged || servicesDirty;
  }, [contactValues, currentAccentColor, currentPractice, details, servicesDirty]);

  // ── logo upload ───────────────────────────────────────────────────────────
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
        practiceText.logoUploadFailedTitle,
        error instanceof Error ? error.message : practiceText.logoUploadFailedBody
      );
    } finally {
      setLogoUploading(false);
      setLogoUploadProgress(null);
    }
  };

  // ── save ──────────────────────────────────────────────────────────────────
  // Single save path for everything. States and services are always included
  // so they never get orphaned by a contact-only save.
  const handleSave = useCallback(async () => {
    if (!currentPractice || isSaving) return;

    const normalizedAccentColor = normalizeAccentColor(contactValues.accentColor);
    if (!normalizedAccentColor) {
      showError(practiceText.brandColorInvalidTitle, practiceText.brandColorInvalidBody);
      return;
    }

    setIsSaving(true);
    try {
      const { practicePayload, detailsPayload } = buildPracticeProfilePayloads(
        {
          name: contactValues.name ?? null,
          slug: contactValues.slug ?? null,
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
        },
        {
          compareTo: {
            logo: currentPractice.logo ?? null,
            name: currentPractice.name ?? null,
            slug: currentPractice.slug ?? null,
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
        }
      );

      // Prune servicesByState to only include currently licensed states.
      const validStates = licensedStates.filter((s) =>
        STATE_OPTIONS.some((opt) => opt.value === s)
      );
      const prunedServicesByState: Record<string, string[]> = {};
      for (const s of validStates) {
        if (servicesByState[s]) prunedServicesByState[s] = servicesByState[s];
      }

      // Always write serviceStates and settings so they're never accidentally
      // dropped by a contact-only save. Backend doesn't echo `settings` back,
      // so we are the source of truth for it. To avoid clobbering unrelated
      // `settings` keys from a stale local `details`, attempt to fetch the
      // latest details and merge only the `services_by_state` portion.
      detailsPayload.serviceStates = validStates;
      try {
        const freshest = currentPractice?.id ? await getPracticeDetails(currentPractice.id) : null;
        const baseSettings = freshest?.settings ?? details?.settings ?? null;
        detailsPayload.settings = buildSettingsString(baseSettings, prunedServicesByState);
      } catch (fetchError) {
        // If fetching latest details fails, fall back to local `details`.
        if (import.meta.env.DEV) console.warn('[PracticePage] Failed to fetch fresh details before saving settings', fetchError);
        detailsPayload.settings = buildSettingsString(details?.settings ?? null, prunedServicesByState);
      }

      if (Object.keys(practicePayload).length > 0) {
        // Only pass allowed fields and filter out nulls for updatePractice
        const safePracticePayload: {
          name?: string;
          slug?: string;
          businessPhone?: string;
          businessEmail?: string;
          consultationFee?: typeof practicePayload.consultationFee;
          logo?: string;
          metadata?: Record<string, unknown>;
          businessOnboardingStatus?: typeof practicePayload.businessOnboardingStatus;
          businessOnboardingHasDraft?: typeof practicePayload.businessOnboardingHasDraft;
        } = {};
        if (typeof practicePayload.name === 'string') safePracticePayload.name = practicePayload.name;
        if (typeof practicePayload.slug === 'string') safePracticePayload.slug = practicePayload.slug;
        if (typeof practicePayload.businessPhone === 'string') safePracticePayload.businessPhone = practicePayload.businessPhone;
        if (typeof practicePayload.businessEmail === 'string') safePracticePayload.businessEmail = practicePayload.businessEmail;
        if (practicePayload.consultationFee !== null && practicePayload.consultationFee !== undefined) safePracticePayload.consultationFee = practicePayload.consultationFee;
        if (typeof practicePayload.logo === 'string') safePracticePayload.logo = practicePayload.logo;
        if (practicePayload.metadata !== null && practicePayload.metadata !== undefined) {
          safePracticePayload.metadata = practicePayload.metadata as Record<string, unknown>;
        } else {
          // Ensure metadata is not set at all if null/undefined
          delete safePracticePayload.metadata;
        }
        if (practicePayload.businessOnboardingStatus !== null && practicePayload.businessOnboardingStatus !== undefined) safePracticePayload.businessOnboardingStatus = practicePayload.businessOnboardingStatus;
        if (practicePayload.businessOnboardingHasDraft !== null && practicePayload.businessOnboardingHasDraft !== undefined) safePracticePayload.businessOnboardingHasDraft = practicePayload.businessOnboardingHasDraft;
        await updatePractice(currentPractice.id, safePracticePayload);
      }

      const savedDetails = await updateDetails(detailsPayload);

      // Backend doesn't return `settings`, so patch servicesByState back onto
      // whatever the server gave us so local state stays consistent.
      if (savedDetails != null) {
        setDetails({
          ...savedDetails,
          servicesByState: prunedServicesByState,
          serviceStates: validStates,
        });
      }

      // Keep local draft in sync with what we just persisted.
      setServicesByState(prunedServicesByState);
      setLicensedStates(validStates);
      setServicesDirty(false);
      setDraft({});
      showSuccess(practiceText.savedTitle, practiceText.savedBody);
    } catch (error) {
      showError(
        practiceText.saveFailedTitle,
        error instanceof Error ? error.message : practiceText.saveFailedBody
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    currentPractice,
    isSaving,
    contactValues,
    currentAccentColor,
    details,
    licensedStates,
    servicesByState,
    updatePractice,
    updateDetails,
    setDetails,
    showError,
    showSuccess,
    practiceText,
  ]);

  // ── reset ─────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setDraft({});
    // Reset services/states back to what the server last told us.
    setLicensedStates(details?.serviceStates ?? []);
    setServicesByState(details?.servicesByState ?? {});
    setServicesDirty(false);
  }, [details]);

  // ── render ────────────────────────────────────────────────────────────────
  if (!currentPractice) {
    return (
      <EditorShell title={practiceText.pageTitle} showBack={Boolean(onBack)} onBack={onBack}>
        <p className="text-sm text-input-placeholder">{practiceText.noPracticeSelected}</p>
      </EditorShell>
    );
  }

  return (
    <EditorShell
      title={practiceText.pageTitle}
      subtitle={practiceText.pageSubtitle}
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
            onClick={handleReset}
            disabled={!hasChanges || isSaving || logoUploading}
          >
            {practiceText.reset}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || isSaving || logoUploading}
          >
            {isSaving ? practiceText.saving : practiceText.save}
          </Button>
        </div>
      )}
    >
      <div className="space-y-6">
        <SettingSection
          title={practiceText.identityTitle}
          description={practiceText.identityDescription}
        >
          <FormGrid>
            <Input
              label={practiceText.practiceNameLabel}
              value={contactValues.name || ''}
              onChange={(value) => setDraft((prev) => ({ ...prev, name: value }))}
              disabled={isSaving}
              placeholder={practiceText.practiceNamePlaceholder}
            />
            <Input
              label={practiceText.publicSlugLabel}
              value={contactValues.slug || ''}
              onChange={(value) => setDraft((prev) => ({ ...prev, slug: value }))}
              disabled={isSaving}
              placeholder={practiceText.publicSlugPlaceholder}
              description={practiceText.publicSlugDescription}
            />
          </FormGrid>
        </SettingSection>

        <SectionDivider />

        <SettingSection
          title={practiceText.brandTitle}
          description={practiceText.brandDescription}
        >
          <div className="space-y-6">
            <LogoUploadInput
              imageUrl={contactValues.logo?.trim() ? contactValues.logo : null}
              name={currentPractice.name || practiceText.pageTitle}
              label={practiceText.avatarLabel}
              description={practiceText.avatarDescription}
              accept="image/*"
              multiple={false}
              onChange={handleLogoChange}
              disabled={isSaving || logoUploading}
              progress={logoUploading ? logoUploadProgress : null}
            />

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-input-text">{practiceText.brandColorLabel}</h3>
                <div className="mt-2 flex items-center gap-3">
                  <div
                    role="img"
                    className="h-5 w-5 rounded-full"
                    style={{ backgroundColor: normalizeAccentColor(contactValues.accentColor) ?? currentAccentColor }}
                    aria-label={practiceText.currentBrandColorAria}
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
                    accentColor:
                      normalizeAccentColor((event.target as HTMLInputElement).value)
                      ?? (event.target as HTMLInputElement).value.toUpperCase(),
                  }))}
                  disabled={isSaving}
                  aria-label={practiceText.brandColorAriaLabel}
                  className="h-10 w-16 rounded-xl border border-line-glass bg-surface-card p-1"
                />
                <Input
                  aria-label={practiceText.brandColorHexAria}
                  value={contactValues.accentColor ?? ''}
                  onChange={(value) => setDraft((prev) => ({
                    ...prev,
                    accentColor: normalizeAccentColor(value) ?? value.toUpperCase(),
                  }))}
                  placeholder={practiceText.brandColorPlaceholder}
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
          title={practiceText.contactTitle}
          description={practiceText.contactDescription}
        >
          <FormGrid>
            <Input
              label={practiceText.websiteLabel}
              value={contactValues.website || ''}
              onChange={(value) => setDraft((prev) => ({ ...prev, website: value }))}
              disabled={isSaving}
              placeholder={practiceText.websitePlaceholder}
            />
            <Input
              label={practiceText.businessEmailLabel}
              value={contactValues.businessEmail || ''}
              onChange={(value) => setDraft((prev) => ({ ...prev, businessEmail: value }))}
              disabled={isSaving}
              type="email"
              placeholder={practiceText.businessEmailPlaceholder}
            />
            <Input
              label={practiceText.contactPhoneLabel}
              value={contactValues.contactPhone || ''}
              onChange={(value) => setDraft((prev) => ({ ...prev, contactPhone: value }))}
              disabled={isSaving}
              type="tel"
              placeholder={practiceText.contactPhonePlaceholder}
            />
          </FormGrid>
        </SettingSection>

        <SectionDivider />

        <SettingSection
          title={practiceText.addressTitle}
          description={practiceText.addressDescription}
        >
          <AddressExperienceForm
            initialValues={{ address: contactValues.address }}
            fields={['address']}
            required={[]}
            onValuesChange={(values) => {
              if (values.address !== undefined) {
                setDraft((prev) => ({
                  ...prev,
                  address: values.address as Partial<Address> | undefined,
                }));
              }
            }}
            showSubmitButton={false}
            variant="plain"
            disabled={isSaving}
          />
          <SettingsHelperText className="mt-3">
            {practiceText.addressHelper}
          </SettingsHelperText>
        </SettingSection>

        <SectionDivider />

        <SettingSection
          title={practiceText.servicesTitle}
          description={practiceText.servicesDescription}
        >
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-input-text">{practiceText.addStatesHeading}</h4>
              <div className="mt-2">
                <Combobox
                  multiple
                  options={STATE_OPTIONS}
                  value={licensedStates}
                  onChange={(nextStates) => {
                    setLicensedStates(nextStates);
                    // Prune servicesByState to only valid states as user removes them.
                    setServicesByState((prev) => {
                      const pruned: Record<string, string[]> = {};
                      for (const s of nextStates) {
                        if (prev[s]) pruned[s] = prev[s];
                      }
                      return pruned;
                    });
                    setServicesDirty(true);
                  }}
                  placeholder={practiceText.licensedStatesPlaceholder}
                />
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-input-text">{practiceText.servicesPerStateHeading}</h4>
              <div className="mt-2">
                <ServicesByStateEditor
                  licensedStates={licensedStates}
                  value={servicesByState}
                  onChange={(next) => {
                    setServicesByState(next);
                    setServicesDirty(true);
                  }}
                  onRemove={(stateCode) => {
                    setServicesByState((prev) => {
                      const next = { ...prev };
                      delete next[stateCode];
                      return next;
                    });
                    setServicesDirty(true);
                  }}
                />
              </div>
            </div>
          </div>
        </SettingSection>
      </div>
    </EditorShell>
  );
};

export default PracticePage;