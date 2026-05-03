/** @type {import('tailwindcss').Config} */
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
          panel: 'rgb(var(--surface-panel) / <alpha-value>)',
        },
        line: {
          glass: 'rgb(var(--line-glass) / <alpha-value>)',
          utility: 'rgb(var(--line-utility) / <alpha-value>)',
        },
        input: {

          text: 'rgb(var(--input-text) / <alpha-value>)',
          placeholder: 'rgb(var(--input-placeholder) / <alpha-value>)',
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
