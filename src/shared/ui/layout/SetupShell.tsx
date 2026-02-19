import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';
import { getAccentBackdropDefaults, type AccentBackdropVariant } from './accentBackdrop';

type AccentBackdropOverrides = {
  gradientClassName?: string;
  leftOrbClassName?: string;
  rightOrbClassName?: string;
};

interface SetupShellProps {
  children: ComponentChildren;
  className?: string;
  mainClassName?: string;
  accentBackdropVariant?: AccentBackdropVariant;
  accentBackdropOverrides?: AccentBackdropOverrides;
}

export const SetupShell = ({
  children,
  className,
  mainClassName,
  accentBackdropVariant = 'settings',
  accentBackdropOverrides
}: SetupShellProps) => {
  const accentDefaults = getAccentBackdropDefaults(accentBackdropVariant);

  const resolvedAccentClasses = accentDefaults
    ? {
      gradientClassName: accentBackdropOverrides?.gradientClassName ?? accentDefaults.gradientClassName,
      leftOrbClassName: accentBackdropOverrides?.leftOrbClassName ?? accentDefaults.leftOrbClassName,
      rightOrbClassName: accentBackdropOverrides?.rightOrbClassName ?? accentDefaults.rightOrbClassName
    }
    : null;

  return (
    <div className={cn('relative min-h-screen w-full overflow-hidden bg-surface-base', className)}>
      {resolvedAccentClasses && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className={resolvedAccentClasses.gradientClassName} />
          <div className={resolvedAccentClasses.leftOrbClassName} />
          <div className={resolvedAccentClasses.rightOrbClassName} />
        </div>
      )}
      <main className={cn('relative z-10 min-h-screen w-full', mainClassName)}>
        {children}
      </main>
    </div>
  );
};
