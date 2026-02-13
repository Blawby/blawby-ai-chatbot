import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState, useRef } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { Button } from '@/shared/ui/Button';
import { Input, LogoUploadInput } from '@/shared/ui/input';
import { cn } from '@/shared/utils/cn';
import { AddressExperienceForm } from '@/shared/ui/address/AddressExperienceForm';
import type { Address } from '@/shared/types/address';
import { PracticeProfileTextFields } from '@/shared/ui/practice/PracticeProfileTextFields';
import { initializeAccentColor } from '@/shared/utils/accentColors';
import type { PracticeSetupStatus } from '../utils/status';
import type { Practice } from '@/shared/hooks/usePracticeManagement';
import type { PracticeDetails } from '@/shared/lib/apiClient';

export interface BasicsFormValues {
  name: string;
  slug: string;
  introMessage: string;
  accentColor: string;
}

export interface ContactFormValues {
  website: string;
  businessEmail: string;
  businessPhone: string;
  address?: Address;
}

interface PracticeSetupProps {
  status: PracticeSetupStatus;
  practice: Practice | null;
  details: PracticeDetails | null;
  onSaveBasics: (values: BasicsFormValues) => Promise<void>;
  onSaveContact: (values: ContactFormValues) => Promise<void>;
  servicesSlot?: ComponentChildren;
  payoutsSlot?: ComponentChildren;
  logoUploading: boolean;
  logoUploadProgress: number | null;
  onLogoChange: (files: FileList | File[]) => void;
  onBasicsDraftChange?: (values: BasicsFormValues) => void;
}

