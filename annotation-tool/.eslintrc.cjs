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
      },
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
