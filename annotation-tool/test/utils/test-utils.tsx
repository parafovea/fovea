import { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { Provider } from 'react-redux'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { store } from '../../src/store/store.js'
import annotationReducer from '../../src/store/annotationSlice.js'
import videoReducer from '../../src/store/videoSlice.js'
import personaReducer from '../../src/store/personaSlice.js'
import worldReducer from '../../src/store/worldSlice.js'
import videoSummaryReducer from '../../src/store/videoSummarySlice.js'
import userReducer from '../../src/store/userSlice.js'
import claimsReducer from '../../src/store/claimsSlice.js'

/**
 * Root state type from the main store.
 */
type RootState = ReturnType<typeof store.getState>

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
})

/**
 * Extended render options that include preloadedState for Redux store.
 */
interface ExtendedRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  preloadedState?: Partial<RootState>
  initialEntries?: string[]
  withRouter?: boolean
}

/**
 * Creates a test store with optional preloaded state.
 *
 * Note: Redux Toolkit's configureStore with preloadedState has strict typing that expects
 * the state shape to exactly match the reducers. However, at runtime Redux correctly handles
 * partial preloaded state by using each reducer's initial state for missing slices. The type
 * assertion ensures TypeScript accepts partial state while maintaining runtime correctness.
 */
function createTestStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: {
      annotations: annotationReducer,
      videos: videoReducer,
      persona: personaReducer,
      world: worldReducer,
      videoSummaries: videoSummaryReducer,
      user: userReducer,
      claims: claimsReducer,
    },
    preloadedState: preloadedState as RootState | undefined,
  })
}

/**
 * Custom render function that wraps components with all required providers.
 * Use this instead of @testing-library/react's render for testing components
 * that depend on Redux, React Query, or Material-UI theming.
 *
 * @param ui - The component to render
 * @param options - Additional render options including preloadedState for Redux
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
 * test('renders with preloaded state', () => {
 *   const { getByText } = renderWithProviders(<MyComponent />, {
 *     preloadedState: {
 *       user: {
 *         currentUser: { id: '1', username: 'test', displayName: 'Test User', isAdmin: false },
 *         isAuthenticated: true,
 *         isLoading: false,
 *         mode: 'multi-user',
 *       }
 *     }
 *   })
 * })
 * ```
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    preloadedState,
    initialEntries = ['/'],
    withRouter = false,
    ...renderOptions
  }: ExtendedRenderOptions = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  const testStore = preloadedState ? createTestStore(preloadedState) : store

  function Wrapper({ children }: { children: React.ReactNode }) {
    const content = (
      <Provider store={testStore}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider theme={theme}>
            {children}
          </ThemeProvider>
        </QueryClientProvider>
      </Provider>
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
// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react'
