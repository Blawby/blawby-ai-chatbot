import { useState } from 'preact/hooks';
import { Building2 } from 'lucide-preact';
import { Chip } from '@/design-system/primitives';
import { Input, Textarea } from '@/shared/ui/input';
import { slugify } from '@/shared/lib/orgCreation';
import { getPublicFormOrigin } from '@/config/urls';
import { STATE_OPTIONS } from '@/shared/ui/address/AddressFields';
import type { OnboardingDraft } from '../types';

interface PracticeStepProps {
  draft: OnboardingDraft;
  onChange: (patch: Partial<OnboardingDraft>) => void;
}

const PRACTICE_SERVICE_GROUPS: ReadonlyArray<{
  type: string;
  services: readonly string[];
}> = [
  {
    type: 'Transactional',
    services: [
      'Contract drafting',
      'Contract review',
      'Business formation',
      'Mergers and acquisitions',
      'Real estate transactions',
      'Estate planning',
      'Employment agreements',
      'Intellectual property licensing',
      'Nonprofit formation'
    ]
  },
  {
    type: 'Regulatory',
    services: [
      'Compliance counseling',
      'Licensing and permitting',
      'Tax',
      'Immigration',
      'Privacy and data security',
      'Health care compliance',
      'Environmental regulation',
      'Securities regulation',
      'Education compliance'
    ]
  },
  {
    type: 'Litigation',
    services: [
      'Family law',
      'Personal injury',
      'Employment disputes',
      'Criminal defense',
      'Business disputes',
      'Probate disputes',
      'Landlord-tenant disputes',
      'Consumer protection',
      'Appeals'
    ]
  }
];

const CATALOG_PRACTICE_AREAS = PRACTICE_SERVICE_GROUPS.flatMap((group) => group.services);

const getPracticeTypesForAreas = (areas: readonly string[]) => {
  const areaSet = new Set(areas);
  return PRACTICE_SERVICE_GROUPS
    .filter((group) => group.services.some((service) => areaSet.has(service)))
    .map((group) => group.type);
};

/**
 * Step 2 body — practice identity plus grounding fields. All fields are sent
 * to the backend via `POST /api/practice` (createPractice) which creates the
 * org, practice details, and seeds the default intake template atomically.
 * Slug is auto-derived from firm name and is not user-editable.
 */
export const PracticeStep = ({ draft, onChange }: PracticeStepProps) => {
  const [otherPracticeArea, setOtherPracticeArea] = useState('');
  const computedSlug = slugify(draft.practiceName ?? '');
  const selectedAreas = new Set(draft.practiceAreas ?? []);
  const customPracticeAreas = (draft.practiceAreas ?? [])
    .filter((area) => !CATALOG_PRACTICE_AREAS.includes(area));
  const publicOrigin = (() => { try { return getPublicFormOrigin(); } catch { return ''; } })();

  const setPracticeAreas = (areas: string[]) => {
    const uniqueAreas = Array.from(new Set(areas.map((area) => area.trim()).filter(Boolean)));
    onChange({
      practiceAreas: uniqueAreas,
      practiceTypes: getPracticeTypesForAreas(uniqueAreas)
    });
  };

  const togglePracticeArea = (area: string) => {
    const next = new Set(selectedAreas);
    if (next.has(area)) {
      next.delete(area);
    } else {
      next.add(area);
    }
    const nextAreas = Array.from(next);

    onChange({
      practiceAreas: nextAreas,
      practiceTypes: getPracticeTypesForAreas(nextAreas)
    });
  };

  const addOtherPracticeArea = () => {
    const nextArea = otherPracticeArea.trim();
    if (!nextArea) return;
    setPracticeAreas([...(draft.practiceAreas ?? []), nextArea]);
    setOtherPracticeArea('');
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
              placeholder="Your practice name"
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
              onInput={(event) =>
                onChange({ jurisdiction: (event.target as HTMLSelectElement).value })
              }
              className="select"
            >
              <option value="">Select…</option>
              {STATE_OPTIONS.map((state) => (
                <option key={state.value} value={state.value}>
                  {state.value} · {state.label}
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
          <p className="label mb-2 block" id="practice-services-label">
            Services by practice type
          </p>
          <div className="flex flex-col gap-5">
            {PRACTICE_SERVICE_GROUPS.map((group) => {
              const selectedCount = group.services.filter((service) => selectedAreas.has(service)).length;
              return (
                <div key={group.type}>
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim-2">
                    <span>{group.type}</span>
                    {selectedCount > 0 && (
                      <span
                        className="rounded-sm border border-line px-1.5 py-0.5 text-[10px] tracking-normal"
                        style={{ color: 'var(--dim)' }}
                        aria-label={`${selectedCount} selected`}
                      >
                        {selectedCount}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.services.map((area) => {
                      const isSelected = selectedAreas.has(area);
                      return (
                        <Chip
                          key={area}
                          variant={isSelected ? 'accent' : 'default'}
                          onClick={() => togglePracticeArea(area)}
                          aria-pressed={isSelected}
                        >
                          {area}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4">
            <Input
              id="onboarding-practice-area-other"
              type="text"
              value={otherPracticeArea}
              onChange={setOtherPracticeArea}
              onBlur={addOtherPracticeArea}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addOtherPracticeArea();
                }
              }}
              label="Add custom practice area"
              placeholder="e.g. Aviation law"
            />
            {customPracticeAreas.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {customPracticeAreas.map((area) => (
                  <Chip
                    key={area}
                    variant="accent"
                    onRemove={() => togglePracticeArea(area)}
                    removeAriaLabel={`Remove ${area}`}
                  >
                    {area}
                  </Chip>
                ))}
              </div>
            )}
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
