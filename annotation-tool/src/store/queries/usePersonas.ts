/**
 * TanStack Query hooks for persona and ontology operations.
 * Provides declarative data fetching with automatic caching and refetching.
 *
 * Personas represent analysts with different ontological perspectives.
 * Each persona has their own ontology (entity types, role types, event types, relations).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  Persona,
  PersonaOntology,
  EntityType,
  RoleType,
  EventType,
  RelationType,
  OntologyRelation,
  ImportRequest,
} from '@models/types'
import { generateId } from '@utils/uuid'

/** Query keys for personas */
export const personaKeys = {
  all: ['personas'] as const,
  list: () => [...personaKeys.all, 'list'] as const,
  detail: (id: string) => [...personaKeys.all, 'detail', id] as const,
  ontology: (personaId: string) => [...personaKeys.all, 'ontology', personaId] as const,
  allOntologies: () => [...personaKeys.all, 'all-ontologies'] as const,
  deletionPreview: (personaId: string) => [...personaKeys.all, 'deletion-preview', personaId] as const,
  typeDeletionPreview: (personaId: string, typeCategory: string, typeId: string) =>
    [...personaKeys.all, 'type-deletion-preview', personaId, typeCategory, typeId] as const,
}

/** Response type for deletion preview API */
export interface PersonaDeletionPreview {
  typeCount: number
  annotationCount: number
  summaryCount: number
  worldAssignmentCount: number
}

/** Response type for type deletion preview API */
export interface TypeDeletionPreview {
  glossReferences: number
  annotationCount: number
  worldAssignmentCount: number
  eventTypeRoleCount?: number // Only for role types
}

/** Response type for type deletion result */
export interface TypeDeletionResult {
  message: string
  glossReferencesConverted: number
  annotationsDeleted: number
  worldAssignmentsRemoved: number
  eventTypeRolesRemoved?: number // Only for role types
}

// ============================================================
// Query Hooks
// ============================================================

/**
 * Fetch all personas from the API.
 */
async function fetchPersonas(): Promise<Persona[]> {
  const response = await fetch('/api/personas')
  if (!response.ok) {
    throw new Error('Failed to fetch personas')
  }
  const data = await response.json()
  return Array.isArray(data) ? data : []
}

/**
 * Fetch a persona's ontology from the API.
 */
async function fetchPersonaOntology(personaId: string): Promise<PersonaOntology> {
  const response = await fetch(`/api/personas/${personaId}/ontology`)
  if (!response.ok) {
    throw new Error('Failed to fetch persona ontology')
  }
  const ontology = await response.json()
  return { personaId, ...ontology }
}

/**
 * Hook to fetch all personas.
 *
 * @returns TanStack Query result with personas array
 *
 * @example
 * ```tsx
 * const { data: personas, isLoading } = usePersonas()
 * ```
 */
export function usePersonas() {
  return useQuery({
    queryKey: personaKeys.list(),
    queryFn: fetchPersonas,
    staleTime: 0, // Always refetch to ensure fresh data (personas can change externally)
    refetchOnMount: 'always', // Force refetch when component mounts (needed for E2E tests)
  })
}

/**
 * Hook to fetch a persona's ontology.
 *
 * @param personaId - The persona ID to fetch ontology for
 * @returns TanStack Query result with ontology
 *
 * @example
 * ```tsx
 * const { data: ontology } = usePersonaOntology(personaId)
 * ```
 */
export function usePersonaOntology(personaId: string | null | undefined) {
  return useQuery({
    queryKey: personaKeys.ontology(personaId ?? ''),
    queryFn: () => fetchPersonaOntology(personaId!),
    enabled: !!personaId,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Hook to fetch all persona ontologies (for multiple personas).
 * Useful when you need all ontologies at once.
 */
export function useAllPersonaOntologies(personaIds: string[]) {
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: [...personaKeys.allOntologies(), personaIds.join(',')],
    queryFn: async () => {
      const ontologies: PersonaOntology[] = []
      for (const personaId of personaIds) {
        // Try to get from cache first
        const cached = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(personaId))
        if (cached) {
          ontologies.push(cached)
        } else {
          const ontology = await fetchPersonaOntology(personaId)
          queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
          ontologies.push(ontology)
        }
      }
      return ontologies
    },
    enabled: personaIds.length > 0,
    staleTime: 0, // Always refetch to get fresh data (needed for header Save button)
    refetchOnMount: 'always', // Force refetch when component mounts
  })
}

// ============================================================
// Persona CRUD Mutations
// ============================================================

/**
 * Hook to create a new persona with its ontology.
 *
 * @returns Mutation for creating persona
 *
 * @example
 * ```tsx
 * const { mutate: createPersona } = useCreatePersona()
 * createPersona({ persona: { name, role, ... }, ontology: { entities: [], ... } })
 * ```
 */
