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
 * Reference patterns to mirror:
 *   - src/shared/ui/layout/FormGrid.tsx           — @container + @md:grid-cols-2
 *   - src/shared/ui/layout/ResponsiveDefinitionGrid.tsx
 *   - src/features/matters/components/MatterSummaryCards.tsx
 *
 * Tracking: see docs/engineering/responsive-audit.md for per-file status.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        short: { raw: '(max-height: 500px)' }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      // Custom color scheme - keeping your custom colors
      colors: {
        surface: {
          app: 'rgb(var(--surface-app) / <alpha-value>)',
          sidebar: 'rgb(var(--surface-sidebar) / <alpha-value>)',
          header: 'rgb(var(--surface-header) / <alpha-value>)',
          page: 'rgb(var(--surface-page) / <alpha-value>)',
          section: 'rgb(var(--surface-section) / <alpha-value>)',
          input: 'rgb(var(--surface-input) / <alpha-value>)',
          popover: 'rgb(var(--surface-popover) / <alpha-value>)',
          modal: 'rgb(var(--surface-modal) / <alpha-value>)',
          base: 'rgb(var(--surface-base) / <alpha-value>)',
          overlay: 'rgb(var(--surface-overlay) / <alpha-value>)',
          'nav-rail': 'rgb(var(--surface-nav-rail))',
          'nav-secondary': 'rgb(var(--surface-nav-secondary))',
          'list-panel': 'rgb(var(--surface-list-panel))',
          'inspector': 'rgb(var(--surface-inspector))',
          glass: 'rgb(var(--surface-glass) / <alpha-value>)',
          'app-frame': 'rgb(var(--surface-app-frame) / <alpha-value>)',
          navigation: 'rgb(var(--surface-navigation) / <alpha-value>)',
          collection: 'rgb(var(--surface-collection) / <alpha-value>)',
          workspace: 'rgb(var(--surface-workspace) / <alpha-value>)',
          utility: 'rgb(var(--surface-utility) / <alpha-value>)',
          elevated: 'rgb(var(--surface-elevated) / <alpha-value>)',
          panel: 'rgb(var(--surface-panel) / <alpha-value>)',
          card: 'rgb(var(--surface-card) / <alpha-value>)',
          hover: 'rgb(var(--surface-card-hover) / <alpha-value>)',
          'card-hover': 'rgb(var(--surface-card-hover) / <alpha-value>)',
          'card-raised': 'rgb(var(--surface-card-raised) / <alpha-value>)',
        },
        // Solid card surface — normal dashboard cards should stay neutral, not glassy.
        // Use bg-card / border-card-border for card-like surfaces that should NOT be translucent.
        card: {
          DEFAULT: 'rgb(var(--surface-card) / <alpha-value>)',
          border: 'rgb(var(--border-subtle) / <alpha-value>)',
        },
        line: {
          glass: 'rgb(var(--line-glass) / <alpha-value>)',
          utility: 'rgb(var(--line-utility) / <alpha-value>)',
          subtle: 'rgb(var(--border-subtle) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
        },
        input: {

          text: 'rgb(var(--input-text) / <alpha-value>)',
          placeholder: 'rgb(var(--input-placeholder) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
          disabled: 'rgb(var(--text-disabled) / <alpha-value>)',
        },
        // Primary colors (brand colors - dark blue theme)
        primary: {
          50: 'rgb(var(--accent-50) / <alpha-value>)',
          100: 'rgb(var(--accent-100) / <alpha-value>)',
          200: 'rgb(var(--accent-200) / <alpha-value>)',
          300: 'rgb(var(--accent-300) / <alpha-value>)',
          400: 'rgb(var(--accent-400) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)',
          700: 'rgb(var(--accent-700) / <alpha-value>)',
          800: 'rgb(var(--accent-800) / <alpha-value>)',
          900: 'rgb(var(--accent-900) / <alpha-value>)',
          950: 'rgb(var(--accent-950) / <alpha-value>)',
        },
        // Accent colors (dynamic via CSS variables)
        accent: {
          50: 'rgb(var(--accent-50) / <alpha-value>)',
          100: 'rgb(var(--accent-100) / <alpha-value>)',
          200: 'rgb(var(--accent-200) / <alpha-value>)',
          300: 'rgb(var(--accent-300) / <alpha-value>)',
          400: 'rgb(var(--accent-400) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)',
          700: 'rgb(var(--accent-700) / <alpha-value>)',
          800: 'rgb(var(--accent-800) / <alpha-value>)',
          900: 'rgb(var(--accent-900) / <alpha-value>)',
          950: 'rgb(var(--accent-950) / <alpha-value>)',
          error: 'rgb(var(--error-foreground) / <alpha-value>)',
          success: 'rgb(var(--success-foreground) / <alpha-value>)',
          warning: 'rgb(var(--warning-foreground) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
          utility: 'rgb(var(--accent-utility) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft))',
          muted: 'rgb(var(--accent-muted))',
          border: 'rgb(var(--accent-border))',
          ring: 'rgb(var(--accent-ring))',
        },
        // Light theme colors

        // Dark theme colors

      },
      boxShadow: {

        glass: 'var(--shadow-glass)',
      },

    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/container-queries'),
  ],
}
