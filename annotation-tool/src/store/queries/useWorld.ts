/**
 * TanStack Query hooks for world state operations.
 * Provides declarative data fetching with automatic caching and refetching.
 *
 * World state contains:
 * - Entities (people, objects, locations)
 * - Events
 * - Times
 * - Collections (entity, event, time)
 * - Relations between objects
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Entity,
  Event,
  Time,
  EntityCollection,
  EventCollection,
  TimeCollection,
  OntologyRelation,
  EventInterpretation,
  EntityTypeAssignment,
} from '../../models/types'
import { generateId } from '../../utils/uuid'

/** World state structure from API */
export interface WorldState {
  entities: Entity[]
  events: Event[]
  times: Time[]
  entityCollections: EntityCollection[]
  eventCollections: EventCollection[]
  timeCollections: TimeCollection[]
  relations: OntologyRelation[]
}

/** Query key factory for world state */
export const worldKeys = {
  all: ['world'] as const,
  state: () => [...worldKeys.all, 'state'] as const,
  entities: () => [...worldKeys.all, 'entities'] as const,
  events: () => [...worldKeys.all, 'events'] as const,
  times: () => [...worldKeys.all, 'times'] as const,
  collections: () => [...worldKeys.all, 'collections'] as const,
  relations: () => [...worldKeys.all, 'relations'] as const,
}

/**
 * Fetch world state from the API.
 * Exported for use in non-component contexts (e.g., seedTestData).
 */
