/**
 * Test utilities for React components.
 *
 * Following industry standards from TkDodo's blog (https://tkdodo.eu/blog/testing-react-query)
 * and official TanStack Query testing guide (https://tanstack.com/query/v5/docs/react/guides/testing):
 *
 * - Each test gets a fresh QueryClient for complete isolation
 * - MSW is used for API mocking at the network level (configured in test/setup.ts)
 * - No Redux - state management uses TanStack Query (server) + Zustand (client)
 */

import { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

/**
 * Extended render options for test utilities.
 */
interface ExtendedRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[]
  withRouter?: boolean
  queryClient?: QueryClient
}

/**
 * Creates a QueryClient configured for testing.
 * Each test should use a fresh QueryClient for isolation.
 *
 * Configuration follows TkDodo's recommendations:
 * - retry: false - prevents test timeouts on error scenarios
 * - gcTime: 0 - prevents cache from affecting other tests
 * - staleTime: 0 - ensures fresh fetches
 *
 * @returns A QueryClient instance configured for testing
 *
 * @example
 * ```tsx
 * const queryClient = createTestQueryClient()
 * ```
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

/**
 * Creates a wrapper component for testing.
 * Each call creates a new QueryClient for test isolation.
 *
 * Use this pattern when you need a wrapper for renderHook:
 * ```tsx
 * const { result } = renderHook(() => useCustomHook(), {
 *   wrapper: createWrapper(),
 * })
 * ```
 *
 * @param queryClient - Optional custom QueryClient (defaults to createTestQueryClient())
 * @returns A React component wrapper
 */
export function createWrapper(queryClient?: QueryClient) {
  const client = queryClient || createTestQueryClient()
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      {children}
    </QueryClientProvider>
  )
}

/**
 * Custom render function that wraps components with required providers.
 *
 * Following TkDodo's pattern: "each test its own QueryClientProvider and create
 * a new QueryClient for each test. That way, tests are completely isolated."
 *
 * @param ui - The component to render
 * @param options - Additional render options
 * @returns Render result from @testing-library/react
 *
 * @example
 * ```tsx
 * import { renderWithProviders } from '@test/utils/test-utils'
 *
 * test('renders component with providers', () => {
 *   const { getByText } = renderWithProviders(<MyComponent />)
 *   expect(getByText('Hello')).toBeInTheDocument()
 * })
 *
 * test('renders with router', () => {
 *   const { getByText } = renderWithProviders(<MyComponent />, {
 *     withRouter: true,
 *     initialEntries: ['/some-path']
 *   })
 * })
 * ```
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    initialEntries = ['/'],
    withRouter = false,
    queryClient,
    ...renderOptions
  }: ExtendedRenderOptions = {}
) {
  const client = queryClient || createTestQueryClient()

  function Wrapper({ children }: { children: React.ReactNode }) {
    const content = (
      <QueryClientProvider client={client}>
        {children}
      </QueryClientProvider>
    )

    if (withRouter) {
      return (
        <MemoryRouter initialEntries={initialEntries}>
          {content}
        </MemoryRouter>
      )
    }

    return content
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

/**
 * Waits for a condition to be true, polling at regular intervals.
 * Useful for testing async state updates.
 *
 * @param condition - Function that returns true when condition is met
 * @param timeout - Maximum time to wait in milliseconds (default: 1000ms)
 * @param interval - Polling interval in milliseconds (default: 50ms)
 * @throws Error if timeout is reached
 *
 * @example
 * ```tsx
 * await waitForCondition(() => store.getState().loading === false)
 * ```
 */
export async function waitForCondition(
  condition: () => boolean,
  timeout = 1000,
  interval = 50
): Promise<void> {
  const startTime = Date.now()
  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition')
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }
}

// Re-export everything from @testing-library/react
// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react'