export function useCreatePersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      persona: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>
      ontology: Omit<PersonaOntology, 'id' | 'personaId' | 'createdAt' | 'updatedAt'>
      projectId?: string
      shareWith?: Array<{ type: 'user' | 'group'; id: string; permission: string }>
    }) => {
      // Create persona
      const response = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: data.persona.name,
          role: data.persona.role,
          informationNeed: data.persona.informationNeed,
          details: data.persona.details,
          projectId: data.projectId || undefined,
        }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create persona')
      }
      const persona = await response.json()

      // Create ontology
      const ontologyResponse = await fetch(`/api/personas/${persona.id}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: data.ontology.entities || [],
          roles: data.ontology.roles || [],
          events: data.ontology.events || [],
          relationTypes: data.ontology.relationTypes || [],
          relations: data.ontology.relations || [],
        }),
      })
      if (!ontologyResponse.ok) {
        // Rollback: delete the persona
        try {
          await fetch(`/api/personas/${persona.id}`, {
            method: 'DELETE',
            credentials: 'include',
          })
        } catch {
          console.error(`Failed to rollback persona ${persona.id}`)
        }
        throw new Error('Failed to create persona ontology')
      }
      const ontology = await ontologyResponse.json()

      // Share persona if requested
      if (data.shareWith && data.shareWith.length > 0) {
        for (const share of data.shareWith) {
          try {
            await fetch('/api/sharing', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                resourceType: 'persona',
                resourceId: persona.id,
                ...(share.type === 'user'
                  ? { targetUserId: share.id }
                  : { targetGroupId: share.id }),
                permission: share.permission,
              }),
            })
          } catch (err) {
            console.error(`Failed to share persona with ${share.type} ${share.id}:`, err)
          }
        }
      }

      return { persona, ontology: { personaId: persona.id, ...ontology } }
    },
    onSuccess: ({ persona, ontology }) => {
      // Update personas list
      queryClient.setQueryData<Persona[]>(personaKeys.list(), (old = []) => [...old, persona])
      // Cache the ontology
      queryClient.setQueryData(personaKeys.ontology(persona.id), ontology)
    },
  })
}

/**
 * Hook to update a persona's basic information.
 */
export function useUpdatePersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (persona: Persona) => {
      const response = await fetch(`/api/personas/${persona.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: persona.name,
          role: persona.role,
          informationNeed: persona.informationNeed,
          details: persona.details,
        }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update persona')
      }
      return await response.json() as Persona
    },
    onSuccess: (updatedPersona) => {
      queryClient.setQueryData<Persona[]>(personaKeys.list(), (old = []) =>
        old.map(p => p.id === updatedPersona.id ? updatedPersona : p)
      )
    },
  })
}

/**
 * Hook to delete a persona.
 */
export function useDeletePersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (personaId: string) => {
      const response = await fetch(`/api/personas/${personaId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete persona')
      }
      return personaId
    },
    onSuccess: (personaId) => {
      // Remove from list
      queryClient.setQueryData<Persona[]>(personaKeys.list(), (old = []) =>
        old.filter(p => p.id !== personaId)
      )
      // Remove ontology from cache
      queryClient.removeQueries({ queryKey: personaKeys.ontology(personaId) })
      // Remove deletion preview from cache
      queryClient.removeQueries({ queryKey: personaKeys.deletionPreview(personaId) })
    },
  })
}

/**
 * Fetch deletion preview for a persona.
 * Returns counts of items that will be affected when the persona is deleted.
 */
async function fetchPersonaDeletionPreview(personaId: string): Promise<PersonaDeletionPreview> {
  const response = await fetch(`/api/personas/${personaId}/deletion-preview`, {
    credentials: 'include',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch deletion preview')
  }
  return response.json()
}

/**
 * Hook to fetch deletion preview for a persona.
 * Shows counts of types, annotations, summaries, and world assignments
 * that will be affected when the persona is deleted.
 *
 * @param personaId - The persona ID to get deletion preview for
 * @param enabled - Whether to enable the query (default: false, fetch on demand)
 * @returns TanStack Query result with deletion preview data
 *
 * @example
 * ```tsx
 * const { data: preview, refetch } = usePersonaDeletionPreview(personaId)
 * // Call refetch() when delete button is clicked to get fresh preview
 * ```
 */
export function usePersonaDeletionPreview(personaId: string | null | undefined, enabled = false) {
  return useQuery({
    queryKey: personaKeys.deletionPreview(personaId ?? ''),
    queryFn: () => fetchPersonaDeletionPreview(personaId!),
    enabled: !!personaId && enabled,
    staleTime: 30 * 1000, // 30 seconds - preview can be slightly stale
  })
}

// ============================================================
// Ontology Mutations
// ============================================================

/**
 * Hook to save a persona's entire ontology.
 */
export function useSavePersonaOntology() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, ontology }: { personaId: string; ontology: PersonaOntology }) => {
      const response = await fetch(`/api/personas/${personaId}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: ontology.entities,
          roles: ontology.roles,
          events: ontology.events,
          relationTypes: ontology.relationTypes,
          relations: ontology.relations,
        }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save persona ontology')
      }
      const savedOntology = await response.json()
      return { personaId, ontology: { personaId, ...savedOntology } as PersonaOntology }
    },
    onSuccess: ({ personaId, ontology }) => {
      queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
      // Invalidate all-ontologies query so header Save button gets fresh data
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
    },
  })
}

