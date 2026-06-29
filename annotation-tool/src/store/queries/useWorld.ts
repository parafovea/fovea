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
} from '@models/types'
import { generateId } from '@utils/uuid'

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
  entityDeletionPreview: (entityId: string) => [...worldKeys.all, 'entity-deletion-preview', entityId] as const,
  eventDeletionPreview: (eventId: string) => [...worldKeys.all, 'event-deletion-preview', eventId] as const,
  timeDeletionPreview: (timeId: string) => [...worldKeys.all, 'time-deletion-preview', timeId] as const,
}

/** Response type for world object deletion preview API */
export interface WorldObjectDeletionPreview {
  glossReferences: number
  relationCount: number
  collectionMemberships: number
  annotationCount: number
}

/** Response type for world object deletion result */
export interface WorldObjectDeletionResult {
  message: string
  glossReferencesConverted: number
  relationsRemoved: number
  collectionMembershipsRemoved: number
  annotationsDeleted: number
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
async function putWorldState(worldState: Partial<WorldState>): Promise<WorldState> {
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

/**
 * Single-flight chain so world-state PUTs never overlap. Each world mutation
 * reads the cache, mutates one slice, and PUTs the whole blob; without
 * serialization two rapid mutations (or a Wikidata batch import) issue
 * overlapping PUTs that race. Chaining them — combined with the server's
 * merge-by-id under optimistic concurrency — guarantees no add is dropped.
 */
let worldWriteChain: Promise<unknown> = Promise.resolve()

/**
 * Save (a partial of) the world state. Serialized: the actual PUT runs only
 * after the previous one settles. Exported for non-component contexts.
 */
export async function saveWorldState(worldState: Partial<WorldState>): Promise<WorldState> {
  const run = worldWriteChain.then(() => putWorldState(worldState))
  // Keep the chain alive even if a write rejects, so one failure doesn't wedge
  // every subsequent world write.
  worldWriteChain = run.catch(() => undefined)
  return run
}

/**
 * DELETE a single world object (collection or relation) from the caller's
 * personal world. Used instead of removing it via the whole-blob PUT, which the
 * server now merges by id — so omitting an object from the PUT no longer
 * removes it; removal must be an explicit DELETE.
 */
async function deleteWorldObject(path: string, label: string): Promise<void> {
  const response = await fetch(path, { method: 'DELETE', credentials: 'include' })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || `Failed to delete ${label}`)
  }
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
    mutationFn: (entityId: string) =>
      deleteWorldObject(`/api/world/entities/${entityId}`, 'entity'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: worldKeys.state() })
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
    mutationFn: (eventId: string) =>
      deleteWorldObject(`/api/world/events/${eventId}`, 'event'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: worldKeys.state() })
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
    mutationFn: (timeId: string) =>
      deleteWorldObject(`/api/world/times/${timeId}`, 'time'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: worldKeys.state() })
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
    mutationFn: (collectionId: string) =>
      deleteWorldObject(`/api/world/entity-collections/${collectionId}`, 'entity collection'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: worldKeys.state() })
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
    mutationFn: (collectionId: string) =>
      deleteWorldObject(`/api/world/event-collections/${collectionId}`, 'event collection'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: worldKeys.state() })
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
    mutationFn: (collectionId: string) =>
      deleteWorldObject(`/api/world/time-collections/${collectionId}`, 'time collection'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: worldKeys.state() })
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
    mutationFn: (relationId: string) =>
      deleteWorldObject(`/api/world/relations/${relationId}`, 'relation'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: worldKeys.state() })
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

// ============= World Object Deletion Preview and Graceful Delete Hooks =============

/**
 * Fetch deletion preview for a world entity.
 */
