module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    // Single-source-of-truth for env: `import.meta.env` (VITE_* vars and the
    // Vite built-ins PROD/DEV/MODE/BASE_URL) may only be read in src/config.ts.
    // The selector targets the `.env` member of the `import.meta` MetaProperty,
    // catching `import.meta.env.VITE_X`, `import.meta.env.PROD`, etc. Exempted:
    // src/config.ts (the source of truth), src/vite-env.d.ts (the type
    // declaration), and test files. The two MSW tree-shaking guards
    // (main.tsx, mocks/tourDemo/browser.ts) and the data-layer fixture gate
    // (mocks/tourDemo/handlers.ts) keep an inline read behind a scoped
    // `eslint-disable-next-line no-restricted-syntax` so Rollup can statically
    // fold them; routing those through config would defeat tree-shaking.
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "MemberExpression[object.type='MetaProperty'][property.name='env']",
        message:
          'Read env via the typed `config` object from src/config.ts, not `import.meta.env`. config.ts is the only module permitted to read import.meta.env. (The MSW tree-shaking guards keep a scoped eslint-disable inline.)',
      },
    ],
    // Demo-layer isolation: product code (anywhere under src/ that is
    // not itself the demo layer) and tours code may not import from
    // src/demo/. The demo layer can import from anywhere; product code
    // can import from src/tours/ freely. See CVPR_2026_DEMO_PLAN.md §6.2.
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/demo/**', '@/demo/**', '@demo/**'],
            message:
              'Product code and tours code may not import from src/demo/. Tours are a product feature; the demo layer is a flag-gated deployment concern. If you need shared logic, lift it into src/tours/ or src/lib/.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.spec.ts', '**/*.test.ts', '**/*.spec.tsx', '**/*.test.tsx'],
      rules: {
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_|^test|^page$|^db$|^annotationWorkspace$|^ontologyWorkspace$|^objectWorkspace$|^videoBrowser$' }],
        // Tests may stub/inspect import.meta.env directly (e.g.
        // services/wikidataConfig.test.ts bulk-manipulates it).
        'no-restricted-syntax': 'off',
      },
    },
    {
      // The single source of truth and the Vite ambient type declaration are
      // the only non-test files permitted to reference import.meta.env.
      files: ['src/config.ts', 'src/vite-env.d.ts'],
      rules: { 'no-restricted-syntax': 'off' },
    },
    {
      // The demo layer itself is allowed to import from anywhere,
      // including its own internals.
      files: ['src/demo/**/*'],
      rules: { 'no-restricted-imports': 'off' },
    },
    {
      // main.tsx is the bootstrap integration point — it decides
      // between mounting the stock <App /> and mounting the demo
      // shell that wraps it. That's a deployment-mode choice, not a
      // product-feature decision, so the restriction doesn't apply.
      files: ['src/main.tsx'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
}
