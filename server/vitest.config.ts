import { defineConfig } from 'vitest/config'

/**
 * Vitest configuration for the backend server.
 * Tests run in Node.js environment with coverage reporting.
 */
export default defineConfig({
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
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80
      }
    },
    include: ['**/*.{test,spec}.{ts,js}'],
    reporters: ['default', 'html', 'json'],
    outputFile: {
      json: './coverage/test-results.json'
    }
  }
})
