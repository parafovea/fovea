/**
 * Tests for GroupDetailPage component.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import GroupDetailPage from './GroupDetailPage'
import { useAuthStore } from '@store/zustand/authStore'
import { server } from '@test/setup'
import { http, HttpResponse } from 'msw'

function renderWithRoute(groupId: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/groups/${groupId}`]}>
        <Routes>
          <Route path="/groups/:groupId" element={<GroupDetailPage />} />
          <Route path="/groups" element={<div>Groups List</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('GroupDetailPage', () => {
  beforeEach(() => {
    useAuthStore.getState().reset()
    useAuthStore.getState().loginSuccess({
      id: 'user-1',
      username: 'testuser',
      displayName: 'Test User',
      isAdmin: false,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    })
  })

  it('renders loading state initially', () => {
    server.use(
      http.get('*/api/groups/:groupId', () => {
        return new Promise(() => {
          // Never resolve to keep loading
        })
      }),
      http.get('*/api/groups/:groupId/members', () => {
        return new Promise(() => {})
      })
    )

    renderWithRoute('grp-1')

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders group name and description', async () => {
    server.use(
      http.get('*/api/groups/:groupId', () => {
        return HttpResponse.json({
          id: 'grp-1',
          name: 'Annotation Team',
          slug: 'annotation-team',
          description: 'Our main annotation team',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        })
      }),
      http.get('*/api/groups/:groupId/members', () => {
        return HttpResponse.json([
          {
            id: 'membership-1',
            userId: 'user-1',
            role: 'group_owner',
            joinedAt: '2025-01-01T00:00:00Z',
            user: { displayName: 'Test User' },
          },
        ])
      })
    )

    renderWithRoute('grp-1')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Annotation Team' })).toBeInTheDocument()
    })

    expect(screen.getByText('Our main annotation team')).toBeInTheDocument()
  })

  it('shows member list in a table', async () => {
    server.use(
      http.get('*/api/groups/:groupId', () => {
        return HttpResponse.json({
          id: 'grp-1',
          name: 'Test Group',
          slug: 'test-group',
          description: null,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        })
      }),
      http.get('*/api/groups/:groupId/members', () => {
        return HttpResponse.json([
          {
            id: 'membership-1',
            userId: 'user-1',
            role: 'group_owner',
            joinedAt: '2025-01-01T00:00:00Z',
            user: { displayName: 'Alice Owner' },
          },
          {
            id: 'membership-2',
            userId: 'user-2',
            role: 'group_member',
            joinedAt: '2025-01-15T00:00:00Z',
            user: { displayName: 'Bob Member' },
          },
        ])
      })
    )

    renderWithRoute('grp-1')

    await waitFor(() => {
      expect(screen.getByText('Alice Owner')).toBeInTheDocument()
    })

    expect(screen.getByText('Bob Member')).toBeInTheDocument()
    expect(screen.getByText('Members')).toBeInTheDocument()
  })

  it('shows back button linking to groups list', async () => {
    server.use(
      http.get('*/api/groups/:groupId', () => {
        return HttpResponse.json({
          id: 'grp-1',
          name: 'Test Group',
          slug: 'test-group',
          description: null,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        })
      }),
      http.get('*/api/groups/:groupId/members', () => {
        return HttpResponse.json([])
      })
    )

    renderWithRoute('grp-1')

    await waitFor(() => {
      expect(screen.getByText('Back to Groups')).toBeInTheDocument()
    })
  })

  it('shows error state when group fails to load', async () => {
    server.use(
      http.get('*/api/groups/:groupId', () => {
        return new HttpResponse(null, { status: 404 })
      }),
      http.get('*/api/groups/:groupId/members', () => {
        return HttpResponse.json([])
      })
    )

    renderWithRoute('grp-nonexistent')

    await waitFor(() => {
      expect(screen.getByText('Failed to load group.')).toBeInTheDocument()
    })
  })
})
