/**
 * Tests for UserMenu component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { UserMenu } from './UserMenu.js'
import { useAuthStore } from '@store/zustand/authStore.js'
import { server } from '@test/setup.js'
import { http, HttpResponse } from 'msw'

describe('UserMenu', () => {
  const mockOnSettingsClick = vi.fn()

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
    vi.clearAllMocks()
    server.resetHandlers()
  })

  it('renders user avatar with initials', () => {
    useAuthStore.getState().loginSuccess(mockAdminUser)
    useAuthStore.getState().setMode('multi-user')

    render(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
      </MemoryRouter>
    )

    expect(screen.getByText('AU')).toBeInTheDocument()
  })

  it('displays user display name', () => {
    useAuthStore.getState().loginSuccess(mockAdminUser)
    useAuthStore.getState().setMode('multi-user')

    render(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
      </MemoryRouter>
    )

    expect(screen.getByText('Admin User')).toBeInTheDocument()
  })

  it('opens menu on avatar click', async () => {
    const user = userEvent.setup()
    useAuthStore.getState().loginSuccess(mockAdminUser)
    useAuthStore.getState().setMode('multi-user')

    render(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
      </MemoryRouter>
    )

    const avatarButton = screen.getByRole('button')
    await user.click(avatarButton)

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })
  })

  it('shows User Settings menu item', async () => {
    const user = userEvent.setup()
    useAuthStore.getState().loginSuccess(mockAdminUser)
    useAuthStore.getState().setMode('multi-user')

    render(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText('User Settings')).toBeInTheDocument()
    })
  })

  it('shows Admin Panel menu item for admin users', async () => {
    const user = userEvent.setup()
    useAuthStore.getState().loginSuccess(mockAdminUser)
    useAuthStore.getState().setMode('multi-user')

    render(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText('Admin Panel')).toBeInTheDocument()
    })
  })

  it('hides Admin Panel menu item for non-admin users', async () => {
    const user = userEvent.setup()
    useAuthStore.getState().loginSuccess(mockRegularUser)
    useAuthStore.getState().setMode('multi-user')

    render(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument()
    })
  })

  it('shows Logout menu item in multi-user mode', async () => {
    const user = userEvent.setup()
    useAuthStore.getState().loginSuccess(mockAdminUser)
    useAuthStore.getState().setMode('multi-user')

    render(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText('Logout')).toBeInTheDocument()
    })
  })

  it('hides Logout menu item in single-user mode', async () => {
    const user = userEvent.setup()
    useAuthStore.getState().loginSuccess(mockAdminUser)
    useAuthStore.getState().setMode('single-user')

    render(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.queryByText('Logout')).not.toBeInTheDocument()
    })
  })

  it('clicking User Settings calls onSettingsClick prop', async () => {
    const user = userEvent.setup()
    mockOnSettingsClick.mockClear()
    useAuthStore.getState().loginSuccess(mockAdminUser)
    useAuthStore.getState().setMode('multi-user')

    render(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText('User Settings')).toBeInTheDocument()
    })

    await user.click(screen.getByText('User Settings'))

    expect(mockOnSettingsClick).toHaveBeenCalledOnce()
  })

  it('clicking Admin Panel calls onAdminPanelClick prop', async () => {
    const user = userEvent.setup()
    const mockOnAdminPanelClick = vi.fn()
    useAuthStore.getState().loginSuccess(mockAdminUser)
    useAuthStore.getState().setMode('multi-user')

    render(
      <MemoryRouter>
        <UserMenu
          onSettingsClick={mockOnSettingsClick}
          onAdminPanelClick={mockOnAdminPanelClick}
        />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText('Admin Panel')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Admin Panel'))

    expect(mockOnAdminPanelClick).toHaveBeenCalledOnce()
  })

  it('clicking Logout logs out user', async () => {
    const user = userEvent.setup()
    useAuthStore.getState().loginSuccess(mockAdminUser)
    useAuthStore.getState().setMode('multi-user')

    server.use(
      http.post('/api/auth/logout', () => {
        return HttpResponse.json({ success: true })
      })
    )

    render(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText('Logout')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Logout'))

    // Logout endpoint should be called
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  it('does not render if currentUser is null', () => {
    // Don't log in anyone
    const { container } = render(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
      </MemoryRouter>
    )

    expect(container.firstChild).toBeNull()
  })

  it('shows user username in menu', async () => {
    const user = userEvent.setup()
    useAuthStore.getState().loginSuccess(mockAdminUser)
    useAuthStore.getState().setMode('multi-user')

    render(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText('@admin')).toBeInTheDocument()
    })
  })

  it('calculates initials from single word name', () => {
    useAuthStore.getState().loginSuccess({
      ...mockRegularUser,
      displayName: 'TestUser',
    })
    useAuthStore.getState().setMode('multi-user')

    render(
      <MemoryRouter>
        <UserMenu onSettingsClick={mockOnSettingsClick} />
      </MemoryRouter>
    )

    expect(screen.getByText('TE')).toBeInTheDocument()
  })
})
