import { useState } from 'preact/hooks';
import { Building2, Plus } from 'lucide-preact';
import { Chip } from '@/design-system/primitives';
import { Button } from '@/shared/ui/Button';
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

const PRACTICE_TYPES = PRACTICE_SERVICE_GROUPS.map((group) => group.type);
const CATALOG_PRACTICE_AREAS = PRACTICE_SERVICE_GROUPS.flatMap((group) => group.services);

/**
 * Step 2 body — practice identity plus grounding fields. All fields are sent
 * to the backend via `POST /api/practice` (createPractice) which creates the
 * org, practice details, and seeds the default intake template atomically.
 * Slug is auto-derived from firm name and is not user-editable.
 */
export const PracticeStep = ({ draft, onChange }: PracticeStepProps) => {
  const [otherPracticeArea, setOtherPracticeArea] = useState('');
  const [otherPracticeType, setOtherPracticeType] = useState(PRACTICE_TYPES[0] ?? '');
  const computedSlug = slugify(draft.practiceName ?? '');
  const selectedAreas = new Set(draft.practiceAreas ?? []);
  const selectedTypes = new Set(draft.practiceTypes ?? []);
  const publicOrigin = (() => { try { return getPublicFormOrigin(); } catch { return ''; } })();

  const setPracticeAreas = (areas: string[]) => {
    const uniqueAreas = Array.from(new Set(areas.map((area) => area.trim()).filter(Boolean)));
    onChange({ practiceAreas: uniqueAreas });
  };

  const setPracticeTypes = (types: string[]) => {
    const uniqueTypes = Array.from(new Set(types.map((type) => type.trim()).filter(Boolean)));
    onChange({ practiceTypes: uniqueTypes });
  };

  const togglePracticeType = (type: string) => {
    const next = new Set(selectedTypes);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    setPracticeTypes(Array.from(next));
  };

  const togglePracticeArea = (area: string, practiceType?: string) => {
    const next = new Set(selectedAreas);
    const isAdding = !next.has(area);
    if (next.has(area)) {
      next.delete(area);
    } else {
      next.add(area);
    }
    const nextAreas = Array.from(next);
    const nextTypes = practiceType && isAdding
      ? Array.from(new Set([...(draft.practiceTypes ?? []), practiceType]))
      : (draft.practiceTypes ?? []);

    onChange({
      practiceAreas: nextAreas,
      practiceTypes: nextTypes
    });
  };

  const addOtherPracticeArea = () => {
    const nextArea = otherPracticeArea.trim();
    if (!nextArea) return;
    setPracticeAreas([...(draft.practiceAreas ?? []), nextArea]);
    setPracticeTypes([...(draft.practiceTypes ?? []), otherPracticeType]);
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
              const hasSelectedService = group.services.some((service) => selectedAreas.has(service));
              const isTypeSelected = selectedTypes.has(group.type) || hasSelectedService;
              return (
                <div key={group.type}>
                  <div className="mb-2 flex items-center gap-2">
                    <Chip
                      variant={isTypeSelected ? 'accent' : 'default'}
                      onClick={() => togglePracticeType(group.type)}
                    >
                      {group.type}
                    </Chip>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.services.map((area) => {
                      const isSelected = selectedAreas.has(area);
                      return (
                        <Chip
                          key={area}
                          variant={isSelected ? 'accent' : 'default'}
                          onClick={() => togglePracticeArea(area, group.type)}
                        >
                          {area}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {(draft.practiceAreas ?? [])
              .filter((area) => !CATALOG_PRACTICE_AREAS.includes(area))
              .map((area) => (
                <Chip
                  key={area}
                  variant="accent"
                  onClick={() => togglePracticeArea(area)}
                  onRemove={() => togglePracticeArea(area)}
                  removeAriaLabel={`Remove ${area}`}
                >
                  {area}
                </Chip>
              ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              id="onboarding-practice-area-other-type"
              value={otherPracticeType}
              onInput={(event) => setOtherPracticeType((event.target as HTMLSelectElement).value)}
              className="select sm:max-w-[180px]"
              aria-label="Practice type for custom area"
            >
              {PRACTICE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <Input
              id="onboarding-practice-area-other"
              type="text"
              value={otherPracticeArea}
              onChange={setOtherPracticeArea}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addOtherPracticeArea();
                }
              }}
              placeholder="Other practice area"
            />
            <Button
              type="button"
              variant="secondary"
              icon={Plus}
              onClick={addOtherPracticeArea}
              disabled={otherPracticeArea.trim().length === 0}
            >
              Add
            </Button>
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
