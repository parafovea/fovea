/**
 * Tests for ProjectDetailPage component.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProjectDetailPage from './ProjectDetailPage'
import { useAuthStore } from '@store/zustand/authStore'
import { useProjectContextStore } from '@store/zustand/projectContextStore'
import { server } from '@test/setup'
import { http, HttpResponse } from 'msw'

vi.mock('../telemetry/tracing', () => ({
  getTracer: () => ({
    startSpan: () => ({ setAttribute: vi.fn(), end: vi.fn() }),
  }),
}))

function renderWithRoute(projectId: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/projects/${projectId}`]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/projects" element={<div>Projects List</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const projectResponse = {
  id: 'proj-1',
  name: 'Gesture Study',
  slug: 'gesture-study',
  description: 'Analysis of hand gestures',
  ownerUserId: 'user-1',
  ownerGroupId: null,
  isArchived: false,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  videoAssignmentCount: 3,
}

const membersResponse = [
  {
    id: 'pm-1',
    userId: 'user-1',
    role: 'project_owner',
    joinedAt: '2025-01-01T00:00:00Z',
    user: { displayName: 'Test User' },
  },
  {
    id: 'pm-2',
    userId: 'user-2',
    role: 'annotator',
    joinedAt: '2025-01-15T00:00:00Z',
    user: { displayName: 'Bob' },
  },
]

const assignableUsersResponse = [
  {
    id: 'user-3',
    username: 'carol',
    displayName: 'Carol',
    email: 'carol@example.com',
  },
]

describe('ProjectDetailPage', () => {
  beforeEach(() => {
    // jsdom does not implement scrollIntoView; the cmdk Command list in the
    // add-member picker calls it on mount.
    Element.prototype.scrollIntoView = vi.fn()
    useAuthStore.getState().reset()
    useAuthStore.getState().loginSuccess({
      id: 'user-1',
      username: 'testuser',
      displayName: 'Test User',
      isAdmin: false,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    })
    useProjectContextStore.getState().clearProject()
  })

  it('renders loading state initially', () => {
    server.use(
      http.get('*/api/projects/:projectId', () => new Promise(() => {})),
      http.get('*/api/projects/:projectId/members', () => new Promise(() => {})),
      http.get('*/api/projects/:projectId/personas', () => new Promise(() => {}))
    )

    renderWithRoute('proj-1')

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders project name', async () => {
    server.use(
      http.get('*/api/projects/:projectId', () => HttpResponse.json(projectResponse)),
      http.get('*/api/projects/:projectId/members', () => HttpResponse.json(membersResponse)),
      http.get('*/api/projects/:projectId/personas', () => HttpResponse.json([]))
    )

    renderWithRoute('proj-1')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Gesture Study' })).toBeInTheDocument()
    })

    expect(screen.getByText('Analysis of hand gestures')).toBeInTheDocument()
  })

  it('shows member section with table headers', async () => {
    server.use(
      http.get('*/api/projects/:projectId', () => HttpResponse.json(projectResponse)),
      http.get('*/api/projects/:projectId/members', () => HttpResponse.json(membersResponse)),
      http.get('*/api/projects/:projectId/personas', () => HttpResponse.json([]))
    )

    renderWithRoute('proj-1')

    await waitFor(() => {
      expect(screen.getByText('Members')).toBeInTheDocument()
    })

    expect(screen.getByText('Test User')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('shows Set as Active Project button', async () => {
    server.use(
      http.get('*/api/projects/:projectId', () => HttpResponse.json(projectResponse)),
      http.get('*/api/projects/:projectId/members', () => HttpResponse.json(membersResponse)),
      http.get('*/api/projects/:projectId/personas', () => HttpResponse.json([]))
    )

    renderWithRoute('proj-1')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /set as active project/i })).toBeInTheDocument()
    })
  })

  it('sets the active project in store when button is clicked', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/projects/:projectId', () => HttpResponse.json(projectResponse)),
      http.get('*/api/projects/:projectId/members', () => HttpResponse.json(membersResponse)),
      http.get('*/api/projects/:projectId/personas', () => HttpResponse.json([]))
    )

    renderWithRoute('proj-1')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /set as active project/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /set as active project/i }))

    const state = useProjectContextStore.getState()
    expect(state.activeProjectId).toBe('proj-1')
    expect(state.activeProjectName).toBe('Gesture Study')
    expect(state.activeProjectRole).toBe('project_owner')
  })

  it('shows back button linking to projects list', async () => {
    server.use(
      http.get('*/api/projects/:projectId', () => HttpResponse.json(projectResponse)),
      http.get('*/api/projects/:projectId/members', () => HttpResponse.json(membersResponse)),
      http.get('*/api/projects/:projectId/personas', () => HttpResponse.json([]))
    )

    renderWithRoute('proj-1')

    await waitFor(() => {
      expect(screen.getByText('Back to Projects')).toBeInTheDocument()
    })
  })

  it('shows error state when project fails to load', async () => {
    server.use(
      http.get('*/api/projects/:projectId', () => new HttpResponse(null, { status: 404 })),
      http.get('*/api/projects/:projectId/members', () => HttpResponse.json([])),
      http.get('*/api/projects/:projectId/personas', () => HttpResponse.json([]))
    )

    renderWithRoute('proj-nonexistent')

    await waitFor(() => {
      expect(screen.getByText('Failed to load project.')).toBeInTheDocument()
    })
  })

  it('shows video assignment count', async () => {
    server.use(
      http.get('*/api/projects/:projectId', () => HttpResponse.json(projectResponse)),
      http.get('*/api/projects/:projectId/members', () => HttpResponse.json(membersResponse)),
      http.get('*/api/projects/:projectId/personas', () => HttpResponse.json([]))
    )

    renderWithRoute('proj-1')

    await waitFor(() => {
      expect(screen.getByText('3 video assignments')).toBeInTheDocument()
    })
  })

  it('shows personas section with empty message', async () => {
    server.use(
      http.get('*/api/projects/:projectId', () => HttpResponse.json(projectResponse)),
      http.get('*/api/projects/:projectId/members', () => HttpResponse.json(membersResponse)),
      http.get('*/api/projects/:projectId/personas', () => HttpResponse.json([]))
    )

    renderWithRoute('proj-1')

    await waitFor(() => {
      expect(screen.getByText('Personas')).toBeInTheDocument()
    })

    expect(screen.getByText('No personas assigned to this project.')).toBeInTheDocument()
  })

  it('lists assignable users in the add-member picker', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/projects/:projectId', () => HttpResponse.json(projectResponse)),
      http.get('*/api/projects/:projectId/members', () => HttpResponse.json(membersResponse)),
      http.get('*/api/projects/:projectId/personas', () => HttpResponse.json([])),
      http.get('*/api/projects/:projectId/assignable-users', () => HttpResponse.json(assignableUsersResponse))
    )

    renderWithRoute('proj-1')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add member/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /add member/i }))
    await user.click(screen.getByText('Select user...'))

    await waitFor(() => {
      expect(screen.getByText('carol (Carol)')).toBeInTheDocument()
    })
  })
})
