export type AccentBackdropVariant = 'none' | 'settings' | 'workspace';

export type AccentBackdropConfig = {
  gradientClassName: string;
  leftOrbClassName: string;
  rightOrbClassName: string;
};

export function getAccentBackdropDefaults(
  _accentBackdropVariant: AccentBackdropVariant
): AccentBackdropConfig | null {
  // The 'settings' and 'workspace' decorative variants (radial gradients + blurred
  // orbs tinted by the practice accent) were deprecated per DESIGN.md as a
  // Generic-AI-tool-template anti-pattern. The function now returns null for every
  // variant; AppShell renders no decorative backdrop. The parameter and AccentBackdropVariant
  // type are preserved so existing callers and the AppShell prop API keep compiling.
  return null;
}
