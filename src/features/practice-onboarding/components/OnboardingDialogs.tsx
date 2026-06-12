/**
 * OnboardingDialogs - Dialog forms for editing practice information
 *
 * Extracts modal logic from PracticeSetup to provide cleaner separation
 * between chat interface and form modals.
 */

import { forwardRef } from 'preact/compat';
import { useState, useCallback, useImperativeHandle } from 'preact/hooks';
import { Dialog } from '@/shared/ui/dialog';
import { FormGrid } from '@/shared/ui/layout';
import { FormActions } from '@/shared/ui/form';
import { FormLabel } from '@/shared/ui/form/FormLabel';
import { Input, URLInput, EmailInput, PhoneInput } from '@/shared/ui/input';
import { AddressExperienceForm } from '@/shared/ui/address/AddressExperienceForm';
import type { Address } from '@/shared/types/address';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import type { Practice } from '@/shared/hooks/usePracticeManagement';

export interface OnboardingDialogsProps {
  practice: Practice | null;
  details: PracticeDetails | null;
  onSaveBasics?: (values: {
    name: string;
    slug: string;
  }) => Promise<void>;
  onSaveContact?: (values: {
    website: string;
    businessEmail: string;
    businessPhone: string;
    address?: Address;
  }) => Promise<void>;
  isModalSaving: boolean;
  onSetModalSaving: (saving: boolean) => void;
}

export interface OnboardingDialogsRef {
  openBasicsModal: () => void;
  closeBasicsModal: () => void;
  openContactModal: () => void;
  closeContactModal: () => void;
}

interface BasicsFormValues {
  name: string;
  slug: string;
}

interface ContactFormValues {
  website: string;
  businessEmail: string;
  businessPhone: string;
  address?: Partial<Address>;
}

const getBasicsDraft = (practice: Practice | null, details: PracticeDetails | null): BasicsFormValues => ({
  name: practice?.name ?? '',
  slug: practice?.slug ?? '',
});

const toPartialAddress = (value: unknown): Partial<Address> | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return { address: value };
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const s = value as Record<string, unknown>;
    const getString = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const address = getString(s.address ?? s.line1 ?? s.address_line ?? '');
    const apartment = getString(s.apartment ?? s.unit ?? '') || undefined;
    const city = getString(s.city ?? '');
    const state = getString(s.state ?? '');
    const postalCode = getString(s.postalCode ?? s.postal_code ?? '');
    const country = getString(s.country ?? '');
    const result: Partial<Address> = {
      ...(address ? { address } : {}),
      ...(apartment ? { apartment } : {}),
      ...(city ? { city } : {}),
      ...(state ? { state } : {}),
      ...(postalCode ? { postalCode } : {}),
      ...(country ? { country } : {}),
    };
    return Object.keys(result).length > 0 ? result : undefined;
  }
  return undefined;
};

const getContactDraft = (practice: Practice | null, details: PracticeDetails | null): ContactFormValues => ({
  website: details?.website ?? practice?.website ?? '',
  businessEmail: details?.businessEmail ?? practice?.businessEmail ?? '',
  businessPhone: details?.businessPhone ?? practice?.businessPhone ?? '',
  address: toPartialAddress(details?.address ?? practice?.address ?? undefined),
});

