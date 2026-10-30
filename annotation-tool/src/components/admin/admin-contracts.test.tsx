import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@test/setup'
import { PermissionsPage } from './PermissionsPage'
import { GroupManagementPage } from './GroupManagementPage'
import { ProjectManagementPage } from './ProjectManagementPage'
import { VideoAssignmentPage } from './VideoAssignmentPage'

/** Renders an admin page with an isolated query cache. */
function renderPage(page: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{page}</QueryClientProvider>)
}

describe('admin API contracts', () => {
  it('renders flat permissions with their scope and ownership restriction', async () => {
    server.use(http.get('/api/admin/permissions', () => HttpResponse.json([
      { scope: 'project', role: 'annotator', resourceType: 'annotation', action: 'update', ownOnly: true },
    ])))
    renderPage(<PermissionsPage />)
    expect(await screen.findByText('project: annotator')).toBeInTheDocument()
    expect(screen.getByText('update (own)')).toBeInTheDocument()
  })

  it('renders nested group members', async () => {
    server.use(
      http.get('/api/admin/groups', () => HttpResponse.json([{
        id: 'group-1', name: 'Annotators', slug: 'annotators', createdBy: 'owner', createdAt: '2026-01-01',
        _count: { members: 1 }, members: [{ userId: 'user-1', role: 'group_member', user: { username: 'analyst', displayName: 'Analyst One' } }],
      }])),
      http.get('/api/admin/users', () => HttpResponse.json([])),
    )
    renderPage(<GroupManagementPage />)
    expect(await screen.findByText('Annotators')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'expand row' }))
    expect(screen.getByText('Analyst One')).toBeInTheDocument()
    expect(screen.getByText('group_member')).toBeInTheDocument()
  })

  it('loads projects through the supported list and detail routes', async () => {
    server.use(
      http.get('/api/projects', () => HttpResponse.json([{ id: 'project-1', name: 'Research' }])),
      http.get('/api/projects/project-1', () => HttpResponse.json({
        id: 'project-1', name: 'Research', slug: 'research', ownerUserId: 'owner', ownerGroupId: null,
        isArchived: false, members: [{ userId: 'one' }, { userId: 'two' }, { userId: 'three' }], videoAssignmentCount: 7, createdAt: '2026-01-01',
      })),
    )
    renderPage(<ProjectManagementPage />)
    expect(await screen.findByText('Research')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders condition arrays and assigns videos through the bulk route', async () => {
    let submitted: unknown
    const conditions = [{ field: 'title', operator: 'contains', value: 'news' }]
    server.use(
      http.get('/api/admin/video-assignments/rules', () => HttpResponse.json([{
        id: 'rule-1', name: 'News', targetType: 'project', targetId: 'project-1', conditions,
        isActive: true, createdAt: '2026-01-01',
      }])),
      http.post('/api/admin/video-assignments/bulk', async ({ request }) => {
        submitted = await request.json()
        return HttpResponse.json({ created: 2, skipped: 0 })
      }),
    )
    renderPage(<VideoAssignmentPage />)
    expect(await screen.findByText(JSON.stringify(conditions))).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Video IDs'), { target: { value: 'video-1, video-2' } })
    fireEvent.change(screen.getByLabelText('Target Project ID'), { target: { value: 'project-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
    expect(await screen.findByText('Assigned 2 video(s) successfully.')).toBeInTheDocument()
    expect(submitted).toEqual({ videoIds: ['video-1', 'video-2'], projectId: 'project-1' })
  })
})
