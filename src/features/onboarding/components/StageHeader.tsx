import type { ComponentChildren } from 'preact';

interface StageHeaderProps {
  /** Mono crumb above the title — e.g. "Step 3 of 6 · About your practice". */
  crumb: string;
  /** Serif H1; pass an accent <em> inside for the gold word. */
  title: ComponentChildren;
  /** Lede paragraph (≤ 56ch). */
  lede: ComponentChildren;
}

/**
 * Stage header for each onboarding step (Onboarding.html `.crumbs` + `h1` + `.lede`).
 */
export const StageHeader = ({ crumb, title, lede }: StageHeaderProps) => {
  return (
    <div className="flex flex-col gap-4">
      <p
        style={{
          fontFamily: 'var(--mono)',
          fontSize: '10px',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--dim)',
          margin: 0
        }}
      >
        {crumb}
      </p>
      <h1
        className="text-balance"
        style={{
          fontFamily: 'var(--serif)',
          fontWeight: 400,
          fontSize: 'clamp(40px, 6vw, 64px)',
          lineHeight: 1,
          letterSpacing: '-0.025em',
          margin: 0,
          maxWidth: '18ch',
          color: 'var(--ink)'
        }}
      >
        {title}
      </h1>
      <p
        style={{
          fontSize: '18px',
          lineHeight: 1.55,
          color: 'var(--ink-2)',
          maxWidth: '56ch',
          margin: 0
        }}
      >
        {lede}
      </p>
    </div>
  );
};

export default StageHeader;
