/**
 * Tests for world state hooks.
 */

import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import {
  useWorld,
  useSaveWorld,
  useAddEntity,
  useUpdateEntity,
  useDeleteEntity,
  useAddEvent,
  useUpdateEvent,
  useDeleteEvent,
  useAddTime,
  useUpdateTime,
  useDeleteTime,
  useAddEntityCollection,
  useUpdateEntityCollection,
  useDeleteEntityCollection,
  useAddEventCollection,
  useUpdateEventCollection,
  useDeleteEventCollection,
} from './useWorld'
import { server } from '@test/setup'
import { http, HttpResponse } from 'msw'

/**
 * Create a wrapper component with QueryClient for testing hooks.
 */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useWorld hooks', () => {
  describe('useWorld', () => {
    it('fetches world state', async () => {
      const { result } = renderHook(() => useWorld(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toMatchObject({
        entities: [],
        events: [],
        times: [],
        entityCollections: [],
        eventCollections: [],
      })
    })

    it('handles errors', async () => {
      server.use(
        http.get('/api/world', () => {
          return HttpResponse.json(
            { message: 'Error' },
            { status: 500 }
          )
        })
      )

      const { result } = renderHook(() => useWorld(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })
  })

  describe('useSaveWorld', () => {
    it('saves world state', async () => {
      const { result } = renderHook(() => useSaveWorld(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        entities: [],
        events: [],
        times: [],
        entityCollections: [],
        eventCollections: [],
        timeCollections: [],
        relations: [],
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
    })

    it('handles errors', async () => {
      server.use(
        http.put('/api/world', () => {
          return HttpResponse.json(
            { message: 'Error' },
            { status: 500 }
          )
        })
      )

      const { result } = renderHook(() => useSaveWorld(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        entities: [],
        events: [],
        times: [],
        entityCollections: [],
        eventCollections: [],
        timeCollections: [],
        relations: [],
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })
  })

  describe('Entity Mutations', () => {
    describe('useAddEntity', () => {
      it('adds an entity to world state', async () => {
        const { result } = renderHook(() => useAddEntity(), {
          wrapper: createWrapper(),
        })

        result.current.mutate({
          id: 'entity-1',
          name: 'Test Entity',
          description: 'A test entity',
          entityTypeId: 'type-1',
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })

    describe('useUpdateEntity', () => {
      it('updates an entity in world state', async () => {
        const { result } = renderHook(() => useUpdateEntity(), {
          wrapper: createWrapper(),
        })

        result.current.mutate({
          id: 'entity-1',
          name: 'Updated Entity',
          description: 'An updated entity',
          entityTypeId: 'type-1',
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })

    describe('useDeleteEntity', () => {
      it('deletes an entity from world state', async () => {
        const { result } = renderHook(() => useDeleteEntity(), {
          wrapper: createWrapper(),
        })

        result.current.mutate('entity-1')

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })

      // Regression guard: deletion must hit the graceful DELETE endpoint, not a
      // whole-blob PUT. Removing by omission from a PUT is silently undone by the
      // server's merge-by-id, so a deleted object would reappear.
      it('calls the DELETE endpoint and not a whole-blob PUT', async () => {
        let deleteHit = false
        let putHit = false
        server.use(
          http.delete('*/api/world/entities/:entityId', () => {
            deleteHit = true
            return HttpResponse.json({ message: 'Entity deleted successfully' })
          }),
          http.put('*/api/world', () => {
            putHit = true
            return HttpResponse.json({})
          })
        )

        const { result } = renderHook(() => useDeleteEntity(), { wrapper: createWrapper() })
        result.current.mutate('entity-1')
        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(deleteHit).toBe(true)
        expect(putHit).toBe(false)
      })
    })
  })

  describe('Event Mutations', () => {
    describe('useAddEvent', () => {
      it('adds an event to world state', async () => {
        const { result } = renderHook(() => useAddEvent(), {
          wrapper: createWrapper(),
        })

        result.current.mutate({
          id: 'event-1',
          name: 'Test Event',
          description: 'A test event',
          eventTypeId: 'type-1',
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })

    describe('useUpdateEvent', () => {
      it('updates an event in world state', async () => {
        const { result } = renderHook(() => useUpdateEvent(), {
          wrapper: createWrapper(),
        })

        result.current.mutate({
          id: 'event-1',
          name: 'Updated Event',
          description: 'An updated event',
          eventTypeId: 'type-1',
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })

    describe('useDeleteEvent', () => {
      it('deletes an event from world state', async () => {
        const { result } = renderHook(() => useDeleteEvent(), {
          wrapper: createWrapper(),
        })

        result.current.mutate('event-1')

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })

      it('calls the DELETE endpoint and not a whole-blob PUT', async () => {
        let deleteHit = false
        let putHit = false
        server.use(
          http.delete('*/api/world/events/:eventId', () => {
            deleteHit = true
            return HttpResponse.json({ message: 'Event deleted successfully' })
          }),
          http.put('*/api/world', () => {
            putHit = true
            return HttpResponse.json({})
          })
        )

        const { result } = renderHook(() => useDeleteEvent(), { wrapper: createWrapper() })
        result.current.mutate('event-1')
        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(deleteHit).toBe(true)
        expect(putHit).toBe(false)
      })
    })
  })

  describe('Time Mutations', () => {
    describe('useAddTime', () => {
      it('adds a time to world state', async () => {
        const { result } = renderHook(() => useAddTime(), {
          wrapper: createWrapper(),
        })

        result.current.mutate({
          id: 'time-1',
          name: 'Test Time',
          type: 'instant',
          timestamp: '2025-01-01T00:00:00Z',
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })

    describe('useUpdateTime', () => {
      it('updates a time in world state', async () => {
        const { result } = renderHook(() => useUpdateTime(), {
          wrapper: createWrapper(),
        })

        result.current.mutate({
          id: 'time-1',
          name: 'Updated Time',
          type: 'instant',
          timestamp: '2025-01-02T00:00:00Z',
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })

    describe('useDeleteTime', () => {
      it('deletes a time from world state', async () => {
        const { result } = renderHook(() => useDeleteTime(), {
          wrapper: createWrapper(),
        })

        result.current.mutate('time-1')

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })

      it('calls the DELETE endpoint and not a whole-blob PUT', async () => {
        let deleteHit = false
        let putHit = false
        server.use(
          http.delete('*/api/world/times/:timeId', () => {
            deleteHit = true
            return HttpResponse.json({ message: 'Time deleted successfully' })
          }),
          http.put('*/api/world', () => {
            putHit = true
            return HttpResponse.json({})
          })
        )

        const { result } = renderHook(() => useDeleteTime(), { wrapper: createWrapper() })
        result.current.mutate('time-1')
        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(deleteHit).toBe(true)
        expect(putHit).toBe(false)
      })
    })
  })

  describe('Entity Collection Mutations', () => {
    describe('useAddEntityCollection', () => {
      it('adds an entity collection to world state', async () => {
        const { result } = renderHook(() => useAddEntityCollection(), {
          wrapper: createWrapper(),
        })

        result.current.mutate({
          id: 'collection-1',
          name: 'Test Collection',
          description: 'A test collection',
          entityIds: ['entity-1', 'entity-2'],
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })

    describe('useUpdateEntityCollection', () => {
      it('updates an entity collection in world state', async () => {
        const { result } = renderHook(() => useUpdateEntityCollection(), {
          wrapper: createWrapper(),
        })

        result.current.mutate({
          id: 'collection-1',
          name: 'Updated Collection',
          description: 'An updated collection',
          entityIds: ['entity-1', 'entity-3'],
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })

    describe('useDeleteEntityCollection', () => {
      it('deletes an entity collection from world state', async () => {
        const { result } = renderHook(() => useDeleteEntityCollection(), {
          wrapper: createWrapper(),
        })

        result.current.mutate('collection-1')

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })
  })

  describe('Event Collection Mutations', () => {
    describe('useAddEventCollection', () => {
      it('adds an event collection to world state', async () => {
        const { result } = renderHook(() => useAddEventCollection(), {
          wrapper: createWrapper(),
        })

        result.current.mutate({
          id: 'event-collection-1',
          name: 'Test Event Collection',
          description: 'A test event collection',
          eventIds: ['event-1', 'event-2'],
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })

    describe('useUpdateEventCollection', () => {
      it('updates an event collection in world state', async () => {
        const { result } = renderHook(() => useUpdateEventCollection(), {
          wrapper: createWrapper(),
        })

        result.current.mutate({
          id: 'event-collection-1',
          name: 'Updated Event Collection',
          description: 'An updated event collection',
          eventIds: ['event-1', 'event-3'],
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })

    describe('useDeleteEventCollection', () => {
      it('deletes an event collection from world state', async () => {
        const { result } = renderHook(() => useDeleteEventCollection(), {
          wrapper: createWrapper(),
        })

        result.current.mutate('event-collection-1')

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })
  })
})
