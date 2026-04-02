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
import { normalizeAccentColor } from '@/shared/utils/accentColors';
import type { Address } from '@/shared/types/address';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import type { Practice } from '@/shared/hooks/usePracticeManagement';

export interface OnboardingDialogsProps {
  practice: Practice | null;
  details: PracticeDetails | null;
  onSaveBasics?: (values: {
    name: string;
    slug: string;
    accentColor: string;
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
  accentColor: string;
}

interface ContactFormValues {
  website: string;
  businessEmail: string;
  businessPhone: string;
  address?: Address;
}

const getBasicsDraft = (practice: Practice | null, details: PracticeDetails | null): BasicsFormValues => ({
  name: practice?.name ?? '',
  slug: practice?.slug ?? '',
  accentColor: normalizeAccentColor(details?.accentColor ?? practice?.accentColor) ?? '#D4AF37',
});

const getContactDraft = (practice: Practice | null, details: PracticeDetails | null): ContactFormValues => ({
  website: details?.website ?? practice?.website ?? '',
  businessEmail: details?.businessEmail ?? practice?.businessEmail ?? '',
  businessPhone: details?.businessPhone ?? practice?.businessPhone ?? '',
  address: details?.address && typeof details.address === 'object'
    ? details.address
    : practice?.address && typeof practice.address === 'object'
      ? practice.address
      : undefined,
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
      await onSaveContact(contactDraft);
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
        onClose={() => setBasicsModalOpen(false)}
        title="Edit Practice Basics"
        contentClassName="glass-panel"
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


          <div className="space-y-1.5">
            <FormLabel htmlFor="edit-accent">Accent Color</FormLabel>
            <div className="flex items-center gap-2">
              <div
                className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full"
                style={{ backgroundColor: normalizeAccentColor(basicsDraft.accentColor) ?? '#D4AF37' }}
              >
                <input
                  type="color"
                  value={normalizeAccentColor(basicsDraft.accentColor) ?? '#D4AF37'}
                  onChange={e => setBasicsDraft(p => ({ ...p, accentColor: (e.target as HTMLInputElement).value }))}
                  className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                  aria-label="Accent color"
                />
              </div>
              <Input
                value={basicsDraft.accentColor}
                onChange={v => setBasicsDraft(p => ({ ...p, accentColor: v }))}
                placeholder="#3B82F6"
                aria-label="Accent color hex"
                disabled={isModalSaving}
              />
            </div>
          </div>

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
        onClose={() => setContactModalOpen(false)}
        title="Edit Contact Information"
        contentClassName="glass-panel"
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
                  address: values.address.address || values.address.city || values.address.state ? 
                    values.address as Address : undefined 
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
