/**
 * Tests for SharedAnnotationsPage component.
 */

import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SharedAnnotationsPage from './SharedAnnotationsPage'
import { server } from '@test/setup'
import { http, HttpResponse } from 'msw'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SharedAnnotationsPage', () => {
  it('renders loading state initially', () => {
    server.use(
      http.get('*/api/sharing/received', () => new Promise(() => {})),
      http.get('*/api/sharing/sent', () => new Promise(() => {}))
    )

    render(<SharedAnnotationsPage />, { wrapper: createWrapper() })

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders filter tabs', async () => {
    server.use(
      http.get('*/api/sharing/received', () => HttpResponse.json([])),
      http.get('*/api/sharing/sent', () => HttpResponse.json([]))
    )

    render(<SharedAnnotationsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /all/i })).toBeInTheDocument()
    })

    expect(screen.getByRole('tab', { name: /annotations/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /summarys/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /claims/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /personas/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /world states/i })).toBeInTheDocument()
  })

  it('shows empty state when no shared resources', async () => {
    server.use(
      http.get('*/api/sharing/received', () => HttpResponse.json([])),
      http.get('*/api/sharing/sent', () => HttpResponse.json([]))
    )

    render(<SharedAnnotationsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('No shared resources to display.')).toBeInTheDocument()
    })

    expect(screen.getByText('You have not shared any resources.')).toBeInTheDocument()
  })

  it('displays received shares in a table', async () => {
    server.use(
      http.get('*/api/sharing/received', () =>
        HttpResponse.json([
          {
            id: 'share-1',
            resourceType: 'annotation',
            resourceId: 'ann-1',
            sharedByUserId: 'user-2',
            sharedByUser: { id: 'user-2', username: 'alice', displayName: 'Alice' },
            permissionLevel: 'forkable',
            expiresAt: null,
            createdAt: '2025-01-10T00:00:00Z',
          },
        ])
      ),
      http.get('*/api/sharing/sent', () => HttpResponse.json([]))
    )

    render(<SharedAnnotationsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })

    expect(screen.getByText('Annotation')).toBeInTheDocument()
    expect(screen.getByText('Forkable')).toBeInTheDocument()
    expect(screen.getByText('Never')).toBeInTheDocument()
  })

  it('displays sent shares in a table', async () => {
    server.use(
      http.get('*/api/sharing/received', () => HttpResponse.json([])),
      http.get('*/api/sharing/sent', () =>
        HttpResponse.json([
          {
            id: 'share-2',
            resourceType: 'summary',
            resourceId: 'sum-1',
            sharedWithUserId: 'user-3',
            sharedWithUser: { id: 'user-3', username: 'bob', displayName: 'Bob' },
            sharedWithGroupId: null,
            permissionLevel: 'read',
            expiresAt: null,
            createdAt: '2025-01-15T00:00:00Z',
          },
        ])
      )
    )

    render(<SharedAnnotationsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Bob')).toBeInTheDocument()
    })

    expect(screen.getByText('My Shared Resources')).toBeInTheDocument()
  })

  it('filters received shares by tab', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/sharing/received', () =>
        HttpResponse.json([
          {
            id: 'share-1',
            resourceType: 'annotation',
            resourceId: 'ann-1',
            sharedByUserId: 'user-2',
            sharedByUser: { id: 'user-2', username: 'alice', displayName: 'Alice' },
            permissionLevel: 'forkable',
            expiresAt: null,
            createdAt: '2025-01-10T00:00:00Z',
          },
          {
            id: 'share-2',
            resourceType: 'summary',
            resourceId: 'sum-1',
            sharedByUserId: 'user-3',
            sharedByUser: { id: 'user-3', username: 'carol', displayName: 'Carol' },
            permissionLevel: 'read',
            expiresAt: null,
            createdAt: '2025-01-12T00:00:00Z',
          },
        ])
      ),
      http.get('*/api/sharing/sent', () => HttpResponse.json([]))
    )

    render(<SharedAnnotationsPage />, { wrapper: createWrapper() })

    // Wait for both to render in "All" tab
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })
    expect(screen.getByText('Carol')).toBeInTheDocument()

    // Switch to Annotations tab to filter out summaries
    await user.click(screen.getByRole('tab', { name: /annotations/i }))

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })
    expect(screen.queryByText('Carol')).not.toBeInTheDocument()
  })

  it('shows both heading sections', async () => {
    server.use(
      http.get('*/api/sharing/received', () => HttpResponse.json([])),
      http.get('*/api/sharing/sent', () => HttpResponse.json([]))
    )

    render(<SharedAnnotationsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Shared With Me' })).toBeInTheDocument()
    })

    expect(screen.getByText('My Shared Resources')).toBeInTheDocument()
  })
})
