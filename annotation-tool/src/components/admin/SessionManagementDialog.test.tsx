/**
 * Tests for SessionManagementDialog component.
 */

import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/utils/test-utils.js'
import SessionManagementDialog from './SessionManagementDialog.js'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup.js'

describe('SessionManagementDialog', () => {
  const mockOnClose = vi.fn()

  const mockSessions = [
    {
      id: 'session-1',
      userId: 'user-1',
      username: 'testuser',
      displayName: 'Test User',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      createdAt: '2025-01-01T00:00:00Z',
      expiresAt: '2025-12-31T23:59:59Z',
    },
    {
      id: 'session-2',
      userId: 'user-2',
      username: 'admin',
      displayName: 'Admin User',
      ipAddress: '192.168.1.2',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      createdAt: '2025-01-02T00:00:00Z',
      expiresAt: '2025-12-30T23:59:59Z',
    },
  ]

  const expiredSession = {
    id: 'session-expired',
    userId: 'user-3',
    username: 'olduser',
    displayName: 'Old User',
    ipAddress: '192.168.1.3',
    userAgent: 'Chrome',
    createdAt: '2024-01-01T00:00:00Z',
    expiresAt: '2024-01-02T00:00:00Z',
  }

  it('renders dialog when open', async () => {
    renderWithProviders(<SessionManagementDialog open={true} onClose={mockOnClose} />)

    await screen.findByRole('dialog')
    expect(screen.getByText('Session Management')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    renderWithProviders(<SessionManagementDialog open={false} onClose={mockOnClose} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('displays loading state', async () => {
    server.use(
      http.get('/api/admin/sessions', async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return HttpResponse.json(mockSessions)
      })
    )

    renderWithProviders(<SessionManagementDialog open={true} onClose={mockOnClose} />)

    await screen.findByRole('dialog')
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('displays sessions in table', async () => {
    renderWithProviders(<SessionManagementDialog open={true} onClose={mockOnClose} />)

    await screen.findByRole('dialog')
    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument()
    })

    expect(screen.getByText('@testuser')).toBeInTheDocument()
    expect(screen.getByText('Admin User')).toBeInTheDocument()
    expect(screen.getByText('@admin')).toBeInTheDocument()

    // Check for table structure
    const table = screen.getByRole('table')
    expect(table).toBeInTheDocument()
  })

  it('displays empty state when no sessions', async () => {
    server.use(
      http.get('/api/admin/sessions', () => {
        return HttpResponse.json([])
      })
    )

    renderWithProviders(<SessionManagementDialog open={true} onClose={mockOnClose} />)

    await screen.findByRole('dialog')
    await waitFor(() => {
      expect(screen.getByText('No active sessions')).toBeInTheDocument()
    })
  })

  it('displays error message on load failure', async () => {
    server.use(
      http.get('/api/admin/sessions', () => {
        return HttpResponse.json(
          { error: 'Failed to load sessions' },
          { status: 500 }
        )
      })
    )

    renderWithProviders(<SessionManagementDialog open={true} onClose={mockOnClose} />)

    await screen.findByRole('dialog')
    await waitFor(() => {
      expect(screen.getByText(/failed to load sessions/i)).toBeInTheDocument()
    })
  })

  it('displays session count message', async () => {
    renderWithProviders(<SessionManagementDialog open={true} onClose={mockOnClose} />)

    await screen.findByRole('dialog')
    await waitFor(() => {
      expect(screen.getByText(/showing 2 active sessions/i)).toBeInTheDocument()
    })
  })

  it('shows expired chip for expired sessions', async () => {
    server.use(
      http.get('/api/admin/sessions', () => {
        return HttpResponse.json([expiredSession])
      })
    )

    renderWithProviders(<SessionManagementDialog open={true} onClose={mockOnClose} />)

    await screen.findByRole('dialog')
    await waitFor(() => {
      expect(screen.getByText('Expired')).toBeInTheDocument()
    })
  })

  it('truncates long user agent strings', async () => {
    const longUserAgent = 'A'.repeat(100)
    server.use(
      http.get('/api/admin/sessions', () => {
        return HttpResponse.json([
          {
            ...mockSessions[0],
            userAgent: longUserAgent,
          },
        ])
      })
    )

    renderWithProviders(<SessionManagementDialog open={true} onClose={mockOnClose} />)

    await screen.findByRole('dialog')
    await waitFor(() => {
      const truncated = screen.getByText(/A{47}\.\.\./i)
      expect(truncated).toBeInTheDocument()
    })
  })

  it('refresh button refetches sessions', async () => {
    const user = userEvent.setup()
    let fetchCount = 0

    server.use(
      http.get('/api/admin/sessions', () => {
        fetchCount++
        return HttpResponse.json(mockSessions)
      })
    )

    renderWithProviders(<SessionManagementDialog open={true} onClose={mockOnClose} />)

    await screen.findByRole('dialog')
    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument()
    })

    const initialCount = fetchCount

    const refreshButton = screen.getByRole('button', { name: /refresh sessions/i })
    await user.click(refreshButton)

    await waitFor(() => {
      expect(fetchCount).toBe(initialCount + 1)
    })
  })

  it('revoke button opens confirmation dialog', async () => {
    const user = userEvent.setup()

    renderWithProviders(<SessionManagementDialog open={true} onClose={mockOnClose} />)

    await screen.findByRole('dialog')
    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument()
    })

    const revokeButtons = screen.getAllByRole('button', { name: /revoke session/i })
    await user.click(revokeButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^revoke$/i })).toBeInTheDocument()
    })
  })

  it('confirm revoke removes session', async () => {
    const user = userEvent.setup()
    let revokedSessionId: string | null = null

    server.use(
      http.delete('/api/admin/sessions/:sessionId', ({ params }) => {
        revokedSessionId = params.sessionId as string
        return HttpResponse.json({ success: true })
      })
    )

    renderWithProviders(<SessionManagementDialog open={true} onClose={mockOnClose} />)

    await screen.findByRole('dialog')
    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument()
    })

    const revokeButtons = screen.getAllByRole('button', { name: /revoke session/i })
    await user.click(revokeButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^revoke$/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^revoke$/i }))

    await waitFor(() => {
      expect(revokedSessionId).toBe('session-1')
    })
  })

  it('close button closes dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    renderWithProviders(<SessionManagementDialog open={true} onClose={onClose} />)

    await screen.findByRole('dialog')
    await waitFor(() => {
      expect(screen.getByText('Session Management')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /close/i }))

    expect(onClose).toHaveBeenCalled()
  })
})
