import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { handlers } from './mocks/handlers.js'

declare global {
  // eslint-disable-next-line no-var
  var IntersectionObserver: typeof IntersectionObserver
  // eslint-disable-next-line no-var
  var ResizeObserver: typeof ResizeObserver
}

/**
 * MSW server instance for intercepting network requests in tests.
 */
export const server = setupServer(...handlers)

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})

/**
 * Mock IntersectionObserver for components that use it.
 * Many UI components rely on this browser API which is not available in jsdom.
 */
globalThis.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
})) as unknown as typeof IntersectionObserver

/**
 * Mock ResizeObserver for components that use it.
 * Required by some Material-UI components.
 */
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
})) as unknown as typeof ResizeObserver

/**
 * Mock matchMedia for responsive components.
 * Required by Material-UI and other responsive UI libraries.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
