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
  // Workers configured per-project to allow different parallelization strategies
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
      workers: undefined,  // Use all available cores
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 }
      }
    },

    // Functional tests - feature behavior and keyboard shortcuts
    // Tests verify core features work correctly including keyboard shortcut execution
    // and browser capture prevention
    {
      name: 'functional',
      testDir: './test/e2e/functional',
      timeout: 45000,
      retries: 1,
      workers: process.env.CI ? 5 : undefined,  // 5 workers in CI, use all cores locally
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 }
      }
    },

    // Regression tests - full coverage
    // Uses parallel execution with worker-scoped users for optimal performance
    // Each worker creates isolated test user with separate WorldState
    // Admin endpoint used for cleanup between tests (ALLOW_TEST_ADMIN_BYPASS=true)
    // See test/e2e/fixtures/test-context.ts for worker-scoped user implementation
    {
      name: 'regression',
      testDir: './test/e2e/regression',
      timeout: 60000,
      retries: 1,
      workers: process.env.CI ? 5 : undefined,  // 5 workers in CI, use all cores locally
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 }
      }
    },

    // Accessibility tests - WCAG 2.1 AA compliance validation
    // Tests keyboard navigation, screen reader compatibility, and ARIA attributes
    // Uses axe-core for automated accessibility auditing
    {
      name: 'accessibility',
      testDir: './test/e2e/accessibility',
      timeout: 45000,
      retries: 1,
      workers: process.env.CI ? 5 : undefined,  // Same parallelization as regression tests
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        // Enable accessibility tree in Chrome DevTools
        launchOptions: {
          args: ['--force-renderer-accessibility']
        }
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
