import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup.js'
import {
  useUsers,
  useUser,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  UserWithStats,
  CreateUserRequest,
  UpdateUserRequest,
} from './useUsers.js'

describe('useUsers', () => {
  const mockUsers: UserWithStats[] = [
    {
      id: 'user-1',
      username: 'user1',
      displayName: 'User One',
      email: 'user1@example.com',
      isAdmin: false,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      personaCount: 2,
      sessionCount: 1,
    },
    {
      id: 'user-2',
      username: 'admin',
      displayName: 'Admin User',
      email: 'admin@example.com',
      isAdmin: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      personaCount: 5,
      sessionCount: 2,
    },
  ]

  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }

  beforeEach(() => {
    server.resetHandlers()
  })

  it('fetches users successfully', async () => {
    server.use(
      http.get('/api/admin/users', () => {
        return HttpResponse.json(mockUsers)
      })
    )

    const { result } = renderHook(() => useUsers(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockUsers)
    expect(result.current.data).toHaveLength(2)
  })

  it('handles error when fetching users fails', async () => {
    server.use(
      http.get('/api/admin/users', () => {
        return HttpResponse.json(
          { message: 'Failed to fetch users' },
          { status: 500 }
        )
      })
    )

    const { result } = renderHook(() => useUsers(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error?.message).toBe('Failed to fetch users')
    expect(result.current.error?.statusCode).toBe(500)
  })

  it('fetches single user successfully', async () => {
    const userId = 'user-1'
    server.use(
      http.get('/api/admin/users/:userId', ({ params }) => {
        const user = mockUsers.find((u) => u.id === params.userId)
        if (user) {
          return HttpResponse.json(user)
        }
        return HttpResponse.json(
          { message: 'User not found' },
          { status: 404 }
        )
      })
    )

    const { result } = renderHook(() => useUser(userId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockUsers[0])
  })

  it('handles error when fetching single user fails', async () => {
    const userId = 'nonexistent'
    server.use(
      http.get('/api/admin/users/:userId', () => {
        return HttpResponse.json(
          { message: 'User not found' },
          { status: 404 }
        )
      })
    )

    const { result } = renderHook(() => useUser(userId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error?.message).toBe('User not found')
    expect(result.current.error?.statusCode).toBe(404)
  })

  it('creates user successfully', async () => {
    const newUser: CreateUserRequest = {
      username: 'newuser',
      password: 'password123',
      displayName: 'New User',
      email: 'newuser@example.com',
      isAdmin: false,
    }

    const createdUser = {
      id: 'user-3',
      username: newUser.username,
      displayName: newUser.displayName,
      email: newUser.email,
      isAdmin: newUser.isAdmin,
      createdAt: '2024-01-02T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    }

    server.use(
      http.post('/api/admin/users', async ({ request }) => {
        const body = (await request.json()) as CreateUserRequest
        expect(body).toEqual(newUser)
        return HttpResponse.json(createdUser)
      })
    )

    const { result } = renderHook(() => useCreateUser(), {
      wrapper: createWrapper(),
    })

    await result.current.mutateAsync(newUser)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(createdUser)
  })

  it('handles error when creating user fails', async () => {
    const newUser: CreateUserRequest = {
      username: 'duplicate',
      password: 'password123',
      displayName: 'Duplicate User',
      isAdmin: false,
    }

    server.use(
      http.post('/api/admin/users', () => {
        return HttpResponse.json(
          { message: 'Username already exists' },
          { status: 409 }
        )
      })
    )

    const { result } = renderHook(() => useCreateUser(), {
      wrapper: createWrapper(),
    })

    try {
      await result.current.mutateAsync(newUser)
    } catch (error) {
      expect((error as any).message).toBe('Username already exists')
      expect((error as any).statusCode).toBe(409)
    }

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })

  it('updates user successfully', async () => {
    const userId = 'user-1'
    const updateData: UpdateUserRequest = {
      displayName: 'Updated Name',
      email: 'updated@example.com',
    }

    const updatedUser = {
      ...mockUsers[0],
      displayName: updateData.displayName,
      email: updateData.email,
      updatedAt: '2024-01-02T00:00:00.000Z',
    }

    server.use(
      http.put('/api/admin/users/:userId', async ({ request, params }) => {
        expect(params.userId).toBe(userId)
        const body = (await request.json()) as UpdateUserRequest
        expect(body).toEqual(updateData)
        return HttpResponse.json(updatedUser)
      })
    )

    const { result } = renderHook(() => useUpdateUser(), {
      wrapper: createWrapper(),
    })

    await result.current.mutateAsync({ userId, data: updateData })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(updatedUser)
  })

  it('handles error when updating user fails', async () => {
    const userId = 'user-1'
    const updateData: UpdateUserRequest = {
      displayName: 'Updated Name',
    }

    server.use(
      http.put('/api/admin/users/:userId', () => {
        return HttpResponse.json(
          { message: 'Failed to update user' },
          { status: 500 }
        )
      })
    )

    const { result } = renderHook(() => useUpdateUser(), {
      wrapper: createWrapper(),
    })

    try {
      await result.current.mutateAsync({ userId, data: updateData })
    } catch (error) {
      expect((error as any).message).toBe('Failed to update user')
      expect((error as any).statusCode).toBe(500)
    }

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })

  it('deletes user successfully', async () => {
    const userId = 'user-1'

    server.use(
      http.delete('/api/admin/users/:userId', ({ params }) => {
        expect(params.userId).toBe(userId)
        return new HttpResponse(null, { status: 204 })
      })
    )

    const { result } = renderHook(() => useDeleteUser(), {
      wrapper: createWrapper(),
    })

    await result.current.mutateAsync(userId)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
  })

  it('handles error when deleting user fails', async () => {
    const userId = 'user-1'

    server.use(
      http.delete('/api/admin/users/:userId', () => {
        return HttpResponse.json(
          { message: 'Cannot delete user with active sessions' },
          { status: 409 }
        )
      })
    )

    const { result } = renderHook(() => useDeleteUser(), {
      wrapper: createWrapper(),
    })

    try {
      await result.current.mutateAsync(userId)
    } catch (error) {
      expect((error as any).message).toBe('Cannot delete user with active sessions')
      expect((error as any).statusCode).toBe(409)
    }

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })
})
