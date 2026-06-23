/**
 * Brand color validation.
 *
 * The DS migration drops runtime per-practice accent injection, so the visual
 * theme is now a fixed gold. The API still stores legacy brand-color values,
 * and a few profile persistence paths still normalize them for compatibility.
 * `normalizeAccentColor` stays as a pure validator for those cases.
 *
 * No DOM side effects. No `style.setProperty` calls.
 */

export type AccentColor = 'grey' | 'gold' | 'blue' | 'green' | 'yellow' | 'pink' | 'orange' | 'purple';

const HEX_COLOR_PATTERN = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

// Hex value of each named accent at shade 500. Lifted from the prior
// ACCENT_COLORS table so `normalizeAccentColor('gold')` -> '#D4AF37' etc.
const NAMED_ACCENT_HEX: Record<AccentColor, string> = {
  grey:   '#737373',
  gold:   '#D4AF37',
  blue:   '#3B82F6',
  green:  '#22C55E',
  yellow: '#EAB308',
  pink:   '#EC4899',
  orange: '#F97316',
  purple: '#A855F7',
};

const normalizeHexColor = (value: string): string | null => {
  const trimmed = value.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) return null;
  if (trimmed.length === 4) {
    const [hash, r, g, b] = trimmed;
    return `${hash}${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return trimmed.toUpperCase();
};

/**
 * Normalize a brand-color input to a canonical uppercase hex string.
 *
 * Accepts:
 *  - named accents ('gold', 'blue', etc.) -> their 500-shade hex
 *  - 3-digit hex ('#abc') -> 6-digit uppercase ('#AABBCC')
 *  - 6-digit hex ('#abcdef') -> 6-digit uppercase ('#ABCDEF')
 *
 * Returns `null` for anything that fails validation. Every importer pairs
 * this with `?? '#D4AF37'` (DS gold default), so the null return is part of
 * the contract — do not change it to `string | undefined`.
 */
export function normalizeAccentColor(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed in NAMED_ACCENT_HEX) {
    return NAMED_ACCENT_HEX[trimmed as AccentColor];
  }
  return normalizeHexColor(trimmed);
}
