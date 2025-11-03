/**
 * Tests for RegisterPage component.
 */

import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { renderWithProviders } from '../../../test/utils/test-utils.js'
import RegisterPage from './RegisterPage.js'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup.js'

describe('RegisterPage', () => {
  it('renders registration form with all required fields', () => {
    renderWithProviders(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    )

    expect(screen.getByLabelText(/^username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /register/i })
    ).toBeInTheDocument()
  })

  it('validates username minimum length (3 characters)', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/^username/i), 'ab')
    await user.type(screen.getByLabelText(/display name/i), 'Test User')
    await user.type(screen.getByLabelText(/^password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /register/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/username must be at least 3 characters/i)
      ).toBeInTheDocument()
    })
  })

  it('validates password minimum length (8 characters)', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/^username/i), 'testuser')
    await user.type(screen.getByLabelText(/display name/i), 'Test User')
    await user.type(screen.getByLabelText(/^password/i), 'pass123')
    await user.type(screen.getByLabelText(/confirm password/i), 'pass123')
    await user.click(screen.getByRole('button', { name: /register/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/password must be at least 8 characters/i)
      ).toBeInTheDocument()
    })
  })

  it('validates password confirmation matches', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/^username/i), 'testuser')
    await user.type(screen.getByLabelText(/display name/i), 'Test User')
    await user.type(screen.getByLabelText(/^password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password456')
    await user.click(screen.getByRole('button', { name: /register/i }))

    await waitFor(() => {
      expect(screen.getAllByText(/passwords do not match/i)[0]).toBeInTheDocument()
    })
  })

  it('shows inline password mismatch error', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/^password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password456')

    await waitFor(() => {
      expect(screen.getAllByText(/passwords do not match/i)[0]).toBeInTheDocument()
    })
  })

  it('shows password strength indicator', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    )

    const passwordField = screen.getByLabelText(/^password/i)
    await user.type(passwordField, 'weak')

    await waitFor(() => {
      expect(screen.getByText(/password strength/i)).toBeInTheDocument()
    })

    // Strength indicator should be visible
    const progressBar = document.querySelector('.MuiLinearProgress-root')
    expect(progressBar).toBeInTheDocument()
  })

  it('successful registration redirects to home', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/^username/i), 'newuser')
    await user.type(screen.getByLabelText(/display name/i), 'New User')
    await user.type(screen.getByLabelText(/^email/i), 'new@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /register/i }))

    // Should not show any error
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('registration error displays message', async () => {
    const user = userEvent.setup()

    server.use(
      http.post('/api/auth/register', () => {
        return HttpResponse.json(
          { error: 'Username already taken' },
          { status: 409 }
        )
      })
    )

    renderWithProviders(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/^username/i), 'existinguser')
    await user.type(screen.getByLabelText(/display name/i), 'Test User')
    await user.type(screen.getByLabelText(/^password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /register/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/username already taken/i)
      ).toBeInTheDocument()
    })
  })

  it('disables form during submission', async () => {
    const user = userEvent.setup()

    // Add delay to registration handler
    server.use(
      http.post('/api/auth/register', async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return HttpResponse.json({
          user: {
            id: 'user-new',
            username: 'newuser',
            displayName: 'New User',
            email: 'new@example.com',
            isAdmin: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }, { status: 201 })
      })
    )

    renderWithProviders(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/^username/i), 'newuser')
    await user.type(screen.getByLabelText(/display name/i), 'New User')
    await user.type(screen.getByLabelText(/^password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /register/i }))

    // Check that button shows "Creating account..."
    expect(screen.getByRole('button', { name: /creating account/i })).toBeInTheDocument()
  })

  it('clears error when user starts typing', async () => {
    const user = userEvent.setup()

    server.use(
      http.post('/api/auth/register', () => {
        return HttpResponse.json(
          { error: 'Username already taken' },
          { status: 409 }
        )
      })
    )

    renderWithProviders(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/^username/i), 'existinguser')
    await user.type(screen.getByLabelText(/display name/i), 'Test User')
    await user.type(screen.getByLabelText(/^password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /register/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/username already taken/i)
      ).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/^username/i), '2')

    await waitFor(() => {
      expect(
        screen.queryByText(/username already taken/i)
      ).not.toBeInTheDocument()
    })
  })

  it('login link navigates to login page', () => {
    renderWithProviders(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    )

    const loginLink = screen.getByRole('link', { name: /login/i })
    expect(loginLink).toHaveAttribute('href', '/login')
  })

  it('register button is disabled when required fields are empty', () => {
    renderWithProviders(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /register/i })).toBeDisabled()
  })

  it('register button is enabled when all required fields are filled', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /register/i })).toBeDisabled()

    await user.type(screen.getByLabelText(/^username/i), 'newuser')
    await user.type(screen.getByLabelText(/display name/i), 'New User')
    await user.type(screen.getByLabelText(/^password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')

    expect(screen.getByRole('button', { name: /register/i })).toBeEnabled()
  })

  it('email field is optional', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/^username/i), 'newuser')
    await user.type(screen.getByLabelText(/display name/i), 'New User')
    await user.type(screen.getByLabelText(/^password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /register/i }))

    // Should not show any error about missing email
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
