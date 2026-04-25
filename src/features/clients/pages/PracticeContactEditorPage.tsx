import { useCallback, useEffect, useId, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { AddressExperienceForm, type AddressExperienceData } from '@/shared/ui/address/AddressExperienceForm';
import { Button } from '@/shared/ui/Button';
import { Combobox } from '@/shared/ui/input';
import { EditorShell, LoadingBlock } from '@/shared/ui/layout';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import {
  createUserDetail,
  getUserDetail,
  listUserDetails,
  updateUserDetail,
  type UserDetailRecord,
  type UserDetailStatus,
} from '@/shared/lib/apiClient';
import { readUserDetailAddress } from '@/shared/lib/userDetailAddress';
import { getValidatedInternalReturnPath } from '@/shared/utils/workspace';

type PracticeContactEditorPageProps = {
  practiceId: string | null;
  practiceSlug: string | null;
  contactId?: string | null;
};

type ContactDraft = {
  name: string;
  email: string;
  phone: string;
  address: AddressExperienceData['address'];
  status: UserDetailStatus;
};

const STATUS_OPTIONS: Array<{ value: UserDetailStatus; label: string }> = [
  { value: 'lead', label: 'Lead' },
  { value: 'active', label: 'Active client' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

const EMPTY_DRAFT: ContactDraft = {
  name: '',
  email: '',
  phone: '',
  address: undefined,
  status: 'lead',
};

const buildDraftFromRecord = (detail: UserDetailRecord | null): ContactDraft => {
  if (!detail) return EMPTY_DRAFT;
  return {
    name: detail.user?.name ?? '',
    email: detail.user?.email ?? '',
    phone: detail.user?.phone ?? '',
    address: readUserDetailAddress(detail) ?? undefined,
    status: detail.status,
  };
};

const normalizeAddress = (address: AddressExperienceData['address']) => {
  if (!address) return undefined;
  const line1 = typeof address.address === 'string' ? address.address.trim() : '';
  const line2 = typeof address.apartment === 'string' ? address.apartment.trim() : '';
  const city = typeof address.city === 'string' ? address.city.trim() : '';
  const state = typeof address.state === 'string' ? address.state.trim() : '';
  const postalCode = typeof address.postalCode === 'string' ? address.postalCode.trim() : '';
  const country = typeof address.country === 'string' ? address.country.trim() : '';
  if (!line1 && !line2 && !city && !state && !postalCode && !country) return undefined;
  return {
    address: line1,
    apartment: line2 || undefined,
    city,
    state,
    postalCode,
    country,
  };
};

export function PracticeContactEditorPage({
  practiceId,
  practiceSlug,
  contactId = null,
}: PracticeContactEditorPageProps) {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { showSuccess } = useToastContext();

  const isEditMode = Boolean(contactId);
  const formId = useId();
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedContactId, setResolvedContactId] = useState<string | null>(contactId);

  const returnTo = useMemo(() => {
    const fallback = practiceSlug
      ? `/practice/${encodeURIComponent(practiceSlug)}/contacts`
      : '/practice';
    return getValidatedInternalReturnPath(
      typeof location.query?.returnTo === 'string'
        ? location.query.returnTo
        : typeof location.query?.backTo === 'string'
          ? location.query.backTo
          : null,
      fallback
    );
  }, [location.query?.backTo, location.query?.returnTo, practiceSlug]);

  useEffect(() => {
    if (!practiceId || !contactId) {
      setDraft(EMPTY_DRAFT);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getUserDetail(practiceId, contactId, { signal: controller.signal })
      .then((detail) => {
        if (controller.signal.aborted) return;
        if (!detail) {
          setError('Contact not found.');
          setDraft(EMPTY_DRAFT);
          return;
        }
        setDraft(buildDraftFromRecord(detail));
        setResolvedContactId(detail.id);
      })
      .catch((nextError: unknown) => {
        if ((nextError as DOMException).name === 'AbortError') return;
        setError(nextError instanceof Error ? nextError.message : 'Failed to load contact.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [contactId, practiceId]);

  const handleFormValuesChange = useCallback((values: Partial<AddressExperienceData>) => {
    setDraft((prev) => ({
      ...prev,
      name: typeof values.name === 'string' ? values.name : prev.name,
      email: typeof values.email === 'string' ? values.email : prev.email,
      phone: typeof values.phone === 'string' ? values.phone : prev.phone,
      address: values.address ?? prev.address,
    }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
    if (!practiceId) {
      throw new Error('Practice context is required.');
    }

    const email = draft.email.trim();
    if (!email) {
      throw new Error('Email is required.');
    }

    const payloadAddress = normalizeAddress(draft.address);
    const payload = {
      name: draft.name.trim() || undefined,
      email,
      phone: draft.phone.trim() || undefined,
      status: draft.status,
      address: payloadAddress,
    };

    if (isEditMode && resolvedContactId) {
      const updated = await updateUserDetail(practiceId, resolvedContactId, payload);
      if (!updated) {
        throw new Error('Contact update did not return a record.');
      }
      showSuccess('Contact updated', 'Changes were saved successfully.');
      navigate(returnTo);
      return;
    }

    await createUserDetail(practiceId, { email });

    // The create API uses an external invitation system and may be eventually
    // consistent. Retry-list for the created record instead of relying on a
    // single immediate query. Use exponential backoff with a few attempts.
    const attempts = 5;
    let resolved: UserDetailRecord | undefined;
    for (let i = 0; i < attempts; i++) {
      const maybeCreated = await listUserDetails(practiceId, {
        search: email,
        limit: 100,
      });
      resolved = maybeCreated.data.find((item) => item.user?.email?.trim().toLowerCase() === email.toLowerCase());
      if (resolved) break;
      // backoff: 300ms, 600ms, 1200ms, ...
      const delay = 300 * Math.pow(2, i);
      // don't block the event loop excessively
      await new Promise((res) => setTimeout(res, delay));
    }

    if (resolved) {
      const updated = await updateUserDetail(practiceId, resolved.id, payload);
      setResolvedContactId(updated?.id ?? resolved.id);
      showSuccess('Contact created', 'The contact was saved successfully.');
      navigate(returnTo);
      return;
    }

    showSuccess('Invite sent', 'The contact invitation was sent.');
    navigate(returnTo);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Failed to save contact.';
      setError(message);
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [draft.address, draft.email, draft.name, draft.phone, draft.status, isEditMode, navigate, practiceId, resolvedContactId, returnTo, saving, showSuccess]);

  const title = isEditMode ? 'Edit Contact' : 'Create Contact';
  const subtitle = isEditMode
    ? 'Update contact details and relationship status.'
    : 'Create a contact record and capture their details.';

  return (
    <EditorShell
      title={title}
      subtitle={subtitle}
      showBack
      backVariant="close"
      onBack={() => navigate(returnTo)}
      contentMaxWidth={null}
      actions={(
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate(returnTo)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={saving || loading || !practiceId}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      )}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {loading ? (
          <div className="rounded-xl border border-line-glass/30 bg-surface-card p-6">
            <LoadingBlock label="Loading contact..." />
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error-foreground">
            {error}
          </div>
        ) : null}
        {!loading || isEditMode ? (
          <div className="space-y-6">
            <AddressExperienceForm
              formId={formId}
              fields={['name', 'email', 'phone', 'address']}
              required={['email']}
              initialValues={draft}
              variant="plain"
              showSubmitButton={false}
              onSubmit={handleSubmit}
              onValuesChange={handleFormValuesChange}
              disabled={saving}
              labels={{
                name: 'Contact name',
                email: 'Contact email',
                phone: 'Contact phone',
                address: 'Address',
              }}
              placeholders={{
                name: 'Jane Doe',
                email: 'jane@example.com',
                phone: '+1 (555) 123-4567',
              }}
            />

            <Combobox
              label="Status"
              value={draft.status}
              options={STATUS_OPTIONS}
              onChange={(value) => setDraft((prev) => ({ ...prev, status: value as UserDetailStatus }))}
              disabled={saving}
            />
            {resolvedContactId ? (
              <p className="text-xs text-input-placeholder">
                Contact record: {resolvedContactId}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </EditorShell>
  );
}

export default PracticeContactEditorPage;
