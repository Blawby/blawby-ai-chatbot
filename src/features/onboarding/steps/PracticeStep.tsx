import { Building2 } from 'lucide-preact';
import { Input } from '@/shared/ui/input';
import { Chip } from '@/design-system/primitives';
import { slugify } from '@/shared/lib/orgCreation';
import type { OnboardingDraft } from '../types';

interface PracticeStepProps {
  draft: OnboardingDraft;
  onChange: (patch: Partial<OnboardingDraft>) => void;
}

const JURISDICTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'NC', label: 'NC · North Carolina' },
  { value: 'SC', label: 'SC · South Carolina' },
  { value: 'GA', label: 'GA · Georgia' },
  { value: 'TX', label: 'TX · Texas' },
  { value: 'NY', label: 'NY · New York' },
  { value: 'CA', label: 'CA · California' },
  { value: 'FL', label: 'FL · Florida' },
  { value: 'IL', label: 'IL · Illinois' },
  { value: 'WA', label: 'WA · Washington' },
  { value: 'MA', label: 'MA · Massachusetts' }
];

/**
 * Step 2 body — collects practice (org) name, public slug, primary jurisdiction,
 * and bar number. Firm name + slug feed `authClient.organization.create`; the
 * jurisdiction + bar number are kept in the draft and persisted post-org via
 * a follow-up update once the API supports those custom fields.
 *
 * TODO(persist): jurisdiction + barNumber currently only live in draft state.
 * authClient.organization.update doesn't yet accept these custom fields, so
 * they are saved to the practice profile in a follow-up once the backend
 * exposes them. See useWorkspaceSetup.handleSaveBasics for the existing
 * basics-update surface that should grow these columns.
 */
export const PracticeStep = ({ draft, onChange }: PracticeStepProps) => {
  const computedSlug = (draft.practiceSlug ?? slugify(draft.practiceName ?? '')) || '';

  return (
    <section className="card" style={{ padding: '28px' }}>
      <h2
        style={{
          fontFamily: 'var(--serif)',
          fontWeight: 400,
          fontSize: '28px',
          lineHeight: 1.15,
          letterSpacing: '-0.01em',
          margin: '0 0 18px',
          color: 'var(--ink)'
        }}
      >
        Practice profile
      </h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="label mb-1.5 block" htmlFor="onboarding-firmName">
            Firm name
          </label>
          <Input
            id="onboarding-firmName"
            type="text"
            required
            value={draft.practiceName ?? ''}
            onChange={(value) =>
              onChange({
                practiceName: value,
                // Keep slug in sync until the user edits it manually.
                practiceSlug: draft.practiceSlug ? draft.practiceSlug : slugify(value)
              })
            }
            placeholder="Law Offices of Sarah Chen"
            icon={Building2}
            iconClassName="h-5 w-5 text-dim-2"
            disabled={Boolean(draft.createdOrganizationId)}
          />
          {draft.createdOrganizationId && (
            <p className="mt-1 text-xs" style={{ color: 'var(--dim)' }}>
              Practice already created — name locked. Edit it later in Settings.
            </p>
          )}
        </div>

        <div>
          <label className="label mb-1.5 block" htmlFor="onboarding-slug">
            Public URL slug
          </label>
          <Input
            id="onboarding-slug"
            type="text"
            value={computedSlug}
            onChange={(value) => onChange({ practiceSlug: slugify(value) })}
            placeholder="sarah-chen-law"
            disabled={Boolean(draft.createdOrganizationId)}
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--dim)' }}>
            blawby.com/p/{computedSlug || 'your-slug'}
          </p>
        </div>

        <div>
          <label className="label mb-1.5 block" htmlFor="onboarding-jurisdiction">
            Primary jurisdiction
          </label>
          <select
            id="onboarding-jurisdiction"
            value={draft.jurisdiction ?? ''}
            onChange={(event) =>
              onChange({ jurisdiction: (event.target as HTMLSelectElement).value })
            }
            className="select"
          >
            <option value="">Select…</option>
            {JURISDICTIONS.map((j) => (
              <option key={j.value} value={j.value}>
                {j.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label mb-1.5 block" htmlFor="onboarding-bar">
            Bar number
          </label>
          <Input
            id="onboarding-bar"
            type="text"
            value={draft.barNumber ?? ''}
            onChange={(value) => onChange({ barNumber: value })}
            placeholder="e.g. NC 45382"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--dim)' }}>
        <Chip variant="default">Optional</Chip>
        Bar number + jurisdiction unlock template suggestions tuned to your state.
      </div>
    </section>
  );
};

/**
 * Step 2 validation — firm name is required; slug is auto-derived. Jurisdiction
 * and bar # are optional (collected for grounding but skip-able).
 */
export const isPracticeComplete = (draft: OnboardingDraft): boolean => {
  return (draft.practiceName ?? '').trim().length >= 2;
};

export default PracticeStep;
