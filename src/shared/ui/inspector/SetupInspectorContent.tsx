import { useRef, useState } from 'preact/hooks';
import type { PracticeSetupStatus } from '@/features/practice-setup/utils/status';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import type { BusinessOnboardingStatus } from '@/shared/hooks/usePracticeManagement';
import type { SetupFieldsPayload, SetupServicePayload, SetupAddressPayload } from '@/shared/types/conversation';
import { Combobox, Input, Textarea } from '@/shared/ui/input';
import { STATE_OPTIONS } from '@/shared/ui/address/AddressFields';
import { InfoRow, InspectorEditableRow, InspectorGroup } from './InspectorPrimitives';
import { StripeCheckpointCard } from '@/features/practice-setup/components/StripeCheckpointCard';

type EditorKey = 'name' | 'slug' | 'businessEmail' | 'businessPhone' | 'address' | 'services' | null;

interface SetupInspectorContentProps {
  practiceName?: string | null;
  practiceSlug?: string | null;
  practiceDetails?: PracticeDetails | null;
  businessOnboardingStatus?: BusinessOnboardingStatus | null;
  setupFields?: SetupFieldsPayload;
  onSetupFieldsChange?: (patch: Partial<SetupFieldsPayload>, options?: { sendSystemAck?: boolean }) => void | Promise<void>;
  setupStatus?: PracticeSetupStatus;
  onStartStripeOnboarding?: () => void;
  isStripeSubmitting?: boolean;
}

const normalizeServices = (services: unknown): SetupServicePayload[] =>
  Array.isArray(services)
    ? services.flatMap((service) => {
        if (!service || typeof service !== 'object' || Array.isArray(service)) return [];
        const row = service as Record<string, unknown>;
        const name = typeof row.name === 'string' ? row.name.trim() : '';
        const key = (
          (typeof row.key === 'string' ? row.key.trim() : '') ||
          (typeof row.service_key === 'string' ? row.service_key.trim() : '') ||
          (typeof row.id === 'string' ? row.id.trim() : '')
        );
        const description = typeof row.description === 'string' ? row.description.trim() : '';
        return name ? [{ name, ...(key ? { key } : {}), ...(description ? { description } : {}) }] : [];
      })
    : [];

