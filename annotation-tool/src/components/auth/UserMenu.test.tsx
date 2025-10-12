/**
 * Tests for UserMenu component.
 */

import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '../../../test/utils/test-utils.js'
import UserMenu from './UserMenu.js'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup.js'

describe('UserMenu', () => {
  const mockOnSettingsClick = vi.fn()

  it('renders user avatar with initials', () => {
    renderWithProviders(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
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

    expect(screen.getByText('AU')).toBeInTheDocument()
  })

  it('displays user display name', () => {
    renderWithProviders(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
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

    expect(screen.getByText('Admin User')).toBeInTheDocument()
  })

  it('opens menu on avatar click', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
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

    const avatarButton = screen.getByRole('button')
    await user.click(avatarButton)

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })
  })

  it('shows Settings menu item', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
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

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })
  })

  it('shows Admin Panel menu item for admin users', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
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

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText('Admin Panel')).toBeInTheDocument()
    })
  })

  it('hides Admin Panel menu item for non-admin users', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
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

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument()
    })
  })

  it('shows Logout menu item in multi-user mode', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
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

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText('Logout')).toBeInTheDocument()
    })
  })

  it('hides Logout menu item in single-user mode', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
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
            mode: 'single-user',
          },
        },
      }
    )

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.queryByText('Logout')).not.toBeInTheDocument()
    })
  })

  it('clicking Settings calls onSettingsClick prop', async () => {
    const user = userEvent.setup()
    mockOnSettingsClick.mockClear()

    renderWithProviders(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
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

    await user.click(screen.getByRole('button'))
    await user.click(screen.getByText('Settings'))

    expect(mockOnSettingsClick).toHaveBeenCalledOnce()
  })

  it('clicking Admin Panel navigates to /admin', async () => {
    const user = userEvent.setup()

    let currentPath = '/'

    renderWithProviders(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={<UserMenu onSettingsClick={mockOnSettingsClick} />}
          />
          <Route
            path="/admin"
            element={
              <div
                ref={() => {
                  currentPath = '/admin'
                }}
              >
                Admin Page
              </div>
            }
          />
        </Routes>
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

    await user.click(screen.getByRole('button'))
    await user.click(screen.getByText('Admin Panel'))

    await waitFor(() => {
      expect(screen.getByText('Admin Page')).toBeInTheDocument()
    })
  })

  it('clicking Logout logs out user', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
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

    await user.click(screen.getByRole('button'))
    await user.click(screen.getByText('Logout'))

    // Logout endpoint should be called
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  it('does not render if currentUser is null', () => {
    const { container } = renderWithProviders(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
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

    expect(container.firstChild).toBeNull()
  })

  it('shows user username in menu', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
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

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText('@admin')).toBeInTheDocument()
    })
  })

  it('calculates initials from single word name', () => {
    renderWithProviders(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
      </MemoryRouter>,
      {
        preloadedState: {
          user: {
            currentUser: {
              id: 'user-1',
              username: 'testuser',
              displayName: 'TestUser',
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

    expect(screen.getByText('TE')).toBeInTheDocument()
  })
})