export async function fetchWorldState(): Promise<WorldState> {
  const response = await fetch('/api/world', {
    credentials: 'include',
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch world state: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Save world state to the API.
 * Exported for use in non-component contexts (e.g., seedTestData).
 */
export async function saveWorldState(worldState: Partial<WorldState>): Promise<WorldState> {
  const response = await fetch('/api/world', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(worldState),
  })
  if (!response.ok) {
    throw new Error(`Failed to save world state: ${response.statusText}`)
  }
  return response.json()
}

// ============= Query Hooks =============

/**
 * Hook to fetch world state.
 * Returns all entities, events, times, collections, and relations.
 *
 * @example
 * ```typescript
 * const { data: world, isLoading } = useWorld()
 * const entities = world?.entities ?? []
 * ```
 */
export function useWorld() {
  return useQuery({
    queryKey: worldKeys.state(),
    queryFn: fetchWorldState,
    staleTime: 30000, // 30 seconds
  })
}

/**
 * Hook to get entities from world state.
 * Derived from useWorld for convenience.
 */
export function useEntities() {
  const { data } = useWorld()
  return data?.entities ?? []
}

/**
 * Hook to get events from world state.
 */
export function useEvents() {
  const { data } = useWorld()
  return data?.events ?? []
}

/**
 * Hook to get times from world state.
 */
export function useTimes() {
  const { data } = useWorld()
  return data?.times ?? []
}

/**
 * Hook to get entity collections from world state.
 */
export function useEntityCollections() {
  const { data } = useWorld()
  return data?.entityCollections ?? []
}

/**
 * Hook to get event collections from world state.
 */
export function useEventCollections() {
  const { data } = useWorld()
  return data?.eventCollections ?? []
}

/**
 * Hook to get time collections from world state.
 */
export function useTimeCollections() {
  const { data } = useWorld()
  return data?.timeCollections ?? []
}

/**
 * Hook to get relations from world state.
 */
export function useRelations() {
  const { data } = useWorld()
  return data?.relations ?? []
}

// ============= Mutation Hooks =============

/**
 * Hook to save the entire world state.
 * Use for bulk operations or when you need to sync everything.
 */
export function useSaveWorld() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: saveWorldState,
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

// ---------- Entity Mutations ----------

/**
 * Hook to add an entity.
 * Optimistically updates the cache.
 */
export function useAddEntity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (entityData: Omit<Entity, 'id' | 'createdAt' | 'updatedAt'>) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newEntity: Entity = {
        ...entityData,
        id: generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const newState = {
        ...currentState,
        entities: [...(currentState?.entities ?? []), newEntity],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

/**
 * Hook to update an entity.
 */
export function useUpdateEntity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (entity: Entity) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const updatedEntity = {
        ...entity,
        updatedAt: new Date().toISOString(),
      }
      const newState = {
        ...currentState,
        entities: currentState?.entities.map((e) =>
          e.id === entity.id ? updatedEntity : e
        ) ?? [],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

/**
 * Hook to delete an entity.
 * Also cleans up related relations.
 */
export function useDeleteEntity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (entityId: string) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newState = {
        ...currentState,
        entities: currentState?.entities.filter((e) => e.id !== entityId) ?? [],
        // Clean up relations involving this entity
        relations: currentState?.relations.filter(
          (r) =>
            !(r.sourceType === 'entity' && r.sourceId === entityId) &&
            !(r.targetType === 'entity' && r.targetId === entityId)
        ) ?? [],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

// ---------- Event Mutations ----------

/**
 * Hook to add an event.
 */
export function useAddEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (eventData: Omit<Event, 'id' | 'createdAt' | 'updatedAt'>) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newEvent: Event = {
        ...eventData,
        id: generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const newState = {
        ...currentState,
        events: [...(currentState?.events ?? []), newEvent],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

/**
 * Hook to update an event.
 */
export function useUpdateEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (event: Event) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const updatedEvent = {
        ...event,
        updatedAt: new Date().toISOString(),
      }
      const newState = {
        ...currentState,
        events: currentState?.events.map((e) =>
          e.id === event.id ? updatedEvent : e
        ) ?? [],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

/**
 * Hook to delete an event.
 */
export function useDeleteEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (eventId: string) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newState = {
        ...currentState,
        events: currentState?.events.filter((e) => e.id !== eventId) ?? [],
        relations: currentState?.relations.filter(
          (r) =>
            !(r.sourceType === 'event' && r.sourceId === eventId) &&
            !(r.targetType === 'event' && r.targetId === eventId)
        ) ?? [],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

// ---------- Time Mutations ----------

/**
 * Hook to add a time.
 */
export function useAddTime() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (timeData: Omit<Time, 'id'> & { id?: string }) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newTime: Time = {
        ...timeData,
        id: timeData.id ?? generateId(),
      } as Time
      const newState = {
        ...currentState,
        times: [...(currentState?.times ?? []), newTime],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

/**
 * Hook to update a time.
 */
export function useUpdateTime() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (time: Time) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newState = {
        ...currentState,
        times: currentState?.times.map((t) =>
          t.id === time.id ? time : t
        ) ?? [],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

/**
 * Hook to delete a time.
 */
export function useDeleteTime() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (timeId: string) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newState = {
        ...currentState,
        times: currentState?.times.filter((t) => t.id !== timeId) ?? [],
        relations: currentState?.relations.filter(
          (r) =>
            !(r.sourceType === 'time' && r.sourceId === timeId) &&
            !(r.targetType === 'time' && r.targetId === timeId)
        ) ?? [],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

// ---------- Collection Mutations ----------

/**
 * Hook to add an entity collection.
 */
export function useAddEntityCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (collectionData: Omit<EntityCollection, 'id' | 'createdAt' | 'updatedAt'>) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newCollection: EntityCollection = {
        ...collectionData,
        id: generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const newState = {
        ...currentState,
        entityCollections: [...(currentState?.entityCollections ?? []), newCollection],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

/**
 * Hook to update an entity collection.
 */
export function useUpdateEntityCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (collection: EntityCollection) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const updatedCollection = {
        ...collection,
        updatedAt: new Date().toISOString(),
      }
      const newState = {
        ...currentState,
        entityCollections: currentState?.entityCollections.map((c) =>
          c.id === collection.id ? updatedCollection : c
        ) ?? [],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

/**
 * Hook to delete an entity collection.
 */
export function useDeleteEntityCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (collectionId: string) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newState = {
        ...currentState,
        entityCollections: currentState?.entityCollections.filter((c) => c.id !== collectionId) ?? [],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

/**
 * Hook to add an event collection.
 */
export function useAddEventCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (collectionData: Omit<EventCollection, 'id' | 'createdAt' | 'updatedAt'>) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newCollection: EventCollection = {
        ...collectionData,
        id: generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const newState = {
        ...currentState,
        eventCollections: [...(currentState?.eventCollections ?? []), newCollection],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

/**
 * Hook to update an event collection.
 */
export function useUpdateEventCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (collection: EventCollection) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const updatedCollection = {
        ...collection,
        updatedAt: new Date().toISOString(),
      }
      const newState = {
        ...currentState,
        eventCollections: currentState?.eventCollections.map((c) =>
          c.id === collection.id ? updatedCollection : c
        ) ?? [],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

/**
 * Hook to delete an event collection.
 */
export function useDeleteEventCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (collectionId: string) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newState = {
        ...currentState,
        eventCollections: currentState?.eventCollections.filter((c) => c.id !== collectionId) ?? [],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

/**
 * Hook to add a time collection.
 */
export function useAddTimeCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (collectionData: Omit<TimeCollection, 'id'>) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newCollection: TimeCollection = {
        ...collectionData,
        id: generateId(),
      }
      const newState = {
        ...currentState,
        timeCollections: [...(currentState?.timeCollections ?? []), newCollection],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

/**
 * Hook to update a time collection.
 */
export function useUpdateTimeCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (collection: TimeCollection) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newState = {
        ...currentState,
        timeCollections: currentState?.timeCollections.map((c) =>
          c.id === collection.id ? collection : c
        ) ?? [],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

/**
 * Hook to delete a time collection.
 */
export function useDeleteTimeCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (collectionId: string) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newState = {
        ...currentState,
        timeCollections: currentState?.timeCollections.filter((c) => c.id !== collectionId) ?? [],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

// ---------- Relation Mutations ----------

/**
 * Hook to add a relation.
 */
export function useAddRelation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (relationData: Omit<OntologyRelation, 'id' | 'createdAt' | 'updatedAt'>) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newRelation: OntologyRelation = {
        ...relationData,
        id: generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const newState = {
        ...currentState,
        relations: [...(currentState?.relations ?? []), newRelation],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

/**
 * Hook to delete a relation.
 */
export function useDeleteRelation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (relationId: string) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newState = {
        ...currentState,
        relations: currentState?.relations.filter((r) => r.id !== relationId) ?? [],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

// ---------- Entity Type Assignment Mutations ----------

/**
 * Hook to add entity type assignment.
 */
export function useAddEntityTypeAssignment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      entityId,
      assignment,
    }: {
      entityId: string
      assignment: EntityTypeAssignment
    }) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newState = {
        ...currentState,
        entities: currentState?.entities.map((e) => {
          if (e.id === entityId) {
            // Remove existing assignment for this persona and add new one
            const filteredAssignments = e.typeAssignments.filter(
              (a) => a.personaId !== assignment.personaId
            )
            return {
              ...e,
              typeAssignments: [...filteredAssignments, assignment],
              updatedAt: new Date().toISOString(),
            }
          }
          return e
        }) ?? [],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

// ---------- Event Interpretation Mutations ----------

/**
 * Hook to add event interpretation.
 */
export function useAddEventInterpretation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      eventId,
      interpretation,
    }: {
      eventId: string
      interpretation: EventInterpretation
    }) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newState = {
        ...currentState,
        events: currentState?.events.map((e) => {
          if (e.id === eventId) {
            // Remove existing interpretation for this persona and add new one
            const filteredInterpretations = e.personaInterpretations.filter(
              (i) => i.personaId !== interpretation.personaId
            )
            return {
              ...e,
              personaInterpretations: [...filteredInterpretations, interpretation],
              updatedAt: new Date().toISOString(),
            }
          }
          return e
        }) ?? [],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}

/**
 * Hook to set world data directly (for imports, etc.)
 */
export function useSetWorldData() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (worldData: Partial<WorldState>) => {
      const currentState = queryClient.getQueryData<WorldState>(worldKeys.state())
      const newState = {
        entities: worldData.entities ?? currentState?.entities ?? [],
        events: worldData.events ?? currentState?.events ?? [],
        times: worldData.times ?? currentState?.times ?? [],
        entityCollections: worldData.entityCollections ?? currentState?.entityCollections ?? [],
        eventCollections: worldData.eventCollections ?? currentState?.eventCollections ?? [],
        timeCollections: worldData.timeCollections ?? currentState?.timeCollections ?? [],
        relations: worldData.relations ?? currentState?.relations ?? [],
      }
      return saveWorldState(newState)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(worldKeys.state(), data)
    },
  })
}
