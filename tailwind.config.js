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

        // Ink (text) tokens
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        'ink-2': 'rgb(var(--ink-2-rgb) / <alpha-value>)',
        'ink-3': 'rgb(var(--ink-3-rgb) / <alpha-value>)',
        dim: 'rgb(var(--dim-rgb) / <alpha-value>)',
        'dim-2': 'rgb(var(--dim-2-rgb) / <alpha-value>)',

        // Rule (border)
        rule: 'rgb(var(--rule-rgb) / <alpha-value>)',

        // Accent — single gold
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        'accent-deep': 'rgb(var(--accent-deep-rgb) / <alpha-value>)',
        'accent-ink': 'rgb(var(--accent-ink-rgb) / <alpha-value>)',

        // Semantic status
        pos: 'rgb(var(--pos-rgb) / <alpha-value>)',
        warn: 'rgb(var(--warn-rgb) / <alpha-value>)',
        neg: 'rgb(var(--neg-rgb) / <alpha-value>)',
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
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/container-queries'),
  ],
}
