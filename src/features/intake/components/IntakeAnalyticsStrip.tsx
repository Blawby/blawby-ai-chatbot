/**
 * IntakeAnalyticsStrip — small mono dim usage strip rendered above the
 * AI authoring strip in the intake editor.
 *
 * Surfaces "used N× in last 30 days · M% converted" — the practice owner's
 * primary signal that this template is or isn't pulling its weight.
 *
 * TODO(backend): wire to a real analytics endpoint
 * (e.g. `/api/practices/:id/intakes/templates/:slug/analytics`) once that
 * exists. For now the page passes `null` for unknown counts and the strip
 * renders em-dashes — never a misleading hard-coded number.
 */

export interface IntakeAnalyticsStripProps {
  /** Total uses in the last 30 days, or null when not yet wired. */
  usesLast30Days: number | null;
  /** Conversion rate as a 0–100 percent, or null when not yet wired. */
  conversionPercent: number | null;
}

const formatNumber = (value: number | null): string => {
  if (value === null) return '—';
  return value.toLocaleString();
};

const formatPercent = (value: number | null): string => {
  if (value === null) return '—';
  return `${Math.round(value)}%`;
};

export function IntakeAnalyticsStrip({
  usesLast30Days,
  conversionPercent,
}: IntakeAnalyticsStripProps) {
  return (
    <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-dim-2">
      Used <span className="text-ink-2">{formatNumber(usesLast30Days)}×</span> in last 30 days ·{' '}
      <span className="text-ink-2">{formatPercent(conversionPercent)}</span> converted
    </p>
  );
}
