/**
 * Tests for AdminPanel component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminPanel from './AdminPanel.js'
import { useAuthStore } from '../../store/zustand/authStore.js'

// Mock child components
vi.mock('./UserManagementPage.js', () => ({
  default: () => <div>User Management Page</div>,
}))

vi.mock('./SessionManagementPage.js', () => ({
  default: () => (
    <div>
      Session Management Page
      <button>Refresh</button>
    </div>
  ),
}))

vi.mock('./SessionManagementDialog.js', () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    open ? (
      <div role="dialog" aria-label="Session Management Dialog">
        <button onClick={onClose}>Close Dialog</button>
      </div>
    ) : null
  ),
}))

describe('AdminPanel', () => {
  const mockAdminUser = {
    id: 'user-1',
    username: 'admin',
    displayName: 'Admin User',
    email: 'admin@example.com',
    isAdmin: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  }

  const mockRegularUser = {
    id: 'user-2',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    isAdmin: false,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  }

  beforeEach(() => {
    // Reset Zustand store before each test
    useAuthStore.getState().reset()
  })

  it('redirects non-admin users to home page', () => {
    useAuthStore.getState().loginSuccess(mockRegularUser)

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/" element={<div>Home Page</div>} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Home Page')).toBeInTheDocument()
  })

  it('renders tabs for Users, Sessions, Settings', () => {
    useAuthStore.getState().loginSuccess(mockAdminUser)

    render(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>
    )

    expect(screen.getByRole('tab', { name: /users/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /sessions/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /settings/i })).toBeInTheDocument()
  })

  it('displays UserManagementPage by default', () => {
    useAuthStore.getState().loginSuccess(mockAdminUser)

    render(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>
    )

    expect(screen.getByText('User Management Page')).toBeInTheDocument()
  })

  it('shows SessionManagementPage when Sessions tab clicked', async () => {
    const user = userEvent.setup()
    useAuthStore.getState().loginSuccess(mockAdminUser)

    render(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('tab', { name: /sessions/i }))

    await waitFor(() => {
      // SessionManagementPage should be displayed with session content
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
    })
  })

  it('shows Settings tab content when selected', async () => {
    const user = userEvent.setup()
    useAuthStore.getState().loginSuccess(mockAdminUser)

    render(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('tab', { name: /settings/i }))

    await waitFor(() => {
      expect(screen.getByText(/settings panel coming soon/i)).toBeInTheDocument()
    })
  })

  it('only renders for admin users', () => {
    // Don't set any user - null user should redirect
    render(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>
    )

    // Component redirects, so nothing should render in the current location
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument()
  })

  it('switches between Sessions and Users tabs', async () => {
    const user = userEvent.setup()
    useAuthStore.getState().loginSuccess(mockAdminUser)

    render(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>
    )

    // Initially on Users tab
    expect(screen.getByText('User Management Page')).toBeInTheDocument()

    // Switch to Sessions tab
    await user.click(screen.getByRole('tab', { name: /sessions/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
    })

    // Switch back to Users tab
    await user.click(screen.getByRole('tab', { name: /users/i }))

    await waitFor(() => {
      expect(screen.getByText('User Management Page')).toBeInTheDocument()
    })
  })
})
