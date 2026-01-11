/**
 * Tests for persona hooks.
 */

import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import {
  usePersonas,
  usePersonaOntology,
  useCreatePersona,
  useUpdatePersona,
  useDeletePersona,
  useAddEntityToPersona,
  useUpdateEntityInPersona,
  useDeleteEntityFromPersona,
  useAddRoleToPersona,
  useUpdateRoleInPersona,
  useDeleteRoleFromPersona,
  useAddEventToPersona,
  useUpdateEventInPersona,
  useDeleteEventFromPersona,
  useAddRelationTypeToPersona,
  useUpdateRelationTypeInPersona,
  useDeleteRelationTypeFromPersona,
} from './usePersonas'
import { server } from '@test/setup'
import { http, HttpResponse } from 'msw'

/**
 * Create a wrapper component with QueryClient for testing hooks.
 */
function createWrapper(initialCache?: Record<string, unknown>) {
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

  // Pre-populate cache if provided
  if (initialCache) {
    Object.entries(initialCache).forEach(([key, value]) => {
      queryClient.setQueryData(JSON.parse(key), value)
    })
  }

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

// Default empty ontology for testing mutations
const emptyOntology = {
  entities: [],
  roles: [],
  events: [],
  relationTypes: [],
  relations: [],
}

describe('usePersonas hooks', () => {
  describe('usePersonas', () => {
    it('fetches all personas', async () => {
      const { result } = renderHook(() => usePersonas(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toHaveLength(1)
      expect(result.current.data?.[0]).toMatchObject({
        id: 'test-persona-id',
        name: 'Test Persona',
      })
    })

    it('handles errors', async () => {
      server.use(
        http.get('*/api/personas', () => {
          return HttpResponse.json(
            { message: 'Error' },
            { status: 500 }
          )
        })
      )

      const { result } = renderHook(() => usePersonas(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })
  })

  describe('usePersonaOntology', () => {
    it('fetches persona ontology', async () => {
      const { result } = renderHook(() => usePersonaOntology('persona-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toMatchObject({
        entities: [],
        roles: [],
        events: [],
        relationTypes: [],
      })
    })

    it('returns undefined when personaId is null', async () => {
      const { result } = renderHook(() => usePersonaOntology(null), {
        wrapper: createWrapper(),
      })

      expect(result.current.fetchStatus).toBe('idle')
    })
  })

  describe('useCreatePersona', () => {
    it('creates a new persona', async () => {
      const { result } = renderHook(() => useCreatePersona(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        persona: {
          name: 'New Persona',
          role: 'Researcher',
          informationNeed: 'Understanding patterns',
        },
        ontology: {
          entities: [],
          roles: [],
          events: [],
          relationTypes: [],
          relations: [],
        },
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toMatchObject({
        persona: {
          id: '2',
          name: 'New Persona',
          role: 'Researcher',
        },
      })
    })
  })

  describe('useUpdatePersona', () => {
    it('updates an existing persona', async () => {
      server.use(
        http.put('/api/personas/:personaId', async ({ request, params }) => {
          const body = await request.json() as Record<string, unknown>
          return HttpResponse.json({
            id: params.personaId,
            ...body,
            updatedAt: new Date().toISOString(),
          })
        })
      )

      const { result } = renderHook(() => useUpdatePersona(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        id: 'persona-1',
        name: 'Updated Persona',
        role: 'Analyst',
        informationNeed: 'Updated needs',
        wikidataId: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toMatchObject({
        id: 'persona-1',
        name: 'Updated Persona',
      })
    })
  })

  describe('useDeletePersona', () => {
    it('deletes a persona', async () => {
      server.use(
        http.delete('/api/personas/:personaId', () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      const { result } = renderHook(() => useDeletePersona(), {
        wrapper: createWrapper(),
      })

      result.current.mutate('persona-1')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
    })
  })

  describe('Entity Type Mutations', () => {
    const ontologyCacheKey = JSON.stringify(['personas', 'ontology', 'persona-1'])

    describe('useAddEntityToPersona', () => {
      it('adds an entity type to persona ontology', async () => {
        const { result } = renderHook(() => useAddEntityToPersona(), {
          wrapper: createWrapper({ [ontologyCacheKey]: emptyOntology }),
        })

        result.current.mutate({
          personaId: 'persona-1',
          entity: {
            id: 'entity-1',
            name: 'Vehicle',
            definition: 'A mode of transportation',
            wikidataId: null,
            parentId: null,
          },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(result.current.data).toMatchObject({
          personaId: 'persona-1',
        })
      })
    })

    describe('useUpdateEntityInPersona', () => {
      it('updates an entity type in persona ontology', async () => {
        const ontologyWithEntity = {
          ...emptyOntology,
          entities: [{ id: 'entity-1', name: 'Vehicle', definition: 'Original', wikidataId: null, parentId: null }],
        }
        const { result } = renderHook(() => useUpdateEntityInPersona(), {
          wrapper: createWrapper({ [ontologyCacheKey]: ontologyWithEntity }),
        })

        result.current.mutate({
          personaId: 'persona-1',
          entity: {
            id: 'entity-1',
            name: 'Updated Vehicle',
            definition: 'An updated definition',
            wikidataId: null,
            parentId: null,
          },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })

    describe('useDeleteEntityFromPersona', () => {
      it('deletes an entity type from persona ontology', async () => {
        const ontologyWithEntity = {
          ...emptyOntology,
          entities: [{ id: 'entity-1', name: 'Vehicle', definition: 'Original', wikidataId: null, parentId: null }],
        }
        const { result } = renderHook(() => useDeleteEntityFromPersona(), {
          wrapper: createWrapper({ [ontologyCacheKey]: ontologyWithEntity }),
        })

        result.current.mutate({
          personaId: 'persona-1',
          entityId: 'entity-1',
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })
  })

  describe('Role Type Mutations', () => {
    const ontologyCacheKey = JSON.stringify(['personas', 'ontology', 'persona-1'])

    describe('useAddRoleToPersona', () => {
      it('adds a role type to persona ontology', async () => {
        const { result } = renderHook(() => useAddRoleToPersona(), {
          wrapper: createWrapper({ [ontologyCacheKey]: emptyOntology }),
        })

        result.current.mutate({
          personaId: 'persona-1',
          role: {
            id: 'role-1',
            name: 'Driver',
            definition: 'A person who operates a vehicle',
            wikidataId: null,
            parentId: null,
          },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })

    describe('useUpdateRoleInPersona', () => {
      it('updates a role type in persona ontology', async () => {
        const ontologyWithRole = {
          ...emptyOntology,
          roles: [{ id: 'role-1', name: 'Driver', definition: 'Original', wikidataId: null, parentId: null }],
        }
        const { result } = renderHook(() => useUpdateRoleInPersona(), {
          wrapper: createWrapper({ [ontologyCacheKey]: ontologyWithRole }),
        })

        result.current.mutate({
          personaId: 'persona-1',
          role: {
            id: 'role-1',
            name: 'Updated Driver',
            definition: 'An updated definition',
            wikidataId: null,
            parentId: null,
          },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })

    describe('useDeleteRoleFromPersona', () => {
      it('deletes a role type from persona ontology', async () => {
        const ontologyWithRole = {
          ...emptyOntology,
          roles: [{ id: 'role-1', name: 'Driver', definition: 'Original', wikidataId: null, parentId: null }],
        }
        const { result } = renderHook(() => useDeleteRoleFromPersona(), {
          wrapper: createWrapper({ [ontologyCacheKey]: ontologyWithRole }),
        })

        result.current.mutate({
          personaId: 'persona-1',
          roleId: 'role-1',
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })
  })

  describe('Event Type Mutations', () => {
    const ontologyCacheKey = JSON.stringify(['personas', 'ontology', 'persona-1'])

    describe('useAddEventToPersona', () => {
      it('adds an event type to persona ontology', async () => {
        const { result } = renderHook(() => useAddEventToPersona(), {
          wrapper: createWrapper({ [ontologyCacheKey]: emptyOntology }),
        })

        result.current.mutate({
          personaId: 'persona-1',
          event: {
            id: 'event-1',
            name: 'Collision',
            definition: 'Two objects coming into contact',
            wikidataId: null,
            parentId: null,
          },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })

    describe('useUpdateEventInPersona', () => {
      it('updates an event type in persona ontology', async () => {
        const ontologyWithEvent = {
          ...emptyOntology,
          events: [{ id: 'event-1', name: 'Collision', definition: 'Original', wikidataId: null, parentId: null }],
        }
        const { result } = renderHook(() => useUpdateEventInPersona(), {
          wrapper: createWrapper({ [ontologyCacheKey]: ontologyWithEvent }),
        })

        result.current.mutate({
          personaId: 'persona-1',
          event: {
            id: 'event-1',
            name: 'Updated Collision',
            definition: 'An updated definition',
            wikidataId: null,
            parentId: null,
          },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })

    describe('useDeleteEventFromPersona', () => {
      it('deletes an event type from persona ontology', async () => {
        const ontologyWithEvent = {
          ...emptyOntology,
          events: [{ id: 'event-1', name: 'Collision', definition: 'Original', wikidataId: null, parentId: null }],
        }
        const { result } = renderHook(() => useDeleteEventFromPersona(), {
          wrapper: createWrapper({ [ontologyCacheKey]: ontologyWithEvent }),
        })

        result.current.mutate({
          personaId: 'persona-1',
          eventId: 'event-1',
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })
  })

  describe('Relation Type Mutations', () => {
    // Cache key for persona-1 ontology
    const ontologyCacheKey = JSON.stringify(['personas', 'ontology', 'persona-1'])

    describe('useAddRelationTypeToPersona', () => {
      it('adds a relation type to persona ontology', async () => {
        const { result } = renderHook(() => useAddRelationTypeToPersona(), {
          wrapper: createWrapper({ [ontologyCacheKey]: emptyOntology }),
        })

        result.current.mutate({
          personaId: 'persona-1',
          relationType: {
            id: 'relation-type-1',
            name: 'causes',
            definition: 'One event causes another',
            inverseId: null,
            wikidataId: null,
          },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })

    describe('useUpdateRelationTypeInPersona', () => {
      it('updates a relation type in persona ontology', async () => {
        const ontologyWithRelationType = {
          ...emptyOntology,
          relationTypes: [{ id: 'relation-type-1', name: 'causes', definition: 'Original', inverseId: null, wikidataId: null }],
        }
        const { result } = renderHook(() => useUpdateRelationTypeInPersona(), {
          wrapper: createWrapper({ [ontologyCacheKey]: ontologyWithRelationType }),
        })

        result.current.mutate({
          personaId: 'persona-1',
          relationType: {
            id: 'relation-type-1',
            name: 'Updated causes',
            definition: 'An updated definition',
            inverseId: null,
            wikidataId: null,
          },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })

    describe('useDeleteRelationTypeFromPersona', () => {
      it('deletes a relation type from persona ontology', async () => {
        const ontologyWithRelationType = {
          ...emptyOntology,
          relationTypes: [{ id: 'relation-type-1', name: 'causes', definition: 'Original', inverseId: null, wikidataId: null }],
        }
        const { result } = renderHook(() => useDeleteRelationTypeFromPersona(), {
          wrapper: createWrapper({ [ontologyCacheKey]: ontologyWithRelationType }),
        })

        result.current.mutate({
          personaId: 'persona-1',
          relationTypeId: 'relation-type-1',
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
      })
    })
  })
})