// ============================================================
// Entity Type Mutations
// ============================================================

/**
 * Hook to add an entity type to a persona's ontology.
 */
export function useAddEntityToPersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, entity }: { personaId: string; entity: EntityType }) => {
      const ontology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(personaId))
      if (!ontology) throw new Error('Ontology not loaded')

      const updatedOntology = {
        ...ontology,
        entities: [...ontology.entities, entity],
        updatedAt: new Date().toISOString(),
      }

      const response = await fetch(`/api/personas/${personaId}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: updatedOntology.entities,
          roles: updatedOntology.roles,
          events: updatedOntology.events,
          relationTypes: updatedOntology.relationTypes,
          relations: updatedOntology.relations,
        }),
      })
      if (!response.ok) throw new Error('Failed to add entity')

      return { personaId, ontology: updatedOntology }
    },
    onSuccess: ({ personaId, ontology }) => {
      queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
      // Invalidate all-ontologies query so header Save button gets fresh data
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
    },
  })
}

/**
 * Hook to update an entity type in a persona's ontology.
 */
export function useUpdateEntityInPersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, entity }: { personaId: string; entity: EntityType }) => {
      const ontology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(personaId))
      if (!ontology) throw new Error('Ontology not loaded')

      const updatedOntology = {
        ...ontology,
        entities: ontology.entities.map(e => e.id === entity.id ? entity : e),
        updatedAt: new Date().toISOString(),
      }

      const response = await fetch(`/api/personas/${personaId}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: updatedOntology.entities,
          roles: updatedOntology.roles,
          events: updatedOntology.events,
          relationTypes: updatedOntology.relationTypes,
          relations: updatedOntology.relations,
        }),
      })
      if (!response.ok) throw new Error('Failed to update entity')

      return { personaId, ontology: updatedOntology }
    },
    onSuccess: ({ personaId, ontology }) => {
      queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
      // Invalidate all-ontologies query so header Save button gets fresh data
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
    },
  })
}

/**
 * Hook to delete an entity type from a persona's ontology.
 */
export function useDeleteEntityFromPersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, entityId }: { personaId: string; entityId: string }) => {
      const ontology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(personaId))
      if (!ontology) throw new Error('Ontology not loaded')

      const updatedOntology = {
        ...ontology,
        entities: ontology.entities.filter(e => e.id !== entityId),
        updatedAt: new Date().toISOString(),
      }

      const response = await fetch(`/api/personas/${personaId}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: updatedOntology.entities,
          roles: updatedOntology.roles,
          events: updatedOntology.events,
          relationTypes: updatedOntology.relationTypes,
          relations: updatedOntology.relations,
        }),
      })
      if (!response.ok) throw new Error('Failed to delete entity')

      return { personaId, ontology: updatedOntology }
    },
    onSuccess: ({ personaId, ontology }) => {
      queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
      // Invalidate all-ontologies query so header Save button gets fresh data
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
    },
  })
}

// ============================================================
// Role Type Mutations
// ============================================================

/**
 * Hook to add a role type to a persona's ontology.
 */
export function useAddRoleToPersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, role }: { personaId: string; role: RoleType }) => {
      const ontology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(personaId))
      if (!ontology) throw new Error('Ontology not loaded')

      const updatedOntology = {
        ...ontology,
        roles: [...ontology.roles, role],
        updatedAt: new Date().toISOString(),
      }

      const response = await fetch(`/api/personas/${personaId}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: updatedOntology.entities,
          roles: updatedOntology.roles,
          events: updatedOntology.events,
          relationTypes: updatedOntology.relationTypes,
          relations: updatedOntology.relations,
        }),
      })
      if (!response.ok) throw new Error('Failed to add role')

      return { personaId, ontology: updatedOntology }
    },
    onSuccess: ({ personaId, ontology }) => {
      queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
      // Invalidate all-ontologies query so header Save button gets fresh data
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
    },
  })
}

