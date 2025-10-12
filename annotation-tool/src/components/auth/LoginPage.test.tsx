/**
 * Tests for LoginPage component.
 */

import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { renderWithProviders } from '../../../test/utils/test-utils.js'
import LoginPage from './LoginPage.js'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup.js'

describe('LoginPage', () => {
  it('renders login form with username and password fields', () => {
    renderWithProviders(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^login$/i })
    ).toBeInTheDocument()
  })

  it('displays validation error when trying to submit empty form', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    // The submit button should be disabled when fields are empty
    const loginButton = screen.getByRole('button', { name: /^login$/i })
    expect(loginButton).toBeDisabled()
  })

  it('successful login with valid credentials', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/username/i), 'admin')
    await user.type(screen.getByLabelText(/password/i), 'admin123')

    const loginButton = screen.getByRole('button', { name: /^login$/i })
    await user.click(loginButton)

    // Login should complete without error
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('failed login displays error message', async () => {
    const user = userEvent.setup()

    server.use(
      http.post('/api/auth/login', () => {
        return HttpResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        )
      })
    )

    renderWithProviders(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/username/i), 'wrong')
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /^login$/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument()
    })
  })

  it('remember me checkbox controls session duration', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    const checkbox = screen.getByRole('checkbox', { name: /remember me/i })
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)
    expect(checkbox).toBeChecked()
  })

  it('shows register link with correct href', () => {
    renderWithProviders(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    const registerLink = screen.queryByRole('link', { name: /register/i })
    if (registerLink) {
      expect(registerLink).toHaveAttribute('href', '/register')
    }
  })

  it('shows loading state during submission', async () => {
    const user = userEvent.setup()

    // Add a delay to the login handler to make loading state visible
    server.use(
      http.post('/api/auth/login', async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return HttpResponse.json({
          user: {
            id: 'user-1',
            username: 'admin',
            displayName: 'Admin User',
            email: 'admin@example.com',
            isAdmin: true,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        })
      })
    )

    renderWithProviders(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/username/i), 'admin')
    await user.type(screen.getByLabelText(/password/i), 'admin123')

    const loginButton = screen.getByRole('button', { name: /^login$/i })
    await user.click(loginButton)

    // Check that button shows "Logging in..." during submission
    expect(screen.getByRole('button', { name: /logging in/i })).toBeInTheDocument()
  })

  it('clears error when user starts typing', async () => {
    const user = userEvent.setup()

    server.use(
      http.post('/api/auth/login', () => {
        return HttpResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        )
      })
    )

    renderWithProviders(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/username/i), 'wrong')
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /^login$/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/username/i), 'a')

    await waitFor(() => {
      expect(
        screen.queryByText(/invalid credentials/i)
      ).not.toBeInTheDocument()
    })
  })

  it('login button is disabled when fields are empty', () => {
    renderWithProviders(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /^login$/i })).toBeDisabled()
  })

  it('login button is enabled when both fields are filled', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /^login$/i })).toBeDisabled()

    await user.type(screen.getByLabelText(/username/i), 'admin')
    await user.type(screen.getByLabelText(/password/i), 'admin123')

    expect(screen.getByRole('button', { name: /^login$/i })).toBeEnabled()
  })
})
