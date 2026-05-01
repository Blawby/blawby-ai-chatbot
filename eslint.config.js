import js from '@eslint/js';
import { fixupPluginRules } from '@eslint/compat';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const loadingConsistency = require('./config/eslint-rules/loading-consistency.cjs');
const noInlineContextValue = require('./config/eslint-rules/no-inline-context-value.cjs');

export default [
  // Base JavaScript configuration
  js.configs.recommended,

  // Global ignores
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'worker/node_modules/**',
      'coverage/**',
      '.tmp/playwright/**',
      'test-logs-*/**',
      '*.min.js',
      '*.bundle.js',
      'sw.js',
      'workbox-*.js',
      'workbox-*.js.map',
      '.wrangler/tmp/**',
      '.wrangler/**',
      'worker/.wrangler/**',
      'public/OneSignalSDK*.js',
      'public/sw.js', // Service worker file
      'sync-organizations.js', // Node.js script with different globals
      'tailwind.config.js' // Config file with require()
    ]
  },

  // Application source (frontend TS/JS + JSX/TSX)
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        crypto: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': typescript,
      react: fixupPluginRules(react),
      'react-hooks': fixupPluginRules(reactHooks),
      'jsx-a11y': fixupPluginRules(jsxA11y),
      custom: {
        rules: {
          'loading-consistency': loadingConsistency,
          'no-inline-context-value': noInlineContextValue,
          'no-hardcoded-colors': {
            create(context) {
              const COLORS_REGEX = /text-white|text-black|bg-white|bg-black|\b(gray|zinc|neutral|stone|blue|indigo|purple|slate)-/;
              const MESSAGE = 'Prefer system tokens (surface-*, input-*, or accent-*) over hardcoded colors to ensure proper theme inversion.';
              return {
                'JSXAttribute[name.name="className"] Literal': (node) => {
                  if (typeof node.value === 'string' && COLORS_REGEX.test(node.value)) {
                    context.report({ node, message: MESSAGE });
                  }
                },
                'JSXAttribute[name.name="className"] TemplateElement': (node) => {
                  if (node.value.raw && COLORS_REGEX.test(node.value.raw)) {
                    context.report({ node, message: MESSAGE });
                  }
                }
              };
            }
          }
        },
      },
    },
    rules: {
      // TypeScript rules
      ...typescript.configs.recommended.rules,
      'no-undef': 'off', // Let TypeScript compiler handle DOM/ambient types
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_', 
        varsIgnorePattern: '^_', 
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true 
      }],
      '@typescript-eslint/no-explicit-any': 'error', // Enforce no explicit any
      '@typescript-eslint/no-non-null-assertion': 'warn', // TODO: consider stricter null safety later

      // React/JSX + hooks + a11y
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      // Relax some accessibility rules for development
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/media-has-caption': 'error',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/role-supports-aria-props': 'warn',
      'jsx-a11y/no-noninteractive-element-to-interactive-role': 'error',
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off', // using TS instead
      'react/jsx-key': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-no-undef': 'error',
      'react/no-unknown-property': 'warn', // Allow class instead of className in some cases
      'react/self-closing-comp': 'warn',
      'react-hooks/rules-of-hooks': 'error', // Keep this as error for safety
      'react-hooks/exhaustive-deps': 'error',

      // General best practices
      'no-console': 'off', // Allow console in development
      'no-debugger': 'error',
      'no-unused-vars': 'off', // handled by TS rule
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',

      // Custom loading consistency rule
      'custom/loading-consistency': 'error',
      'custom/no-inline-context-value': 'error',
      'custom/no-hardcoded-colors': 'warn',

      // Import guardrails: ban barrel import, namespace imports of icon/motion libs,
      // and the deleted/migrated ad-hoc store modules.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/shared/ui',
              message: 'Import from the specific path (e.g. @/shared/ui/Button) instead of the barrel.'
            },
            {
              name: '@/shared/stores/clientsStore',
              message: 'Removed in β. Use useQuery / queryCache instead.'
            },
            {
              name: '@/shared/stores/mattersStore',
              message: 'Removed in β. Use useQuery / queryCache instead.'
            },
            {
              name: '@/shared/stores/practiceTeamStore',
              message: 'Removed in β. Use usePracticeTeam (which goes through queryCache).'
            }
          ],
          patterns: [
            {
              group: ['@heroicons/react/*/index', '@heroicons/react/index'],
              message: 'Import individual icons by path (e.g. @heroicons/react/24/outline/CheckIcon).'
            }
          ]
        }
      ],

      // Project guardrails
      'no-restricted-syntax': [
        'error',
        {
          selector: 'a[href^="/"]',
          message: 'Use Link or navigate()/location.route() for in-app routes instead of internal <a href="/..."> anchors'
        },
        {
          selector: 'ImportDeclaration[source.value=/LoadingIndicator/]',
          message: 'Import LoadingIndicator from shared/ui/layout instead of local definitions'
        },
        {
          selector: 'ClassDeclaration[id=/LoadingSpinner|LoadingBlock|LoadingScreen|SkeletonLoader/]',
          message: 'Use shared loading components from shared/ui/layout instead of redeclaring'
        },
        {
          selector: 'JSXAttribute[name.name="className"] > Literal[value=/animate-spin/]',
          message: 'Use LoadingSpinner component instead of inline animate-spin classes'
        },
        {
          selector: 'TSTypeAliasDeclaration[id.name=/^Backend/]',
          message: 'Backend wire types live in worker/types/wire/ — import from @/shared/types/wire instead of redeclaring inline.'
        },
        {
          selector: 'TSInterfaceDeclaration[id.name=/^Backend/]',
          message: 'Backend wire types live in worker/types/wire/ — import from @/shared/types/wire instead of redeclaring inline.'
        }
      ],
    },
    settings: {
      react: {
        version: 'detect',
        pragma: 'h'
      }
    }
  },

  
  // Worker files (Cloudflare Workers runtime)
  {
    files: ['worker/**/*.{ts,js}'],
    ignores: ['worker/types/wire/**'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: {
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        ReadableStream: 'readonly',
        WritableStream: 'readonly',
        TransformStream: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        addEventListener: 'readonly',
        removeEventListener: 'readonly',
        dispatchEvent: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        RequestInit: 'readonly',
        Buffer: 'readonly',
        process: 'readonly',
        ReadableStreamDefaultController: 'readonly',
        ExecutionContext: 'readonly', // TODO: validate Worker typing approach
        MessageBatch: 'readonly',
        BodyInit: 'readonly'
      }
    },
    plugins: { '@typescript-eslint': typescript },
    rules: {
      ...typescript.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_', 
        varsIgnorePattern: '^_', 
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true 
      }],
      '@typescript-eslint/no-explicit-any': 'error', // Enforce no explicit any
      'no-console': 'off', // keep console logging for Workers (debugging/forensics)
      'no-unused-vars': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSTypeAliasDeclaration[id.name=/^Backend/]',
          message: 'Backend wire types live in worker/types/wire/ — declare there, not inline.'
        },
        {
          selector: 'TSInterfaceDeclaration[id.name=/^Backend/]',
          message: 'Backend wire types live in worker/types/wire/ — declare there, not inline.'
        }
      ]
    }
  },

  // Worker wire schema files deliberately declare Backend* wire contracts.
  {
    files: ['worker/types/wire/**/*.{ts,js}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': typescript },
    rules: {
      ...typescript.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-unused-vars': 'off',
      'no-restricted-syntax': 'off',
    }
  },

  // Node.js scripts
  {
    files: ['scripts/**/*.{js,ts,mjs}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly'
      }
    },
    plugins: { '@typescript-eslint': typescript },
    rules: {
      ...typescript.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_', 
        varsIgnorePattern: '^_', 
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true 
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'off', // console useful in scripts
      'no-unused-vars': 'off'
    }
  },

  // Root config files (Node environment)
  {
    files: ['*.config.{js,ts,mjs}', 'vite.config.ts', 'config/vitest/*.ts', 'tailwind.config.js', 'postcss.config.js'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly'
      }
    },
    plugins: { '@typescript-eslint': typescript },
    rules: {
      ...typescript.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_', 
        varsIgnorePattern: '^_', 
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true 
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'off',
      'no-unused-vars': 'off'
    }
  },

  // Frontend tests (browser environment + vitest)
  {
    files: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}', 'tests/unit/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      },
      globals: {
        // Test framework globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
        vitest: 'readonly',
        // Browser globals for frontend tests
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        crypto: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': typescript,
      react: fixupPluginRules(react),
      'react-hooks': fixupPluginRules(reactHooks),
      'jsx-a11y': fixupPluginRules(jsxA11y)
    },
    rules: {
      ...typescript.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_', 
        varsIgnorePattern: '^_', 
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true 
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off', // tests often assert non-null
      '@typescript-eslint/no-require-imports': 'off', // allow require in tests
      'no-console': 'off', // console useful in tests
      'no-unused-vars': 'off', // handled by TS rule
      'no-undef': 'off', // Let TypeScript compiler handle DOM/ambient types
      // React rules for test files
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off'
    },
    settings: {
      react: {
        version: 'detect',
        pragma: 'h'
      }
    }
  },

  // Worker tests (Cloudflare Workers environment + vitest)
  {
    files: ['worker/**/*.{test,spec}.{ts,js}', 'tests/integration/**/*.{ts,js}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        // Test framework globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
        vitest: 'readonly',
        // Worker/Cloudflare globals for worker tests
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        ReadableStream: 'readonly',
        WritableStream: 'readonly',
        TransformStream: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        addEventListener: 'readonly',
        removeEventListener: 'readonly',
        dispatchEvent: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        // Cloudflare Workers globals
        ExecutionContext: 'readonly',
        MessageBatch: 'readonly',
        BodyInit: 'readonly',
        // Service Worker globals
        self: 'readonly',
        event: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': typescript
    },
    rules: {
      ...typescript.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_', 
        varsIgnorePattern: '^_', 
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true 
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off', // tests often assert non-null
      '@typescript-eslint/no-require-imports': 'off', // allow require in tests
      'no-console': 'off', // console useful in tests
      'no-unused-vars': 'off', // handled by TS rule
      'no-undef': 'off'
    }
  },

  // Node.js tests (Node environment + vitest)
  {
    files: ['scripts/**/*.{test,spec}.{ts,js,mjs}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        // Test framework globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
        vitest: 'readonly',
        // Node.js globals for Node tests
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': typescript
    },
    rules: {
      ...typescript.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_', 
        varsIgnorePattern: '^_', 
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true 
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off', // tests often assert non-null
      '@typescript-eslint/no-require-imports': 'off', // allow require in tests
      'no-console': 'off', // console useful in tests
      'no-unused-vars': 'off', // handled by TS rule
      'no-undef': 'off'
    }
  }
];