/**
 * Hook to update a role type in a persona's ontology.
 */
export function useUpdateRoleInPersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, role }: { personaId: string; role: RoleType }) => {
      const ontology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(personaId))
      if (!ontology) throw new Error('Ontology not loaded')

      const updatedOntology = {
        ...ontology,
        roles: ontology.roles.map(r => r.id === role.id ? role : r),
        updatedAt: new Date().toISOString(),
      }

      const response = await fetch(`/api/personas/${personaId}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: updatedOntology.entities,
          roles: updatedOntology.roles,
          events: updatedOntology.events,
          relationTypes: updatedOntology.relationTypes,
          relations: updatedOntology.relations,
        }),
      })
      if (!response.ok) throw new Error('Failed to update role')

      return { personaId, ontology: updatedOntology }
    },
    onSuccess: ({ personaId, ontology }) => {
      queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
      // Invalidate all-ontologies query so header Save button gets fresh data
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
    },
  })
}

/**
 * Hook to delete a role type from a persona's ontology.
 */
export function useDeleteRoleFromPersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, roleId }: { personaId: string; roleId: string }) => {
      const ontology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(personaId))
      if (!ontology) throw new Error('Ontology not loaded')

      const updatedOntology = {
        ...ontology,
        roles: ontology.roles.filter(r => r.id !== roleId),
        updatedAt: new Date().toISOString(),
      }

      const response = await fetch(`/api/personas/${personaId}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: updatedOntology.entities,
          roles: updatedOntology.roles,
          events: updatedOntology.events,
          relationTypes: updatedOntology.relationTypes,
          relations: updatedOntology.relations,
        }),
      })
      if (!response.ok) throw new Error('Failed to delete role')

      return { personaId, ontology: updatedOntology }
    },
    onSuccess: ({ personaId, ontology }) => {
      queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
      // Invalidate all-ontologies query so header Save button gets fresh data
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
    },
  })
}

// ============================================================
// Event Type Mutations
// ============================================================

/**
 * Hook to add an event type to a persona's ontology.
 */
export function useAddEventToPersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, event }: { personaId: string; event: EventType }) => {
      const ontology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(personaId))
      if (!ontology) throw new Error('Ontology not loaded')

      const updatedOntology = {
        ...ontology,
        events: [...ontology.events, event],
        updatedAt: new Date().toISOString(),
      }

      const response = await fetch(`/api/personas/${personaId}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: updatedOntology.entities,
          roles: updatedOntology.roles,
          events: updatedOntology.events,
          relationTypes: updatedOntology.relationTypes,
          relations: updatedOntology.relations,
        }),
      })
      if (!response.ok) throw new Error('Failed to add event')

      return { personaId, ontology: updatedOntology }
    },
    onSuccess: ({ personaId, ontology }) => {
      queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
      // Invalidate all-ontologies query so header Save button gets fresh data
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
    },
  })
}

/**
 * Hook to update an event type in a persona's ontology.
 */
export function useUpdateEventInPersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, event }: { personaId: string; event: EventType }) => {
      const ontology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(personaId))
      if (!ontology) throw new Error('Ontology not loaded')

      const updatedOntology = {
        ...ontology,
        events: ontology.events.map(e => e.id === event.id ? event : e),
        updatedAt: new Date().toISOString(),
      }

      const response = await fetch(`/api/personas/${personaId}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: updatedOntology.entities,
          roles: updatedOntology.roles,
          events: updatedOntology.events,
          relationTypes: updatedOntology.relationTypes,
          relations: updatedOntology.relations,
        }),
      })
      if (!response.ok) throw new Error('Failed to update event')

      return { personaId, ontology: updatedOntology }
    },
    onSuccess: ({ personaId, ontology }) => {
      queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
      // Invalidate all-ontologies query so header Save button gets fresh data
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
    },
  })
}

/**
 * Hook to delete an event type from a persona's ontology.
 */
