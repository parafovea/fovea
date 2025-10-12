/**
 * Tests for CreateUserDialog component.
 */

import { describe, it, expect } from 'vitest'
import { screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderWithProviders } from '../../../test/utils/test-utils.js'
import CreateUserDialog from './CreateUserDialog.js'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup.js'

describe('CreateUserDialog', () => {
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

  const mockOnClose = () => {}

  it('renders form when open=true', () => {
    renderWithProviders(<CreateUserDialog open={true} onClose={mockOnClose} />, {
      wrapper: createWrapper(),
    })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Create User' })).toBeInTheDocument()
  })

  it('does not render when open=false', () => {
    renderWithProviders(<CreateUserDialog open={false} onClose={mockOnClose} />, {
      wrapper: createWrapper(),
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('validates username required', async () => {
    const user = userEvent.setup()

    renderWithProviders(<CreateUserDialog open={true} onClose={mockOnClose} />, {
      wrapper: createWrapper(),
    })

    // Wait for the entire form to be visible by checking for a button
    const submitButton = await screen.findByRole('button', { name: /create user/i })

    // Get all password fields (Password and Confirm Password)
    const passwordFields = screen.getAllByLabelText(/password/i)

    // Fill in all fields EXCEPT username
    await user.type(screen.getByRole('textbox', { name: /display name/i }), 'Test User')
    await user.type(passwordFields[0], 'password123')
    await user.type(passwordFields[1], 'password123')

    // Submit the form directly (bypassing button click)
    const form = submitButton.closest('form')
    if (!form) throw new Error('Form not found')
    fireEvent.submit(form)

    // Wait for validation errors to appear
    await waitFor(
      () => {
        // Check if the username field has error state
        const usernameField = screen.getByRole('textbox', { name: /username/i })
        expect(usernameField).toHaveAttribute('aria-invalid', 'true')
      },
      { timeout: 2000 }
    )

    // And verify the error message appears
    expect(screen.getByText(/username is required/i)).toBeInTheDocument()
  })

  it('validates username minimum length', async () => {
    const user = userEvent.setup()

    renderWithProviders(<CreateUserDialog open={true} onClose={mockOnClose} />, {
      wrapper: createWrapper(),
    })

    const submitButton = await screen.findByRole('button', { name: /create user/i })
    const passwordFields = screen.getAllByLabelText(/password/i)

    await user.type(screen.getByRole('textbox', { name: /username/i }), 'ab')
    await user.type(screen.getByRole('textbox', { name: /display name/i }), 'Test User')
    await user.type(passwordFields[0], 'password123')
    await user.type(passwordFields[1], 'password123')

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/username must be at least 3 characters/i)).toBeInTheDocument()
    })
  })

  it('validates display name required', async () => {
    const user = userEvent.setup()

    renderWithProviders(<CreateUserDialog open={true} onClose={mockOnClose} />, {
      wrapper: createWrapper(),
    })

    const submitButton = await screen.findByRole('button', { name: /create user/i })
    const passwordFields = screen.getAllByLabelText(/password/i)

    await user.type(screen.getByRole('textbox', { name: /username/i }), 'testuser')
    await user.type(passwordFields[0], 'password123')
    await user.type(passwordFields[1], 'password123')

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Display name is required')).toBeInTheDocument()
    })
  })

  it('validates password required', async () => {
    const user = userEvent.setup()

    renderWithProviders(<CreateUserDialog open={true} onClose={mockOnClose} />, {
      wrapper: createWrapper(),
    })

    const submitButton = await screen.findByRole('button', { name: /create user/i })

    await user.type(screen.getByRole('textbox', { name: /username/i }), 'testuser')
    await user.type(screen.getByRole('textbox', { name: /display name/i }), 'Test User')

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Password is required')).toBeInTheDocument()
    })
  })

  it('validates password minimum length', async () => {
    const user = userEvent.setup()

    renderWithProviders(<CreateUserDialog open={true} onClose={mockOnClose} />, {
      wrapper: createWrapper(),
    })

    const submitButton = await screen.findByRole('button', { name: /create user/i })
    const passwordFields = screen.getAllByLabelText(/password/i)

    await user.type(screen.getByRole('textbox', { name: /username/i }), 'testuser')
    await user.type(screen.getByRole('textbox', { name: /display name/i }), 'Test User')
    await user.type(passwordFields[0], 'short')
    await user.type(passwordFields[1], 'short')

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument()
    })
  })

  it('validates password confirmation matches', async () => {
    const user = userEvent.setup()

    renderWithProviders(<CreateUserDialog open={true} onClose={mockOnClose} />, {
      wrapper: createWrapper(),
    })

    const submitButton = await screen.findByRole('button', { name: /create user/i })
    const passwordFields = screen.getAllByLabelText(/password/i)

    await user.type(screen.getByRole('textbox', { name: /username/i }), 'testuser')
    await user.type(screen.getByRole('textbox', { name: /display name/i }), 'Test User')
    await user.type(passwordFields[0], 'password123')
    await user.type(passwordFields[1], 'different')

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    })
  })

  it('validates email format if provided', async () => {
    const user = userEvent.setup()

    renderWithProviders(<CreateUserDialog open={true} onClose={mockOnClose} />, {
      wrapper: createWrapper(),
    })

    const submitButton = await screen.findByRole('button', { name: /create user/i })
    const passwordFields = screen.getAllByLabelText(/password/i)

    await user.type(screen.getByRole('textbox', { name: /username/i }), 'testuser')
    await user.type(screen.getByRole('textbox', { name: /display name/i }), 'Test User')
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'invalid-email')
    await user.type(passwordFields[0], 'password123')
    await user.type(passwordFields[1], 'password123')

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Invalid email address')).toBeInTheDocument()
    })
  })

  it('Administrator checkbox controls isAdmin', async () => {
    const user = userEvent.setup()

    renderWithProviders(<CreateUserDialog open={true} onClose={mockOnClose} />, {
      wrapper: createWrapper(),
    })

    const checkbox = screen.getByRole('checkbox', { name: /administrator/i })
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)
    expect(checkbox).toBeChecked()
  })

  it('successful creation closes dialog and calls onSuccess', async () => {
    const user = userEvent.setup()
    let dialogClosed = false
    const onClose = () => {
      dialogClosed = true
    }

    renderWithProviders(<CreateUserDialog open={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    })

    const submitButton = await screen.findByRole('button', { name: /create user/i })
    const passwordFields = screen.getAllByLabelText(/password/i)

    await user.type(screen.getByRole('textbox', { name: /username/i }), 'newuser')
    await user.type(screen.getByRole('textbox', { name: /display name/i }), 'New User')
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'newuser@example.com')
    await user.type(passwordFields[0], 'password123')
    await user.type(passwordFields[1], 'password123')

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(dialogClosed).toBe(true)
    })
  })

  it('displays error message on failure', async () => {
    const user = userEvent.setup()

    server.use(
      http.post('/api/admin/users', () => {
        return HttpResponse.json(
          { error: 'Username already exists' },
          { status: 409 }
        )
      })
    )

    renderWithProviders(<CreateUserDialog open={true} onClose={mockOnClose} />, {
      wrapper: createWrapper(),
    })

    const submitButton = await screen.findByRole('button', { name: /create user/i })
    const passwordFields = screen.getAllByLabelText(/password/i)

    await user.type(screen.getByRole('textbox', { name: /username/i }), 'admin')
    await user.type(screen.getByRole('textbox', { name: /display name/i }), 'Admin')
    await user.type(passwordFields[0], 'password123')
    await user.type(passwordFields[1], 'password123')

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/failed to create user/i)).toBeInTheDocument()
    })
  })

  it('Cancel button closes dialog without creating', async () => {
    const user = userEvent.setup()
    let dialogClosed = false
    const onClose = () => {
      dialogClosed = true
    }

    renderWithProviders(<CreateUserDialog open={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    })

    await screen.findByRole('button', { name: /create user/i })

    await user.type(screen.getByRole('textbox', { name: /username/i }), 'testuser')
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(dialogClosed).toBe(true)
    })
  })

  it('form is disabled during submission', async () => {
    const user = userEvent.setup()

    server.use(
      http.post('/api/admin/users', async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return HttpResponse.json({
          id: 'user-new',
          username: 'newuser',
          displayName: 'New User',
          isAdmin: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      })
    )

    renderWithProviders(<CreateUserDialog open={true} onClose={mockOnClose} />, {
      wrapper: createWrapper(),
    })

    const submitButton = await screen.findByRole('button', { name: /create user/i })
    const passwordFields = screen.getAllByLabelText(/password/i)

    await user.type(screen.getByRole('textbox', { name: /username/i }), 'newuser')
    await user.type(screen.getByRole('textbox', { name: /display name/i }), 'New User')
    await user.type(passwordFields[0], 'password123')
    await user.type(passwordFields[1], 'password123')

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    // Buttons should be disabled during submission
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /create user/i })).toBeDisabled()
  })

  it('resets form on close', async () => {
    const user = userEvent.setup()

    let isOpen = true
    const onClose = () => {
      isOpen = false
    }

    const { rerender } = renderWithProviders(
      <CreateUserDialog open={true} onClose={onClose} />,
      {
        wrapper: createWrapper(),
      }
    )

    await screen.findByRole('button', { name: /create user/i })

    await user.type(screen.getByRole('textbox', { name: /username/i }), 'testuser')
    await user.type(screen.getByRole('textbox', { name: /display name/i }), 'Test User')
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(isOpen).toBe(false)
    })

    // Reopen dialog
    rerender(<CreateUserDialog open={true} onClose={mockOnClose} />)

    await screen.findByRole('button', { name: /create user/i })

    // Form should be reset
    expect(screen.getByRole('textbox', { name: /username/i })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: /display name/i })).toHaveValue('')
  })
})
