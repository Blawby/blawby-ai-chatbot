import { Textarea } from '@/shared/ui/input';
import { Chip } from '@/design-system/primitives';
import type { OnboardingDraft, FeePreference } from '../types';

interface HowYouWorkStepProps {
  draft: OnboardingDraft;
  onChange: (patch: Partial<OnboardingDraft>) => void;
}

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

const FEE_OPTIONS: ReadonlyArray<{ value: FeePreference; label: string }> = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'flat', label: 'Flat fee' },
  { value: 'contingency', label: 'Contingency' },
  { value: 'sliding', label: 'Sliding scale' }
];

const MAX_PRACTICE_AREAS = 3;

/**
 * Step 3 body — practice areas (up to 3 chip multi-select), free-text "what's
 * weird" textarea, and fee-preference chips.
 *
 * TODO(persist): nothing collected here is wired to the backend yet. Practice
 * areas + quirks + fee preferences are intended to become the seed of the
 * org's grounded assistant system prompt; punted to a follow-up that adds the
 * org-prefs column.
 */
export const HowYouWorkStep = ({ draft, onChange }: HowYouWorkStepProps) => {
  const selectedAreas = new Set(draft.practiceAreas ?? []);
  const selectedFees = new Set(draft.feePreferences ?? []);

  const togglePracticeArea = (area: string) => {
    const next = new Set(selectedAreas);
    if (next.has(area)) {
      next.delete(area);
    } else {
      if (next.size >= MAX_PRACTICE_AREAS) return;
      next.add(area);
    }
    onChange({ practiceAreas: Array.from(next) });
  };

  const toggleFee = (fee: FeePreference) => {
    const next = new Set(selectedFees);
    if (next.has(fee)) {
      next.delete(fee);
    } else {
      next.add(fee);
    }
    onChange({ feePreferences: Array.from(next) });
  };

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
        How you work
      </h2>

      <div className="flex flex-col gap-6">
        <div>
          <label className="label mb-2 block">
            Practice areas <span className="text-dim-2 normal-case text-xs">— pick up to {MAX_PRACTICE_AREAS} the assistant should weight first</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {PRACTICE_AREAS.map((area) => {
              const isSelected = selectedAreas.has(area);
              const isMaxed = !isSelected && selectedAreas.size >= MAX_PRACTICE_AREAS;
              return (
                <Chip
                  key={area}
                  variant={isSelected ? 'accent' : 'default'}
                  onClick={isMaxed ? undefined : () => togglePracticeArea(area)}
                  className={isMaxed ? 'opacity-50 cursor-not-allowed' : undefined}
                >
                  {area}
                </Chip>
              );
            })}
          </div>
          {selectedAreas.size > 0 && (
            <p className="mt-2 text-xs" style={{ color: 'var(--dim)' }}>
              {selectedAreas.size}/{MAX_PRACTICE_AREAS} selected
            </p>
          )}
        </div>

        <div>
          <label className="label mb-2 block" htmlFor="onboarding-quirks">
            What should the AI know that&apos;s <em style={{ fontStyle: 'italic', color: 'var(--accent-deep)' }}>weird</em> about your practice?
          </label>
          <Textarea
            id="onboarding-quirks"
            value={draft.practiceQuirks ?? ''}
            onChange={(value) => onChange({ practiceQuirks: value })}
            placeholder="e.g. I don't take criminal cases. I work sliding scale for domestic violence intakes. I'm out of office every Friday."
            rows={4}
            description="Free text — this becomes the assistant's system prompt for your practice. Edit any time in Settings."
          />
        </div>

        <fieldset className="border-0 p-0 m-0">
          <legend className="label mb-2 block">Fee preferences</legend>
          <div className="flex flex-wrap gap-2">
            {FEE_OPTIONS.map((option) => {
              const isSelected = selectedFees.has(option.value);
              return (
                <Chip
                  key={option.value}
                  variant={isSelected ? 'accent' : 'default'}
                  onClick={() => toggleFee(option.value)}
                >
                  {option.label}
                </Chip>
              );
            })}
          </div>
        </fieldset>
      </div>
    </section>
  );
};

/**
 * Step 3 is fully optional — any selection (or even none) is valid because
 * the AI grounds with whatever it gets. Continue is always enabled.
 */
export const isHowYouWorkComplete = (_draft: OnboardingDraft): boolean => true;

export default HowYouWorkStep;
