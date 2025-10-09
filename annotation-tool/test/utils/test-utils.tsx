import { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { Provider } from 'react-redux'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@mui/material/styles'
import { theme } from '../../src/theme.js'
import { store } from '../../src/store/index.js'

/**
 * Custom render function that wraps components with all required providers.
 * Use this instead of @testing-library/react's render for testing components
 * that depend on Redux, React Query, or Material-UI theming.
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
 * ```
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider theme={theme}>
            {children}
          </ThemeProvider>
        </QueryClientProvider>
      </Provider>
    )
  }

  return render(ui, { wrapper: Wrapper, ...options })
}

/**
 * Creates a QueryClient configured for testing.
 * Disables retries and sets short cache times for faster tests.
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
 * await waitFor(() => store.getState().loading === false)
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
export * from '@testing-library/react'
