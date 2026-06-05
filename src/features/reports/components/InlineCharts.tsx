import type { FunctionComponent } from 'preact';

/**
 * Inline SVG charts for the Reports landing hub. Kept dependency-free
 * (no charting lib) to avoid a bundle hit for what is effectively a few
 * pixels of polyline / rect. Both components render fluidly into their
 * container (width: 100%).
 */

export interface SparklineProps {
  /** Numeric series — usually monthly revenue cents. */
  values: readonly number[];
  /** Pixel height — defaults to 32. */
  height?: number;
  /** ARIA label for screen readers. */
  ariaLabel?: string;
  className?: string;
}

const polylinePoints = (values: readonly number[], height: number): string => {
  if (values.length === 0) return '';
  const width = 200;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(1, max - min);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((value, idx) => {
      const x = idx * step;
      const y = height - ((value - min) / range) * (height - 4) - 2;
      return `${x},${y.toFixed(2)}`;
    })
    .join(' ');
};

export const Sparkline: FunctionComponent<SparklineProps> = ({
  values,
  height = 32,
  ariaLabel,
  className,
}) => {
  if (values.length === 0) return null;
  const points = polylinePoints(values, height);
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 200 ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel ?? `Trend across ${values.length} period${values.length === 1 ? '' : 's'}`}
      className={className}
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};

export interface BarChartDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  /** Series — usually 6 months of revenue cents. */
  data: readonly BarChartDatum[];
  /** Pixel height of the chart area. */
  height?: number;
  /** ARIA label for screen readers. */
  ariaLabel?: string;
  /** Optional formatter for the y-axis gridline label. */
  formatYAxis?: (value: number) => string;
  className?: string;
}

export const BarChart: FunctionComponent<BarChartProps> = ({
  data,
  height = 180,
  ariaLabel,
  formatYAxis,
  className,
}) => {
  if (data.length === 0) return null;
  const width = 600;
  const baselineY = height - 20;
  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.min(60, (width - 40) / (data.length * 1.6));
  const gap = (width - barWidth * data.length) / (data.length + 1);
  const gridY = 20;
  const yLabel = formatYAxis ? formatYAxis(max) : String(max);

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel ?? `Bar chart with ${data.length} data points`}
      className={className}
    >
      <line
        x1="0"
        y1={baselineY}
        x2={width}
        y2={baselineY}
        stroke="var(--rule)"
        strokeWidth="1"
      />
      <line
        x1="0"
        y1={gridY}
        x2={width}
        y2={gridY}
        stroke="var(--rule)"
        strokeWidth="1"
        strokeDasharray="2 4"
      />
      <text
        x="0"
        y={gridY - 4}
        fontFamily="Geist Mono, monospace"
        fontSize="10"
        fill="var(--dim)"
        letterSpacing=".04em"
      >
        {yLabel}
      </text>
      <g>
        {data.map((datum, idx) => {
          const h = (datum.value / max) * (baselineY - gridY);
          const x = gap + idx * (barWidth + gap);
          const y = baselineY - h;
          const isLast = idx === data.length - 1;
          return (
            <rect
              key={datum.label}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(0, h)}
              fill={isLast ? 'var(--accent)' : 'var(--paper-2)'}
              stroke={isLast ? 'var(--accent-deep)' : 'var(--rule)'}
              strokeWidth="1"
            />
          );
        })}
      </g>
      <g
        fontFamily="Geist Mono, monospace"
        fontSize="10"
        fill="var(--dim)"
        letterSpacing=".06em"
        textAnchor="middle"
      >
        {data.map((datum, idx) => {
          const x = gap + idx * (barWidth + gap) + barWidth / 2;
          const isLast = idx === data.length - 1;
          return (
            <text
              key={datum.label}
              x={x}
              y={height - 5}
              fill={isLast ? 'var(--ink)' : 'var(--dim)'}
            >
              {datum.label}
            </text>
          );
        })}
      </g>
    </svg>
  );
};
