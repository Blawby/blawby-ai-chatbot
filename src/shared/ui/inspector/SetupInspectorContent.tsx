import { useRef, useState } from 'preact/hooks';
import type { PracticeSetupStatus } from '@/features/practice-setup/utils/status';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import type { BusinessOnboardingStatus } from '@/shared/hooks/usePracticeManagement';
import type { SetupFieldsPayload, SetupServicePayload } from '@/shared/types/conversation';
import { Input, Textarea } from '@/shared/ui/input';
import { InfoRow, InspectorEditableRow, InspectorGroup } from './InspectorPrimitives';
import { StripeCheckpointCard } from '@/features/practice-setup/components/StripeCheckpointCard';

type EditorKey = 'name' | 'slug' | 'businessEmail' | 'businessPhone' | 'address' | 'services' | null;

interface SetupInspectorContentProps {
  practiceName?: string | null;
  practiceSlug?: string | null;
  practiceDetails?: PracticeDetails | null;
  businessOnboardingStatus?: BusinessOnboardingStatus | null;
  setupFields?: SetupFieldsPayload;
  onSetupFieldsChange?: (patch: Partial<SetupFieldsPayload>) => void | Promise<void>;
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
        const key = typeof row.key === 'string' ? row.key.trim() : '';
        return name ? [{ name, ...(key ? { key } : {}) }] : [];
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
  const [activeEditor, setActiveEditor] = useState<EditorKey>(null);
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const skipBlurRef = useRef(false);
  const services = Array.isArray(setupFields.services) && setupFields.services.length > 0
    ? setupFields.services
    : normalizeServices(practiceDetails?.services);
  const values = {
    name: (setupFields.name ?? practiceName ?? '').trim(),
    slug: (setupFields.slug ?? practiceSlug ?? '').trim(),
    businessEmail: (setupFields.businessEmail ?? practiceDetails?.businessEmail ?? '').trim(),
    businessPhone: (setupFields.businessPhone ?? practiceDetails?.businessPhone ?? '').trim(),
    address: (setupFields.address?.address ?? practiceDetails?.address ?? '').trim(),
    services: services.map((service) => service.name).filter(Boolean),
  };

  const openEditor = (key: Exclude<EditorKey, null>, initialValue: string) => {
    setSaveError(null);
    setDraftValue(initialValue);
    setActiveEditor((prev) => (prev === key ? null : key));
  };