export const PracticeSetup = ({
  status,
  practice,
  details,
  onSaveBasics,
  onSaveContact,
  servicesSlot,
  payoutsSlot,
  logoUploading,
  logoUploadProgress,
  onLogoChange,
  onBasicsDraftChange
}: PracticeSetupProps) => {
  const { t } = useTranslation(['settings', 'common']);
  const glassCardClass = 'glass-card p-4 sm:p-5';

  const inputGlassClass = 'glass-input';

  const [basicsDraft, setBasicsDraft] = useState<BasicsFormValues>({
    name: '',
    slug: '',
    introMessage: '',
    accentColor: 'grey'
  });
  const [contactDraft, setContactDraft] = useState<ContactFormValues>({
    website: '',
    businessEmail: '',
    businessPhone: '',
    address: undefined
  });
  const [isSavingBasics, setIsSavingBasics] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [basicsSaveError, setBasicsSaveError] = useState<string | null>(null);
  const [contactSaveError, setContactSaveError] = useState<string | null>(null);
  const [justSavedBasics, setJustSavedBasics] = useState(false);
  const [justSavedContact, setJustSavedContact] = useState(false);

  const [initialBasics, setInitialBasics] = useState<BasicsFormValues | null>(null);
  const [initialContact, setInitialContact] = useState<ContactFormValues | null>(null);
  const basicsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentBasicsFromProps = useMemo(() => ({
    name: practice?.name ?? '',
    slug: practice?.slug ?? '',
    introMessage: details?.introMessage ?? practice?.introMessage ?? '',
    accentColor: details?.accentColor ?? practice?.accentColor ?? 'grey'
  }), [practice?.name, practice?.slug, practice?.introMessage, details?.introMessage, details?.accentColor, practice?.accentColor]);

  const currentContactFromProps = useMemo(() => ({
    website: details?.website ?? practice?.website ?? '',
    businessEmail: details?.businessEmail ?? practice?.businessEmail ?? '',
    businessPhone: details?.businessPhone ?? practice?.businessPhone ?? '',
    address: {
      address: details?.address ?? practice?.address ?? '',
      apartment: details?.apartment ?? practice?.apartment ?? '',
      city: details?.city ?? practice?.city ?? '',
      state: details?.state ?? practice?.state ?? '',
      postalCode: details?.postalCode ?? practice?.postalCode ?? '',
      country: details?.country ?? practice?.country ?? ''
    }
  }), [
    details?.website,
    details?.businessEmail,
    details?.businessPhone,
    details?.address,
    details?.apartment,
    details?.city,
    details?.state,
    details?.postalCode,
    details?.country,
    practice?.website,
    practice?.businessEmail,
    practice?.businessPhone,
    practice?.address,
    practice?.apartment,
    practice?.city,
    practice?.state,
    practice?.postalCode,
    practice?.country
  ]);

  const basicsDirty = useMemo(() => {
    if (!initialBasics) return false;
    return (
      basicsDraft.name !== initialBasics.name ||
      basicsDraft.slug !== initialBasics.slug ||
      basicsDraft.introMessage !== initialBasics.introMessage
    );
  }, [basicsDraft, initialBasics]);

  const contactDirty = useMemo(() => {
    if (!initialContact) return false;
    const initial = initialContact;
    return (
      contactDraft.website !== initial.website ||
      contactDraft.businessEmail !== initial.businessEmail ||
      contactDraft.businessPhone !== initial.businessPhone ||
      (contactDraft.address?.address ?? '') !== (initial.address?.address ?? '') ||
      (contactDraft.address?.apartment ?? '') !== (initial.address?.apartment ?? '') ||
      (contactDraft.address?.city ?? '') !== (initial.address?.city ?? '') ||
      (contactDraft.address?.state ?? '') !== (initial.address?.state ?? '') ||
      (contactDraft.address?.postalCode ?? '') !== (initial.address?.postalCode ?? '') ||
      (contactDraft.address?.country ?? '') !== (initial.address?.country ?? '')
    );
  }, [contactDraft, initialContact]);

  useEffect(() => {
    onBasicsDraftChange?.(basicsDraft);
  }, [basicsDraft, onBasicsDraftChange]);

  useEffect(() => {
    if (justSavedBasics) {
      if (
        initialBasics &&
        currentBasicsFromProps.name === initialBasics.name &&
        currentBasicsFromProps.slug === initialBasics.slug &&
        currentBasicsFromProps.introMessage === initialBasics.introMessage
      ) {
        if (basicsTimerRef.current) {
          clearTimeout(basicsTimerRef.current);
          basicsTimerRef.current = null;
        }
        setJustSavedBasics(false);
      }
      return;
    }
    if (basicsDirty) return;
    setBasicsDraft(currentBasicsFromProps);
    setInitialBasics(currentBasicsFromProps);
  }, [currentBasicsFromProps, basicsDirty, justSavedBasics, initialBasics]);

  useEffect(() => {
    if (justSavedContact) {
      const initial = initialContact;
      if (
        initial &&
        currentContactFromProps.website === initial.website &&
        currentContactFromProps.businessEmail === initial.businessEmail &&
        currentContactFromProps.businessPhone === initial.businessPhone &&
        (currentContactFromProps.address?.address ?? '') === (initial.address?.address ?? '') &&
        (currentContactFromProps.address?.apartment ?? '') === (initial.address?.apartment ?? '') &&
        (currentContactFromProps.address?.city ?? '') === (initial.address?.city ?? '') &&
        (currentContactFromProps.address?.state ?? '') === (initial.address?.state ?? '') &&
        (currentContactFromProps.address?.postalCode ?? '') === (initial.address?.postalCode ?? '') &&
        (currentContactFromProps.address?.country ?? '') === (initial.address?.country ?? '')
      ) {
        if (contactTimerRef.current) {
          clearTimeout(contactTimerRef.current);
          contactTimerRef.current = null;
        }
        setJustSavedContact(false);
      }
      return;
    }
    if (contactDirty) return;
    setContactDraft(currentContactFromProps);
    setInitialContact(currentContactFromProps);
  }, [currentContactFromProps, contactDirty, justSavedContact, initialContact]);

  useEffect(() => {
    return () => {
      if (basicsTimerRef.current) clearTimeout(basicsTimerRef.current);
      if (contactTimerRef.current) clearTimeout(contactTimerRef.current);
    };
  }, []);

  // Live preview of accent color changes
  useEffect(() => {
    if (basicsDraft.accentColor) {
      initializeAccentColor(basicsDraft.accentColor);
    }
  }, [basicsDraft.accentColor]);

  const bannerTitle = status.needsSetup ? 'Almost ready to go' : 'All set';
  const bannerDescription = status.needsSetup
    ? 'Finish these essentials to unlock AI chat and your public intake flow.'
    : 'Your workspace essentials are complete. You can update any section at any time.';



  return (
    <div className="space-y-8 text-input-text">
      <div className="space-y-8">
        <header className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.45em] text-input-placeholder">
            Let&apos;s get started
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            {bannerTitle}
          </h2>
          <p className="text-sm text-input-placeholder">
            {bannerDescription}
          </p>
        </header>

        <section className={glassCardClass}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-input-placeholder">Profile</p>
              <p className="text-lg font-bold">Firm basics</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Input
              label="Practice name"
              value={basicsDraft.name}
              onChange={(value) => setBasicsDraft((prev) => ({ ...prev, name: value }))}
              placeholder="Blawby & Co."
              className={inputGlassClass}
            />
            <Input
              label="Public slug"
              value={basicsDraft.slug}
              onChange={(value) => setBasicsDraft((prev) => ({ ...prev, slug: value }))}
              placeholder="your-firm"
              className={inputGlassClass}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-input-text" htmlFor="practice-setup-accent-color">
                Brand accent color
              </label>
              <select
                id="practice-setup-accent-color"
                value={basicsDraft.accentColor}
                onChange={(e) => setBasicsDraft((prev) => ({ ...prev, accentColor: (e.target as HTMLSelectElement).value }))}
                className={cn(
                  'w-full h-10 px-3 py-2 text-sm bg-surface-base border border-line-glass rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all',
                  inputGlassClass
                )}
              >
                <option value="grey">{t('settings:general.accent.options.grey')}</option>
                <option value="gold">{t('settings:general.accent.options.gold')}</option>
                <option value="blue">{t('settings:general.accent.options.blue')}</option>
                <option value="green">{t('settings:general.accent.options.green')}</option>
                <option value="yellow">{t('settings:general.accent.options.yellow')}</option>
                <option value="pink">{t('settings:general.accent.options.pink')}</option>
                <option value="orange">{t('settings:general.accent.options.orange')}</option>
                <option value="purple">{t('settings:general.accent.options.purple')}</option>
              </select>
              <p className="text-[10px] text-input-placeholder">This color appears on your public profile and client portal.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <LogoUploadInput
                imageUrl={practice?.logo ?? null}
                name={practice?.name ?? 'Practice'}
                label="Logo"
                description="Upload a square logo (max 5 MB)."
                accept="image/*"
                multiple={false}
                onChange={onLogoChange}
                disabled={logoUploading}
                progress={logoUploading ? logoUploadProgress : null}
              />
            </div>
            <div>
              <PracticeProfileTextFields
                introMessage={basicsDraft.introMessage}
                onIntroChange={(value) => setBasicsDraft((prev) => ({ ...prev, introMessage: value }))}
                introRows={3}
                introLabel="Intro message"
                introPlaceholder="Welcome to our firm. How can we help?"
                disabled={isSavingBasics}
                inputClassName={inputGlassClass}
              />
            </div>
          </div>
          <div className="mt-4 flex">
            <Button
              variant="primary"
              size="sm"
              className="w-full sm:w-auto sm:ml-auto"
              disabled={!basicsDirty || isSavingBasics}
              onClick={async () => {
                if (!basicsDirty || isSavingBasics) return;
                setIsSavingBasics(true);
                setBasicsSaveError(null);
                try {
                  await onSaveBasics(basicsDraft);
                  setInitialBasics(basicsDraft);
                  setJustSavedBasics(true);
                  if (basicsTimerRef.current) clearTimeout(basicsTimerRef.current);
                  basicsTimerRef.current = setTimeout(() => {
                    setJustSavedBasics(false);
                    basicsTimerRef.current = null;
                  }, 5000);
                } catch (error) {
                  setBasicsSaveError(error instanceof Error ? error.message : 'Failed to save basics');
                } finally {
                  setIsSavingBasics(false);
                }
              }}
            >
              {isSavingBasics ? 'Saving…' : 'Save basics'}
            </Button>
          </div>
          {basicsSaveError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {basicsSaveError}
            </p>
          )}
        </section>

        <section className={glassCardClass}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-input-placeholder">Contact</p>
              <p className="text-lg font-bold">Where can clients reach you?</p>
            </div>
          </div>
          <div className="mt-4 space-y-4">
            <Input
              label="Website"
              type="url"
              value={contactDraft.website}
              onChange={(value) => setContactDraft((prev) => ({ ...prev, website: value }))}
              placeholder="https://example.com"
              className={inputGlassClass}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <Input
                label="Business email"
                type="email"
                value={contactDraft.businessEmail}
                onChange={(value) => setContactDraft((prev) => ({ ...prev, businessEmail: value }))}
                placeholder="you@example.com"
                className={inputGlassClass}
              />
              <Input
                label="Phone number"
                type="tel"
                value={contactDraft.businessPhone}
                onChange={(value) => setContactDraft((prev) => ({ ...prev, businessPhone: value }))}
                placeholder="(555) 123-4567"
                className={inputGlassClass}
              />
            </div>
            <AddressExperienceForm
              initialValues={{ address: contactDraft.address }}
              fields={['address']}
              required={[]}
              onValuesChange={(values) => {
                if (values.address !== undefined) {
                  setContactDraft(prev => ({
                    ...prev,
                    address: values.address as Address,
                  }));
                }
              }}
              showSubmitButton={false}
              variant="plain"
              disabled={isSavingContact}
              inputClassName={inputGlassClass}
            />
          </div>
          <div className="mt-4 flex">
            <Button
              variant="primary"
              size="sm"
              className="w-full sm:w-auto sm:ml-auto"
              disabled={!contactDirty || isSavingContact}
              onClick={async () => {
                if (!contactDirty || isSavingContact) return;
                setIsSavingContact(true);
                setContactSaveError(null);
                try {
                  await onSaveContact(contactDraft);
                  setInitialContact(contactDraft);
                  setJustSavedContact(true);
                  if (contactTimerRef.current) clearTimeout(contactTimerRef.current);
                  contactTimerRef.current = setTimeout(() => {
                    setJustSavedContact(false);
                    contactTimerRef.current = null;
                  }, 5000);
                } catch (error) {
                  setContactSaveError(error instanceof Error ? error.message : 'Failed to save contact info');
                } finally {
                  setIsSavingContact(false);
                }
              }}
            >
              {isSavingContact ? 'Saving…' : 'Save contact'}
            </Button>
          </div>
          {contactSaveError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {contactSaveError}
            </p>
          )}
        </section>

        {servicesSlot && (
          <section className={glassCardClass}>
            {servicesSlot}
          </section>
        )}

        {payoutsSlot && (
          <section className={glassCardClass}>
            {payoutsSlot}
          </section>
        )}
      </div>
    </div>
  );
};
