import { useState, useCallback, useRef, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { AppDispatch, RootState } from '../store/store'
import { DuplicateImportError } from '../lib/errors'
import {
  addEntityToPersona,
  deleteEntityFromPersona,
  addRoleToPersona,
  deleteRoleFromPersona,
  addEventToPersona,
  deleteEventFromPersona,
  addRelationType,
  deleteRelationType,
} from '../store/personaSlice'
import {
  addEntity,
  deleteEntity,
  addEvent,
  deleteEvent,
  deleteTime,
} from '../store/worldSlice'
import { EntityType, RoleType, EventType, RelationType, Entity, Event, Location } from '../models/types'
import { generateId } from '../utils/uuid'

/**
 * Wikidata import types supported by the hook.
 */
export type ImportType = 'entity-type' | 'role-type' | 'event-type' | 'relation-type' | 'entity' | 'event' | 'location' | 'time'

/**
 * Data structure for importing items from Wikidata.
 */
export interface WikidataImportData {
  name: string
  description: string
  wikidataId: string
  wikidataUrl: string
  aliases?: string[]
  coordinates?: any
  boundingBox?: any
  temporalData?: any
  locationData?: any[]
  participantData?: any[]
}

/**
 * Undo queue entry for tracking imports that can be undone.
 */
interface UndoEntry {
  id: string
  type: ImportType
  personaId?: string
  timestamp: number
  timeout: ReturnType<typeof setTimeout>
}

const UNDO_TIMEOUT_MS = 10000 // 10 seconds

/**
 * Checks if an item with the given wikidataId already exists in the list.
 * Returns the existing item's name if found, null otherwise.
 */
function findExistingByWikidataId<T extends { wikidataId?: string; name: string }>(
  items: T[],
  wikidataId: string
): string | null {
  const existing = items.find(item => item.wikidataId === wikidataId)
  return existing ? existing.name : null
}

/**
 * Custom hook for managing Wikidata imports with one-click save and undo functionality.
 *
 * Provides a standardized way to import items from Wikidata into the application,
 * with automatic persistence and a 10-second undo window.
 *
 * @param type - The type of item being imported
 * @param personaId - The persona ID for ontology types (required for types, optional for objects)
 * @param onSuccess - Optional callback when import succeeds
 * @param onError - Optional callback when import fails
 * @returns Object with import function, loading state, error state, and undo function
 *
 * @example
 * ```tsx
 * const { importItem, importing, error, undo } = useWikidataImport('entity-type', personaId)
 *
 * const handleImport = async (data: WikidataImportData) => {
 *   const id = await importItem(data)
 *   toast.success('Imported successfully', { action: <Button onClick={() => undo(id)}>Undo</Button> })
 * }
 * ```
 */
export function useWikidataImport(
  type: ImportType,
  personaId?: string,
  onSuccess?: (id: string) => void,
  onError?: (error: Error) => void
) {
  const dispatch = useDispatch<AppDispatch>()
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const undoQueue = useRef<Map<string, UndoEntry>>(new Map())

  // Get existing items from Redux state for duplicate detection
  const personaOntologies = useSelector((state: RootState) => state.persona.personaOntologies)
  const worldEntities = useSelector((state: RootState) => state.world.entities)
  const worldEvents = useSelector((state: RootState) => state.world.events)

  // Memoize the current persona's ontology for efficient lookup
  const currentOntology = useMemo(() => {
    if (!personaId) return null
    return personaOntologies.find(o => o.personaId === personaId) || null
  }, [personaOntologies, personaId])

  /**
   * Imports an item from Wikidata with immediate persistence.
   * Returns the ID of the imported item for undo purposes.
   */
  const importItem = useCallback(async (data: WikidataImportData): Promise<string> => {
    setImporting(true)
    setError(null)

    try {
      // Check for duplicates based on wikidataId
      const wikidataId = data.wikidataId
      let existingItemName: string | null = null

      switch (type) {
        case 'entity-type':
          if (currentOntology) existingItemName = findExistingByWikidataId(currentOntology.entities, wikidataId)
          break
        case 'role-type':
          if (currentOntology) existingItemName = findExistingByWikidataId(currentOntology.roles, wikidataId)
          break
        case 'event-type':
          if (currentOntology) existingItemName = findExistingByWikidataId(currentOntology.events, wikidataId)
          break
        case 'relation-type':
          if (currentOntology) existingItemName = findExistingByWikidataId(currentOntology.relationTypes, wikidataId)
          break
        case 'entity':
        case 'location':
          existingItemName = findExistingByWikidataId(worldEntities, wikidataId)
          break
        case 'event':
          existingItemName = findExistingByWikidataId(worldEvents, wikidataId)
          break
      }

      if (existingItemName) {
        throw new DuplicateImportError(wikidataId, existingItemName, type)
      }

      const now = new Date().toISOString()
      const id = generateId()

      // Dispatch appropriate action based on type
      switch (type) {
        case 'entity-type': {
          if (!personaId) throw new Error('personaId required for entity-type import')
          const entityType: EntityType = {
            id,
            name: data.name,
            gloss: [{ type: 'text', content: data.description }],
            examples: [],
            wikidataId: data.wikidataId,
            wikidataUrl: data.wikidataUrl,
            importedFrom: 'wikidata',
            importedAt: now,
            createdAt: now,
            updatedAt: now,
          }
          dispatch(addEntityToPersona({ personaId, entity: entityType }))
          break
        }

        case 'role-type': {
          if (!personaId) throw new Error('personaId required for role-type import')
          const roleType: RoleType = {
            id,
            name: data.name,
            gloss: [{ type: 'text', content: data.description }],
            allowedFillerTypes: ['entity'],
            examples: [],
            wikidataId: data.wikidataId,
            wikidataUrl: data.wikidataUrl,
            importedFrom: 'wikidata',
            importedAt: now,
            createdAt: now,
            updatedAt: now,
          }
          dispatch(addRoleToPersona({ personaId, role: roleType }))
          break
        }

        case 'event-type': {
          if (!personaId) throw new Error('personaId required for event-type import')
          const eventType: EventType = {
            id,
            name: data.name,
            gloss: [{ type: 'text', content: data.description }],
            roles: [],
            examples: [],
            wikidataId: data.wikidataId,
            wikidataUrl: data.wikidataUrl,
            importedFrom: 'wikidata',
            importedAt: now,
            createdAt: now,
            updatedAt: now,
          }
          dispatch(addEventToPersona({ personaId, event: eventType }))
          break
        }

        case 'relation-type': {
          if (!personaId) throw new Error('personaId required for relation-type import')
          const relationType: RelationType = {
            id,
            name: data.name,
            gloss: [{ type: 'text', content: data.description }],
            sourceTypes: ['entity'],
            targetTypes: ['entity'],
            symmetric: false,
            transitive: false,
            examples: [],
            wikidataId: data.wikidataId,
            wikidataUrl: data.wikidataUrl,
            importedFrom: 'wikidata',
            importedAt: now,
            createdAt: now,
            updatedAt: now,
          }
          dispatch(addRelationType({ personaId, relationType }))
          break
        }

        case 'entity': {
          const entity: Omit<Entity, 'id' | 'createdAt' | 'updatedAt'> = {
            name: data.name,
            description: [{ type: 'text', content: data.description }],
            typeAssignments: [],
            wikidataId: data.wikidataId,
            wikidataUrl: data.wikidataUrl,
            importedFrom: 'wikidata',
            importedAt: now,
            metadata: {
              alternateNames: data.aliases || [],
              externalIds: {},
              properties: {},
            },
          }
          dispatch(addEntity(entity))
          break
        }

        case 'event': {
          const event: Omit<Event, 'id' | 'createdAt' | 'updatedAt'> = {
            name: data.name,
            description: [{ type: 'text', content: data.description }],
            personaInterpretations: [],
            wikidataId: data.wikidataId,
            wikidataUrl: data.wikidataUrl,
            importedFrom: 'wikidata',
            importedAt: now,
            metadata: {
              certainty: 1.0,
              properties: {},
            },
          }
          dispatch(addEvent(event))
          break
        }

        case 'location': {
          const location: Omit<Location, 'id' | 'createdAt' | 'updatedAt'> = {
            name: data.name,
            description: [{ type: 'text', content: data.description }],
            typeAssignments: [],
            wikidataId: data.wikidataId,
            wikidataUrl: data.wikidataUrl,
            importedFrom: 'wikidata',
            importedAt: now,
            metadata: {
              alternateNames: data.aliases || [],
              externalIds: {},
              properties: {},
            },
            locationType: 'point',
            coordinateSystem: 'GPS',
            coordinates: data.coordinates || {},
          } as any
          dispatch(addEntity(location as any))
          break
        }

        default:
          throw new Error(`Unsupported import type: ${type}`)
      }

      // Add to undo queue with timeout
      const timeout = setTimeout(() => {
        undoQueue.current.delete(id)
      }, UNDO_TIMEOUT_MS)

      undoQueue.current.set(id, {
        id,
        type,
        personaId,
        timestamp: Date.now(),
        timeout,
      })

      setImporting(false)
      onSuccess?.(id)
      return id
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to import from Wikidata'
      setError(errorMessage)
      setImporting(false)
      onError?.(err instanceof Error ? err : new Error(errorMessage))
      throw err
    }
  }, [type, personaId, dispatch, onSuccess, onError, currentOntology, worldEntities, worldEvents])

  /**
   * Undoes a previous import by ID.
   * Only works within 10 seconds of import.
   */
  const undo = useCallback((id: string) => {
    const entry = undoQueue.current.get(id)
    if (!entry) {
      throw new Error('Undo timeout expired or invalid ID')
    }

    // Clear the timeout
    clearTimeout(entry.timeout)
    undoQueue.current.delete(id)

    // Dispatch delete action based on type
    switch (entry.type) {
      case 'entity-type':
        if (entry.personaId) {
          dispatch(deleteEntityFromPersona({ personaId: entry.personaId, entityId: id }))
        }
        break
      case 'role-type':
        if (entry.personaId) {
          dispatch(deleteRoleFromPersona({ personaId: entry.personaId, roleId: id }))
        }
        break
      case 'event-type':
        if (entry.personaId) {
          dispatch(deleteEventFromPersona({ personaId: entry.personaId, eventId: id }))
        }
        break
      case 'relation-type':
        if (entry.personaId) {
          dispatch(deleteRelationType({ personaId: entry.personaId, relationTypeId: id }))
        }
        break
      case 'entity':
      case 'location':
        dispatch(deleteEntity(id))
        break
      case 'event':
        dispatch(deleteEvent(id))
        break
      case 'time':
        dispatch(deleteTime(id))
        break
    }
  }, [dispatch])

  /**
   * Clears all undo timeouts on unmount.
   */
  const clearUndo = useCallback(() => {
    undoQueue.current.forEach(entry => clearTimeout(entry.timeout))
    undoQueue.current.clear()
  }, [])

  return {
    importItem,
    importing,
    error,
    undo,
    clearUndo,
  }
}
