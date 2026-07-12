import type { ComponentChildren } from 'preact';

interface StageHeaderProps {
  /** Mono crumb above the title — e.g. "Step 3 of 6 · About your practice". */
  crumb: string;
  /** Sans H1; pass an accent <em> inside for the gold word. */
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
      <p className="m-0 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
        {crumb}
      </p>
      <h1 className="m-0 max-w-[18ch] text-balance font-sans text-[clamp(40px,6vw,64px)] font-normal leading-none tracking-[-0.025em] text-ink">
        {title}
      </h1>
      <p className="m-0 max-w-[56ch] text-lg leading-[1.55] text-ink-2">
        {lede}
      </p>
    </div>
  );
};

export default StageHeader;
