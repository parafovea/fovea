/**
 * Tests for GroupsPage component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import GroupsPage from './GroupsPage'
import { server } from '@test/setup'
import { http, HttpResponse } from 'msw'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

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

describe('GroupsPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('renders loading state initially', () => {
    // Use a delayed handler to keep the loading state visible
    server.use(
      http.get('*/api/groups', () => {
        return new Promise(() => {
          // Never resolve to keep loading
        })
      })
    )

    render(<GroupsPage />, { wrapper: createWrapper() })

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders groups after fetch', async () => {
    server.use(
      http.get('*/api/groups', () => {
        return HttpResponse.json([
          {
            id: 'grp-1',
            name: 'Annotators',
            slug: 'annotators',
            description: 'Main annotation team',
            memberCount: 5,
            userRole: 'group_owner',
            createdAt: '2025-01-01T00:00:00Z',
          },
          {
            id: 'grp-2',
            name: 'Reviewers',
            slug: 'reviewers',
            description: null,
            memberCount: 3,
            userRole: 'group_member',
            createdAt: '2025-02-01T00:00:00Z',
          },
        ])
      })
    )

    render(<GroupsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Annotators')).toBeInTheDocument()
    })

    expect(screen.getByText('Reviewers')).toBeInTheDocument()
    expect(screen.getByText('Main annotation team')).toBeInTheDocument()
    expect(screen.getByText('5 members')).toBeInTheDocument()
  })

  it('shows empty state message when no groups', async () => {
    server.use(
      http.get('*/api/groups', () => {
        return HttpResponse.json([])
      })
    )

    render(<GroupsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('You are not a member of any groups yet.')).toBeInTheDocument()
    })
  })

  it('shows the Create Group button', async () => {
    server.use(
      http.get('*/api/groups', () => {
        return HttpResponse.json([])
      })
    )

    render(<GroupsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create group/i })).toBeInTheDocument()
    })
  })

  it('opens create dialog when Create Group is clicked', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/groups', () => {
        return HttpResponse.json([])
      })
    )

    render(<GroupsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create group/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /create group/i }))

    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toBeInTheDocument()
      expect(screen.getByLabelText('Slug')).toBeInTheDocument()
      expect(screen.getByLabelText('Description')).toBeInTheDocument()
    })
  })

  it('navigates to group detail on card click', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/groups', () => {
        return HttpResponse.json([
          {
            id: 'grp-1',
            name: 'Annotators',
            slug: 'annotators',
            description: 'A team',
            memberCount: 5,
            userRole: 'group_owner',
            createdAt: '2025-01-01T00:00:00Z',
          },
        ])
      })
    )

    render(<GroupsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Annotators')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Annotators'))

    expect(mockNavigate).toHaveBeenCalledWith('/groups/grp-1')
  })

  it('shows heading text', async () => {
    server.use(
      http.get('*/api/groups', () => {
        return HttpResponse.json([])
      })
    )

    render(<GroupsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Groups' })).toBeInTheDocument()
    })
  })
})
