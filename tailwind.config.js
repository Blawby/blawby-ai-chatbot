const lineColor = (rgbVar, alphaVar) => ({ opacityValue } = {}) => {
  if (opacityValue === undefined) {
    return `rgb(var(${rgbVar}) / var(${alphaVar}))`;
  }
  return `rgb(var(${rgbVar}) / calc(${opacityValue} * var(${alphaVar})))`;
};

/**
 * Responsive breakpoint conventions
 * ---------------------------------
 * Default Tailwind viewport breakpoints are kept as-is:
 *   sm: 640px · md: 768px · lg: 1024px · xl: 1280px · 2xl: 1536px
 * Plus one custom screen below: `short` ((max-height: 500px)).
 *
 * When to use viewport queries (`sm:` / `md:` / `lg:` / ...):
 *   - The shell, sidebar, and routing chrome (AppShell, Sidebar, MainApp).
 *   - Anything whose layout depends on the actual viewport, not container width.
 *
 * When to use container queries (`@sm:` / `@md:` / `@lg:` / ...):
 *   - Components rendered inside the workspace shell (their available width
 *     changes with sidebar state and inspector panes — the viewport doesn't
 *     reflect what the component actually has to work with).
 *   - Cards, grids, forms, detail panes.
 *
 * Design-system color/font/radius/shadow utilities are sourced from
 * `src/design-system/tokens.css`. Each DS color token is exposed here as a
 * Tailwind utility (e.g. `bg-paper`, `text-ink`, `bg-accent/20`) backed by
 * the `--token-rgb` triplet for `<alpha-value>` interpolation.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/design-system/**/*.{css,tsx,ts}",
  ],
  darkMode: ['selector', ':is([data-theme="dark"],[data-theme="midnight"])'],
  theme: {
    extend: {
      screens: {
        short: { raw: '(max-height: 500px)' }
      },
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['"Source Serif 4"', '"Source Serif Pro"', 'Georgia', 'serif'],
        mono: ['"Geist Mono"', 'ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        // Surface tokens
        paper: 'rgb(var(--paper-rgb) / <alpha-value>)',
        'paper-2': 'rgb(var(--paper-2-rgb) / <alpha-value>)',
        'paper-edge': 'rgb(var(--paper-edge-rgb) / <alpha-value>)',
        card: 'rgb(var(--card-rgb) / <alpha-value>)',
        'surface-page': 'rgb(var(--surface-page) / <alpha-value>)',
        'surface-base': 'rgb(var(--surface-base) / <alpha-value>)',
        'surface-workspace': 'rgb(var(--surface-workspace) / <alpha-value>)',
        'surface-card': 'rgb(var(--surface-card) / <alpha-value>)',
        'surface-card-hover': 'rgb(var(--surface-card-hover) / <alpha-value>)',
        'surface-panel': 'rgb(var(--surface-panel) / <alpha-value>)',
        'surface-overlay': 'rgb(var(--surface-overlay) / <alpha-value>)',
        'surface-app-frame': 'rgb(var(--surface-app-frame) / <alpha-value>)',
        'surface-utility': 'rgb(var(--surface-utility) / <alpha-value>)',

        // Ink (text) tokens
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        'ink-2': 'rgb(var(--ink-2-rgb) / <alpha-value>)',
        'ink-3': 'rgb(var(--ink-3-rgb) / <alpha-value>)',
        dim: 'rgb(var(--dim-rgb) / <alpha-value>)',
        'dim-2': 'rgb(var(--dim-2-rgb) / <alpha-value>)',
        'text-primary': 'rgb(var(--text-primary) / <alpha-value>)',
        'text-secondary': 'rgb(var(--text-secondary) / <alpha-value>)',
        'text-muted': 'rgb(var(--text-muted) / <alpha-value>)',
        'input-text': 'rgb(var(--input-text) / <alpha-value>)',
        'input-foreground': 'rgb(var(--input-foreground) / <alpha-value>)',
        'input-placeholder': 'rgb(var(--input-placeholder) / <alpha-value>)',

        // Rule (border)
        rule: 'rgb(var(--rule-rgb) / <alpha-value>)',
        'rule-soft': 'var(--rule-soft)',
        'border-subtle': 'rgb(var(--border-subtle) / <alpha-value>)',
        'line-subtle': lineColor('--line-subtle-rgb', '--line-subtle-alpha'),
        'line-default': lineColor('--line-default-rgb', '--line-default-alpha'),
        'line-utility': lineColor('--line-utility-rgb', '--line-utility-alpha'),
        'line-emphasized': lineColor('--line-emphasized-rgb', '--line-emphasized-alpha'),
        'line-glass': lineColor('--line-glass-rgb', '--line-glass-alpha'),
        primary: 'rgb(var(--accent-rgb) / <alpha-value>)',

        // Accent — single gold
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        'accent-deep': 'rgb(var(--accent-deep-rgb) / <alpha-value>)',
        'accent-ink': 'rgb(var(--accent-ink-rgb) / <alpha-value>)',

        // Semantic status
        pos: 'rgb(var(--pos-rgb) / <alpha-value>)',
        warn: 'rgb(var(--warn-rgb) / <alpha-value>)',
        neg: 'rgb(var(--neg-rgb) / <alpha-value>)',
        'error-foreground': 'rgb(var(--error-foreground) / <alpha-value>)',

        // Upload file color tokens
        'light-file-type-pdf': 'rgb(var(--light-file-type-pdf) / <alpha-value>)',
        'light-file-type-image': 'rgb(var(--light-file-type-image) / <alpha-value>)',
        'light-file-type-video': 'rgb(var(--light-file-type-video) / <alpha-value>)',
        'light-file-type-audio': 'rgb(var(--light-file-type-audio) / <alpha-value>)',
        'light-file-type-code': 'rgb(var(--light-file-type-code) / <alpha-value>)',
        'light-file-type-archive': 'rgb(var(--light-file-type-archive) / <alpha-value>)',
        'light-file-type-spreadsheet': 'rgb(var(--light-file-type-spreadsheet) / <alpha-value>)',
        'light-file-type-document': 'rgb(var(--light-file-type-document) / <alpha-value>)',
        'light-file-type-default': 'rgb(var(--light-file-type-default) / <alpha-value>)',
        'dark-file-type-pdf': 'rgb(var(--dark-file-type-pdf) / <alpha-value>)',
        'dark-file-type-image': 'rgb(var(--dark-file-type-image) / <alpha-value>)',
        'dark-file-type-video': 'rgb(var(--dark-file-type-video) / <alpha-value>)',
        'dark-file-type-audio': 'rgb(var(--dark-file-type-audio) / <alpha-value>)',
        'dark-file-type-code': 'rgb(var(--dark-file-type-code) / <alpha-value>)',
        'dark-file-type-archive': 'rgb(var(--dark-file-type-archive) / <alpha-value>)',
        'dark-file-type-spreadsheet': 'rgb(var(--dark-file-type-spreadsheet) / <alpha-value>)',
        'dark-file-type-document': 'rgb(var(--dark-file-type-document) / <alpha-value>)',
        'dark-file-type-default': 'rgb(var(--dark-file-type-default) / <alpha-value>)',
        'light-file-progress-bg': 'rgb(var(--light-file-progress-bg) / <alpha-value>)',
        'light-file-progress-fill': 'rgb(var(--light-file-progress-fill) / <alpha-value>)',
        'dark-file-progress-bg': 'rgb(var(--dark-file-progress-bg) / <alpha-value>)',
        'dark-file-progress-fill': 'rgb(var(--dark-file-progress-fill) / <alpha-value>)',
      },
      borderRadius: {
        'r-xs': 'var(--r-xs)',
        'r-sm': 'var(--r-sm)',
        'r-md': 'var(--r-md)',
        'r-lg': 'var(--r-lg)',
      },
      boxShadow: {
        '1': 'var(--shadow-1)',
        '2': 'var(--shadow-2)',
        '3': 'var(--shadow-3)',
        glass: 'var(--glass-rim-subtle)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/container-queries'),
  ],
}
