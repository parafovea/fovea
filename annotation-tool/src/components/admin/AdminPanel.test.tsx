/**
 * Tests for AdminPanel component.
 */

import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '../../../test/utils/test-utils.js'
import AdminPanel from './AdminPanel.js'

// Mock child components
vi.mock('./UserManagementPage.js', () => ({
  default: () => <div>User Management Page</div>,
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
  it('redirects non-admin users to home page', () => {
    let redirected = false

    renderWithProviders(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<AdminPanel />} />
          <Route
            path="/"
            element={
              <div
                ref={() => {
                  redirected = true
                }}
              >
                Home Page
              </div>
            }
          />
        </Routes>
      </MemoryRouter>,
      {
        preloadedState: {
          user: {
            currentUser: {
              id: 'user-2',
              username: 'testuser',
              displayName: 'Test User',
              email: 'test@example.com',
              isAdmin: false,
              createdAt: '2025-01-01T00:00:00Z',
              updatedAt: '2025-01-01T00:00:00Z',
            },
            isAuthenticated: true,
            isLoading: false,
            mode: 'multi-user',
          },
        },
      }
    )

    expect(screen.getByText('Home Page')).toBeInTheDocument()
  })

  it('renders tabs for Users, Sessions, Settings', () => {
    renderWithProviders(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>,
      {
        preloadedState: {
          user: {
            currentUser: {
              id: 'user-1',
              username: 'admin',
              displayName: 'Admin User',
              email: 'admin@example.com',
              isAdmin: true,
              createdAt: '2025-01-01T00:00:00Z',
              updatedAt: '2025-01-01T00:00:00Z',
            },
            isAuthenticated: true,
            isLoading: false,
            mode: 'multi-user',
          },
        },
      }
    )

    expect(screen.getByRole('tab', { name: /users/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /sessions/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /settings/i })).toBeInTheDocument()
  })

  it('displays UserManagementPage by default', () => {
    renderWithProviders(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>,
      {
        preloadedState: {
          user: {
            currentUser: {
              id: 'user-1',
              username: 'admin',
              displayName: 'Admin User',
              email: 'admin@example.com',
              isAdmin: true,
              createdAt: '2025-01-01T00:00:00Z',
              updatedAt: '2025-01-01T00:00:00Z',
            },
            isAuthenticated: true,
            isLoading: false,
            mode: 'multi-user',
          },
        },
      }
    )

    expect(screen.getByText('User Management Page')).toBeInTheDocument()
  })

  it('shows SessionManagementDialog when Sessions tab clicked', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>,
      {
        preloadedState: {
          user: {
            currentUser: {
              id: 'user-1',
              username: 'admin',
              displayName: 'Admin User',
              email: 'admin@example.com',
              isAdmin: true,
              createdAt: '2025-01-01T00:00:00Z',
              updatedAt: '2025-01-01T00:00:00Z',
            },
            isAuthenticated: true,
            isLoading: false,
            mode: 'multi-user',
          },
        },
      }
    )

    await user.click(screen.getByRole('tab', { name: /sessions/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /session management dialog/i })).toBeInTheDocument()
    })
  })

  it('shows Settings tab content when selected', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>,
      {
        preloadedState: {
          user: {
            currentUser: {
              id: 'user-1',
              username: 'admin',
              displayName: 'Admin User',
              email: 'admin@example.com',
              isAdmin: true,
              createdAt: '2025-01-01T00:00:00Z',
              updatedAt: '2025-01-01T00:00:00Z',
            },
            isAuthenticated: true,
            isLoading: false,
            mode: 'multi-user',
          },
        },
      }
    )

    await user.click(screen.getByRole('tab', { name: /settings/i }))

    await waitFor(() => {
      expect(screen.getByText(/settings panel coming soon/i)).toBeInTheDocument()
    })
  })

  it('only renders for admin users', () => {
    const { container } = renderWithProviders(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>,
      {
        preloadedState: {
          user: {
            currentUser: null,
            isAuthenticated: false,
            isLoading: false,
            mode: 'multi-user',
          },
        },
      }
    )

    // Component redirects, so nothing should render in the current location
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument()
  })

  it('closes session dialog and returns to Users tab', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>,
      {
        preloadedState: {
          user: {
            currentUser: {
              id: 'user-1',
              username: 'admin',
              displayName: 'Admin User',
              email: 'admin@example.com',
              isAdmin: true,
              createdAt: '2025-01-01T00:00:00Z',
              updatedAt: '2025-01-01T00:00:00Z',
            },
            isAuthenticated: true,
            isLoading: false,
            mode: 'multi-user',
          },
        },
      }
    )

    // Open Sessions tab
    await user.click(screen.getByRole('tab', { name: /sessions/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Close dialog
    await user.click(screen.getByText('Close Dialog'))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // Should return to Users tab
    expect(screen.getByText('User Management Page')).toBeInTheDocument()
  })
})
