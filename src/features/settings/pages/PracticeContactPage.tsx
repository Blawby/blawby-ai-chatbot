import { useMemo, useState, useCallback } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Input, EmailInput } from '@/shared/ui/input';
import { AddressExperienceForm } from '@/shared/ui/address/AddressExperienceForm';
import { EditorShell } from '@/shared/ui/layout';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import type { Address } from '@/shared/types/address';
import { buildPracticeProfilePayloads } from '@/shared/utils/practiceProfile';

import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import { buildAddress, mapAddressSource } from '@/features/settings/utils/practiceFormHelpers';

interface PracticeContactPageProps {
  className?: string;
  onBack?: () => void;
}

type Draft = {
  website?: string;
  businessEmail?: string;
  contactPhone?: string;
  address?: Partial<Address>;
};

export const PracticeContactPage = ({ className, onBack }: PracticeContactPageProps) => {
  const { currentPractice, updatePractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const { details, updateDetails } = usePracticeDetails(currentPractice?.id, currentPractice?.slug, false);
  const { showSuccess, showError } = useToastContext();
  const { t } = useTranslation(['settings', 'common']);

  const [draft, setDraft] = useState<Draft>({});
  const [isSaving, setIsSaving] = useState(false);

  const baseline = useMemo(() => {
    const basePractice = currentPractice
      ? {
          website: currentPractice.website ?? undefined,
          businessEmail: currentPractice.businessEmail ?? undefined,
          contactPhone: currentPractice.businessPhone ?? undefined,
          address: buildAddress(mapAddressSource(currentPractice)),
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
  }, [currentPractice, details]);

  const values = useMemo(() => ({
    website: draft.website ?? baseline.website ?? '',
    businessEmail: draft.businessEmail ?? baseline.businessEmail ?? '',
    contactPhone: draft.contactPhone ?? baseline.contactPhone ?? '',
    address: draft.address ?? baseline.address,
  }), [draft, baseline]);

  const hasChanges = useMemo(() => {
    return (values.website ?? '').trim() !== (baseline.website ?? '').trim()
      || (values.businessEmail ?? '').trim() !== (baseline.businessEmail ?? '').trim()
      || (values.contactPhone ?? '').trim() !== (baseline.contactPhone ?? '').trim()
      || JSON.stringify(values.address ?? null) !== JSON.stringify(baseline.address ?? null);
  }, [values, baseline]);

  const handleSave = useCallback(async () => {
    if (!currentPractice || isSaving) return;
    setIsSaving(true);
    try {
      const { practicePayload, detailsPayload } = buildPracticeProfilePayloads(
        {
          website: values.website,
          businessEmail: values.businessEmail,
          businessPhone: values.contactPhone,
          address: values.address?.address ?? null,
          apartment: values.address?.apartment ?? null,
          city: values.address?.city ?? null,
          state: values.address?.state ?? null,
          postalCode: values.address?.postalCode ?? null,
          country: values.address?.country ?? null,
        },
        {
          compareTo: {
            website: baseline.website ?? null,
            businessEmail: baseline.businessEmail ?? null,
            businessPhone: baseline.contactPhone ?? null,
            address: currentPractice.address ?? null,
            apartment: currentPractice.apartment ?? null,
            city: currentPractice.city ?? null,
            state: currentPractice.state ?? null,
            postalCode: currentPractice.postalCode ?? null,
            country: currentPractice.country ?? null,
          },
        },
      );

      if (Object.keys(practicePayload).length > 0) {
        const safePayload: {
          businessEmail?: string;
          businessPhone?: string;
        } = {};
        if (typeof practicePayload.businessEmail === 'string') safePayload.businessEmail = practicePayload.businessEmail;
        if (typeof practicePayload.businessPhone === 'string') safePayload.businessPhone = practicePayload.businessPhone;
        if (Object.keys(safePayload).length > 0) {
          await updatePractice(currentPractice.id, safePayload);
        }
      }

      if (Object.keys(detailsPayload).length > 0) {
        await updateDetails(detailsPayload);
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
  }, [currentPractice, isSaving, values, baseline, updatePractice, updateDetails, showError, showSuccess, t]);

  if (!currentPractice) {
    return (
      <EditorShell title="Practice" showBack={Boolean(onBack)} onBack={onBack}>
        <p className="text-sm text-input-placeholder">{t('settings:practice.noPracticeSelected', { defaultValue: 'No practice selected.' })}</p>
      </EditorShell>
    );
  }

  return (
    <EditorShell
      title={t('settings:practice.contact.pageTitle', { defaultValue: 'Contact' })}
      subtitle={t('settings:practice.contact.pageSubtitle', { defaultValue: 'How clients reach this practice.' })}
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
            disabled={!hasChanges || isSaving}
          >
            {t('common:forms.actions.reset')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? t('common:forms.actions.saving') : t('common:forms.actions.save')}
          </Button>
        </div>
      )}
    >
      <div className="divide-y divide-line-default">
        <SettingSection
          title={t('settings:practice.contact.title', { defaultValue: 'Contact details' })}
          description={t('settings:practice.contact.description', {
            defaultValue: 'Website, business email, and phone number for this practice.',
          })}
        >
          <div className="space-y-4">
            <Input
              label={t('settings:practice.contact.websiteLabel', { defaultValue: 'Website' })}
              value={values.website ?? ''}
              onChange={(value) => setDraft((prev) => ({ ...prev, website: value }))}
              disabled={isSaving}
              placeholder="https://example.com"
            />
            <EmailInput
              label={t('settings:practice.contact.businessEmailLabel', { defaultValue: 'Business email' })}
              value={values.businessEmail ?? ''}
              onChange={(value) => setDraft((prev) => ({ ...prev, businessEmail: value }))}
              disabled={isSaving}
              placeholder="business@example.com"
            />
            <Input
              label={t('settings:practice.contact.phoneLabel', { defaultValue: 'Contact phone' })}
              value={values.contactPhone ?? ''}
              onChange={(value) => setDraft((prev) => ({ ...prev, contactPhone: value }))}
              disabled={isSaving}
              type="tel"
              placeholder="+1 (555) 123-4567"
            />
          </div>
        </SettingSection>

        <SettingSection
          title={t('settings:practice.address.title', { defaultValue: 'Address' })}
          description={t('settings:practice.address.description', {
            defaultValue: 'Used in public practice details and intake flows.',
          })}
        >
          <AddressExperienceForm
            initialValues={{ address: values.address }}
            fields={['address']}
            required={[]}
            onValuesChange={(next) => {
              if (next.address !== undefined) {
                setDraft((prev) => ({ ...prev, address: next.address as Partial<Address> | undefined }));
              }
            }}
            showSubmitButton={false}
            variant="plain"
            disabled={isSaving}
          />
          <SettingsHelperText className="mt-3">
            {t('settings:practice.address.helper', { defaultValue: 'Leave fields blank to clear them.' })}
          </SettingsHelperText>
        </SettingSection>
      </div>
    </EditorShell>
  );
};

export default PracticeContactPage;
