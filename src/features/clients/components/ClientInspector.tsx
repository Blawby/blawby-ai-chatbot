import { useEffect, useState } from 'preact/hooks';
import { useUserDetail } from '@/shared/hooks/useUserDetail';
import { type UserDetailRecord } from '@/shared/lib/apiClient';
import type { Address } from '@/shared/types/address';
import { CONTACT_RELATIONSHIP_STATUS_LABELS } from '@/shared/domain/contacts';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/dialog';
import { AddressExperienceForm } from '@/shared/ui/address/AddressExperienceForm';
import { InspectorSectionSkeleton } from '@/shared/ui/layout';
import {
  InfoRow,
  InspectorEditableRow,
  InspectorGroup,
  InspectorHeaderPerson,
} from '@/shared/ui/inspector/InspectorPrimitives';

export interface ClientInspectorProps {
  practiceId: string;
  /** The userId for the client record being inspected. */
  entityId: string;
}

const emptyAddress: Address = {
  address: '',
  apartment: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
};

const readAddressFromDetail = (detail: UserDetailRecord | null): Address => {
  const record = detail as unknown as Record<string, unknown> | null;
  const addressValue = record?.address;
  const address = (addressValue && typeof addressValue === 'object')
    ? addressValue as Record<string, unknown>
    : {};
  const line1 = typeof address.address === 'string'
    ? address.address
    : (typeof address.line1 === 'string' ? address.line1 : '');
  const line2 = typeof address.apartment === 'string'
    ? address.apartment
    : (typeof address.line2 === 'string' ? address.line2 : '');
  const city = typeof address.city === 'string' ? address.city : '';
  const state = typeof address.state === 'string' ? address.state : '';
  const postalCode = typeof address.postalCode === 'string'
    ? address.postalCode
    : (typeof address.postal_code === 'string' ? address.postal_code : '');
  const country = typeof address.country === 'string' && address.country.trim().length > 0
    ? address.country
    : 'US';
  return {
    address: line1,
    apartment: line2,
    city,
    state,
    postalCode,
    country,
  };
};

const formatAddressSummary = (detail: UserDetailRecord | null): string => {
  const value = readAddressFromDetail(detail);
  const parts = [
    value.address,
    value.apartment ?? '',
    [value.city, value.state, value.postalCode].filter(Boolean).join(' '),
    value.country,
  ].map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : '—';
};

/**
 * ClientInspector — per-feature inspector for the client entity type.
 * Extracted from the legacy InspectorPanel as part of the per-feature split
 * (5d.3). Owns: user data fetch (via useUserDetail), address editor state,
 * archive flow + confirmation dialog.
 *
 * Outer chrome (header / close button / error banner) currently still lives
 * in InspectorPanel's dispatcher. The dispatcher disappears in 5d.6 once all
 * four per-feature inspectors are extracted.
 */