async function fetchEntityDeletionPreview(entityId: string): Promise<WorldObjectDeletionPreview> {
  const response = await fetch(`/api/world/entities/${entityId}/deletion-preview`, {
    credentials: 'include',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch entity deletion preview')
  }
  return response.json()
}

/**
 * Fetch deletion preview for a world event.
 */
async function fetchEventDeletionPreview(eventId: string): Promise<WorldObjectDeletionPreview> {
  const response = await fetch(`/api/world/events/${eventId}/deletion-preview`, {
    credentials: 'include',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch event deletion preview')
  }
  return response.json()
}

/**
 * Fetch deletion preview for a world time.
 */
async function fetchTimeDeletionPreview(timeId: string): Promise<WorldObjectDeletionPreview> {
  const response = await fetch(`/api/world/times/${timeId}/deletion-preview`, {
    credentials: 'include',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch time deletion preview')
  }
  return response.json()
}

/**
 * Hook to fetch deletion preview for a world entity.
 * Shows counts of gloss references, relations, collection memberships,
 * and annotations that will be affected when the entity is deleted.
 *
 * @param entityId - The entity ID
 * @param enabled - Whether to enable the query (default: false)
 */
export function useEntityDeletionPreview(entityId: string | null | undefined, enabled = false) {
  return useQuery({
    queryKey: worldKeys.entityDeletionPreview(entityId ?? ''),
    queryFn: () => fetchEntityDeletionPreview(entityId!),
    enabled: !!entityId && enabled,
    staleTime: 30 * 1000,
  })
}

/**
 * Hook to fetch deletion preview for a world event.
 */
export function useEventDeletionPreview(eventId: string | null | undefined, enabled = false) {
  return useQuery({
    queryKey: worldKeys.eventDeletionPreview(eventId ?? ''),
    queryFn: () => fetchEventDeletionPreview(eventId!),
    enabled: !!eventId && enabled,
    staleTime: 30 * 1000,
  })
}

/**
 * Hook to fetch deletion preview for a world time.
 */
export function useTimeDeletionPreview(timeId: string | null | undefined, enabled = false) {
  return useQuery({
    queryKey: worldKeys.timeDeletionPreview(timeId ?? ''),
    queryFn: () => fetchTimeDeletionPreview(timeId!),
    enabled: !!timeId && enabled,
    staleTime: 30 * 1000,
  })
}

/**
 * Delete a world entity with graceful cleanup.
 */
async function deleteEntityGracefully(entityId: string): Promise<WorldObjectDeletionResult> {
  const response = await fetch(`/api/world/entities/${entityId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete entity')
  }
  return response.json()
}

/**
 * Delete a world event with graceful cleanup.
 */
async function deleteEventGracefully(eventId: string): Promise<WorldObjectDeletionResult> {
  const response = await fetch(`/api/world/events/${eventId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete event')
  }
  return response.json()
}

/**
 * Delete a world time with graceful cleanup.
 */
async function deleteTimeGracefully(timeId: string): Promise<WorldObjectDeletionResult> {
  const response = await fetch(`/api/world/times/${timeId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete time')
  }
  return response.json()
}

/**
 * Hook to delete a world entity with graceful cleanup.
 * References in persona ontology glosses are converted to plain text.
 * Relations and collection memberships are removed.
 * Object annotations are deleted.
 */
export function useDeleteEntityGracefully() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (entityId: string) => {
      const result = await deleteEntityGracefully(entityId)
      return { entityId, result }
    },
    onSuccess: ({ entityId }) => {
      // Invalidate world state to refetch fresh data
      queryClient.invalidateQueries({ queryKey: worldKeys.state() })
      // Remove the deletion preview from cache
      queryClient.removeQueries({ queryKey: worldKeys.entityDeletionPreview(entityId) })
    },
  })
}

/**
 * Hook to delete a world event with graceful cleanup.
 * References in persona ontology glosses are converted to plain text.
 * Relations and collection memberships are removed.
 * Object annotations are deleted.
 */
export function useDeleteEventGracefully() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (eventId: string) => {
      const result = await deleteEventGracefully(eventId)
      return { eventId, result }
    },
    onSuccess: ({ eventId }) => {
      queryClient.invalidateQueries({ queryKey: worldKeys.state() })
      queryClient.removeQueries({ queryKey: worldKeys.eventDeletionPreview(eventId) })
    },
  })
}

/**
 * Hook to delete a world time with graceful cleanup.
 * References in persona ontology glosses are converted to plain text.
 * Relations and collection memberships are removed.
 * Object annotations are deleted.
 */
export function useDeleteTimeGracefully() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (timeId: string) => {
      const result = await deleteTimeGracefully(timeId)
      return { timeId, result }
    },
    onSuccess: ({ timeId }) => {
      queryClient.invalidateQueries({ queryKey: worldKeys.state() })
      queryClient.removeQueries({ queryKey: worldKeys.timeDeletionPreview(timeId) })
    },
  })
}