export function useDeleteEventFromPersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, eventId }: { personaId: string; eventId: string }) => {
      const ontology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(personaId))
      if (!ontology) throw new Error('Ontology not loaded')

      const updatedOntology = {
        ...ontology,
        events: ontology.events.filter(e => e.id !== eventId),
        updatedAt: new Date().toISOString(),
      }

      const response = await fetch(`/api/personas/${personaId}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: updatedOntology.entities,
          roles: updatedOntology.roles,
          events: updatedOntology.events,
          relationTypes: updatedOntology.relationTypes,
          relations: updatedOntology.relations,
        }),
      })
      if (!response.ok) throw new Error('Failed to delete event')

      return { personaId, ontology: updatedOntology }
    },
    onSuccess: ({ personaId, ontology }) => {
      queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
      // Invalidate all-ontologies query so header Save button gets fresh data
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
    },
  })
}

// ============================================================
// Relation Type Mutations
// ============================================================

/**
 * Hook to add a relation type to a persona's ontology.
 */
export function useAddRelationTypeToPersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, relationType }: { personaId: string; relationType: RelationType }) => {
      const ontology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(personaId))
      if (!ontology) throw new Error('Ontology not loaded')

      const updatedOntology = {
        ...ontology,
        relationTypes: [...ontology.relationTypes, relationType],
        updatedAt: new Date().toISOString(),
      }

      const response = await fetch(`/api/personas/${personaId}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: updatedOntology.entities,
          roles: updatedOntology.roles,
          events: updatedOntology.events,
          relationTypes: updatedOntology.relationTypes,
          relations: updatedOntology.relations,
        }),
      })
      if (!response.ok) throw new Error('Failed to add relation type')

      return { personaId, ontology: updatedOntology }
    },
    onSuccess: ({ personaId, ontology }) => {
      queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
      // Invalidate all-ontologies query so header Save button gets fresh data
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
    },
  })
}

/**
 * Hook to update a relation type in a persona's ontology.
 */
export function useUpdateRelationTypeInPersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, relationType }: { personaId: string; relationType: RelationType }) => {
      const ontology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(personaId))
      if (!ontology) throw new Error('Ontology not loaded')

      const updatedOntology = {
        ...ontology,
        relationTypes: ontology.relationTypes.map(r => r.id === relationType.id ? relationType : r),
        updatedAt: new Date().toISOString(),
      }

      const response = await fetch(`/api/personas/${personaId}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: updatedOntology.entities,
          roles: updatedOntology.roles,
          events: updatedOntology.events,
          relationTypes: updatedOntology.relationTypes,
          relations: updatedOntology.relations,
        }),
      })
      if (!response.ok) throw new Error('Failed to update relation type')

      return { personaId, ontology: updatedOntology }
    },
    onSuccess: ({ personaId, ontology }) => {
      queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
      // Invalidate all-ontologies query so header Save button gets fresh data
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
    },
  })
}

/**
 * Hook to delete a relation type from a persona's ontology.
 * Also deletes all relations that use this relation type.
 */
export function useDeleteRelationTypeFromPersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, relationTypeId }: { personaId: string; relationTypeId: string }) => {
      const ontology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(personaId))
      if (!ontology) throw new Error('Ontology not loaded')

      const updatedOntology = {
        ...ontology,
        relationTypes: ontology.relationTypes.filter(r => r.id !== relationTypeId),
        relations: ontology.relations.filter(r => r.relationTypeId !== relationTypeId),
        updatedAt: new Date().toISOString(),
      }

      const response = await fetch(`/api/personas/${personaId}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: updatedOntology.entities,
          roles: updatedOntology.roles,
          events: updatedOntology.events,
          relationTypes: updatedOntology.relationTypes,
          relations: updatedOntology.relations,
        }),
      })
      if (!response.ok) throw new Error('Failed to delete relation type')

      return { personaId, ontology: updatedOntology }
    },
    onSuccess: ({ personaId, ontology }) => {
      queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
      // Invalidate all-ontologies query so header Save button gets fresh data
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
    },
  })
}

// ============================================================
// Relation Instance Mutations
// ============================================================

/**
 * Hook to add a relation to a persona's ontology.
 */
export function useAddRelationToPersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, relation }: { personaId: string; relation: OntologyRelation }) => {
      const ontology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(personaId))
      if (!ontology) throw new Error('Ontology not loaded')

      const updatedOntology = {
        ...ontology,
        relations: [...ontology.relations, relation],
        updatedAt: new Date().toISOString(),
      }

      const response = await fetch(`/api/personas/${personaId}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: updatedOntology.entities,
          roles: updatedOntology.roles,
          events: updatedOntology.events,
          relationTypes: updatedOntology.relationTypes,
          relations: updatedOntology.relations,
        }),
      })
      if (!response.ok) throw new Error('Failed to add relation')

      return { personaId, ontology: updatedOntology }
    },
    onSuccess: ({ personaId, ontology }) => {
      queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
      // Invalidate all-ontologies query so header Save button gets fresh data
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
    },
  })
}

/**
 * Hook to update a relation in a persona's ontology.
 */
export function useUpdateRelationInPersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, relation }: { personaId: string; relation: OntologyRelation }) => {
      const ontology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(personaId))
      if (!ontology) throw new Error('Ontology not loaded')

      const updatedOntology = {
        ...ontology,
        relations: ontology.relations.map(r => r.id === relation.id ? relation : r),
        updatedAt: new Date().toISOString(),
      }

      const response = await fetch(`/api/personas/${personaId}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: updatedOntology.entities,
          roles: updatedOntology.roles,
          events: updatedOntology.events,
          relationTypes: updatedOntology.relationTypes,
          relations: updatedOntology.relations,
        }),
      })
      if (!response.ok) throw new Error('Failed to update relation')

      return { personaId, ontology: updatedOntology }
    },
    onSuccess: ({ personaId, ontology }) => {
      queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
      // Invalidate all-ontologies query so header Save button gets fresh data
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
    },
  })
}

