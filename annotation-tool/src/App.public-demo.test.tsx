import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { useAuthStore } from './store/zustand/authStore'

vi.mock('./config', async (importOriginal) => {
  const original = await importOriginal<typeof import('./config')>()
  return {
    ...original,
    config: {
      ...original.config,
      deploymentMode: { ...original.config.deploymentMode, publicBooth: true },
    },
  }
})
vi.mock('./hooks/auth/useSession', () => ({ useSession: vi.fn() }))
vi.mock('./store/queries/useAbilities', () => ({ useAbilities: vi.fn() }))
vi.mock('./pages/TourCataloguePage', () => ({
  TourCataloguePage: () => <div>Public tour catalogue</div>,
}))
vi.mock('@components/layout/Layout', () => ({ default: () => <Outlet /> }))
vi.mock('@components/video/VideoBrowser', () => ({ default: () => <div>Video workspace</div> }))
vi.mock('./utils/seedTestData', () => ({ seedTestData: vi.fn(), isTestDataEnabled: () => false }))

function renderRoot(path = '/') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Public demo root routing', () => {
  beforeEach(() => useAuthStore.getState().reset())

  it('shows the catalogue while the session is loading', () => {
    renderRoot()
    expect(screen.getByText('Public tour catalogue')).toBeInTheDocument()
    expect(screen.queryByText('Video workspace')).not.toBeInTheDocument()
  })

  it('keeps the video workspace available at the tour entry route', () => {
    useAuthStore.getState().setLoading(false)
    renderRoot('/app')
    expect(screen.getByText('Video workspace')).toBeInTheDocument()
    expect(screen.queryByText('Public tour catalogue')).not.toBeInTheDocument()
  })

  it.each(['demo-anonymous-visitor', 'signed-in-user'])(
    'routes the authenticated %s to the appropriate root page', (username) => {
      useAuthStore.getState().loginSuccess({
        id: 'visitor', username, displayName: 'Visitor', email: null, isAdmin: false,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      })
      renderRoot()
      const anonymous = username.startsWith('demo-anonymous-')
      expect(screen.getByText(anonymous ? 'Public tour catalogue' : 'Video workspace')).toBeInTheDocument()
      expect(screen.queryByText(anonymous ? 'Video workspace' : 'Public tour catalogue')).not.toBeInTheDocument()
    },
  )
})
