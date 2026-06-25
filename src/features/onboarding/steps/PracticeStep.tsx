import { Building2 } from 'lucide-preact';
import { Chip } from '@/design-system/primitives';
import { Input, Textarea } from '@/shared/ui/input';
import { slugify } from '@/shared/lib/orgCreation';
import { getPublicFormOrigin } from '@/config/urls';
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

const PRACTICE_AREAS: readonly string[] = [
  'Family law',
  'Civil litigation',
  'Estate planning',
  'Personal injury',
  'Small business',
  'Real estate',
  'Employment',
  'Immigration',
  'Criminal defense',
  'Tax',
  'Intellectual property',
  'Bankruptcy'
];

/**
 * Step 2 body — practice identity plus grounding fields. All fields are sent
 * to the backend via `POST /api/practice` (createPractice) which creates the
 * org, practice details, and seeds the default intake template atomically.
 * Slug is auto-derived from firm name and is not user-editable.
 */
export const PracticeStep = ({ draft, onChange }: PracticeStepProps) => {
  const computedSlug = slugify(draft.practiceName ?? '');
  const selectedAreas = new Set(draft.practiceAreas ?? []);
  const publicOrigin = (() => { try { return getPublicFormOrigin(); } catch { return ''; } })();

  const togglePracticeArea = (area: string) => {
    const next = new Set(selectedAreas);
    if (next.has(area)) {
      next.delete(area);
    } else {
      next.add(area);
    }
    onChange({ practiceAreas: Array.from(next) });
  };

  return (
    <section className="flex flex-col gap-5">
      <div className="card" style={{ padding: '28px' }}>
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
              onChange={(value) => onChange({ practiceName: value })}
              placeholder="Law Offices of Sarah Chen"
              icon={Building2}
              iconClassName="h-5 w-5 text-dim-2"
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--dim)' }}>
              {publicOrigin}/p/{computedSlug || 'your-practice'}
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

        <div className="mt-6">
          <p className="label mb-2 block" id="practice-areas-label">
            Practice areas
          </p>
          <div className="flex flex-wrap gap-2">
            {PRACTICE_AREAS.map((area) => {
              const isSelected = selectedAreas.has(area);
              return (
                <Chip
                  key={area}
                  variant={isSelected ? 'accent' : 'default'}
                  onClick={() => togglePracticeArea(area)}
                >
                  {area}
                </Chip>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          <label className="label mb-2 block" htmlFor="onboarding-description">
            Describe your practice
          </label>
          <Textarea
            id="onboarding-description"
            value={draft.description ?? ''}
            onChange={(value) => onChange({ description: value })}
            placeholder="e.g. Solo family law practice serving North Carolina clients. We focus on custody, support, and protective-order matters."
            rows={4}
          />
        </div>
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
