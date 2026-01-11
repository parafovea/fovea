import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
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
