/**
 * Tests for EditUserDialog component.
 */

import { describe, it, expect } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/utils/test-utils.js'
import EditUserDialog from './EditUserDialog.js'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup.js'
import { UserWithStats } from '../../hooks/admin/useUsers.js'

describe('EditUserDialog', () => {
  const mockUser: UserWithStats = {
    id: 'user-1',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    isAdmin: false,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    personaCount: 3,
    sessionCount: 1,
  }

  const mockOnClose = () => {}

  it('renders form pre-filled with user data', async () => {
    renderWithProviders(
      <EditUserDialog open={true} user={mockUser} onClose={mockOnClose} />,
      {
        preloadedState: { user: { currentUser: { ...mockUser, id: 'other-user' }, isAuthenticated: true, isLoading: false, mode: 'multi-user' } }
      }
    )

    await screen.findByRole('button', { name: /save changes/i })

    expect(screen.getByDisplayValue('testuser')).toBeDisabled()
    expect(screen.getByDisplayValue('Test User')).not.toBeDisabled()
    expect(screen.getByDisplayValue('test@example.com')).not.toBeDisabled()
  })

  it('displays user statistics', async () => {
    renderWithProviders(
      <EditUserDialog open={true} user={mockUser} onClose={mockOnClose} />,
      { preloadedState: { user: { currentUser: { ...mockUser, id: 'other-user' }, isAuthenticated: true, isLoading: false, mode: 'multi-user' } } }
    )

    await screen.findByRole('button', { name: /save changes/i })

    expect(screen.getByText((content, element) => {
      return element?.textContent === 'Personas: 3'
    })).toBeInTheDocument()
    expect(screen.getByText((content, element) => {
      return element?.textContent === 'Sessions: 1'
    })).toBeInTheDocument()
    expect(screen.getByText(/created:/i)).toBeInTheDocument()
  })

  it('username field is disabled', async () => {
    renderWithProviders(
      <EditUserDialog open={true} user={mockUser} onClose={mockOnClose} />,
      { preloadedState: { user: { currentUser: { ...mockUser, id: 'other-user' }, isAuthenticated: true, isLoading: false, mode: 'multi-user' } } }
    )

    await screen.findByRole('button', { name: /save changes/i })

    const usernameField = screen.getByDisplayValue('testuser')
    expect(usernameField).toBeDisabled()
    expect(screen.getByText('Username cannot be changed')).toBeInTheDocument()
  })

  it('display name can be edited', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <EditUserDialog open={true} user={mockUser} onClose={mockOnClose} />,
      { preloadedState: { user: { currentUser: { ...mockUser, id: 'other-user' }, isAuthenticated: true, isLoading: false, mode: 'multi-user' } } }
    )

    await screen.findByRole('button', { name: /save changes/i })

    const displayNameField = screen.getByRole('textbox', { name: /display name/i })
    await user.clear(displayNameField)
    await user.type(displayNameField, 'Updated Name')

    expect(displayNameField).toHaveValue('Updated Name')
  })

  it('email can be edited', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <EditUserDialog open={true} user={mockUser} onClose={mockOnClose} />,
      { preloadedState: { user: { currentUser: { ...mockUser, id: 'other-user' }, isAuthenticated: true, isLoading: false, mode: 'multi-user' } } }
    )

    await screen.findByRole('button', { name: /save changes/i })

    const emailField = screen.getByRole('textbox', { name: /email/i })
    await user.clear(emailField)
    await user.type(emailField, 'updated@example.com')

    expect(emailField).toHaveValue('updated@example.com')
  })

  it('isAdmin checkbox can be toggled', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <EditUserDialog open={true} user={mockUser} onClose={mockOnClose} />,
      { preloadedState: { user: { currentUser: { ...mockUser, id: 'other-user' }, isAuthenticated: true, isLoading: false, mode: 'multi-user' } } }
    )

    await screen.findByRole('button', { name: /save changes/i })

    const checkbox = screen.getByRole('checkbox', { name: /administrator/i })
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)
    expect(checkbox).toBeChecked()
  })

  it('password section is collapsible', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <EditUserDialog open={true} user={mockUser} onClose={mockOnClose} />,
      { preloadedState: { user: { currentUser: { ...mockUser, id: 'other-user' }, isAuthenticated: true, isLoading: false, mode: 'multi-user' } } }
    )

    await screen.findByRole('button', { name: /save changes/i })

    // Password fields should not be visible initially
    const passwordFields = screen.queryAllByLabelText(/new password/i)
    passwordFields.forEach(field => {
      expect(field).not.toBeVisible()
    })

    // Click to expand accordion
    const accordion = screen.getByText(/change password/i)
    await user.click(accordion)

    // Password fields should now be visible
    await waitFor(() => {
      const fields = screen.getAllByLabelText(/new password/i)
      expect(fields[0]).toBeVisible()
    })
  })

  it('new password validates minimum length', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <EditUserDialog open={true} user={mockUser} onClose={mockOnClose} />,
      { preloadedState: { user: { currentUser: { ...mockUser, id: 'other-user' }, isAuthenticated: true, isLoading: false, mode: 'multi-user' } } }
    )

    const submitButton = await screen.findByRole('button', { name: /save changes/i })

    // Expand password section
    await user.click(screen.getByText(/change password/i))
    await waitFor(() => {
      const fields = screen.getAllByLabelText(/new password/i)
      expect(fields.length).toBeGreaterThan(0)
    })

    const passwordFields = screen.getAllByLabelText(/password/i)
    await user.type(passwordFields[0], 'short')
    await user.type(passwordFields[1], 'short')

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument()
    })
  })

  it('confirm password validates match', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <EditUserDialog open={true} user={mockUser} onClose={mockOnClose} />,
      { preloadedState: { user: { currentUser: { ...mockUser, id: 'other-user' }, isAuthenticated: true, isLoading: false, mode: 'multi-user' } } }
    )

    const submitButton = await screen.findByRole('button', { name: /save changes/i })

    // Expand password section
    await user.click(screen.getByText(/change password/i))
    await waitFor(() => {
      const fields = screen.getAllByLabelText(/new password/i)
      expect(fields.length).toBeGreaterThan(0)
    })

    const passwordFields = screen.getAllByLabelText(/password/i)
    await user.type(passwordFields[0], 'password123')
    await user.type(passwordFields[1], 'different')

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
    })
  })

  it('leaving password blank keeps existing password', async () => {
    const user = userEvent.setup()
    let updatePayload: any = null

    server.use(
      http.put('/api/admin/users/:userId', async ({ request }) => {
        updatePayload = await request.json()
        return HttpResponse.json({ ...mockUser })
      })
    )

    renderWithProviders(
      <EditUserDialog open={true} user={mockUser} onClose={mockOnClose} />,
      { preloadedState: { user: { currentUser: { ...mockUser, id: 'other-user' }, isAuthenticated: true, isLoading: false, mode: 'multi-user' } } }
    )

    const submitButton = await screen.findByRole('button', { name: /save changes/i })

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(updatePayload).toBeTruthy()
      expect(updatePayload.password).toBeUndefined()
    })
  })

  it('save button updates user and calls onSuccess', async () => {
    const user = userEvent.setup()
    let dialogClosed = false
    const onClose = () => {
      dialogClosed = true
    }

    renderWithProviders(
      <EditUserDialog open={true} user={mockUser} onClose={onClose} />,
      { preloadedState: { user: { currentUser: { ...mockUser, id: 'other-user' }, isAuthenticated: true, isLoading: false, mode: 'multi-user' } } }
    )

    const submitButton = await screen.findByRole('button', { name: /save changes/i })

    const displayNameField = screen.getByRole('textbox', { name: /display name/i })
    await user.clear(displayNameField)
    await user.type(displayNameField, 'Updated Name')

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(dialogClosed).toBe(true)
    })
  })

  it('displays error on update failure', async () => {
    const user = userEvent.setup()

    server.use(
      http.put('/api/admin/users/:userId', () => {
        return HttpResponse.json(
          { error: 'Update failed' },
          { status: 500 }
        )
      })
    )

    renderWithProviders(
      <EditUserDialog open={true} user={mockUser} onClose={mockOnClose} />,
      { preloadedState: { user: { currentUser: { ...mockUser, id: 'other-user' }, isAuthenticated: true, isLoading: false, mode: 'multi-user' } } }
    )

    const submitButton = await screen.findByRole('button', { name: /save changes/i })

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/failed to update user/i)).toBeInTheDocument()
    })
  })

  it('delete button opens confirmation dialog', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <EditUserDialog open={true} user={mockUser} onClose={mockOnClose} />,
      { preloadedState: { user: { currentUser: { ...mockUser, id: 'other-user' }, isAuthenticated: true, isLoading: false, mode: 'multi-user' } } }
    )

    await screen.findByRole('button', { name: /save changes/i })

    await user.click(screen.getByRole('button', { name: /delete user/i }))

    await waitFor(() => {
      expect(screen.getByText(/are you sure you want to delete user/i)).toBeInTheDocument()
    })
  })

  it('delete button disabled if cannot delete', async () => {
    renderWithProviders(
      <EditUserDialog open={true} user={mockUser} onClose={mockOnClose} />,
      { preloadedState: { user: { currentUser: mockUser, isAuthenticated: true, isLoading: false, mode: 'multi-user' } } }
    )

    await screen.findByRole('button', { name: /save changes/i })

    const deleteButton = screen.getByRole('button', { name: /delete user/i })
    expect(deleteButton).toBeDisabled()
  })

  it('confirm delete removes user and closes dialog', async () => {
    const user = userEvent.setup()
    let dialogClosed = false
    const onClose = () => {
      dialogClosed = true
    }

    renderWithProviders(
      <EditUserDialog open={true} user={mockUser} onClose={onClose} />,
      { preloadedState: { user: { currentUser: { ...mockUser, id: 'other-user' }, isAuthenticated: true, isLoading: false, mode: 'multi-user' } } }
    )

    await screen.findByRole('button', { name: /save changes/i })

    await user.click(screen.getByRole('button', { name: /delete user/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete$/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /delete$/i }))

    await waitFor(() => {
      expect(dialogClosed).toBe(true)
    })
  })

  it('cancel button closes dialog without saving', async () => {
    const user = userEvent.setup()
    let dialogClosed = false
    const onClose = () => {
      dialogClosed = true
    }

    renderWithProviders(
      <EditUserDialog open={true} user={mockUser} onClose={onClose} />,
      { preloadedState: { user: { currentUser: { ...mockUser, id: 'other-user' }, isAuthenticated: true, isLoading: false, mode: 'multi-user' } } }
    )

    await screen.findByRole('button', { name: /save changes/i })

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(dialogClosed).toBe(true)
    })
  })

  it('form resets when user prop changes', async () => {
    const user = userEvent.setup()

    const newUser: UserWithStats = {
      ...mockUser,
      id: 'user-2',
      username: 'newuser',
      displayName: 'New User',
    }

    const { rerender } = renderWithProviders(
      <EditUserDialog open={true} user={mockUser} onClose={mockOnClose} />,
      { preloadedState: { user: { currentUser: { ...mockUser, id: 'other-user' }, isAuthenticated: true, isLoading: false, mode: 'multi-user' } } }
    )

    await screen.findByRole('button', { name: /save changes/i })

    // Modify display name
    const displayNameField = screen.getByRole('textbox', { name: /display name/i })
    await user.clear(displayNameField)
    await user.type(displayNameField, 'Modified Name')
    expect(displayNameField).toHaveValue('Modified Name')

    // Rerender with new user
    rerender(<EditUserDialog open={true} user={newUser} onClose={mockOnClose} />)

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /display name/i })).toHaveValue('New User')
    })
  })
})
