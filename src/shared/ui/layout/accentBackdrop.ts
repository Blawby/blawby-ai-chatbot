export type AccentBackdropVariant = 'none' | 'settings' | 'workspace';

export type AccentBackdropConfig = {
  gradientClassName: string;
  leftOrbClassName: string;
  rightOrbClassName: string;
};

export function getAccentBackdropDefaults(
  accentBackdropVariant: AccentBackdropVariant
): AccentBackdropConfig | null {
  if (accentBackdropVariant === 'settings') {
    return {
      gradientClassName: 'absolute inset-x-0 top-0 h-[360px] bg-gradient-to-b from-accent-600/25 via-accent-700/10 to-transparent',
      leftOrbClassName: 'absolute -left-10 top-8 h-40 w-40 rounded-full bg-accent-500/20 blur-3xl',
      rightOrbClassName: 'absolute right-8 top-20 h-28 w-28 rounded-full bg-white/[0.08] blur-3xl'
    };
  }
  if (accentBackdropVariant === 'workspace') {
    return {
      gradientClassName: 'absolute inset-0 bg-[radial-gradient(120%_90%_at_0%_0%,rgb(var(--accent-500)_/_0.22)_0%,rgb(var(--accent-600)_/_0.12)_35%,transparent_72%)]',
      leftOrbClassName: 'absolute -left-24 -top-20 h-72 w-72 rounded-full bg-accent-500/25 blur-3xl',
      rightOrbClassName: 'absolute right-8 top-20 h-28 w-28 rounded-full bg-white/[0.08] blur-3xl'
    };
  }
  return null;
}
