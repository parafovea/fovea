import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
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