export const ClientInspector = ({ practiceId, entityId }: ClientInspectorProps) => {
  const { data: userDetail, isLoading, error, mutate } = useUserDetail(practiceId, entityId);
  const [localError, setLocalError] = useState<string | null>(null);
  const [activePersonEditor, setActivePersonEditor] = useState<'address' | null>(null);
  const [isSavingPersonField, setIsSavingPersonField] = useState(false);
  const [isArchivingPerson, setIsArchivingPerson] = useState(false);
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [personAddressDraft, setPersonAddressDraft] = useState<Address>(emptyAddress);

  // Clear local editor state when the entity changes.
  useEffect(() => {
    setActivePersonEditor(null);
    setLocalError(null);
  }, [entityId]);

  const openPersonEditor = (editor: 'address') => {
    setLocalError(null);
    setPersonAddressDraft(readAddressFromDetail(userDetail));
    setActivePersonEditor((prev) => (prev === editor ? null : editor));
  };

  const handlePersonFieldUpdate = async (payload: Partial<{ address: Partial<Address> }>) => {
    setLocalError(null);
    setIsSavingPersonField(true);
    try {
      await mutate(payload);
      setActivePersonEditor(null);
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Failed to update contact');
    } finally {
      setIsSavingPersonField(false);
    }
  };

  const handlePersonStatusChange = async (
    status: 'archived' | 'active',
    eventName: 'Archive Contact' | 'Restore Contact',
  ) => {
    setLocalError(null);
    setIsArchivingPerson(true);
    try {
      await mutate({ status, event_name: eventName });
      setActivePersonEditor(null);
      setIsArchiveConfirmOpen(false);
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Failed to update contact status');
    } finally {
      setIsArchivingPerson(false);
    }
  };

  const displayError = localError ?? error;

  if (isLoading) {
    return (
      <div className="py-3">
        <InspectorSectionSkeleton wideRows={[true, false, false]} />
      </div>
    );
  }

  return (
    <>
      {displayError ? (
        <p className="px-4 py-3 text-sm text-neg">{displayError}</p>
      ) : null}
      <div className="pb-4">
        <InspectorHeaderPerson
          name={userDetail?.user?.name ?? userDetail?.user?.email ?? 'Unknown'}
          secondaryLine={userDetail?.user?.email ?? undefined}
        />
        <div>
          <InspectorGroup label="Email">
            <InfoRow label="" value={userDetail?.user?.email ?? undefined} muted={!userDetail?.user?.email} />
          </InspectorGroup>
          <InspectorGroup label="Phone">
            <InfoRow label="" value={userDetail?.user?.phone ?? undefined} muted={!userDetail?.user?.phone} />
          </InspectorGroup>
          <InspectorGroup label="Relationship status">
            <InfoRow
              label=""
              value={userDetail?.status ? CONTACT_RELATIONSHIP_STATUS_LABELS[userDetail.status] : undefined}
              muted={!userDetail?.status}
            />
          </InspectorGroup>
          <InspectorGroup
            label="Address"
            onToggle={() => openPersonEditor('address')}
            isOpen={activePersonEditor === 'address'}
            disabled={isSavingPersonField}
          >
            <InspectorEditableRow
              label=""
              summary={formatAddressSummary(userDetail)}
              summaryMuted={formatAddressSummary(userDetail) === '—'}
              isOpen={activePersonEditor === 'address'}
            >
              <div className="space-y-2">
                <AddressExperienceForm
                  initialValues={{ address: personAddressDraft }}
                  fields={['address']}
                  required={[]}
                  variant="plain"
                  showSubmitButton={false}
                  disabled={isSavingPersonField}
                  onValuesChange={(updates) => {
                    const nextAddress = updates.address;
                    if (!nextAddress || typeof nextAddress !== 'object') return;
                    setPersonAddressDraft((prev) => ({
                      ...prev,
                      ...nextAddress,
                    }));
                  }}
                  addressOptions={{
                    enableAutocomplete: true,
                    showCountry: true,
                    stackedFields: true,
                  }}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setActivePersonEditor(null)}
                    disabled={isSavingPersonField}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void handlePersonFieldUpdate({ address: personAddressDraft })}
                    disabled={isSavingPersonField}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </InspectorEditableRow>
          </InspectorGroup>
          <InspectorGroup label="Record">
            <div className="px-5 py-1.5">
              {userDetail?.status === 'archived' ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] text-dim">This contact is archived.</p>
                  <Button
                    size="sm"
                    onClick={() => { void handlePersonStatusChange('active', 'Restore Contact'); }}
                    disabled={isArchivingPerson || isSavingPersonField}
                  >
                    {isArchivingPerson ? 'Restoring...' : 'Restore'}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setIsArchiveConfirmOpen(true)}
                  disabled={isArchivingPerson || isSavingPersonField}
                >
                  {isArchivingPerson ? 'Archiving...' : 'Archive'}
                </Button>
              )}
            </div>
          </InspectorGroup>
        </div>
      </div>
      <Dialog
        isOpen={isArchiveConfirmOpen}
        onClose={() => {
          if (isArchivingPerson) return;
          setIsArchiveConfirmOpen(false);
        }}
        title="Archive contact"
      >
        <div className="space-y-4">
          <p className="text-sm text-dim">
            Archive this contact? They will move to the Archived list and can be restored later.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsArchiveConfirmOpen(false)}
              disabled={isArchivingPerson}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => { void handlePersonStatusChange('archived', 'Archive Contact'); }}
              disabled={isArchivingPerson}
            >
              {isArchivingPerson ? 'Archiving...' : 'Archive'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
};