  const commitDraft = async (key: Exclude<EditorKey, null>, rawValue: string, shouldClose = true) => {
    if (!onSetupFieldsChange) return;
    const value = rawValue.trim();
    try {
      setSaveError(null);
      if (key === 'services') {
        await onSetupFieldsChange({
          services: value ? value.split('\n').map((name) => name.trim()).filter(Boolean).map((name) => ({ name })) : [],
        });
      } else if (key === 'address') {
        await onSetupFieldsChange({ address: { ...(setupFields.address ?? {}), address: value } });
      } else {
        await onSetupFieldsChange({ [key]: value } as Partial<SetupFieldsPayload>);
      }
      if (shouldClose) setActiveEditor(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to update setup field');
    }
  };

  return (
    <div className="pb-4">
      {saveError ? <p className="px-4 py-3 text-sm text-red-400">{saveError}</p> : null}
      <div className="mt-4">
        <InspectorGroup label={`Basics ${setupStatus?.basicsComplete ? '· Complete' : '· Missing'}`}>
          <InspectorEditableRow label="Name" summary={values.name || 'Not set'} summaryMuted={!values.name} isOpen={activeEditor === 'name'} onToggle={() => openEditor('name', values.name)}>
            <Input value={draftValue ?? values.name} onChange={setDraftValue} placeholder="Practice name" className="w-full" onBlur={() => { if (skipBlurRef.current) { skipBlurRef.current = false; return; } if (draftValue !== null) void commitDraft('name', draftValue, false); }} onKeyDown={(e) => { if (e.key === 'Enter') { skipBlurRef.current = true; void commitDraft('name', draftValue ?? values.name, true); } if (e.key === 'Escape') { skipBlurRef.current = true; setActiveEditor(null); } }} />
          </InspectorEditableRow>
          <InspectorEditableRow label="Slug" summary={values.slug || 'Not set'} summaryMuted={!values.slug} isOpen={activeEditor === 'slug'} onToggle={() => openEditor('slug', values.slug)}>
            <Input value={draftValue ?? values.slug} onChange={setDraftValue} placeholder="practice-slug" className="w-full" onBlur={() => { if (skipBlurRef.current) { skipBlurRef.current = false; return; } if (draftValue !== null) void commitDraft('slug', draftValue, false); }} onKeyDown={(e) => { if (e.key === 'Enter') { skipBlurRef.current = true; void commitDraft('slug', draftValue ?? values.slug, true); } if (e.key === 'Escape') { skipBlurRef.current = true; setActiveEditor(null); } }} />
          </InspectorEditableRow>
        </InspectorGroup>
        <InspectorGroup label={`Contact ${setupStatus?.contactComplete ? '· Complete' : '· Missing'}`}>
          <InspectorEditableRow label="Email" summary={values.businessEmail || 'Not set'} summaryMuted={!values.businessEmail} isOpen={activeEditor === 'businessEmail'} onToggle={() => openEditor('businessEmail', values.businessEmail)}>
            <Input value={draftValue ?? values.businessEmail} onChange={setDraftValue} placeholder="name@practice.com" type="email" className="w-full" onBlur={() => { if (skipBlurRef.current) { skipBlurRef.current = false; return; } if (draftValue !== null) void commitDraft('businessEmail', draftValue, false); }} onKeyDown={(e) => { if (e.key === 'Enter') { skipBlurRef.current = true; void commitDraft('businessEmail', draftValue ?? values.businessEmail, true); } if (e.key === 'Escape') { skipBlurRef.current = true; setActiveEditor(null); } }} />
          </InspectorEditableRow>
          <InspectorEditableRow label="Phone" summary={values.businessPhone || 'Not set'} summaryMuted={!values.businessPhone} isOpen={activeEditor === 'businessPhone'} onToggle={() => openEditor('businessPhone', values.businessPhone)}>
            <Input value={draftValue ?? values.businessPhone} onChange={setDraftValue} placeholder="Business phone" type="tel" className="w-full" onBlur={() => { if (skipBlurRef.current) { skipBlurRef.current = false; return; } if (draftValue !== null) void commitDraft('businessPhone', draftValue, false); }} onKeyDown={(e) => { if (e.key === 'Enter') { skipBlurRef.current = true; void commitDraft('businessPhone', draftValue ?? values.businessPhone, true); } if (e.key === 'Escape') { skipBlurRef.current = true; setActiveEditor(null); } }} />
          </InspectorEditableRow>
          <InspectorEditableRow label="Address" summary={values.address || 'Not set'} summaryMuted={!values.address} isOpen={activeEditor === 'address'} onToggle={() => openEditor('address', values.address)}>
            <Textarea value={draftValue ?? values.address} onChange={setDraftValue} placeholder="Street address" className="w-full" rows={3} onBlur={() => { if (skipBlurRef.current) { skipBlurRef.current = false; return; } if (draftValue !== null) void commitDraft('address', draftValue, false); }} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { skipBlurRef.current = true; void commitDraft('address', draftValue ?? values.address, true); } if (e.key === 'Escape') { skipBlurRef.current = true; setActiveEditor(null); } }} />
          </InspectorEditableRow>
        </InspectorGroup>
        <InspectorGroup label={`Services ${setupStatus?.servicesComplete ? '· Complete' : '· Missing'}`}>
          <InspectorEditableRow label="Practice services" summary={values.services.length > 0 ? values.services.join(', ') : 'Not set'} summaryMuted={values.services.length === 0} isOpen={activeEditor === 'services'} onToggle={() => openEditor('services', values.services.join('\n'))}>
            <Textarea value={draftValue ?? values.services.join('\n')} onChange={setDraftValue} placeholder="One service per line" className="w-full" rows={4} onBlur={() => { if (skipBlurRef.current) { skipBlurRef.current = false; return; } if (draftValue !== null) void commitDraft('services', draftValue, false); }} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { skipBlurRef.current = true; void commitDraft('services', draftValue ?? values.services.join('\n'), true); } if (e.key === 'Escape') { skipBlurRef.current = true; setActiveEditor(null); } }} />
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