export function SetupInspectorContent({
  practiceName,
  practiceSlug,
  practiceDetails,
  businessOnboardingStatus,
  setupFields = {},
  onSetupFieldsChange,
  setupStatus,
  onStartStripeOnboarding,
  isStripeSubmitting = false,
}: SetupInspectorContentProps) {
  const normalizeAddrSource = (src: unknown): SetupAddressPayload => {
    if (!src) return {};
    if (typeof src === 'string') return { address: src };
    if (typeof src === 'object' && !Array.isArray(src)) {
      const s = src as Record<string, unknown>;
      const getString = (...vals: unknown[]) => {
        for (const val of vals) {
          if (typeof val === 'string') return val;
          if (typeof val === 'number' || typeof val === 'boolean') return String(val);
        }
        return '';
      };
      return {
        address: getString(s.address, s.line1, s.address_line),
        apartment: getString(s.apartment, s.unit),
        city: getString(s.city),
        state: getString(s.state),
        postalCode: getString(s.postalCode, s.postal_code),
        country: getString(s.country),
      };
    }
    return {};
  };
  const [activeEditor, setActiveEditor] = useState<EditorKey>(null);
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const [addressDraft, setAddressDraft] = useState<SetupAddressPayload>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const skipBlurRef = useRef(false);
  const isReadOnly = !onSetupFieldsChange;
  const services = Array.isArray(setupFields.services)
    ? setupFields.services
    : normalizeServices(practiceDetails?.services);
  const values = {
    name: (setupFields.name ?? practiceName ?? '').trim(),
    slug: (setupFields.slug ?? practiceSlug ?? '').trim(),
    businessEmail: (setupFields.businessEmail ?? practiceDetails?.businessEmail ?? '').trim(),
    businessPhone: (setupFields.businessPhone ?? practiceDetails?.businessPhone ?? '').trim(),
    address: (typeof setupFields.address?.address === 'string'
      ? setupFields.address.address
      : (typeof practiceDetails?.address === 'string' ? practiceDetails.address : '')
    ).trim(),
    services: services.map((service) => service.name).filter(Boolean),
  };

  const openEditor = (key: Exclude<EditorKey, null>, initialValue: string) => {
    if (isReadOnly) return;
    setSaveError(null);
    setDraftValue(initialValue);
    if (key === 'address') {
      const fromFields = normalizeAddrSource(setupFields.address ?? {});
      const fromDetails = normalizeAddrSource(practiceDetails?.address ?? {});
      setAddressDraft({
        address: fromFields.address ?? fromDetails.address ?? '',
        city: fromFields.city ?? fromDetails.city ?? '',
        state: fromFields.state ?? fromDetails.state ?? '',
        postalCode: fromFields.postalCode ?? fromDetails.postalCode ?? '',
        apartment: fromFields.apartment ?? fromDetails.apartment ?? '',
        country: fromFields.country ?? fromDetails.country ?? '',
      });
    }
    setActiveEditor((prev) => (prev === key ? null : key));
  };

  const commitDraft = async (key: Exclude<EditorKey, null>, rawValue: string, shouldClose = true) => {
    if (!onSetupFieldsChange) return;
    const value = rawValue.trim();
    try {
      setSaveError(null);
      if (key === 'services') {
        const serviceSource = Array.isArray(setupFields.services)
          ? setupFields.services
          : practiceDetails?.services;
        const existingServices = normalizeServices(serviceSource);
        const assignedKeys = new Set<string>();
        await onSetupFieldsChange({
          services: value
            ? value.split('\n').map((n) => n.trim()).filter(Boolean).map((name) => {
                const byName = existingServices.find((s) => s.name === name);
                let existingKey: string | undefined;
                let existingDescription: string | undefined;
                if (byName?.key && !assignedKeys.has(byName.key)) {
                  existingKey = byName.key;
                  existingDescription = byName.description;
                }
                if (existingKey) assignedKeys.add(existingKey);
                return { name, ...(existingKey ? { key: existingKey } : {}), ...(existingDescription ? { description: existingDescription } : {}) };
              })
            : [],
        }, { sendSystemAck: true });
      } else if (key === 'address') {
        await onSetupFieldsChange({
          address: {
            address: addressDraft.address?.trim() ?? '',
            city: addressDraft.city?.trim() ?? '',
            state: addressDraft.state?.trim() ?? '',
            postalCode: addressDraft.postalCode?.trim() ?? '',
            ...(addressDraft.apartment?.trim() ? { apartment: addressDraft.apartment.trim() } : {}),
            ...(addressDraft.country?.trim() ? { country: addressDraft.country.trim() } : {}),
          }
        }, { sendSystemAck: true });
      } else {
        await onSetupFieldsChange({ [key]: value } as Partial<SetupFieldsPayload>, { sendSystemAck: true });
      }
      if (shouldClose) setActiveEditor(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="pb-4">
      {saveError ? <p className="px-4 py-3 text-sm text-red-400">{saveError}</p> : null}
      <div className="mt-4">
        <InspectorGroup label={`Basics ${setupStatus?.basicsComplete ? '· Complete' : '· Missing'}`}>
          <InspectorEditableRow label="Name" summary={values.name || 'Not set'} summaryMuted={!values.name} isOpen={activeEditor === 'name'} onToggle={isReadOnly ? undefined : () => openEditor('name', values.name)} disabled={isReadOnly}>
            <Input value={draftValue ?? values.name} onChange={setDraftValue} placeholder="Practice name" className="w-full" disabled={isReadOnly} onBlur={() => { if (skipBlurRef.current) { skipBlurRef.current = false; return; } if (draftValue !== null) void commitDraft('name', draftValue, false); }} onKeyDown={(e) => { if (e.key === 'Enter') { skipBlurRef.current = true; void commitDraft('name', draftValue ?? values.name, true); } if (e.key === 'Escape') { skipBlurRef.current = true; setActiveEditor(null); } }} />
          </InspectorEditableRow>
          <InspectorEditableRow label="Slug" summary={values.slug || 'Not set'} summaryMuted={!values.slug} isOpen={activeEditor === 'slug'} onToggle={isReadOnly ? undefined : () => openEditor('slug', values.slug)} disabled={isReadOnly}>
            <Input value={draftValue ?? values.slug} onChange={setDraftValue} placeholder="practice-slug" className="w-full" disabled={isReadOnly} onBlur={() => { if (skipBlurRef.current) { skipBlurRef.current = false; return; } if (draftValue !== null) void commitDraft('slug', draftValue, false); }} onKeyDown={(e) => { if (e.key === 'Enter') { skipBlurRef.current = true; void commitDraft('slug', draftValue ?? values.slug, true); } if (e.key === 'Escape') { skipBlurRef.current = true; setActiveEditor(null); } }} />
          </InspectorEditableRow>
        </InspectorGroup>
        <InspectorGroup label={`Contact ${setupStatus?.contactComplete ? '· Complete' : '· Missing'}`}>
          <InspectorEditableRow label="Email" summary={values.businessEmail || 'Not set'} summaryMuted={!values.businessEmail} isOpen={activeEditor === 'businessEmail'} onToggle={isReadOnly ? undefined : () => openEditor('businessEmail', values.businessEmail)} disabled={isReadOnly}>
            <Input value={draftValue ?? values.businessEmail} onChange={setDraftValue} placeholder="name@practice.com" type="email" className="w-full" disabled={isReadOnly} onBlur={() => { if (skipBlurRef.current) { skipBlurRef.current = false; return; } if (draftValue !== null) void commitDraft('businessEmail', draftValue, false); }} onKeyDown={(e) => { if (e.key === 'Enter') { skipBlurRef.current = true; void commitDraft('businessEmail', draftValue ?? values.businessEmail, true); } if (e.key === 'Escape') { skipBlurRef.current = true; setActiveEditor(null); } }} />
          </InspectorEditableRow>
          <InspectorEditableRow label="Phone" summary={values.businessPhone || 'Not set'} summaryMuted={!values.businessPhone} isOpen={activeEditor === 'businessPhone'} onToggle={isReadOnly ? undefined : () => openEditor('businessPhone', values.businessPhone)} disabled={isReadOnly}>
            <Input value={draftValue ?? values.businessPhone} onChange={setDraftValue} placeholder="Business phone" type="tel" className="w-full" disabled={isReadOnly} onBlur={() => { if (skipBlurRef.current) { skipBlurRef.current = false; return; } if (draftValue !== null) void commitDraft('businessPhone', draftValue, false); }} onKeyDown={(e) => { if (e.key === 'Enter') { skipBlurRef.current = true; void commitDraft('businessPhone', draftValue ?? values.businessPhone, true); } if (e.key === 'Escape') { skipBlurRef.current = true; setActiveEditor(null); } }} />
          </InspectorEditableRow>
          <InspectorEditableRow label="Address" summary={values.address || 'Not set'} summaryMuted={!values.address} isOpen={activeEditor === 'address'} onToggle={isReadOnly ? undefined : () => openEditor('address', values.address)} disabled={isReadOnly}>
            <div className="space-y-3">
              <Input value={addressDraft.address ?? ''} onChange={(next) => setAddressDraft((prev) => ({ ...prev, address: next }))} placeholder="Street address" className="w-full" disabled={isReadOnly} />
              <Input value={addressDraft.city ?? ''} onChange={(next) => setAddressDraft((prev) => ({ ...prev, city: next }))} placeholder="City" className="w-full" disabled={isReadOnly} />
              <Combobox value={addressDraft.state ?? ''} onChange={(next) => setAddressDraft((prev) => ({ ...prev, state: next }))} options={STATE_OPTIONS} placeholder="Select state" searchable disabled={isReadOnly} />
              <Input value={addressDraft.postalCode ?? ''} onChange={(next) => setAddressDraft((prev) => ({ ...prev, postalCode: next }))} placeholder="Postal code" className="w-full" disabled={isReadOnly} />
              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded-md bg-surface-panel/40 px-3 py-1.5 text-xs font-semibold text-input-text transition hover:bg-surface-panel/60 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isReadOnly}
                  onClick={() => { void commitDraft('address', '', true); }}
                >
                  Save address
                </button>
              </div>
            </div>
          </InspectorEditableRow>
        </InspectorGroup>
        <InspectorGroup label={`Services ${setupStatus?.servicesComplete ? '· Complete' : '· Missing'}`}>
          <InspectorEditableRow label="Practice services" summary={values.services.length > 0 ? values.services.join(', ') : 'Not set'} summaryMuted={values.services.length === 0} isOpen={activeEditor === 'services'} onToggle={isReadOnly ? undefined : () => openEditor('services', values.services.join('\n'))} disabled={isReadOnly}>
            <Textarea value={draftValue ?? values.services.join('\n')} onChange={setDraftValue} placeholder="One service per line" className="w-full" rows={4} disabled={isReadOnly} onBlur={() => { if (skipBlurRef.current) { skipBlurRef.current = false; return; } if (draftValue !== null) void commitDraft('services', draftValue, false); }} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { skipBlurRef.current = true; void commitDraft('services', draftValue ?? values.services.join('\n'), true); } if (e.key === 'Escape') { skipBlurRef.current = true; setActiveEditor(null); } }} />
          </InspectorEditableRow>
        </InspectorGroup>
        <InspectorGroup label={`Payouts ${setupStatus?.payoutsComplete ? '· Complete' : '· Missing'}`}>
          {setupStatus?.payoutsComplete ? (
            <InfoRow label="Stripe status" value="Enabled" />
          ) : (
            <div className="px-5 py-2">
              <StripeCheckpointCard businessOnboardingStatus={businessOnboardingStatus} onConnect={() => onStartStripeOnboarding?.()} isLoading={isStripeSubmitting} />
            </div>
          )}
        </InspectorGroup>
      </div>
    </div>
  );
}
