import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

/**
 * Shared accent hero shell used by detail surfaces that need a branded header
 * over a light panel. Keep this here so detail pages do not each invent their
 * own accent foreground/background treatment.
 */
export interface AccentHeroSurfaceProps {
  children: ComponentChildren;
  className?: string;
}

export const AccentHeroSurface = ({
  children,
  className,
}: AccentHeroSurfaceProps) => (
  <section
    className={cn(
      'relative overflow-hidden rounded-[28px] bg-gradient-to-b from-accent-500/30 via-surface-overlay/70 to-surface-overlay/85 [--accent-foreground:var(--input-text)]',
      className
    )}
  >
    <div className="absolute inset-0 bg-gradient-to-t from-surface-base/45 via-transparent to-transparent" />
    <div className="relative">
      {children}
    </div>
  </section>
);

export default AccentHeroSurface;
