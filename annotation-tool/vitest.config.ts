import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'
import fs from 'fs'

// Closes issue #122 (vitest + pnpm dual-React useContext null). In a
// pnpm workspace, react@18.3.1 lives at TWO physical paths:
//   1) /fovea/annotation-tool/node_modules/.pnpm/react@18.3.1/...
//   2) /fovea/node_modules/.pnpm/react@18.3.1/...
// pnpm decides at install time which packages get which copy. The
// react-dom@18.3.1 build that ships at the workspace root resolves its
// React peer dependency via a relative `../../react@18.3.1/...` link
// from inside its own .pnpm folder, which deterministically lands on
// copy (2). So the rule is: when react-dom is hoisted to the workspace
// root, every component that calls a React hook MUST also resolve to
// copy (2), otherwise MUI's useTheme (or any other hook caller resolved
// against copy (1)) reads from a null dispatcher because the renderer
// set the dispatcher on copy (2). We canonicalise the React import to
// copy (2) by following `react-dom`'s symlinked sibling — that gives us
// one source of truth that survives any future pnpm re-layout, since
// it is by definition the same React the workspace's react-dom is
// linked against.
const reactDomRealpath = fs.realpathSync(path.resolve(__dirname, 'node_modules/react-dom'))
const reactPath = path.resolve(path.dirname(reactDomRealpath), 'react')
const reactDomPath = reactDomRealpath

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  // Pre-bundle MUI and Emotion through Vite so their internal `import
  // "react"` calls go through our resolve.alias above — without this,
  // vitest's CJS interop hands MUI off to Node's resolver which finds
  // the OTHER physical react copy and breaks the dispatcher singleton.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      '@mui/material',
      '@mui/system',
      '@mui/icons-material',
      '@emotion/react',
      '@emotion/styled',
    ],
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@emotion/react', '@emotion/styled'],
    alias: {
      // Force a single physical React resolution across the workspace
      // (see header comment for the dual-React root cause).
      react: reactPath,
      'react-dom': reactDomPath,
      'react/jsx-runtime': path.join(reactPath, 'jsx-runtime'),
      'react/jsx-dev-runtime': path.join(reactPath, 'jsx-dev-runtime'),
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@store': path.resolve(__dirname, './src/store'),
      '@models': path.resolve(__dirname, './src/models'),
      '@api': path.resolve(__dirname, './src/api'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@services': path.resolve(__dirname, './src/services'),
      '@test': path.resolve(__dirname, './test'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    testTimeout: 10000,
    // Inline MUI / Emotion (and anything that depends on React) so vite's
    // SSR-style externalisation does not give those packages their own
    // physically-separate React copy. With `inline`, vite resolves
    // `react` from these packages through the same dedupe/alias chain
    // configured above, which is the only way to guarantee a single
    // React.useContext dispatcher across the entire render tree under
    // pnpm's nested-symlink layout. (Closes #122.)
    server: {
      deps: {
        inline: [
          /^@mui\//,
          /^@emotion\//,
          /^@base-ui\//,
        ],
      },
    },
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/',
        'dist/',
        '**/*.stories.tsx'
      ],
      thresholds: {
        statements: 30,
        branches: 75,
        functions: 35,
        lines: 30
      }
    },
    include: ['**/*.{test,spec}.{ts,tsx}'],
    reporters: ['default', 'html', 'json'],
    outputFile: {
      json: './coverage/test-results.json'
    }
  }
})
