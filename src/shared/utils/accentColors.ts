/**
 * Accent Color System
 * 
 * Provides dynamic accent color theming throughout the application.
 * Colors are applied via CSS variables and can be changed at runtime.
 */

export type AccentColor = 'grey' | 'gold' | 'blue' | 'green' | 'yellow' | 'pink' | 'orange' | 'purple';

/**
 * Accent color definitions in RGB format for CSS variables
 * Each color has shades from 50 (lightest) to 950 (darkest)
 */
export const ACCENT_COLORS: Record<AccentColor, Record<string, string>> = {
  grey: {
    '50': '250 250 250',   // Neutral 50
    '100': '245 245 245',  // Neutral 100
    '200': '229 229 229',  // Neutral 200
    '300': '212 212 212',  // Neutral 300
    '400': '163 163 163',  // Neutral 400
    '500': '115 115 115',  // Neutral 500
    '600': '82 82 82',     // Neutral 600
    '700': '64 64 64',     // Neutral 700
    '800': '38 38 38',     // Neutral 800
    '900': '23 23 23',     // Neutral 900
    '950': '10 10 10',     // Neutral 950
  },
  gold: {
    '50': '254 252 232',   // #fefce8
    '100': '254 249 195',  // #fef9c3
    '200': '254 240 138',  // #fef08a
    '300': '253 224 71',   // #fde047
    '400': '250 204 21',   // #facc15
    '500': '212 175 55',   // #d4af37 - Primary brand color
    '600': '202 138 4',    // #ca8a04
    '700': '161 98 7',     // #a16207
    '800': '133 77 14',    // #854d0e
    '900': '113 63 18',    // #713f12
    '950': '66 32 6',      // #422006
  },
  blue: {
    '50': '239 246 255',   // #eff6ff
    '100': '219 234 254',  // #dbeafe
    '200': '191 219 254',  // #bfdbfe
    '300': '147 197 253',  // #93c5fd
    '400': '96 165 250',   // #60a5fa
    '500': '59 130 246',   // #3b82f6
    '600': '37 99 235',    // #2563eb
    '700': '29 78 216',    // #1d4ed8
    '800': '30 64 175',    // #1e40af
    '900': '30 58 138',    // #1e3a8a
    '950': '23 37 84',     // #172554
  },
  green: {
    '50': '240 253 244',   // #f0fdf4
    '100': '220 252 231',  // #dcfce7
    '200': '187 247 208',  // #bbf7d0
    '300': '134 239 172',  // #86efac
    '400': '74 222 128',   // #4ade80
    '500': '34 197 94',    // #22c55e
    '600': '22 163 74',    // #16a34a
    '700': '21 128 61',    // #15803d
    '800': '22 101 52',    // #166534
    '900': '20 83 45',     // #14532d
    '950': '5 46 22',      // #052e16
  },
  yellow: {
    '50': '254 252 232',   // #fefce8
    '100': '254 249 195',  // #fef9c3
    '200': '254 240 138',  // #fef08a
    '300': '253 224 71',   // #fde047
    '400': '250 204 21',   // #facc15
    '500': '234 179 8',    // #eab308
    '600': '202 138 4',    // #ca8a04
    '700': '161 98 7',     // #a16207
    '800': '133 77 14',    // #854d0e
    '900': '113 63 18',    // #713f12
    '950': '66 32 6',      // #422006
  },
  pink: {
    '50': '253 242 248',   // #fdf2f8
    '100': '252 231 243',  // #fce7f3
    '200': '251 207 232',  // #fbcfe8
    '300': '249 168 212',  // #f9a8d4
    '400': '244 114 182',  // #f472b6
    '500': '236 72 153',   // #ec4899
    '600': '219 39 119',   // #db2777
    '700': '190 24 93',    // #be185d
    '800': '157 23 77',    // #9d174d
    '900': '131 24 67',    // #831843
    '950': '80 7 36',      // #500724
  },
  orange: {
    '50': '255 247 237',   // #fff7ed
    '100': '255 237 213',  // #ffedd5
    '200': '254 215 170',  // #fed7aa
    '300': '253 186 116',  // #fdba74
    '400': '251 146 60',   // #fb923c
    '500': '249 115 22',   // #f97316
    '600': '234 88 12',    // #ea580c
    '700': '194 65 12',    // #c2410c
    '800': '154 52 18',    // #9a3412
    '900': '124 45 18',    // #7c2d12
    '950': '67 20 7',      // #431407
  },
  purple: {
    '50': '250 245 255',   // #faf5ff
    '100': '243 232 255',  // #f3e8ff
    '200': '233 213 255',  // #e9d5ff
    '300': '216 180 254',  // #d8b4fe
    '400': '192 132 252',  // #c084fc
    '500': '168 85 247',   // #a855f7
    '600': '147 51 234',   // #9333ea
    '700': '126 34 206',   // #7e22ce
    '800': '107 33 168',   // #6b21a8
    '900': '88 28 135',    // #581c87
    '950': '59 7 100',     // #3b0764
  },
};

const DEFAULT_ACCENT_COLOR: AccentColor = 'gold';
const HEX_COLOR_PATTERN = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const DARK_FOREGROUND_RGB = '15 15 15';
const LIGHT_FOREGROUND_RGB = '255 255 255';

