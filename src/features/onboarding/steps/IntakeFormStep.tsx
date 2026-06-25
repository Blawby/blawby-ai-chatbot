import { useEffect, useState } from 'preact/hooks';
import { CheckCircle2, Sparkles } from 'lucide-preact';
import { Icon } from '@/shared/ui/Icon';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { listIntakeTemplates } from '@/features/intake/api/intakeTemplatesApi';
import type { IntakeTemplate } from '@/shared/types/intake';
import type { OnboardingDraft } from '../types';

interface IntakeFormStepProps {
  draft: OnboardingDraft;
}

/**
 * Step 5 — shows the seeded intake template so the user knows what their
 * intake form looks like before sharing the link in step 6.
 *
 * The template is seeded by the backend on PracticeCreated (PR #318).
 * This step is read-only: editing happens in Settings → Intake forms.
 */
export const IntakeFormStep = ({ draft }: IntakeFormStepProps) => {
  const [template, setTemplate] = useState<IntakeTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const orgId = draft.createdOrganizationId ?? null;

  useEffect(() => {
    if (!orgId) {
      setIsLoading(false);
      setError('Practice not created yet — go back to step 3.');
      return;
    }

    let mounted = true;
    setIsLoading(true);
    listIntakeTemplates(orgId)
      .then((templates) => {
        if (!mounted) return;
        const defaultTemplate = templates.find((t) => t.is_default) ?? templates[0] ?? null;
        setTemplate(defaultTemplate);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        const msg = err instanceof Error ? err.message : String(err);
        // Surface a clear message — likely the backend endpoint isn't live yet.
        const isParseError = msg.includes('JSON') || msg.includes('Unexpected');
        setError(
          isParseError
            ? 'Intake form not available yet — the backend endpoint may still be deploying.'
            : msg || 'Unable to load intake form.'
        );
        setIsLoading(false);
      });

    return () => { mounted = false; };
  }, [orgId]);

  if (isLoading) {
    return <LoadingBlock />;
  }

  if (error || !template) {
    return (
      <div className="card" style={{ padding: '22px' }}>
        <p className="text-sm" style={{ color: 'var(--neg)' }}>
          {error ?? 'No intake form found. You can create one from Settings → Intake forms.'}
        </p>
      </div>
    );
  }

  const requiredFields = template.fields.filter((f) => (f.phase ?? (f.required ? 'required' : 'enrichment')) === 'required');
  const enrichmentFields = template.fields.filter((f) => (f.phase ?? (f.required ? 'required' : 'enrichment')) === 'enrichment');
  const standardContactFields = ['Name', 'Email', 'Phone'];

  return (
    <div className="flex flex-col gap-4">
      {/* Template name */}
      <div className="card" style={{ padding: '22px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>
          Intake form
        </div>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 22, lineHeight: 1.2, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
          {template.name}
        </div>
        {template.introMessage && (
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.5 }}>
            {template.introMessage}
          </p>
        )}
      </div>

      <div className="card" style={{ padding: '22px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 14 }}>
          Collected on every intake
        </div>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: 0, padding: 0, listStyle: 'none' }}>
          {standardContactFields.map((label) => (
            <li key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Icon icon={CheckCircle2} className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--pos)' }} />
              <span style={{ fontSize: 14, color: 'var(--ink)' }}>{label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Required fields */}
      {requiredFields.length > 0 && (
        <div className="card" style={{ padding: '22px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 14 }}>
            Required — clients must answer these
          </div>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: 0, padding: 0, listStyle: 'none' }}>
            {requiredFields.map((field) => (
              <li key={field.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Icon icon={CheckCircle2} className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--pos)' }} />
                <span style={{ fontSize: 14, color: 'var(--ink)' }}>{field.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Enrichment fields */}
      {enrichmentFields.length > 0 && (
        <div className="card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <Icon icon={Sparkles} className="h-3.5 w-3.5" style={{ color: 'var(--accent-deep)' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)' }}>
              AI follow-up — collected to strengthen the case
            </span>
          </div>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
            {enrichmentFields.map((field) => (
              <li key={field.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--rule)', display: 'inline-block'
                }} />
                <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{field.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)', letterSpacing: '0.02em' }}>
        You can rename this form, edit these questions, and add custom questions from{' '}
        <strong style={{ color: 'var(--ink-2)' }}>Settings → Intake forms</strong>{' '}
        any time after setup.
      </p>
    </div>
  );
};

export const isIntakeFormComplete = (_draft: OnboardingDraft): boolean => true;

export default IntakeFormStep;
