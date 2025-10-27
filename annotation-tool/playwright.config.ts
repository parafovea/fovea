import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E Test Configuration
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './test/e2e',
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },

  projects: [
    // Smoke tests - critical path, fast, high reliability
    {
      name: 'smoke',
      testDir: './test/e2e/smoke',
      timeout: 30000,
      retries: 2,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 }
      }
    },

    // Regression tests - full coverage
    // Note: Uses workers: 1 to avoid race conditions in single-user mode
    // All tests share the same default user and WorldState database record
    // Parallel execution causes tests to overwrite each other's data
    // See E2E_TEST_ISOLATION_ANALYSIS.md for permanent solution (worker-specific users)
    {
      name: 'regression',
      testDir: './test/e2e/regression',
      timeout: 60000,
      retries: 1,
      workers: 1,  // Serial execution required for test isolation
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 }
      }
    }
  ]

  // Web server for E2E tests
  // Note: When using docker-compose.e2e.yml, the server is already running on port 3000
  // Uncomment this if you want Playwright to manage the dev server instead:
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:5173',
  //   timeout: 120000,
  //   reuseExistingServer: !process.env.CI
  // }
})
