import { useEffect, useState } from 'preact/hooks';
import { Sparkles } from 'lucide-preact';
import { Icon } from '@/shared/ui/Icon';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { listIntakeTemplates } from '@/features/intake/api/intakeTemplatesApi';
import type { IntakeFieldDefinition, IntakeTemplate } from '@/shared/types/intake';
import type { OnboardingDraft } from '../types';

interface IntakeFormStepProps {
  draft: OnboardingDraft;
  onTemplateReady?: (template: IntakeTemplate | null) => void;
}

const fieldPhase = (field: IntakeFieldDefinition) => field.phase ?? (field.required ? 'required' : 'enrichment');

const PreviewInput = ({ field }: { field: IntakeFieldDefinition }) => {
  const inputClass = 'mt-1.5 w-full rounded-sm border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-sm text-dim';

  if (field.type === 'select') {
    return (
      <select className={inputClass} disabled aria-label={field.label}>
        <option>{field.options?.[0] ?? 'Select an option'}</option>
      </select>
    );
  }

  if (field.type === 'boolean') {
    return (
      <div className="mt-2 flex gap-2" aria-label={field.label}>
        <span className="rounded-sm border border-[var(--rule)] bg-[var(--paper)] px-3 py-1.5 text-xs text-dim">Yes</span>
        <span className="rounded-sm border border-[var(--rule)] bg-[var(--paper)] px-3 py-1.5 text-xs text-dim">No</span>
      </div>
    );
  }

  if (field.backendFieldType === 'textarea' || field.key === 'description') {
    return (
      <textarea
        className={`${inputClass} min-h-[88px] resize-none`}
        placeholder={field.validationHint ?? 'Client describes what happened here.'}
        disabled
        aria-label={field.label}
      />
    );
  }

  return (
    <input
      className={inputClass}
      type={field.type === 'number' ? 'number' : 'text'}
      placeholder={field.validationHint ?? (field.type === 'date' ? 'MM/DD/YYYY' : 'Client answer')}
      disabled
      aria-label={field.label}
    />
  );
};

/**
 * Step 5 shows the seeded intake template as a read-only client-form preview.
 * Editing happens after onboarding in Settings -> Intake forms.
 */
export const IntakeFormStep = ({ draft, onTemplateReady }: IntakeFormStepProps) => {
  const [template, setTemplate] = useState<IntakeTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const orgId = draft.createdOrganizationId ?? null;

  useEffect(() => {
    if (!orgId) {
      setIsLoading(false);
      setError('Practice not created yet. Go back to step 3.');
      onTemplateReady?.(null);
      return;
    }

    let mounted = true;
    setIsLoading(true);
    setError(null);
    listIntakeTemplates(orgId)
      .then((templates) => {
        if (!mounted) return;
        const defaultTemplate = templates.find((t) => t.is_default) ?? templates[0] ?? null;
        setTemplate(defaultTemplate);
        setError(null);
        onTemplateReady?.(defaultTemplate);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        const msg = err instanceof Error ? err.message : String(err);
        const isParseError = msg.includes('JSON') || msg.includes('Unexpected');
        setError(
          isParseError
            ? 'Intake form not available yet. The backend endpoint may still be deploying.'
            : msg || 'Unable to load intake form.'
        );
        setTemplate(null);
        onTemplateReady?.(null);
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [onTemplateReady, orgId]);

  if (isLoading) {
    return <LoadingBlock />;
  }

  if (error || !template) {
    return (
      <div className="card" style={{ padding: '22px' }}>
        <p className="text-sm" style={{ color: 'var(--neg)' }}>
          {error ?? 'No intake form found. You can create one from Settings -> Intake forms.'}
        </p>
      </div>
    );
  }

  const requiredFields = template.fields.filter((field) => fieldPhase(field) === 'required');
  const enrichmentFields = template.fields.filter((field) => fieldPhase(field) === 'enrichment');
  const contactFields: Array<{ label: string; placeholder: string; type?: string }> = [
    { label: 'Name', placeholder: 'Jane Client' },
    { label: 'Email', placeholder: 'jane@example.com', type: 'email' },
    { label: 'Phone', placeholder: '(555) 014-2190', type: 'tel' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="card overflow-hidden" style={{ padding: 0 }}>
        <div className="border-b border-[var(--rule)] px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
            Client preview
          </div>
          <div className="mt-1 font-serif text-[24px] leading-tight tracking-[-0.01em] text-ink">
            {template.name}
          </div>
          <p className="mt-2 max-w-[58ch] text-sm leading-6 text-ink-2">
            {template.introMessage || 'Clients start by sharing contact details and the facts needed for your practice to review the request.'}
          </p>
        </div>

        <div className="bg-[var(--paper)]/45 px-5 py-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
            Collected on every intake
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            {contactFields.map((field) => (
              <label key={field.label} className="block text-sm font-medium text-ink">
                {field.label}
                <input
                  className="mt-1.5 w-full rounded-sm border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-sm text-dim"
                  type={field.type ?? 'text'}
                  placeholder={field.placeholder}
                  disabled
                />
              </label>
            ))}
          </div>

          {requiredFields.length > 0 && (
            <div className="mt-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
                Required before submission
              </div>
              <div className="mt-3 grid gap-4">
                {requiredFields.map((field) => (
                  <label key={field.key} className="block text-sm font-medium text-ink">
                    {field.label}
                    <PreviewInput field={field} />
                  </label>
                ))}
              </div>
            </div>
          )}

          {enrichmentFields.length > 0 && (
            <div className="mt-6 rounded-sm border border-[var(--rule)] bg-[var(--card)] p-4">
              <div className="flex items-center gap-2">
                <Icon icon={Sparkles} className="h-3.5 w-3.5" style={{ color: 'var(--accent-deep)' }} />
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
                  AI follow-up questions
                </span>
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {enrichmentFields.map((field) => (
                  <label key={field.key} className="block text-sm font-medium text-ink">
                    {field.label}
                    <PreviewInput field={field} />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)', letterSpacing: '0.02em' }}>
        You can rename this form, edit these questions, and add custom questions from{' '}
        <strong style={{ color: 'var(--ink-2)' }}>Settings {'->'} Intake forms</strong>{' '}
        any time after setup.
      </p>
    </div>
  );
};

export const isIntakeFormComplete = (_draft: OnboardingDraft): boolean => true;

export default IntakeFormStep;
