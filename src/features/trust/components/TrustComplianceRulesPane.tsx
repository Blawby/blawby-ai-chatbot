import { useCallback, useEffect, useState } from 'preact/hooks';
import type { FunctionComponent } from 'preact';

import { Switch } from '@/shared/ui/input';

/**
 * Compliance rules — toggle definitions. Persisted to localStorage for
 * the demo until the practice preferences API ships these fields.
 *
 * TODO(backend): persist via `/api/practice/:practiceId/preferences` once
 * the registry exposes the IOLTA-specific keys
 * (`iolta_auto_replenish_threshold_cents`, `trust_alert_threshold_cents`,
 * `trust_dual_approval_threshold_cents`, `trust_lock_on_zero`). Each rule
 * here maps 1:1 to one of those preference keys — the `id` is the
 * localStorage key so the demo state is namespaced by practice.
 */
interface ComplianceRule {
  id: string;
  label: string;
  description: string;
  /** Default-on rules mirror the canonical Trust.html mock. */
  defaultOn: boolean;
}

const RULES: readonly ComplianceRule[] = [
  {
    id: 'auto_replenish_below_1k',
    label: 'Auto-replenish when balance < $1k',
    description: 'Stage a replenishment request whenever a client balance dips below the threshold.',
    defaultOn: true,
  },
  {
    id: 'alert_threshold_cross',
    label: 'Alert when a client balance crosses threshold',
    description: 'Notify the firm in chat when a balance moves above or below the alert threshold.',
    defaultOn: true,
  },
  {
    id: 'require_dual_approval_5k',
    label: 'Require dual approval for withdrawals > $5k',
    description: 'A second team member must confirm withdrawals over the threshold before they execute.',
    defaultOn: false,
  },
  {
    id: 'lock_matter_on_zero',
    label: 'Lock matter when balance hits zero',
    description: 'Pause new staged actions on a matter until the client retainer is replenished.',
    defaultOn: false,
  },
];

const storageKey = (practiceId: string, ruleId: string): string =>
  `blawby:trust:compliance:${practiceId}:${ruleId}`;

interface TrustComplianceRulesPaneProps {
  practiceId: string | null;
}

/**
 * Compliance rules card. Toggles persist to localStorage (per-practice
 * namespace) until the preferences API exposes the IOLTA-specific
 * fields. Each row mirrors a future preference key — see TODO above.
 */
export const TrustComplianceRulesPane: FunctionComponent<TrustComplianceRulesPaneProps> = ({
  practiceId,
}) => {
  // We initialize from localStorage so the demo state persists across
  // reloads. Falls back to `defaultOn` when no value has been written.
  const [values, setValues] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const rule of RULES) out[rule.id] = rule.defaultOn;
    return out;
  });

  // Read persisted values once a practiceId is available.
  useEffect(() => {
    if (!practiceId || typeof window === 'undefined') return;
    const next: Record<string, boolean> = {};
    for (const rule of RULES) {
      try {
        const raw = window.localStorage.getItem(storageKey(practiceId, rule.id));
        next[rule.id] = raw == null ? rule.defaultOn : raw === 'true';
      } catch {
        next[rule.id] = rule.defaultOn;
      }
    }
    setValues(next);
  }, [practiceId]);

  const handleChange = useCallback((ruleId: string, value: boolean) => {
    setValues((prev) => ({ ...prev, [ruleId]: value }));
    if (!practiceId || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey(practiceId, ruleId), String(value));
    } catch {
      // Quota / privacy mode — swallow so the toggle still flips visually.
    }
  }, [practiceId]);

  const activeCount = Object.values(values).filter(Boolean).length;

  return (
    <section className="panel overflow-hidden">
      <header className="flex items-center justify-between border-b border-rule bg-paper-2 px-5 py-3">
        <div className="flex flex-col">
          <h3 className="font-serif text-lg leading-tight text-ink">Compliance rules</h3>
          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
            IOLTA · {activeCount} of {RULES.length} active
          </span>
        </div>
      </header>
      <div className="px-5 py-1">
        {RULES.map((rule, index) => (
          <div
            key={rule.id}
            className={
              index === RULES.length - 1
                ? 'border-b-0'
                : 'border-b border-rule'
            }
          >
            <Switch
              label={rule.label}
              description={rule.description}
              value={values[rule.id] ?? rule.defaultOn}
              onChange={(next) => handleChange(rule.id, next)}
            />
          </div>
        ))}
      </div>
    </section>
  );
};

export default TrustComplianceRulesPane;
