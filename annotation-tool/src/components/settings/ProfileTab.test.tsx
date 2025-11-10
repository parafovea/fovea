/**
 * Tests for ProfileTab component.
 */

import { describe, it, expect } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/utils/test-utils.js'
import ProfileTab from './ProfileTab.js'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup.js'

describe('ProfileTab', () => {
  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    isAdmin: false,
  }

  it('renders profile form with pre-filled data', async () => {
    renderWithProviders(<ProfileTab showPasswordChange={false} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await screen.findByRole('button', { name: /save profile/i })

    expect(screen.getByDisplayValue('testuser')).toBeDisabled()
    expect(screen.getByDisplayValue('Test User')).not.toBeDisabled()
    expect(screen.getByDisplayValue('test@example.com')).not.toBeDisabled()
  })

  it('username field is disabled with helper text', async () => {
    renderWithProviders(<ProfileTab showPasswordChange={false} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await screen.findByRole('button', { name: /save profile/i })

    const usernameField = screen.getByDisplayValue('testuser')
    expect(usernameField).toBeDisabled()
    expect(screen.getByText('Username cannot be changed')).toBeInTheDocument()
  })

  it('display name can be edited', async () => {
    const user = userEvent.setup()

    renderWithProviders(<ProfileTab showPasswordChange={false} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await screen.findByRole('button', { name: /save profile/i })

    const displayNameField = screen.getByRole('textbox', { name: /display name/i })
    await user.clear(displayNameField)
    await user.type(displayNameField, 'Updated Name')

    expect(displayNameField).toHaveValue('Updated Name')
  })

  it('email can be edited', async () => {
    const user = userEvent.setup()

    renderWithProviders(<ProfileTab showPasswordChange={false} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await screen.findByRole('button', { name: /save profile/i })

    const emailField = screen.getByRole('textbox', { name: /email/i })
    await user.clear(emailField)
    await user.type(emailField, 'updated@example.com')

    expect(emailField).toHaveValue('updated@example.com')
  })

  it('validates display name required', async () => {
    const user = userEvent.setup()

    renderWithProviders(<ProfileTab showPasswordChange={false} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    const submitButton = await screen.findByRole('button', { name: /save profile/i })

    const displayNameField = screen.getByRole('textbox', { name: /display name/i })
    await user.clear(displayNameField)

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Display name is required')).toBeInTheDocument()
    })
  })

  it('validates email format', async () => {
    const user = userEvent.setup()

    renderWithProviders(<ProfileTab showPasswordChange={false} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    const submitButton = await screen.findByRole('button', { name: /save profile/i })

    const emailField = screen.getByRole('textbox', { name: /email/i })
    await user.clear(emailField)
    await user.type(emailField, 'invalid-email')

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Invalid email address')).toBeInTheDocument()
    })
  })

  it('saves profile on submit', async () => {
    const user = userEvent.setup()
    let savedProfile: any = null

    server.use(
      http.put('/api/user/profile', async ({ request }) => {
        savedProfile = await request.json()
        return HttpResponse.json({
          user: {
            ...mockUser,
            displayName: savedProfile.displayName,
            email: savedProfile.email,
          },
        })
      })
    )

    renderWithProviders(<ProfileTab showPasswordChange={false} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    const submitButton = await screen.findByRole('button', { name: /save profile/i })

    const displayNameField = screen.getByRole('textbox', { name: /display name/i })
    await user.clear(displayNameField)
    await user.type(displayNameField, 'Updated Name')

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(savedProfile).toBeTruthy()
      expect(savedProfile.displayName).toBe('Updated Name')
    })
  })

  it('shows success message on save', async () => {
    const user = userEvent.setup()

    renderWithProviders(<ProfileTab showPasswordChange={false} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    const submitButton = await screen.findByRole('button', { name: /save profile/i })

    const displayNameField = screen.getByRole('textbox', { name: /display name/i })
    await user.clear(displayNameField)
    await user.type(displayNameField, 'Updated Name')

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Profile updated successfully')).toBeInTheDocument()
    })
  })

  it('shows error message on save failure', async () => {
    const user = userEvent.setup()

    server.use(
      http.put('/api/user/profile', () => {
        return HttpResponse.json(
          { message: 'Failed to update profile' },
          { status: 500 }
        )
      })
    )

    renderWithProviders(<ProfileTab showPasswordChange={false} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    const submitButton = await screen.findByRole('button', { name: /save profile/i })

    const displayNameField = screen.getByRole('textbox', { name: /display name/i })
    await user.clear(displayNameField)
    await user.type(displayNameField, 'Updated Name')

    const form = submitButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Failed to update profile')).toBeInTheDocument()
    })
  })

  it('password section visible when showPasswordChange=true', async () => {
    renderWithProviders(<ProfileTab showPasswordChange={true} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await screen.findByRole('button', { name: /save profile/i })

    // Check for accordion heading
    expect(screen.getByRole('heading', { name: /change password/i })).toBeInTheDocument()
  })

  it('password section hidden when showPasswordChange=false', async () => {
    renderWithProviders(<ProfileTab showPasswordChange={false} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await screen.findByRole('button', { name: /save profile/i })

    expect(screen.queryByRole('heading', { name: /change password/i })).not.toBeInTheDocument()
  })

  it('validates password fields', async () => {
    const user = userEvent.setup()

    renderWithProviders(<ProfileTab showPasswordChange={true} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await screen.findByRole('button', { name: /save profile/i })

    // Expand password accordion (click the accordion button, not the submit button)
    const accordionButtons = screen.getAllByRole('button', { name: /change password/i })
    await user.click(accordionButtons[0])

    await waitFor(() => {
      expect(screen.getByLabelText(/current password/i)).toBeVisible()
    })

    // Get the password change form (second button is the submit button)
    const changePasswordButtons = screen.getAllByRole('button', { name: /change password/i })
    const changePasswordButton = changePasswordButtons[1]
    const form = changePasswordButton.closest('form')!

    // Submit without filling any fields
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Current password is required')).toBeInTheDocument()
    })

    // Fill current password but leave new password empty
    const currentPasswordField = screen.getByLabelText(/current password/i)
    await user.type(currentPasswordField, 'oldpassword')

    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('New password is required')).toBeInTheDocument()
    })

    // Fill new password but too short
    const passwordFields = screen.getAllByLabelText(/password/i)
    const newPasswordField = passwordFields[1] // Current, New, Confirm - so index 1 is New
    await user.type(newPasswordField, 'short')

    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    })

    // Fill new password correctly but mismatch confirm
    await user.clear(newPasswordField)
    await user.type(newPasswordField, 'newpassword123')

    const confirmPasswordField = screen.getByLabelText(/confirm new password/i)
    await user.type(confirmPasswordField, 'different')

    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    })
  })

  it('changes password on submit', async () => {
    const user = userEvent.setup()
    let passwordPayload: any = null

    server.use(
      http.put('/api/user/profile', async ({ request }) => {
        passwordPayload = await request.json()
        return HttpResponse.json({ user: mockUser })
      })
    )

    renderWithProviders(<ProfileTab showPasswordChange={true} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await screen.findByRole('button', { name: /save profile/i })

    // Expand password accordion (click the accordion button, not the submit button)
    const accordionButtons = screen.getAllByRole('button', { name: /change password/i })
    await user.click(accordionButtons[0])

    await waitFor(() => {
      expect(screen.getByLabelText(/current password/i)).toBeVisible()
    })

    // Fill password change form
    const passwordFields = screen.getAllByLabelText(/password/i)
    await user.type(passwordFields[0], 'oldpassword') // Current Password
    await user.type(passwordFields[1], 'newpassword123') // New Password
    await user.type(passwordFields[2], 'newpassword123') // Confirm New Password

    const changePasswordButtons = screen.getAllByRole('button', { name: /change password/i })
    const changePasswordButton = changePasswordButtons[1]
    const form = changePasswordButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(passwordPayload).toBeTruthy()
      expect(passwordPayload.password).toBe('newpassword123')
    })
  })

  it('clears password form on success', async () => {
    const user = userEvent.setup()

    renderWithProviders(<ProfileTab showPasswordChange={true} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await screen.findByRole('button', { name: /save profile/i })

    // Expand password accordion (click the accordion button, not the submit button)
    const accordionButtons = screen.getAllByRole('button', { name: /change password/i })
    await user.click(accordionButtons[0])

    await waitFor(() => {
      expect(screen.getByLabelText(/current password/i)).toBeVisible()
    })

    // Fill password change form
    const passwordFields = screen.getAllByLabelText(/password/i)
    const currentPasswordField = passwordFields[0] as HTMLInputElement // Current Password
    const newPasswordField = passwordFields[1] as HTMLInputElement // New Password
    const confirmPasswordField = passwordFields[2] as HTMLInputElement // Confirm New Password

    await user.type(currentPasswordField, 'oldpassword')
    await user.type(newPasswordField, 'newpassword123')
    await user.type(confirmPasswordField, 'newpassword123')

    const changePasswordButtons = screen.getAllByRole('button', { name: /change password/i })
    const changePasswordButton = changePasswordButtons[1]
    const form = changePasswordButton.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Profile updated successfully')).toBeInTheDocument()
    })

    // Password fields should be cleared
    await waitFor(() => {
      expect(currentPasswordField.value).toBe('')
      expect(newPasswordField.value).toBe('')
      expect(confirmPasswordField.value).toBe('')
    })
  })
})
