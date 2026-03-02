/**
 * Tests for ProjectsPage component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProjectsPage from './ProjectsPage'
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

describe('ProjectsPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('renders loading state initially', () => {
    server.use(
      http.get('*/api/projects', () => {
        return new Promise(() => {})
      })
    )

    render(<ProjectsPage />, { wrapper: createWrapper() })

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows the Create Project button', async () => {
    server.use(
      http.get('*/api/projects', () => {
        return HttpResponse.json([])
      })
    )

    render(<ProjectsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create project/i })).toBeInTheDocument()
    })
  })

  it('renders projects after fetch', async () => {
    server.use(
      http.get('*/api/projects', () => {
        return HttpResponse.json([
          {
            id: 'proj-1',
            name: 'Gesture Study',
            slug: 'gesture-study',
            description: 'Analysis of hand gestures',
            ownerUserId: 'user-1',
            ownerGroupId: null,
            isArchived: false,
            _count: { members: 3 },
            myRole: 'project_owner',
            createdAt: '2025-01-01T00:00:00Z',
          },
        ])
      })
    )

    render(<ProjectsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Gesture Study')).toBeInTheDocument()
    })

    expect(screen.getByText('Analysis of hand gestures')).toBeInTheDocument()
    expect(screen.getByText('3 members')).toBeInTheDocument()
  })

  it('shows empty state for personal and group sections', async () => {
    server.use(
      http.get('*/api/projects', () => {
        return HttpResponse.json([])
      })
    )

    render(<ProjectsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('No personal projects yet.')).toBeInTheDocument()
    })

    expect(screen.getByText('No group projects yet.')).toBeInTheDocument()
  })

  it('separates personal and group projects', async () => {
    server.use(
      http.get('*/api/projects', () => {
        return HttpResponse.json([
          {
            id: 'proj-1',
            name: 'My Personal Project',
            slug: 'my-personal',
            description: null,
            ownerUserId: 'user-1',
            ownerGroupId: null,
            isArchived: false,
            _count: { members: 1 },
            myRole: 'project_owner',
            createdAt: '2025-01-01T00:00:00Z',
          },
          {
            id: 'proj-2',
            name: 'Team Project',
            slug: 'team-project',
            description: 'Shared team work',
            ownerUserId: null,
            ownerGroupId: 'grp-1',
            isArchived: false,
            _count: { members: 5 },
            myRole: 'annotator',
            createdAt: '2025-02-01T00:00:00Z',
          },
        ])
      })
    )

    render(<ProjectsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('My Personal Project')).toBeInTheDocument()
    })

    expect(screen.getByText('Team Project')).toBeInTheDocument()
    expect(screen.getByText('Personal Projects')).toBeInTheDocument()
    expect(screen.getByText('Group Projects')).toBeInTheDocument()
  })

  it('shows heading text', async () => {
    server.use(
      http.get('*/api/projects', () => {
        return HttpResponse.json([])
      })
    )

    render(<ProjectsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Projects' })).toBeInTheDocument()
    })
  })
})