const OnboardingDialogs = forwardRef<OnboardingDialogsRef, OnboardingDialogsProps>(({
  practice,
  details,
  onSaveBasics,
  onSaveContact,
  isModalSaving,
  onSetModalSaving,
}, ref) => {
  const [basicsModalOpen, setBasicsModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [basicsDraft, setBasicsDraft] = useState<BasicsFormValues>(() => getBasicsDraft(practice, details));
  const [contactDraft, setContactDraft] = useState<ContactFormValues>(() => getContactDraft(practice, details));

  const openBasicsModal = useCallback(() => {
    setBasicsDraft(getBasicsDraft(practice, details));
    setBasicsModalOpen(true);
  }, [practice, details]);

  const openContactModal = useCallback(() => {
    setContactDraft(getContactDraft(practice, details));
    setContactModalOpen(true);
  }, [practice, details]);

  useImperativeHandle(ref, () => ({
    openBasicsModal,
    closeBasicsModal: () => setBasicsModalOpen(false),
    openContactModal,
    closeContactModal: () => setContactModalOpen(false),
  }), [openBasicsModal, openContactModal]);

  const handleBasicsSubmit = useCallback(async () => {
    if (!onSaveBasics) return;
    
    onSetModalSaving(true);
    try {
      await onSaveBasics(basicsDraft);
      setBasicsModalOpen(false);
    } finally {
      onSetModalSaving(false);
    }
  }, [basicsDraft, onSaveBasics, onSetModalSaving]);

  const handleContactSubmit = useCallback(async () => {
    if (!onSaveContact) return;
    
    onSetModalSaving(true);
    try {
      const isFullAddress = (a: Partial<Address> | undefined): a is Address => {
        return !!a && typeof a.address === 'string' && a.address.trim() !== ''
          && typeof a.city === 'string' && a.city.trim() !== ''
          && typeof a.state === 'string' && a.state.trim() !== ''
          && typeof a.postalCode === 'string' && a.postalCode.trim() !== ''
          && typeof a.country === 'string' && a.country.trim() !== '';
      };

      const payload = {
        website: contactDraft.website,
        businessEmail: contactDraft.businessEmail,
        businessPhone: contactDraft.businessPhone,
        address: isFullAddress(contactDraft.address) ? contactDraft.address : undefined,
      };

      await onSaveContact(payload);
      setContactModalOpen(false);
    } finally {
      onSetModalSaving(false);
    }
  }, [contactDraft, onSaveContact, onSetModalSaving]);

  return (
    <>
      {/* Basics Modal */}
      <Dialog
        isOpen={basicsModalOpen}
        onClose={isModalSaving ? () => {} : () => setBasicsModalOpen(false)}
        title="Edit Practice Basics"
        contentClassName="panel"
        disableBackdropClick={isModalSaving}
        showCloseButton={!isModalSaving}
      >
        <div className="space-y-4">
          <FormGrid>
            <div>
              <FormLabel htmlFor="edit-name">Practice Name</FormLabel>
              <Input
                id="edit-name"
                value={basicsDraft.name}
                onChange={v => setBasicsDraft(p => ({ ...p, name: v }))}
                placeholder="Smith & Associates"
                disabled={isModalSaving}
              />
            </div>
            
            <div>
              <FormLabel htmlFor="edit-slug">Public Slug</FormLabel>
              <Input
                id="edit-slug"
                value={basicsDraft.slug}
                onChange={v => setBasicsDraft(p => ({ ...p, slug: v }))}
                placeholder="smith-associates"
                disabled={isModalSaving}
              />
            </div>
          </FormGrid>

          <FormActions
            className="justify-end"
            onCancel={() => setBasicsModalOpen(false)}
            onSubmit={handleBasicsSubmit}
            submitType="button"
            submitText="Save"
            submitDisabled={isModalSaving}
            cancelDisabled={isModalSaving}
          />
        </div>
      </Dialog>

      {/* Contact Modal */}
      <Dialog
        isOpen={contactModalOpen}
        onClose={isModalSaving ? () => {} : () => setContactModalOpen(false)}
        title="Edit Contact Information"
        contentClassName="panel"
        disableBackdropClick={isModalSaving}
        showCloseButton={!isModalSaving}
      >
        <div className="space-y-4">
          <FormGrid>
            <URLInput
              label="Website"
              value={contactDraft.website}
              onChange={v => setContactDraft(p => ({ ...p, website: v }))}
              placeholder="https://example.com"
              disabled={isModalSaving}
            />
            
            <EmailInput
              label="Business Email"
              value={contactDraft.businessEmail}
              onChange={v => setContactDraft(p => ({ ...p, businessEmail: v }))}
              placeholder="you@firm.com"
              disabled={isModalSaving}
            />
            
            <PhoneInput
              label="Phone"
              value={contactDraft.businessPhone}
              onChange={v => setContactDraft(p => ({ ...p, businessPhone: v }))}
              placeholder="(555) 123-4567"
              showCountryCode={false}
              disabled={isModalSaving}
            />
          </FormGrid>

          <AddressExperienceForm
            initialValues={{ address: contactDraft.address }}
            fields={['address']}
            required={[]}
            onValuesChange={values => {
              if (values.address !== undefined) {
                setContactDraft(p => ({
                  ...p,
                  address: values.address as Partial<Address> | undefined,
                }));
              }
            }}
            showSubmitButton={false}
            variant="plain"
            disabled={isModalSaving}
          />

          <FormActions
            className="justify-end"
            onCancel={() => setContactModalOpen(false)}
            onSubmit={handleContactSubmit}
            submitType="button"
            submitText="Save"
            submitDisabled={isModalSaving}
            cancelDisabled={isModalSaving}
          />
        </div>
      </Dialog>
    </>
  );
});

export default OnboardingDialogs;
