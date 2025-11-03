import { beforeAll, afterAll, afterEach, vi } from 'vitest'

/**
 * Global test setup for backend tests.
 * This file is run before all tests via vitest.config.ts setupFiles.
 */

beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test'
  process.env.FOVEA_MODE = 'multi-user'
  process.env.MODEL_SERVICE_URL = 'http://localhost:8000'
  process.env.API_KEY_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  process.env.COOKIE_SECRET = 'test-cookie-secret-min-32-chars!!'
})

afterEach(() => {
  // Clear all mocks after each test
  vi.clearAllMocks()
})

afterAll(() => {
  // Clean up after all tests
  vi.restoreAllMocks()
})

/**
 * Mock console methods to reduce noise in test output.
 * Uncomment if you want to suppress console logs during tests.
 */
// global.console = {
//   ...console,
//   log: vi.fn(),
//   debug: vi.fn(),
//   info: vi.fn(),
//   warn: vi.fn(),
//   error: vi.fn(),
// }
