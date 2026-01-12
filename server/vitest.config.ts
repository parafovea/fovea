import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Vitest configuration for the backend server.
 * Tests run in Node.js environment with coverage reporting.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@models': path.resolve(__dirname, './src/models'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@middleware': path.resolve(__dirname, './src/middleware'),
      '@routes': path.resolve(__dirname, './src/routes'),
      '@services': path.resolve(__dirname, './src/services'),
      '@queues': path.resolve(__dirname, './src/queues'),
      '@repositories': path.resolve(__dirname, './src/repositories'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true  // Run all tests in a single process sequentially
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.d.ts',
        '**/*.config.*',
        'dist/',
        'src/index.ts'
      ],
      thresholds: {
        statements: 50,
        branches: 65,
        functions: 65,
        lines: 50
      }
    },
    include: ['**/*.{test,spec}.{ts,js}'],
    reporters: ['default', 'html', 'json'],
    outputFile: {
      json: './coverage/test-results.json'
    }
  }
})