/**
 * Hook to delete a relation from a persona's ontology.
 */
export function useDeleteRelationFromPersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, relationId }: { personaId: string; relationId: string }) => {
      const ontology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(personaId))
      if (!ontology) throw new Error('Ontology not loaded')

      const updatedOntology = {
        ...ontology,
        relations: ontology.relations.filter(r => r.id !== relationId),
        updatedAt: new Date().toISOString(),
      }

      const response = await fetch(`/api/personas/${personaId}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: updatedOntology.entities,
          roles: updatedOntology.roles,
          events: updatedOntology.events,
          relationTypes: updatedOntology.relationTypes,
          relations: updatedOntology.relations,
        }),
      })
      if (!response.ok) throw new Error('Failed to delete relation')

      return { personaId, ontology: updatedOntology }
    },
    onSuccess: ({ personaId, ontology }) => {
      queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
      // Invalidate all-ontologies query so header Save button gets fresh data
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
    },
  })
}

// ============================================================
// Import/Copy Operations
// ============================================================

/**
 * Hook to import types from one persona's ontology to another.
 */
export function useImportFromPersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (request: ImportRequest) => {
      const { fromPersonaId, toPersonaId, entityIds, roleIds, eventIds, relationTypeIds } = request

      const sourceOntology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(fromPersonaId))
      const targetOntology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(toPersonaId))

      if (!sourceOntology || !targetOntology) {
        throw new Error('Source or target ontology not loaded')
      }

      const now = new Date().toISOString()
      const updatedOntology = { ...targetOntology }

      if (entityIds && entityIds.length > 0) {
        const entitiesToImport = sourceOntology.entities.filter(e => entityIds.includes(e.id))
        const newEntities = entitiesToImport.map(e => ({
          ...e,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
        }))
        updatedOntology.entities = [...updatedOntology.entities, ...newEntities]
      }

      if (roleIds && roleIds.length > 0) {
        const rolesToImport = sourceOntology.roles.filter(r => roleIds.includes(r.id))
        const newRoles = rolesToImport.map(r => ({
          ...r,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
        }))
        updatedOntology.roles = [...updatedOntology.roles, ...newRoles]
      }

      if (eventIds && eventIds.length > 0) {
        const eventsToImport = sourceOntology.events.filter(e => eventIds.includes(e.id))
        const newEvents = eventsToImport.map(e => ({
          ...e,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
        }))
        updatedOntology.events = [...updatedOntology.events, ...newEvents]
      }

      if (relationTypeIds && relationTypeIds.length > 0) {
        const relationTypesToImport = sourceOntology.relationTypes.filter(r => relationTypeIds.includes(r.id))
        const newRelationTypes = relationTypesToImport.map(r => ({
          ...r,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
        }))
        updatedOntology.relationTypes = [...updatedOntology.relationTypes, ...newRelationTypes]
      }

      updatedOntology.updatedAt = now

      // Save to server
      const response = await fetch(`/api/personas/${toPersonaId}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: updatedOntology.entities,
          roles: updatedOntology.roles,
          events: updatedOntology.events,
          relationTypes: updatedOntology.relationTypes,
          relations: updatedOntology.relations,
        }),
      })
      if (!response.ok) throw new Error('Failed to import types')

      return { personaId: toPersonaId, ontology: updatedOntology }
    },
    onSuccess: ({ personaId, ontology }) => {
      queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
      // Invalidate all-ontologies query so header Save button gets fresh data
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
    },
  })
}

/**
 * Hook to copy an entire persona with its ontology.
 */
