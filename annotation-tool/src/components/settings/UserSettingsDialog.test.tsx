/**
 * Tests for UserSettingsDialog component.
 */

import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/utils/test-utils.js'
import UserSettingsDialog from './UserSettingsDialog.js'

describe('UserSettingsDialog', () => {
  const mockOnClose = vi.fn()

  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    isAdmin: false,
  }

  it('renders dialog when open', async () => {
    renderWithProviders(<UserSettingsDialog open={true} onClose={mockOnClose} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await screen.findByRole('dialog')
    expect(screen.getByText('User Settings')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    renderWithProviders(<UserSettingsDialog open={false} onClose={mockOnClose} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('displays all three tabs', async () => {
    renderWithProviders(<UserSettingsDialog open={true} onClose={mockOnClose} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await screen.findByRole('dialog')

    expect(screen.getByRole('tab', { name: /profile/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /api keys/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /preferences/i })).toBeInTheDocument()
  })

  it('defaults to Profile tab', async () => {
    renderWithProviders(<UserSettingsDialog open={true} onClose={mockOnClose} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await screen.findByRole('dialog')

    const profileTab = screen.getByRole('tab', { name: /profile/i })
    expect(profileTab).toHaveAttribute('aria-selected', 'true')
  })

  it('switches to API Keys tab', async () => {
    const user = userEvent.setup()

    renderWithProviders(<UserSettingsDialog open={true} onClose={mockOnClose} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await screen.findByRole('dialog')

    const apiKeysTab = screen.getByRole('tab', { name: /api keys/i })
    await user.click(apiKeysTab)

    await waitFor(() => {
      expect(apiKeysTab).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('switches to Preferences tab', async () => {
    const user = userEvent.setup()

    renderWithProviders(<UserSettingsDialog open={true} onClose={mockOnClose} />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await screen.findByRole('dialog')

    const preferencesTab = screen.getByRole('tab', { name: /preferences/i })
    await user.click(preferencesTab)

    await waitFor(() => {
      expect(preferencesTab).toHaveAttribute('aria-selected', 'true')
    })

    expect(screen.getByText('Preferences settings coming soon.')).toBeInTheDocument()
  })

  it('close button closes dialog and resets to Profile tab', async () => {
    const user = userEvent.setup()
    let dialogClosed = false
    const onClose = () => {
      dialogClosed = true
    }

    const { rerender } = renderWithProviders(
      <UserSettingsDialog open={true} onClose={onClose} />,
      {
        preloadedState: {
          user: {
            currentUser: mockUser,
            isAuthenticated: true,
            isLoading: false,
            mode: 'multi-user',
          },
        },
      }
    )

    await screen.findByRole('dialog')

    // Switch to API Keys tab
    const apiKeysTab = screen.getByRole('tab', { name: /api keys/i })
    await user.click(apiKeysTab)

    await waitFor(() => {
      expect(apiKeysTab).toHaveAttribute('aria-selected', 'true')
    })

    // Close dialog using the DialogActions button
    const closeButtons = screen.getAllByRole('button', { name: /close/i })
    await user.click(closeButtons[1]) // The second one is the DialogActions button

    await waitFor(() => {
      expect(dialogClosed).toBe(true)
    })

    // Reopen dialog
    rerender(<UserSettingsDialog open={true} onClose={mockOnClose} />)

    await screen.findByRole('dialog')

    // Should be back to Profile tab
    const profileTab = screen.getByRole('tab', { name: /profile/i })
    expect(profileTab).toHaveAttribute('aria-selected', 'true')
  })
})
