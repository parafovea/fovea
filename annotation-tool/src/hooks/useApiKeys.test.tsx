import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup.js'
import {
  useApiKeys,
  useAdminApiKeys,
  useAllApiKeys,
  useCreateApiKey,
  useUpdateApiKey,
  useDeleteApiKey,
  ApiKey,
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
} from './useApiKeys.js'

describe('useApiKeys', () => {
  const mockUserKeys: ApiKey[] = [
    {
      id: 'key-1',
      userId: 'user-1',
      provider: 'anthropic',
      keyName: 'My Claude Key',
      keyMask: 'sk-ant-...1234',
      isActive: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'key-2',
      userId: 'user-1',
      provider: 'openai',
      keyName: 'My OpenAI Key',
      keyMask: 'sk-...5678',
      isActive: true,
      lastUsedAt: '2024-01-02T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ]

  const mockAdminKeys: ApiKey[] = [
    {
      id: 'admin-key-1',
      userId: 'admin-1',
      provider: 'anthropic',
      keyName: 'Shared Claude Key',
      keyMask: 'sk-ant-...9999',
      isActive: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
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

  it('fetches user API keys successfully', async () => {
    server.use(
      http.get('/api/api-keys', () => {
        return HttpResponse.json(mockUserKeys)
      })
    )

    const { result } = renderHook(() => useApiKeys(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockUserKeys)
    expect(result.current.data).toHaveLength(2)
  })

  it('handles error when fetching user API keys fails', async () => {
    server.use(
      http.get('/api/api-keys', () => {
        return HttpResponse.json(
          { message: 'Failed to fetch API keys' },
          { status: 500 }
        )
      })
    )

    const { result } = renderHook(() => useApiKeys(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error?.message).toBe('Failed to fetch API keys')
    expect(result.current.error?.statusCode).toBe(500)
  })

  it('fetches admin API keys successfully with isAdminKey flag', async () => {
    server.use(
      http.get('/api/admin/api-keys', () => {
        return HttpResponse.json(mockAdminKeys)
      })
    )

    const { result } = renderHook(() => useAdminApiKeys(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0].isAdminKey).toBe(true)
    expect(result.current.data?.[0].keyName).toBe('Shared Claude Key')
  })

  it('handles error when fetching admin API keys fails', async () => {
    server.use(
      http.get('/api/admin/api-keys', () => {
        return HttpResponse.json(
          { message: 'Forbidden' },
          { status: 403 }
        )
      })
    )

    const { result } = renderHook(() => useAdminApiKeys(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error?.message).toBe('Forbidden')
    expect(result.current.error?.statusCode).toBe(403)
  })

  it('combines user and admin keys when user is admin', async () => {
    server.use(
      http.get('/api/api-keys', () => {
        return HttpResponse.json(mockUserKeys)
      }),
      http.get('/api/admin/api-keys', () => {
        return HttpResponse.json(mockAdminKeys)
      })
    )

    const { result } = renderHook(() => useAllApiKeys(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toHaveLength(3)
    expect(result.current.data[0]).toEqual(mockUserKeys[0])
    expect(result.current.data[1]).toEqual(mockUserKeys[1])
    expect(result.current.data[2].isAdminKey).toBe(true)
  })

  it('returns only user keys when user is not admin', async () => {
    server.use(
      http.get('/api/api-keys', () => {
        return HttpResponse.json(mockUserKeys)
      })
    )

    const { result } = renderHook(() => useAllApiKeys(false), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toHaveLength(2)
    expect(result.current.data).toEqual(mockUserKeys)
  })

  it('creates API key successfully', async () => {
    const newKey: CreateApiKeyRequest = {
      provider: 'google',
      keyName: 'My Google Key',
      apiKey: 'AIzaSy...abcd1234',
    }

    const createdKey: ApiKey = {
      id: 'key-3',
      userId: 'user-1',
      provider: newKey.provider,
      keyName: newKey.keyName,
      keyMask: 'AIzaSy...1234',
      isActive: true,
      createdAt: '2024-01-03T00:00:00.000Z',
      updatedAt: '2024-01-03T00:00:00.000Z',
    }

    server.use(
      http.post('/api/api-keys', async ({ request }) => {
        const body = (await request.json()) as CreateApiKeyRequest
        expect(body).toEqual(newKey)
        return HttpResponse.json(createdKey)
      })
    )

    const { result } = renderHook(() => useCreateApiKey(), {
      wrapper: createWrapper(),
    })

    await result.current.mutateAsync(newKey)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(createdKey)
  })

  it('handles error when creating API key fails', async () => {
    const newKey: CreateApiKeyRequest = {
      provider: 'anthropic',
      keyName: 'Invalid Key',
      apiKey: 'invalid',
    }

    server.use(
      http.post('/api/api-keys', () => {
        return HttpResponse.json(
          { message: 'Invalid API key format' },
          { status: 400 }
        )
      })
    )

    const { result } = renderHook(() => useCreateApiKey(), {
      wrapper: createWrapper(),
    })

    try {
      await result.current.mutateAsync(newKey)
    } catch (error) {
      expect((error as any).message).toBe('Invalid API key format')
      expect((error as any).statusCode).toBe(400)
    }

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })

  it('updates API key successfully', async () => {
    const keyId = 'key-1'
    const updateData: UpdateApiKeyRequest = {
      keyName: 'Updated Key Name',
      isActive: false,
    }

    const updatedKey: ApiKey = {
      ...mockUserKeys[0],
      keyName: updateData.keyName!,
      isActive: updateData.isActive!,
      updatedAt: '2024-01-04T00:00:00.000Z',
    }

    server.use(
      http.put('/api/api-keys/:keyId', async ({ request, params }) => {
        expect(params.keyId).toBe(keyId)
        const body = (await request.json()) as UpdateApiKeyRequest
        expect(body).toEqual(updateData)
        return HttpResponse.json(updatedKey)
      })
    )

    const { result } = renderHook(() => useUpdateApiKey(), {
      wrapper: createWrapper(),
    })

    await result.current.mutateAsync({ keyId, data: updateData })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(updatedKey)
  })

  it('handles error when updating API key fails', async () => {
    const keyId = 'key-1'
    const updateData: UpdateApiKeyRequest = {
      keyName: 'Updated Key Name',
    }

    server.use(
      http.put('/api/api-keys/:keyId', () => {
        return HttpResponse.json(
          { message: 'API key not found' },
          { status: 404 }
        )
      })
    )

    const { result } = renderHook(() => useUpdateApiKey(), {
      wrapper: createWrapper(),
    })

    try {
      await result.current.mutateAsync({ keyId, data: updateData })
    } catch (error) {
      expect((error as any).message).toBe('API key not found')
      expect((error as any).statusCode).toBe(404)
    }

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })

  it('deletes API key successfully', async () => {
    const keyId = 'key-1'

    server.use(
      http.delete('/api/api-keys/:keyId', ({ params }) => {
        expect(params.keyId).toBe(keyId)
        return new HttpResponse(null, { status: 204 })
      })
    )

    const { result } = renderHook(() => useDeleteApiKey(), {
      wrapper: createWrapper(),
    })

    await result.current.mutateAsync(keyId)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
  })

  it('handles error when deleting API key fails', async () => {
    const keyId = 'key-1'

    server.use(
      http.delete('/api/api-keys/:keyId', () => {
        return HttpResponse.json(
          { message: 'Failed to delete API key' },
          { status: 500 }
        )
      })
    )

    const { result } = renderHook(() => useDeleteApiKey(), {
      wrapper: createWrapper(),
    })

    try {
      await result.current.mutateAsync(keyId)
    } catch (error) {
      expect((error as any).message).toBe('Failed to delete API key')
      expect((error as any).statusCode).toBe(500)
    }

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })
})