export function useCopyPersona() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ sourcePersonaId, newPersonaData }: {
      sourcePersonaId: string
      newPersonaData: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>
    }) => {
      const sourceOntology = queryClient.getQueryData<PersonaOntology>(personaKeys.ontology(sourcePersonaId))
      if (!sourceOntology) throw new Error('Source ontology not loaded')

      // Create new persona
      const response = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newPersonaData),
      })
      if (!response.ok) throw new Error('Failed to create copied persona')
      const newPersona = await response.json()

      // Create ontology copy
      const ontologyResponse = await fetch(`/api/personas/${newPersona.id}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entities: sourceOntology.entities,
          roles: sourceOntology.roles,
          events: sourceOntology.events,
          relationTypes: sourceOntology.relationTypes,
          relations: sourceOntology.relations,
        }),
      })
      if (!ontologyResponse.ok) {
        // Rollback
        await fetch(`/api/personas/${newPersona.id}`, { method: 'DELETE', credentials: 'include' })
        throw new Error('Failed to copy ontology')
      }

      const newOntology = await ontologyResponse.json()
      return {
        persona: newPersona,
        ontology: { personaId: newPersona.id, ...newOntology } as PersonaOntology,
      }
    },
    onSuccess: ({ persona, ontology }) => {
      queryClient.setQueryData<Persona[]>(personaKeys.list(), (old = []) => [...old, persona])
      queryClient.setQueryData(personaKeys.ontology(persona.id), ontology)
    },
  })
}

// ============================================================
// Utility Hooks
// ============================================================

/**
 * Hook to invalidate persona cache.
 */
export function useInvalidatePersonas() {
  const queryClient = useQueryClient()

  return (personaId?: string) => {
    if (personaId) {
      queryClient.invalidateQueries({ queryKey: personaKeys.ontology(personaId) })
    } else {
      queryClient.invalidateQueries({ queryKey: personaKeys.all })
    }
  }
}

/**
 * Hook to set personas directly in cache (for optimistic updates or imports).
 */
export function useSetPersonas() {
  const queryClient = useQueryClient()

  return (personas: Persona[]) => {
    queryClient.setQueryData(personaKeys.list(), personas)
  }
}

/**
 * Hook to set a persona's ontology directly in cache.
 */
export function useSetPersonaOntology() {
  const queryClient = useQueryClient()

  return (personaId: string, ontology: PersonaOntology) => {
    queryClient.setQueryData(personaKeys.ontology(personaId), ontology)
  }
}

// ============================================================
// Type Deletion Preview and Graceful Delete Hooks
// ============================================================

type TypeCategory = 'entities' | 'roles' | 'events' | 'relation-types'

/**
 * Fetch deletion preview for an ontology type.
 * Returns counts of items that will be affected when the type is deleted.
 */
async function fetchTypeDeletionPreview(
  personaId: string,
  typeCategory: TypeCategory,
  typeId: string
): Promise<TypeDeletionPreview> {
  const response = await fetch(
    `/api/personas/${personaId}/ontology/${typeCategory}/${typeId}/deletion-preview`,
    { credentials: 'include' }
  )
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch type deletion preview')
  }
  return response.json()
}

/**
 * Hook to fetch deletion preview for an entity type.
 * Shows counts of gloss references, annotations, and world assignments
 * that will be affected when the entity type is deleted.
 *
 * @param personaId - The persona ID
 * @param entityId - The entity type ID
 * @param enabled - Whether to enable the query (default: false)
 */
export function useEntityTypeDeletionPreview(
  personaId: string | null | undefined,
  entityId: string | null | undefined,
  enabled = false
) {
  return useQuery({
    queryKey: personaKeys.typeDeletionPreview(personaId ?? '', 'entities', entityId ?? ''),
    queryFn: () => fetchTypeDeletionPreview(personaId!, 'entities', entityId!),
    enabled: !!personaId && !!entityId && enabled,
    staleTime: 30 * 1000,
  })
}

/**
 * Hook to fetch deletion preview for a role type.
 */
export function useRoleTypeDeletionPreview(
  personaId: string | null | undefined,
  roleId: string | null | undefined,
  enabled = false
) {
  return useQuery({
    queryKey: personaKeys.typeDeletionPreview(personaId ?? '', 'roles', roleId ?? ''),
    queryFn: () => fetchTypeDeletionPreview(personaId!, 'roles', roleId!),
    enabled: !!personaId && !!roleId && enabled,
    staleTime: 30 * 1000,
  })
}

/**
 * Hook to fetch deletion preview for an event type.
 */
export function useEventTypeDeletionPreview(
  personaId: string | null | undefined,
  eventId: string | null | undefined,
  enabled = false
) {
  return useQuery({
    queryKey: personaKeys.typeDeletionPreview(personaId ?? '', 'events', eventId ?? ''),
    queryFn: () => fetchTypeDeletionPreview(personaId!, 'events', eventId!),
    enabled: !!personaId && !!eventId && enabled,
    staleTime: 30 * 1000,
  })
}

/**
 * Hook to fetch deletion preview for a relation type.
 */
export function useRelationTypeDeletionPreview(
  personaId: string | null | undefined,
  relationTypeId: string | null | undefined,
  enabled = false
) {
  return useQuery({
    queryKey: personaKeys.typeDeletionPreview(personaId ?? '', 'relation-types', relationTypeId ?? ''),
    queryFn: () => fetchTypeDeletionPreview(personaId!, 'relation-types', relationTypeId!),
    enabled: !!personaId && !!relationTypeId && enabled,
    staleTime: 30 * 1000,
  })
}

/**
 * Delete an ontology type with graceful cleanup.
 * Converts references in glosses to plain text instead of cascading.
 */
async function deleteTypeGracefully(
  personaId: string,
  typeCategory: TypeCategory,
  typeId: string
): Promise<TypeDeletionResult> {
  const response = await fetch(
    `/api/personas/${personaId}/ontology/${typeCategory}/${typeId}`,
    {
      method: 'DELETE',
      credentials: 'include',
    }
  )
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete type')
  }
  return response.json()
}

/**
 * Hook to delete an entity type with graceful cleanup.
 * References in other type glosses are converted to plain text.
 * Type annotations and world assignments are removed.
 */
export function useDeleteEntityTypeGracefully() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, entityId }: { personaId: string; entityId: string }) => {
      const result = await deleteTypeGracefully(personaId, 'entities', entityId)
      return { personaId, entityId, result }
    },
    onSuccess: ({ personaId, entityId }) => {
      // Update the ontology cache to remove the deleted entity
      queryClient.setQueryData<PersonaOntology>(personaKeys.ontology(personaId), (old) => {
        if (!old) return old
        return {
          ...old,
          entities: old.entities.filter(e => e.id !== entityId),
          updatedAt: new Date().toISOString(),
        }
      })
      // Invalidate all ontologies since glosses may have been modified
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
      // Remove the deletion preview from cache
      queryClient.removeQueries({
        queryKey: personaKeys.typeDeletionPreview(personaId, 'entities', entityId),
      })
    },
  })
}

/**
 * Hook to delete a role type with graceful cleanup.
 * References in other type glosses are converted to plain text.
 * Role references in event types are removed.
 */
export function useDeleteRoleTypeGracefully() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, roleId }: { personaId: string; roleId: string }) => {
      const result = await deleteTypeGracefully(personaId, 'roles', roleId)
      return { personaId, roleId, result }
    },
    onSuccess: ({ personaId, roleId }) => {
      queryClient.setQueryData<PersonaOntology>(personaKeys.ontology(personaId), (old) => {
        if (!old) return old
        return {
          ...old,
          roles: old.roles.filter(r => r.id !== roleId),
          // Also remove role references from event types
          events: old.events.map(event => ({
            ...event,
            roles: event.roles?.filter(role => role.roleTypeId !== roleId) ?? [],
          })),
          updatedAt: new Date().toISOString(),
        }
      })
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
      queryClient.removeQueries({
        queryKey: personaKeys.typeDeletionPreview(personaId, 'roles', roleId),
      })
    },
  })
}

/**
 * Hook to delete an event type with graceful cleanup.
 * References in other type glosses are converted to plain text.
 * Event interpretations in world objects are removed.
 */
export function useDeleteEventTypeGracefully() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, eventId }: { personaId: string; eventId: string }) => {
      const result = await deleteTypeGracefully(personaId, 'events', eventId)
      return { personaId, eventId, result }
    },
    onSuccess: ({ personaId, eventId }) => {
      queryClient.setQueryData<PersonaOntology>(personaKeys.ontology(personaId), (old) => {
        if (!old) return old
        return {
          ...old,
          events: old.events.filter(e => e.id !== eventId),
          updatedAt: new Date().toISOString(),
        }
      })
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
      queryClient.removeQueries({
        queryKey: personaKeys.typeDeletionPreview(personaId, 'events', eventId),
      })
    },
  })
}

/**
 * Hook to delete a relation type with graceful cleanup.
 * References in other type glosses are converted to plain text.
 * Relations using this type are deleted.
 */
export function useDeleteRelationTypeGracefully() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, relationTypeId }: { personaId: string; relationTypeId: string }) => {
      const result = await deleteTypeGracefully(personaId, 'relation-types', relationTypeId)
      return { personaId, relationTypeId, result }
    },
    onSuccess: ({ personaId, relationTypeId }) => {
      queryClient.setQueryData<PersonaOntology>(personaKeys.ontology(personaId), (old) => {
        if (!old) return old
        return {
          ...old,
          relationTypes: old.relationTypes.filter(r => r.id !== relationTypeId),
          // Also remove relations using this type
          relations: old.relations.filter(r => r.relationTypeId !== relationTypeId),
          updatedAt: new Date().toISOString(),
        }
      })
      queryClient.invalidateQueries({ queryKey: personaKeys.allOntologies() })
      queryClient.removeQueries({
        queryKey: personaKeys.typeDeletionPreview(personaId, 'relation-types', relationTypeId),
      })
    },
  })
}
