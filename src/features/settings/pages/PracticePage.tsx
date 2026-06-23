import { useEffect, useMemo, useState, useCallback } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { LogoUploadInput } from '@/shared/ui/input';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import type { Address } from '@/shared/types/address';
import { cn } from '@/shared/utils/cn';
import { buildPracticeProfilePayloads } from '@/shared/utils/practiceProfile';
import { uploadPracticeLogo } from '@/shared/utils/practiceLogoUpload';

interface PracticePageProps {
  className?: string;
}

type ContactDraft = {
  name?: string;
  slug?: string;
  website?: string;
  businessEmail?: string;
  contactPhone?: string;
  address?: Partial<Address>;
  logo?: string;
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

const PRACTICE_AREAS = [
  'Family law', 'Divorce & separation', 'Child custody', 'Domestic violence',
  'Estate planning', 'Immigration', 'Personal injury', 'Criminal defense',
  'Real estate', 'Business law', 'Bankruptcy', 'Employment law',
];

// ─── component ──────────────────────────────────────────────────────────────

export const PracticePage = ({ className }: PracticePageProps) => {
  const { currentPractice, updatePractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const { details, updateDetails } = usePracticeDetails(currentPractice?.id, currentPractice?.slug, false);
  const { showSuccess, showError } = useToastContext();
  const { t } = useTranslation(['settings', 'common']);

  // ── contact / brand draft ──────────────────────────────────────────────────
  const [draft, setDraft] = useState<Partial<ContactDraft>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadProgress, setLogoUploadProgress] = useState<number | null>(null);

  // ── metadata fields (jurisdictions, practice areas, bio) ──────────────────
  type MetaDraft = {
    jurisdictions: string[];
    practiceAreas: string[];
    bio: string;
    specializations: string;
    barNumber: string;
    admittedYear: string;
    dba: string;
    fax: string;
  };
  const metaFromDetails = useMemo((): MetaDraft => {
    const m = details?.metadata ?? {};
    return {
      jurisdictions: Array.isArray(m.jurisdictions) ? (m.jurisdictions as string[]) : [],
      practiceAreas: Array.isArray(m.practiceAreas) ? (m.practiceAreas as string[]) : [],
      bio: typeof m.bio === 'string' ? m.bio : '',
      specializations: typeof m.specializations === 'string' ? m.specializations : '',
      barNumber: typeof m.barNumber === 'string' ? m.barNumber : '',
      admittedYear: typeof m.admittedYear === 'string' ? m.admittedYear : '',
      dba: typeof m.dba === 'string' ? m.dba : '',
      fax: typeof m.fax === 'string' ? m.fax : '',
    };
  }, [details?.metadata]);
  const [meta, setMeta] = useState<MetaDraft>(metaFromDetails);
  useEffect(() => {
    setMeta(metaFromDetails);
  }, [metaFromDetails]);
  const toggleJurisdiction = (j: string) => setMeta((p) => ({ ...p, jurisdictions: p.jurisdictions.includes(j) ? p.jurisdictions.filter((x) => x !== j) : [...p.jurisdictions, j] }));
  const togglePracticeArea = (a: string) => setMeta((p) => ({ ...p, practiceAreas: p.practiceAreas.includes(a) ? p.practiceAreas.filter((x) => x !== a) : [...p.practiceAreas, a] }));

  const contactValues = useMemo(
    () => ({
      ...resolveContactDraft(currentPractice, details),
      ...draft,
      name: draft.name ?? currentPractice?.name ?? '',
      slug: draft.slug ?? currentPractice?.slug ?? '',
      logo: draft.logo ?? currentPractice?.logo ?? '',
    }),
    [currentPractice, details, draft]
  );

  // ── i18n ──────────────────────────────────────────────────────────────────
  const practiceText = useMemo(() => ({
    pageTitle: t('settings:practice.page.title', { defaultValue: 'Practice' }),
    pageSubtitle: t('settings:practice.page.subtitle', { defaultValue: 'Identity, brand, and contact' }),
    identityTitle: t('settings:practice.identity.title', { defaultValue: 'Identity' }),
    identityDescription: t('settings:practice.identity.description', { defaultValue: 'Practice name and public slug used in the workspace URL.' }),
    practiceNameLabel: t('settings:practice.identity.nameLabel', { defaultValue: 'Practice name' }),
    practiceNamePlaceholder: t('settings:practice.identity.namePlaceholder', { defaultValue: 'Smith & Associates' }),
    publicSlugLabel: t('settings:practice.identity.slugLabel', { defaultValue: 'Public slug' }),
    publicSlugPlaceholder: t('settings:practice.identity.slugPlaceholder', { defaultValue: 'smith-associates' }),
    publicSlugDescription: t('settings:practice.identity.slugDescription', { defaultValue: 'This controls the workspace URL.' }),
    publicSlugUrlLabel: t('settings:practice.identity.slugUrlLabel', { defaultValue: 'Your URL' }),
    publicSlugSuggestPrefix: t('settings:practice.identity.slugSuggestPrefix', { defaultValue: 'Use' }),
    publicSlugSuggestSuffix: t('settings:practice.identity.slugSuggestSuffix', { defaultValue: 'from your practice name' }),
    brandTitle: t('settings:practice.brand.title', { defaultValue: 'Brand' }),
    brandDescription: t('settings:practice.brand.description', { defaultValue: 'Logo used throughout the widget experience.' }),
    avatarLabel: t('settings:practice.brand.avatarLabel', { defaultValue: 'Upload brand avatar' }),
    avatarDescription: t('settings:practice.brand.avatarDescription', { defaultValue: 'Upload a square image. Maximum 5 MB.' }),
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
  }), [t]);

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
      || (contactValues.logo ?? '').trim() !== (currentPractice?.logo ?? '').trim();

    const metaChanged = JSON.stringify(meta) !== JSON.stringify(metaFromDetails);
    return contactChanged || metaChanged;
  }, [contactValues, currentPractice, details, meta, metaFromDetails]);

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

    setIsSaving(true);
    try {
      const { practicePayload, detailsPayload } = buildPracticeProfilePayloads(
        {
          name: contactValues.name ?? null,
          slug: contactValues.slug ?? null,
          logo: contactValues.logo ?? null,
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

      // Merge metadata fields into the details payload
      detailsPayload.metadata = {
        ...(details?.metadata ?? {}),
        jurisdictions: meta.jurisdictions,
        practiceAreas: meta.practiceAreas,
        bio: meta.bio,
        specializations: meta.specializations,
        barNumber: meta.barNumber,
        admittedYear: meta.admittedYear,
        dba: meta.dba,
        fax: meta.fax,
      };

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

      await updateDetails(detailsPayload);
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
    meta,
    details,
    updatePractice,
    updateDetails,
    showError,
    showSuccess,
    practiceText,
  ]);

  // ── reset ─────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setDraft({});
    setMeta(metaFromDetails);
  }, [metaFromDetails]);

  // ── render ────────────────────────────────────────────────────────────────
  if (!currentPractice) {
    return <p className="text-sm text-dim-2">{practiceText.noPracticeSelected}</p>;
  }

  // Helpers for address sub-fields
  const addrField = (key: keyof NonNullable<ContactDraft['address']>) =>
    (contactValues.address as Record<string, string | null | undefined> | undefined)?.[key] as string ?? '';
  const setAddr = (key: string, value: string) =>
    setDraft((p) => ({ ...p, address: { ...(p.address ?? contactValues.address ?? {}), [key]: value } }));

  const practiceInitial = (contactValues.name || currentPractice.name || 'P').charAt(0).toUpperCase();
  const logoUrl = contactValues.logo?.trim() || null;
  const chipClass = (selected: boolean, disabled = false, dashed = false) => cn(
    'inline-flex items-center gap-1.5 rounded-[var(--r-xs)] border px-3 py-[7px] text-[13px] transition-all',
    selected
      ? 'border-ink bg-ink text-accent'
      : 'bg-card text-ink-2 hover:border-ink',
    dashed ? 'border-dashed text-dim hover:text-ink' : 'border-rule',
    disabled && 'cursor-not-allowed opacity-50',
  );

  return (
    <div className={className}>
      <div className="space-y-0">
        <SettingSection
          first
          title="Firm details"
          description="How your practice appears to clients and in generated documents."
        >
          <div className="mb-8 flex items-center gap-[22px]">
            <LogoUploadInput
              imageUrl={logoUrl}
              name={currentPractice.name || ''}
              buttonLabel="Change logo"
              accept="image/*"
              multiple={false}
              onChange={handleLogoChange}
              disabled={isSaving || logoUploading}
              progress={logoUploading ? logoUploadProgress : null}
              triggerMode="avatar"
              size={72}
              className="w-auto"
            />
            <div>
              <div className="font-serif text-[22px] font-normal tracking-[-0.01em] text-ink">
                {contactValues.name || currentPractice.name || practiceInitial}
              </div>
              <div className="mt-0.5 font-mono text-xs text-dim">
                {contactValues.businessEmail || currentPractice.businessEmail || ''}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-[14px] max-[720px]:grid-cols-1">
            <div className="form-field">
              <label className="label" htmlFor="firm-name">Firm name</label>
              <input id="firm-name" className="input" value={contactValues.name || ''} placeholder="Law Offices of…" disabled={isSaving}
                onInput={(e) => setDraft((p) => ({ ...p, name: (e.target as HTMLInputElement).value }))} />
            </div>
            <div className="form-field">
              <label className="label" htmlFor="dba">DBA / public name</label>
              <input id="dba" className="input" value={meta.dba} placeholder="Optional public name" disabled={isSaving}
                onInput={(e) => setMeta((p) => ({ ...p, dba: (e.target as HTMLInputElement).value }))} />
            </div>
            <div className="form-field">
              <label className="label" htmlFor="contact-phone">Phone</label>
              <input id="contact-phone" className="input" type="tel" value={contactValues.contactPhone || ''} placeholder="(555) 000-0000" disabled={isSaving}
                onInput={(e) => setDraft((p) => ({ ...p, contactPhone: (e.target as HTMLInputElement).value }))} />
            </div>
            <div className="form-field">
              <label className="label" htmlFor="fax">Fax</label>
              <input id="fax" className="input" type="tel" value={meta.fax} placeholder="Optional" disabled={isSaving}
                onInput={(e) => setMeta((p) => ({ ...p, fax: (e.target as HTMLInputElement).value }))} />
            </div>
            <div className="form-field">
              <label className="label" htmlFor="public-slug">Slug</label>
              <input id="public-slug" className="input" value={contactValues.slug || ''} placeholder="smith-associates" disabled={isSaving}
                onInput={(e) => setDraft((p) => ({ ...p, slug: (e.target as HTMLInputElement).value }))} />
            </div>
            <div className="form-field">
              <label className="label" htmlFor="business-email">Business email</label>
              <input id="business-email" className="input" type="email" value={contactValues.businessEmail || ''} placeholder="business@example.com" disabled={isSaving}
                onInput={(e) => setDraft((p) => ({ ...p, businessEmail: (e.target as HTMLInputElement).value }))} />
            </div>
            <div className="form-field">
              <label className="label" htmlFor="website">Website</label>
              <input id="website" className="input" value={contactValues.website || ''} placeholder="https://example.com" disabled={isSaving}
                onInput={(e) => setDraft((p) => ({ ...p, website: (e.target as HTMLInputElement).value }))} />
            </div>
          </div>

          <div className="form-field mt-[22px]">
            <label className="label" htmlFor="address-line-1">Address line 1</label>
            <input id="address-line-1" className="input" value={addrField('address')} placeholder="Street address, suite" disabled={isSaving}
              onInput={(e) => setAddr('address', (e.target as HTMLInputElement).value)} />
          </div>

          <div className="mt-[22px] grid grid-cols-2 gap-[14px] max-[720px]:grid-cols-1">
            <div className="form-field">
              <label className="label" htmlFor="city">City</label>
              <input id="city" className="input" value={addrField('city')} placeholder="Charlotte" disabled={isSaving}
                onInput={(e) => setAddr('city', (e.target as HTMLInputElement).value)} />
            </div>
            <div className="form-field">
              <label className="label" htmlFor="state">State</label>
              <input id="state" className="input" value={addrField('state')} placeholder="NC" disabled={isSaving}
                onInput={(e) => setAddr('state', (e.target as HTMLInputElement).value)} />
            </div>
            <div className="form-field">
              <label className="label" htmlFor="postal-code">Postal code</label>
              <input id="postal-code" className="input" value={addrField('postalCode')} placeholder="28202" disabled={isSaving}
                onInput={(e) => setAddr('postalCode', (e.target as HTMLInputElement).value)} />
            </div>
            <div className="form-field">
              <label className="label" htmlFor="country">Country</label>
              <select id="country" className="select" value={addrField('country') || 'US'} disabled={isSaving}
                onChange={(e) => setAddr('country', (e.target as HTMLSelectElement).value)}>
                <option value="US">US</option>
                <option value="CA">CA</option>
                <option value="GB">GB</option>
              </select>
            </div>
            <div className="form-field">
              <label className="label" htmlFor="bar-number">Bar number</label>
              <input id="bar-number" className="input" value={meta.barNumber} placeholder="NC 38421" disabled={isSaving}
                onInput={(e) => setMeta((p) => ({ ...p, barNumber: (e.target as HTMLInputElement).value }))} />
            </div>
            <div className="form-field">
              <label className="label" htmlFor="admitted-year">Admitted</label>
              <input id="admitted-year" className="input" value={meta.admittedYear} placeholder="2016" disabled={isSaving}
                onInput={(e) => setMeta((p) => ({ ...p, admittedYear: (e.target as HTMLInputElement).value }))} />
            </div>
          </div>
        </SettingSection>

        {/* Jurisdictions */}
        <SettingSection
          title="Jurisdictions"
          description="Where you're licensed. The assistant will decline matters outside these jurisdictions."
        >
          <div className="mt-[14px] flex flex-wrap gap-2">
            {meta.jurisdictions.map((j) => (
              <button key={j} type="button" disabled={isSaving} onClick={() => toggleJurisdiction(j)} className={chipClass(true, isSaving)}>
                {j}
              </button>
            ))}
            {['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming']
              .filter((s) => !meta.jurisdictions.includes(s))
              .map((s) => (
                <button key={s} type="button" disabled={isSaving} onClick={() => toggleJurisdiction(s)} className={chipClass(false, isSaving)}>
                  {s}
                </button>
              ))}
            <button type="button" disabled className={chipClass(false, true, true)}>+ Add jurisdiction</button>
          </div>
        </SettingSection>

        {/* Practice areas */}
        <SettingSection
          title="Practice areas"
          description="The assistant uses these to qualify intakes and route consultations. Toggle areas on or off as your practice evolves."
        >
          <div className="mt-[14px] flex flex-wrap gap-2">
            {PRACTICE_AREAS.map((area) => {
              const on = meta.practiceAreas.includes(area);
              return (
                <button key={area} type="button" disabled={isSaving} onClick={() => togglePracticeArea(area)}
                  className={chipClass(on, isSaving)}>
                  {area}
                </button>
              );
            })}
            <button type="button" className={chipClass(false, true, true)} disabled>+ Custom area</button>
          </div>
        </SettingSection>

        {/* Bio & credentials */}
        <SettingSection
          title="Bio & credentials"
          description="Used in engagement letters, the client portal, and intake widget."
        >
          <div className="form-field mb-[18px]">
            <label className="label" htmlFor="professional-bio">Professional bio</label>
            <textarea id="professional-bio" className="textarea" rows={4} value={meta.bio} disabled={isSaving}
              placeholder="Brief bio visible to clients…"
              onInput={(e) => setMeta((p) => ({ ...p, bio: (e.target as HTMLTextAreaElement).value }))} />
          </div>
          <div className="form-field">
            <label className="label" htmlFor="specializations">Specializations / certifications</label>
            <input id="specializations" className="input" value={meta.specializations} disabled={isSaving}
              placeholder="NC Board Certified Specialist — Family Law"
              onInput={(e) => setMeta((p) => ({ ...p, specializations: (e.target as HTMLInputElement).value }))} />
          </div>
        </SettingSection>

      </div>

      {/* Save / discard — bottom of content, matching design's Profile.html */}
      <div className="mt-2 flex items-center gap-2.5">
        <Button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || isSaving || logoUploading}
        >
          {isSaving ? practiceText.saving : practiceText.save}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleReset}
          disabled={!hasChanges || isSaving || logoUploading}
        >
          {practiceText.reset}
        </Button>
      </div>
    </div>
  );
};

export default PracticePage;