const rgbStringToHex = (value: string): string | null => {
  const parts = value.split(/\s+/).filter(Boolean).map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return `#${parts.map((part) => part.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
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

const mixChannel = (base: number, target: number, ratio: number): number =>
  Math.round(base + (target - base) * ratio);

const mixRgb = (
  rgb: [number, number, number],
  target: [number, number, number],
  ratio: number
): [number, number, number] => [
  mixChannel(rgb[0], target[0], ratio),
  mixChannel(rgb[1], target[1], ratio),
  mixChannel(rgb[2], target[2], ratio)
];

const rgbTupleToCss = (rgb: [number, number, number]): string => `${rgb[0]} ${rgb[1]} ${rgb[2]}`;

const hexToRgbTuple = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16)
];

const buildPaletteFromHex = (hex: string): Record<string, string> => {
  const base = hexToRgbTuple(hex);
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];

  return {
    '50': rgbTupleToCss(mixRgb(base, white, 0.94)),
    '100': rgbTupleToCss(mixRgb(base, white, 0.88)),
    '200': rgbTupleToCss(mixRgb(base, white, 0.72)),
    '300': rgbTupleToCss(mixRgb(base, white, 0.54)),
    '400': rgbTupleToCss(mixRgb(base, white, 0.24)),
    '500': rgbTupleToCss(base),
    '600': rgbTupleToCss(mixRgb(base, black, 0.14)),
    '700': rgbTupleToCss(mixRgb(base, black, 0.28)),
    '800': rgbTupleToCss(mixRgb(base, black, 0.42)),
    '900': rgbTupleToCss(mixRgb(base, black, 0.56)),
    '950': rgbTupleToCss(mixRgb(base, black, 0.68))
  };
};

/**
 * Calculate relative luminance of an RGB color (WCAG 2.1)
 * Returns a value between 0 (black) and 1 (white).
 */
const getRelativeLuminance = (r: number, g: number, b: number): number => {
  const toLinear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

/**
 * Determine whether text on a given RGB background should be dark or light.
 * Uses WCAG contrast ratio against white and black to pick the better foreground.
 */
export const getTextColorForBackground = (rgbString: string): 'dark' | 'light' => {
  const parts = rgbString.split(/\s+/).filter(Boolean).map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return 'light';
  }

  const luminance = getRelativeLuminance(parts[0], parts[1], parts[2]);
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  return contrastWithWhite > contrastWithBlack ? 'light' : 'dark';
};

const resolveAccentPalette = (value?: string | null): Record<string, string> | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed in ACCENT_COLORS) {
    return ACCENT_COLORS[trimmed as AccentColor];
  }
  const normalizedHex = normalizeHexColor(trimmed);
  if (!normalizedHex) return null;
  return buildPaletteFromHex(normalizedHex);
};

export function normalizeAccentColor(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed in ACCENT_COLORS) {
    return rgbStringToHex(ACCENT_COLORS[trimmed as AccentColor]['500']);
  }
  return normalizeHexColor(trimmed);
}

/**
 * Apply an accent color to the document root
 * Updates all accent color shades which are used in gradients and UI elements
 * @param color - The accent color to apply
 */
export function applyAccentColor(color: AccentColor | string): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const colorValues = resolveAccentPalette(color);
  if (!colorValues) return;
  const root = document.documentElement;

  // Apply accent color shades - these are used throughout the app
  // including in the radial gradient hotspots on the body background
  Object.entries(colorValues).forEach(([shade, rgb]) => {
    root.style.setProperty(`--accent-${shade}`, rgb);
  });
  root.style.setProperty('--accent-color', `rgb(${colorValues['500']})`);
  const accent500 = colorValues['500'];
  const textOnAccent = getTextColorForBackground(accent500);
  root.style.setProperty(
    '--accent-foreground',
    textOnAccent === 'dark' ? DARK_FOREGROUND_RGB : LIGHT_FOREGROUND_RGB
  );
}

/**
 * Get the current accent color from CSS variables
 * @returns The current accent color, or null if not found (default null)
 */
export function getCurrentAccentColor(): AccentColor | null {
  if (typeof window === 'undefined') return null;
  
  const root = document.documentElement;
  const accent500 = getComputedStyle(root).getPropertyValue('--accent-500').trim();
  
  if (!accent500) return null;

  // Match against known colors
  for (const [colorName, shades] of Object.entries(ACCENT_COLORS)) {
    if (shades['500'] === accent500) {
      return colorName as AccentColor;
    }
  }
  
  return null;
}

/**
 * Initialize accent color from a saved setting (practice details or legacy values)
 * Should be called on app startup
 */
export function initializeAccentColor(savedColor?: string | null): void {
  const requested = savedColor?.trim();
  if (requested && resolveAccentPalette(requested)) {
    applyAccentColor(requested);
    return;
  }
  applyAccentColor(DEFAULT_ACCENT_COLOR);
}

/**
 * Get display name for an accent color
 */
export function getAccentColorDisplayName(color: AccentColor): string {
  const names: Record<AccentColor, string> = {
    grey: 'Grey',
    gold: 'Gold (Default)',
    blue: 'Blue',
    green: 'Green',
    yellow: 'Yellow',
    pink: 'Pink',
    orange: 'Orange',
    purple: 'Purple',
  };
  
  return names[color] || 'Grey (Default)';
}
