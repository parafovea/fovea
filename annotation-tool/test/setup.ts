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
  server.listen({ onUnhandledRequest: 'warn' })
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

/**
 * Polyfill PointerEvent for jsdom.
 *
 * jsdom (any version through 27) does not implement PointerEvent, but Base
 * UI (shadcn's upstream primitives for Checkbox, Dialog close triggers,
 * Menu, Popover, Select, etc.) dispatches pointer events in its click
 * handlers. Without this shim, a React Testing Library ``userEvent.click``
 * bubbles into ``new PointerEvent(...)`` inside Base UI and throws a
 * process-level ``ReferenceError: PointerEvent is not defined``, which
 * Vitest surfaces as an "Uncaught Exception" and marks the whole test file
 * as failed.
 *
 * The shim delegates to ``MouseEvent`` (which jsdom does implement) while
 * copying over ``pointerId``, ``pointerType``, and ``isPrimary`` that Base
 * UI reads on the event object. This is deliberately minimal — it is not a
 * spec-accurate PointerEvent implementation, just enough surface for
 * headless-DOM click paths.
 */
if (typeof globalThis.PointerEvent === 'undefined') {
  interface PointerEventInitLike extends MouseEventInit {
    pointerId?: number
    pointerType?: string
    isPrimary?: boolean
  }

  class PointerEventShim extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean

    constructor(type: string, init: PointerEventInitLike = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? ''
      this.isPrimary = init.isPrimary ?? false
    }
  }

  globalThis.PointerEvent = PointerEventShim as unknown as typeof PointerEvent
  ;(window as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent =
    PointerEventShim as unknown as typeof PointerEvent
}

/**
 * Element-level pointer-capture methods are likewise missing in jsdom.
 * Base UI Radio/Checkbox roots call ``hasPointerCapture``/``setPointerCapture``
 * inside their pointerdown handler; both are no-ops here.
 */
if (typeof Element !== 'undefined') {
  if (!('hasPointerCapture' in Element.prototype)) {
    Element.prototype.hasPointerCapture = (): boolean => false
  }
  if (!('setPointerCapture' in Element.prototype)) {
    Element.prototype.setPointerCapture = (): void => {}
  }
  if (!('releasePointerCapture' in Element.prototype)) {
    Element.prototype.releasePointerCapture = (): void => {}
  }
}
