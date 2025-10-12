/**
 * Tests for ApiKeyManagementPanel component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/utils/test-utils.js'
import ApiKeyManagementPanel from './ApiKeyManagementPanel.js'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup.js'

describe('ApiKeyManagementPanel', () => {
  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    isAdmin: false,
  }

  const mockAdminUser = {
    ...mockUser,
    isAdmin: true,
  }

  const mockUserKeys = [
    {
      id: 'key-1',
      userId: 'user-1',
      provider: 'anthropic',
      keyName: 'My Anthropic Key',
      keyMask: 'sk-ant-...abc123',
      isActive: true,
      lastUsedAt: '2025-10-10T10:00:00Z',
      createdAt: '2025-10-01T00:00:00Z',
      updatedAt: '2025-10-01T00:00:00Z',
    },
    {
      id: 'key-2',
      userId: 'user-1',
      provider: 'openai',
      keyName: 'OpenAI Development',
      keyMask: 'sk-...xyz789',
      isActive: false,
      createdAt: '2025-10-05T00:00:00Z',
      updatedAt: '2025-10-05T00:00:00Z',
    },
  ]

  const mockAdminKeys = [
    {
      id: 'admin-key-1',
      userId: null,
      provider: 'google',
      keyName: 'Shared Google Key',
      keyMask: 'AIza...def456',
      isActive: true,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      isAdminKey: true,
    },
  ]

  beforeEach(() => {
    // Set up default handlers for all tests
    server.use(
      http.get('/api/api-keys', () => {
        return HttpResponse.json(mockUserKeys)
      }),
      http.get('/api/admin/api-keys', () => {
        return HttpResponse.json(mockAdminKeys.map(k => ({ ...k, isAdminKey: undefined })))
      })
    )
  })

  it('renders loading state', () => {
    server.use(
      http.get('/api/api-keys', async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return HttpResponse.json([])
      }),
      http.get('/api/admin/api-keys', async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return HttpResponse.json([])
      })
    )

    renderWithProviders(<ApiKeyManagementPanel />, {
      preloadedState: {
        user: {
          currentUser: mockAdminUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    server.use(
      http.get('/api/api-keys', () => {
        return HttpResponse.json(
          { message: 'Failed to load API keys' },
          { status: 500 }
        )
      })
    )

    renderWithProviders(<ApiKeyManagementPanel />, {
      preloadedState: {
        user: {
          currentUser: mockAdminUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByText(/failed to load api keys/i)).toBeInTheDocument()
    })
  })

  it('renders empty state', async () => {
    server.use(
      http.get('/api/api-keys', () => {
        return HttpResponse.json([])
      })
    )

    renderWithProviders(<ApiKeyManagementPanel />, {
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByText(/no api keys configured/i)).toBeInTheDocument()
    })
  })

  it('renders table with API keys', async () => {
    renderWithProviders(<ApiKeyManagementPanel />, {
      preloadedState: {
        user: {
          currentUser: mockAdminUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    expect(screen.getByText('My Anthropic Key')).toBeInTheDocument()
    expect(screen.getByText('OpenAI Development')).toBeInTheDocument()
    expect(screen.getByText('Shared Google Key')).toBeInTheDocument()
  })

  it('displays provider names correctly', async () => {
    renderWithProviders(<ApiKeyManagementPanel />, {
      preloadedState: {
        user: {
          currentUser: mockAdminUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByText('Anthropic')).toBeInTheDocument()
    })

    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByText('Google')).toBeInTheDocument()
  })

  it('displays key mask', async () => {
    renderWithProviders(<ApiKeyManagementPanel />, {
      preloadedState: {
        user: {
          currentUser: mockAdminUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByText('sk-ant-...abc123')).toBeInTheDocument()
    })

    expect(screen.getByText('sk-...xyz789')).toBeInTheDocument()
    expect(screen.getByText('AIza...def456')).toBeInTheDocument()
  })

  it('shows Active chip for active keys', async () => {
    renderWithProviders(<ApiKeyManagementPanel />, {
      preloadedState: {
        user: {
          currentUser: mockAdminUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await waitFor(() => {
      const activeChips = screen.getAllByText('Active')
      expect(activeChips.length).toBeGreaterThan(0)
    })
  })

  it('shows Inactive chip for inactive keys', async () => {
    renderWithProviders(<ApiKeyManagementPanel />, {
      preloadedState: {
        user: {
          currentUser: mockAdminUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByText('Inactive')).toBeInTheDocument()
    })
  })

  it('formats last used date correctly', async () => {
    renderWithProviders(<ApiKeyManagementPanel />, {
      preloadedState: {
        user: {
          currentUser: mockAdminUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByText('Oct 10, 2025')).toBeInTheDocument()
    })
  })

  it('shows lock icon and Admin Key chip for admin keys', async () => {
    renderWithProviders(<ApiKeyManagementPanel />, {
      preloadedState: {
        user: {
          currentUser: mockAdminUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await waitFor(() => {
      const adminKeyChips = screen.getAllByText('Admin Key')
      expect(adminKeyChips.length).toBeGreaterThan(0)
    })
  })

  it('Add Key button opens create dialog', async () => {
    const user = userEvent.setup()

    renderWithProviders(<ApiKeyManagementPanel />, {
      preloadedState: {
        user: {
          currentUser: mockAdminUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add key/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /add key/i }))

    await waitFor(() => {
      const dialogs = screen.getAllByRole('dialog')
      expect(dialogs.length).toBeGreaterThan(0)
    })
  })

  it('Edit button opens edit dialog', async () => {
    const user = userEvent.setup()

    renderWithProviders(<ApiKeyManagementPanel />, {
      preloadedState: {
        user: {
          currentUser: mockAdminUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByText('My Anthropic Key')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', { name: /edit key/i })
    await user.click(editButtons[0])

    await waitFor(() => {
      const dialogs = screen.getAllByRole('dialog')
      expect(dialogs.length).toBeGreaterThan(0)
    })
  })

  it('Delete button opens confirm dialog', async () => {
    const user = userEvent.setup()

    renderWithProviders(<ApiKeyManagementPanel />, {
      preloadedState: {
        user: {
          currentUser: mockAdminUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByText('My Anthropic Key')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByRole('button', { name: /delete key/i })
    await user.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Delete API Key')).toBeInTheDocument()
      expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument()
    })
  })

  it('Confirm delete removes key', async () => {
    const user = userEvent.setup()
    let deletedKeyId: string | null = null

    server.use(
      http.delete('/api/api-keys/:keyId', ({ params }) => {
        deletedKeyId = params.keyId as string
        return HttpResponse.json({ success: true })
      })
    )

    renderWithProviders(<ApiKeyManagementPanel />, {
      preloadedState: {
        user: {
          currentUser: mockAdminUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByText('My Anthropic Key')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByRole('button', { name: /delete key/i })
    await user.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => {
      expect(deletedKeyId).toBe('key-1')
    })
  })

  it('Toggle active button updates key status', async () => {
    const user = userEvent.setup()
    let updatedKey: any = null

    server.use(
      http.put('/api/api-keys/:keyId', async ({ request, params }) => {
        updatedKey = {
          keyId: params.keyId,
          data: await request.json(),
        }
        return HttpResponse.json({ ...mockUserKeys[0], isActive: !mockUserKeys[0].isActive })
      })
    )

    renderWithProviders(<ApiKeyManagementPanel />, {
      preloadedState: {
        user: {
          currentUser: mockAdminUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByText('My Anthropic Key')).toBeInTheDocument()
    })

    const toggleButtons = screen.getAllByRole('button', { name: /toggle active status/i })
    await user.click(toggleButtons[0])

    await waitFor(() => {
      expect(updatedKey).toBeTruthy()
      expect(updatedKey.data.isActive).toBe(false)
    })
  })

  it('Admin keys have no edit/delete/toggle buttons', async () => {
    renderWithProviders(<ApiKeyManagementPanel />, {
      preloadedState: {
        user: {
          currentUser: mockAdminUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByText('Shared Google Key')).toBeInTheDocument()
    })

    // Admin keys should have 2 action buttons (for user keys) but not for the admin key row
    const editButtons = screen.getAllByRole('button', { name: /edit key/i })
    const deleteButtons = screen.getAllByRole('button', { name: /delete key/i })
    const toggleButtons = screen.getAllByRole('button', { name: /toggle active status/i })

    // Should be 2 of each (for the 2 user keys), not 3
    expect(editButtons.length).toBe(2)
    expect(deleteButtons.length).toBe(2)
    expect(toggleButtons.length).toBe(2)
  })

  it('User keys have all action buttons', async () => {
    renderWithProviders(<ApiKeyManagementPanel />, {
      preloadedState: {
        user: {
          currentUser: mockAdminUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByText('My Anthropic Key')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', { name: /edit key/i })
    const deleteButtons = screen.getAllByRole('button', { name: /delete key/i })
    const toggleButtons = screen.getAllByRole('button', { name: /toggle active status/i })

    expect(editButtons.length).toBeGreaterThan(0)
    expect(deleteButtons.length).toBeGreaterThan(0)
    expect(toggleButtons.length).toBeGreaterThan(0)
  })
})
