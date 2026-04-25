import { useMemo, useRef, useState, useCallback } from 'preact/hooks';
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
import { normalizeAccentColor } from '@/shared/utils/accentColors';
import { uploadPracticeLogo } from '@/shared/utils/practiceLogoUpload';
import { ServicesEditor } from '@/features/services/components/ServicesEditor';
import { SERVICE_CATALOG } from '@/features/services/data/serviceCatalog';
import type { Service } from '@/features/services/types';
import { getServiceDetailsForSave } from '@/features/services/utils';
import { resolveServiceDetails } from '@/features/services/utils/serviceNormalization';
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
        address: buildAddress(mapAddressSource(typeof details.address === 'object' && details.address !== null
          ? {
              ...details.address,
              city: details.city ?? (details.address as Record<string, unknown>).city,
              state: details.state ?? (details.address as Record<string, unknown>).state,
              postalCode: details.postalCode ?? (details.address as Record<string, unknown>).postalCode ?? (details.address as Record<string, unknown>).postal_code,
              country: details.country ?? (details.address as Record<string, unknown>).country,
            }
          : details.address)),
      }
    : {};

  return { ...basePractice, ...baseDetails };
};

export const PracticePage = ({ className, onBack }: PracticePageProps) => {
  const { currentPractice, updatePractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const { details, updateDetails, setDetails } = usePracticeDetails(currentPractice?.id, currentPractice?.slug, false);
  const { showSuccess, showError } = useToastContext();
  const { t } = useTranslation(['settings', 'common']);
  const [draft, setDraft] = useState<Partial<ContactDraft>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadProgress, setLogoUploadProgress] = useState<number | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [statesError, setStatesError] = useState<string | null>(null);
  const [licensedStatesDraft, setLicensedStatesDraft] = useState<string[]>([]);
  const [statesDraftTouched, setStatesDraftTouched] = useState(false);
  const [isSavingStates, setIsSavingStates] = useState(false);
  const lastSavedKeyRef = useRef<string>('');
  const saveRequestIdRef = useRef(0);
  const pendingSaveSnapshotsRef = useRef(new Map<number, { optimisticDetails: typeof details }>());
  const confirmedDetailsRef = useRef(details);
  const confirmedSaveIdRef = useRef(0);
  const lastToastAtRef = useRef(0);
  const toastCooldownMs = 4000;
  const currentAccentColor = normalizeAccentColor(details?.accentColor ?? currentPractice?.accentColor) ?? '#D4AF37';
  const initialServiceDetails = useMemo(
    () => resolveServiceDetails(details, currentPractice),
    [details, currentPractice]
  );
  const savedLicensedStates = useMemo(() => details?.serviceStates ?? [], [details?.serviceStates]);
  const displayedLicensedStates = statesDraftTouched || isSavingStates ? licensedStatesDraft : savedLicensedStates;

  const contactValues = useMemo(
    () => ({
      ...resolveContactDraft(currentPractice, details),
      name: draft.name ?? currentPractice?.name ?? '',
      slug: draft.slug ?? currentPractice?.slug ?? '',
      logo: draft.logo ?? currentPractice?.logo ?? '',
      accentColor: draft.accentColor ?? currentAccentColor,
      ...draft,
    }),
    [currentAccentColor, currentPractice, details, draft]
  );

  const hasChanges = useMemo(() => {
    const baseline = resolveContactDraft(currentPractice, details);
    return contactValues.name?.trim() !== baseline.name?.trim()
      || contactValues.slug?.trim() !== baseline.slug?.trim()
      || contactValues.website?.trim() !== baseline.website?.trim()
      || contactValues.businessEmail?.trim() !== baseline.businessEmail?.trim()
      || contactValues.contactPhone?.trim() !== baseline.contactPhone?.trim()
      || JSON.stringify(contactValues.address ?? null) !== JSON.stringify(baseline.address ?? null)
      || (contactValues.logo ?? '').trim() !== (currentPractice?.logo ?? '').trim()
      || normalizeAccentColor(contactValues.accentColor) !== currentAccentColor;
  }, [contactValues, currentAccentColor, currentPractice, details]);

  const saveServices = useCallback(async (nextServices: Service[]) => {
    if (!currentPractice) return;
    setServicesError(null);
    const serviceDetails = getServiceDetailsForSave(nextServices);
    const apiServices = serviceDetails
      .map(({ id, title }) => ({ id: id.trim(), name: title.trim() }))
      .filter((service) => service.id && service.name);
    const payloadKey = JSON.stringify(apiServices);
    if (payloadKey === lastSavedKeyRef.current) return;

    const saveId = ++saveRequestIdRef.current;
    if (pendingSaveSnapshotsRef.current.size === 0) {
      confirmedDetailsRef.current = details;
      confirmedSaveIdRef.current = saveId - 1;
    }

    const getLatestPendingSave = () => {
      let latestSaveId: number | null = null;
      let latestSave: { optimisticDetails: typeof details } | null = null;
      pendingSaveSnapshotsRef.current.forEach((pendingSave, pendingSaveId) => {
        if (latestSaveId === null || pendingSaveId > latestSaveId) {
          latestSaveId = pendingSaveId;
          latestSave = pendingSave;
        }
      });
      if (latestSaveId === null || !latestSave) return null;
      return { saveId: latestSaveId, optimisticDetails: latestSave.optimisticDetails };
    };

    const optimisticDetails = {
      ...(details ?? { services: [] }),
      services: apiServices,
    };
    pendingSaveSnapshotsRef.current.set(saveId, { optimisticDetails });
    setDetails(optimisticDetails);

    try {
      const savedDetails = await updateDetails({ services: apiServices });
      pendingSaveSnapshotsRef.current.delete(saveId);
      if (savedDetails !== undefined && saveId >= confirmedSaveIdRef.current) {
        confirmedSaveIdRef.current = saveId;
        confirmedDetailsRef.current = savedDetails;
      }
      const latestPendingSave = getLatestPendingSave();
      if (latestPendingSave && latestPendingSave.saveId > saveId) {
        setDetails(latestPendingSave.optimisticDetails);
        return;
      }
      if (saveId < confirmedSaveIdRef.current) {
        setDetails(confirmedDetailsRef.current);
        return;
      }
      if (saveId !== saveRequestIdRef.current) return;
      lastSavedKeyRef.current = payloadKey;
      const now = Date.now();
      if (now - lastToastAtRef.current > toastCooldownMs) {
        showSuccess(
          t('common:notifications.settingsSavedTitle'),
          t('common:notifications.settingsSavedBody')
        );
        lastToastAtRef.current = now;
      }
    } catch (err) {
      pendingSaveSnapshotsRef.current.delete(saveId);
      const latestPendingSave = getLatestPendingSave();
      setDetails(latestPendingSave?.optimisticDetails ?? confirmedDetailsRef.current);
      if (saveId !== saveRequestIdRef.current) return;
      const message = err instanceof Error ? err.message : t('common:notifications.settingsSaveErrorBody');
      setServicesError(message);
      showError(t('common:notifications.settingsSaveErrorTitle'), message);
    }
  }, [currentPractice, details, setDetails, showError, showSuccess, t, updateDetails]);

  const validateStateCode = useCallback((code: string) => STATE_OPTIONS.some(opt => opt.value === code), []);

  const saveLicensedStates = useCallback(async (nextStates: string[]) => {
    if (!currentPractice) return;
    const validStates = nextStates.filter(validateStateCode);
    const { detailsPayload } = buildPracticeProfilePayloads({ serviceStates: validStates });
    setStatesError(null);
    setIsSavingStates(true);
    try {
      const optimisticDetails = {
        ...(details ?? { services: [] }),
        serviceStates: validStates,
      };
      setDetails(optimisticDetails);
      const savedDetails = await updateDetails(detailsPayload);
      if (savedDetails !== undefined) setDetails(savedDetails);
      setLicensedStatesDraft(validStates);
      setStatesDraftTouched(false);
      showSuccess('Licensed states updated.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update licensed states';
      setStatesError(message);
      showError('Licensed states update failed', message);
    } finally {
      setIsSavingStates(false);
    }
  }, [currentPractice, details, setDetails, showError, showSuccess, updateDetails, validateStateCode]);

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
      }, {
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
      });

      if (Object.keys(practicePayload).length > 0) {
        await updatePractice(currentPractice.id, practicePayload);
      }
      if (Object.keys(detailsPayload).length > 0) {
        await updateDetails(detailsPayload);
      }
      setDraft({});
      showSuccess('Practice settings updated.');
    } catch (error) {
      showError('Practice settings update failed', error instanceof Error ? error.message : 'Unable to save practice settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentPractice) {
    return (
      <EditorShell title="Practice" showBack={Boolean(onBack)} onBack={onBack}>
        <p className="text-sm text-input-placeholder">No practice selected.</p>
      </EditorShell>
    );
  }

  return (
    <EditorShell
      title="Practice"
      subtitle="Identity, brand, contact, services, and licensed states"
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
        {servicesError && (
          <p className="text-xs text-accent-error dark:text-accent-error-light mb-4">
            {servicesError}
          </p>
        )}
        {statesError && (
          <p className="text-xs text-red-600 dark:text-red-400 mb-4">
            {statesError}
          </p>
        )}

        <SettingSection
          title="Identity"
          description="Practice name and public slug used in the workspace URL."
        >
          <FormGrid>
            <Input
              label="Practice name"
              value={contactValues.name || ''}
              onChange={(value) => setDraft((prev) => ({ ...prev, name: value }))}
              disabled={isSaving}
              placeholder="Smith & Associates"
            />
            <Input
              label="Public slug"
              value={contactValues.slug || ''}
              onChange={(value) => setDraft((prev) => ({ ...prev, slug: value }))}
              disabled={isSaving}
              placeholder="smith-associates"
              description="This controls the workspace URL."
            />
          </FormGrid>
        </SettingSection>

        <SectionDivider />

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
                    role="img"
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
                  address: values.address as Partial<Address> | undefined,
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

        <SectionDivider />

        <SettingSection
          title="Services"
          description="Choose the legal service areas this practice accepts for routing and intake setup."
        >
          <ServicesEditor
            services={initialServiceDetails}
            onChange={(nextServices) => void saveServices(nextServices)}
            catalog={SERVICE_CATALOG}
          />
        </SettingSection>

        <SectionDivider />

        <SettingSection
          title="Licensed states"
          description="Choose one or more states where this practice is licensed."
        >
          <Combobox
            multiple
            options={STATE_OPTIONS}
            value={displayedLicensedStates}
            onChange={(nextStates) => {
              setLicensedStatesDraft(nextStates);
              setStatesDraftTouched(true);
              void saveLicensedStates(nextStates);
            }}
            placeholder="Select licensed states"
            disabled={isSavingStates}
            aria-label="Licensed states"
          />
        </SettingSection>
      </div>
    </EditorShell>
  );
};

export default PracticePage;
