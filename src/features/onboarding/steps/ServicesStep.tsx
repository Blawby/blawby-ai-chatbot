import { useMemo } from 'preact/hooks';
import { Check, Sparkles } from 'lucide-preact';
import { Icon } from '@/shared/ui/Icon';
import type { OnboardingDraft, ServiceTemplate } from '../types';

interface ServicesStepProps {
  draft: OnboardingDraft;
  onChange: (patch: Partial<OnboardingDraft>) => void;
}

interface TemplateOption extends ServiceTemplate {
  practiceArea: string;
}

// Per-practice-area defaults. The first 6 are surfaced before suggestions —
// suggestions for the user's selected practice areas are bubbled to the top.
const TEMPLATES: readonly TemplateOption[] = [
  {
    key: 'fam-consult',
    name: 'Family law consultation',
    suggestedFee: '$250 · 60 min',
    rationale: 'Most-requested intake for family law solos',
    practiceArea: 'Family law'
  },
  {
    key: 'fam-divorce',
    name: 'Uncontested divorce flat fee',
    suggestedFee: '$1,800 · flat',
    rationale: 'Predictable revenue for high-volume family practices',
    practiceArea: 'Family law'
  },
  {
    key: 'civil-consult',
    name: 'Civil litigation consultation',
    suggestedFee: '$300 · 60 min',
    rationale: 'Triages billable vs. contingency cases',
    practiceArea: 'Civil litigation'
  },
  {
    key: 'estate-plan',
    name: 'Will & basic estate plan',
    suggestedFee: '$650 · flat',
    rationale: 'Flat-fee anchor for estate practices',
    practiceArea: 'Estate planning'
  },
  {
    key: 'pi-intake',
    name: 'Personal injury intake',
    suggestedFee: 'Free · contingency',
    rationale: 'Standard for PI — no fee unless you win',
    practiceArea: 'Personal injury'
  },
  {
    key: 'biz-formation',
    name: 'LLC formation',
    suggestedFee: '$450 · flat',
    rationale: 'Onboarding offer for small business clients',
    practiceArea: 'Small business'
  },
  {
    key: 'real-estate-closing',
    name: 'Real estate closing',
    suggestedFee: '$850 · flat',
    rationale: 'Conveyance + title review',
    practiceArea: 'Real estate'
  },
  {
    key: 'employment-review',
    name: 'Employment contract review',
    suggestedFee: '$400 · flat',
    rationale: 'Common HR ask from small businesses',
    practiceArea: 'Employment'
  },
  {
    key: 'immigration-i130',
    name: 'I-130 family petition',
    suggestedFee: '$1,200 · flat',
    rationale: 'Standard immigration package',
    practiceArea: 'Immigration'
  }
];

const MAX_SERVICES = 3;

/**
 * Step 5 body — 3-column template picker for the user's first 1–3 services.
 *
 * Suggestions are biased by the practice areas the user picked in step 3:
 * matching templates float to the top with the gold "Suggested" tag. The
 * user can pick any of the templates regardless of bias.
 */
export const ServicesStep = ({ draft, onChange }: ServicesStepProps) => {
  const selectedKeys = useMemo(
    () => new Set((draft.selectedServices ?? []).map((service) => service.key)),
    [draft.selectedServices]
  );

  const orderedTemplates = useMemo(() => {
    const areas = new Set(draft.practiceAreas ?? []);
    if (areas.size === 0) return TEMPLATES;
    return [...TEMPLATES].sort((a, b) => {
      const aMatch = areas.has(a.practiceArea) ? 0 : 1;
      const bMatch = areas.has(b.practiceArea) ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [draft.practiceAreas]);

  const userPracticeAreas = useMemo(
    () => new Set(draft.practiceAreas ?? []),
    [draft.practiceAreas]
  );

  const toggle = (template: TemplateOption) => {
    const existing = draft.selectedServices ?? [];
    if (selectedKeys.has(template.key)) {
      onChange({
        selectedServices: existing.filter((service) => service.key !== template.key)
      });
      return;
    }
    if (existing.length >= MAX_SERVICES) return;
    onChange({
      selectedServices: [
        ...existing,
        {
          key: template.key,
          name: template.name,
          suggestedFee: template.suggestedFee,
          rationale: template.rationale
        }
      ]
    });
  };

  return (
    <section className="flex flex-col gap-5">
      <p className="text-sm" style={{ color: 'var(--dim)' }}>
        Pick the first {MAX_SERVICES} services your intake form should offer. You can
        add and edit more once your workspace is live.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {orderedTemplates.map((template) => {
          const isSelected = selectedKeys.has(template.key);
          const isMaxed = !isSelected && selectedKeys.size >= MAX_SERVICES;
          const isSuggested = userPracticeAreas.has(template.practiceArea);

          return (
            <button
              key={template.key}
              type="button"
              onClick={() => (isMaxed ? undefined : toggle(template))}
              disabled={isMaxed}
              aria-pressed={isSelected}
              className="text-left"
              style={{
                background: isSelected
                  ? 'color-mix(in oklab, var(--accent) 8%, var(--card))'
                  : 'var(--card)',
                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--rule)'}`,
                boxShadow: isSelected
                  ? '0 0 0 1px var(--accent), var(--shadow-1)'
                  : 'var(--shadow-1)',
                borderRadius: 'var(--r-md)',
                padding: '14px 16px',
                cursor: isMaxed ? 'not-allowed' : 'pointer',
                opacity: isMaxed ? 0.55 : 1,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                transition: 'border-color .14s, transform .14s, box-shadow .14s'
              }}
            >
              <span
                aria-hidden="true"
                className="absolute right-2.5 top-2.5 grid h-[18px] w-[18px] place-items-center rounded-full"
                style={{
                  background: isSelected ? 'var(--accent)' : 'var(--card)',
                  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--rule)'}`,
                  color: isSelected ? 'var(--accent-ink)' : 'transparent'
                }}
              >
                <Icon icon={Check} className="h-3 w-3" />
              </span>
              <span
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: '19px',
                  lineHeight: 1.2,
                  paddingRight: '26px',
                  letterSpacing: '-0.01em',
                  color: 'var(--ink)'
                }}
              >
                {template.name}
              </span>
              {template.suggestedFee && (
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '11px',
                    color: 'var(--dim)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase'
                  }}
                >
                  {template.suggestedFee}
                </span>
              )}
              {template.rationale && (
                <span className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.45 }}>
                  {template.rationale}
                </span>
              )}
              {isSuggested && (
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '9.5px',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--accent-deep)'
                  }}
                >
                  <Icon icon={Sparkles} className="h-3 w-3" />
                  Suggested for you
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedKeys.size > 0 && (
        <p className="text-xs" style={{ color: 'var(--dim)' }}>
          {selectedKeys.size}/{MAX_SERVICES} selected
        </p>
      )}
    </section>
  );
};

/**
 * Step 5 — at least one service is recommended but not strictly required.
 * Users can land in their workspace and add services any time.
 */
export const isServicesComplete = (_draft: OnboardingDraft): boolean => true;

export default ServicesStep;
