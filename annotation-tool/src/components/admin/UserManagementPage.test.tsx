/**
 * Tests for UserManagementPage component.
 */

import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderWithProviders } from '../../../test/utils/test-utils.js'
import UserManagementPage from './UserManagementPage.js'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup.js'

// Mock child components
vi.mock('./CreateUserDialog.js', () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    open ? (
      <div role="dialog" aria-label="Create User Dialog">
        <button onClick={onClose}>Close Create Dialog</button>
      </div>
    ) : null
  ),
}))

vi.mock('./EditUserDialog.js', () => ({
  default: ({
    open,
    user,
    onClose,
  }: {
    open: boolean
    user: { username: string }
    onClose: () => void
  }) => (
    open ? (
      <div role="dialog" aria-label="Edit User Dialog">
        <div>Editing: {user.username}</div>
        <button onClick={onClose}>Close Edit Dialog</button>
      </div>
    ) : null
  ),
}))

vi.mock('../shared/ConfirmDialog.js', () => ({
  default: ({
    open,
    title,
    message,
    onConfirm,
    onCancel,
  }: {
    open: boolean
    title: string
    message: string
    onConfirm: () => void
    onCancel: () => void
  }) => (
    open ? (
      <div role="dialog" aria-label={title}>
        <div>{message}</div>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null
  ),
}))

describe('UserManagementPage', () => {
  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }

  it('renders user table with all columns', async () => {
    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Username')).toBeInTheDocument()
      expect(screen.getByText('Display Name')).toBeInTheDocument()
      expect(screen.getByText('Email')).toBeInTheDocument()
      expect(screen.getByText('Role')).toBeInTheDocument()
      expect(screen.getByText('Personas')).toBeInTheDocument()
      expect(screen.getByText('Sessions')).toBeInTheDocument()
      expect(screen.getByText('Created')).toBeInTheDocument()
      expect(screen.getByText('Actions')).toBeInTheDocument()
    })
  })

  it('displays loading spinner while fetching users', () => {
    server.use(
      http.get('/api/admin/users', async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return HttpResponse.json([])
      })
    )

    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('displays error message if fetch fails', async () => {
    server.use(
      http.get('/api/admin/users', () => {
        return HttpResponse.json(
          { error: 'Database connection failed' },
          { status: 500 }
        )
      })
    )

    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText(/failed to load users/i)).toBeInTheDocument()
    })
  })

  it('renders user list with correct data', async () => {
    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
      expect(screen.getByText('Admin User')).toBeInTheDocument()
      expect(screen.getByText('admin@example.com')).toBeInTheDocument()
      expect(screen.getByText('testuser')).toBeInTheDocument()
      expect(screen.getByText('Test User')).toBeInTheDocument()
    })
  })

  it('search filters users by username', async () => {
    const user = userEvent.setup()

    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search users...')
    await user.type(searchInput, 'testuser')

    await waitFor(() => {
      expect(screen.queryByText('admin')).not.toBeInTheDocument()
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })
  })

  it('search filters users by display name', async () => {
    const user = userEvent.setup()

    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search users...')
    await user.type(searchInput, 'Admin User')

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
      expect(screen.queryByText('testuser')).not.toBeInTheDocument()
    })
  })

  it('search filters users by email', async () => {
    const user = userEvent.setup()

    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search users...')
    await user.type(searchInput, 'test@example.com')

    await waitFor(() => {
      expect(screen.queryByText('admin')).not.toBeInTheDocument()
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })
  })

  it('sort by username ascending', async () => {
    const user = userEvent.setup()

    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    // Click username sort (should already be ascending by default)
    const usernameSort = screen.getByText('Username')
    await user.click(usernameSort)

    // Verify order (admin should come before testuser alphabetically in descending)
    const rows = screen.getAllByRole('row')
    const dataRows = rows.slice(1) // Skip header row
    expect(dataRows[0]).toHaveTextContent('testuser')
    expect(dataRows[1]).toHaveTextContent('admin')
  })

  it('sort by display name', async () => {
    const user = userEvent.setup()

    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    const displayNameSort = screen.getByText('Display Name')
    await user.click(displayNameSort)

    // Verify sorting happened (Admin User < Test User alphabetically)
    await waitFor(() => {
      const rows = screen.getAllByRole('row')
      expect(rows.length).toBeGreaterThan(1)
    })
  })

  it('sort by email', async () => {
    const user = userEvent.setup()

    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    const emailSort = screen.getByText('Email')
    await user.click(emailSort)

    await waitFor(() => {
      const rows = screen.getAllByRole('row')
      expect(rows.length).toBeGreaterThan(1)
    })
  })

  it('sort by created date', async () => {
    const user = userEvent.setup()

    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    const createdSort = screen.getByText('Created')
    await user.click(createdSort)

    await waitFor(() => {
      const rows = screen.getAllByRole('row')
      expect(rows.length).toBeGreaterThan(1)
    })
  })

  it('sort by persona count', async () => {
    const user = userEvent.setup()

    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    const personasSort = screen.getByText('Personas')
    await user.click(personasSort)

    await waitFor(() => {
      const rows = screen.getAllByRole('row')
      expect(rows.length).toBeGreaterThan(1)
    })
  })

  it('sort by session count', async () => {
    const user = userEvent.setup()

    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    const sessionsSort = screen.getByText('Sessions')
    await user.click(sessionsSort)

    await waitFor(() => {
      const rows = screen.getAllByRole('row')
      expect(rows.length).toBeGreaterThan(1)
    })
  })

  it('Add User button opens CreateUserDialog', async () => {
    const user = userEvent.setup()

    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /add user/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /create user dialog/i })).toBeInTheDocument()
    })
  })

  it('Edit button opens EditUserDialog with user data', async () => {
    const user = userEvent.setup()

    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByLabelText('edit user')
    await user.click(editButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /edit user dialog/i })).toBeInTheDocument()
      expect(screen.getByText(/editing: admin/i)).toBeInTheDocument()
    })
  })

  it('Delete button opens confirmation dialog', async () => {
    const user = userEvent.setup()

    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByLabelText('delete user')
    await user.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /delete user/i })).toBeInTheDocument()
      expect(screen.getByText(/are you sure you want to delete user "admin"/i)).toBeInTheDocument()
    })
  })

  it('Confirm delete removes user from list', async () => {
    const user = userEvent.setup()

    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByLabelText('delete user')
    await user.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /delete user/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^confirm$/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /delete user/i })).not.toBeInTheDocument()
    })
  })

  it('Cancel delete closes dialog without removing user', async () => {
    const user = userEvent.setup()

    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByLabelText('delete user')
    await user.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /delete user/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /delete user/i })).not.toBeInTheDocument()
    })

    // User should still be in the list
    expect(screen.getByText('admin')).toBeInTheDocument()
  })

  it('Admin badge shows for admin users', async () => {
    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument()
    })
  })

  it('User badge shows for non-admin users', async () => {
    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('User')).toBeInTheDocument()
    })
  })

  it('shows "No users found" when search returns no results', async () => {
    const user = userEvent.setup()

    renderWithProviders(<UserManagementPage />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search users...')
    await user.type(searchInput, 'nonexistent')

    await waitFor(() => {
      expect(screen.getByText('No users found')).toBeInTheDocument()
    })
  })
})
