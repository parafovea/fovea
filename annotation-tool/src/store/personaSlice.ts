import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { Persona, PersonaOntology, EntityType, RoleType, EventType, RelationType, OntologyRelation, ImportRequest } from '../models/types'
import { generateId } from '../utils/uuid'

/**
 * Fetches all personas from the API.
 * Used to load personas from the backend database.
 */
export const fetchPersonas = createAsyncThunk(
  'persona/fetchPersonas',
  async () => {
    const response = await fetch('/api/personas')
    if (!response.ok) {
      throw new Error('Failed to fetch personas')
    }
    const data = await response.json()
    // API returns array directly, not wrapped in object
    return Array.isArray(data) ? data as Persona[] : []
  }
)

/**
 * Fetches ontology for a specific persona from the API.
 */
export const fetchPersonaOntology = createAsyncThunk(
  'persona/fetchPersonaOntology',
  async (personaId: string) => {
    const response = await fetch(`/api/personas/${personaId}/ontology`)
    if (!response.ok) {
      throw new Error('Failed to fetch persona ontology')
    }
    const ontology = await response.json()
    return { personaId, ontology }
  }
)

/**
 * State shape for persona management.
 * Manages personas and their associated ontologies in the application.
 */
interface PersonaState {
  /** Array of all personas */
  personas: Persona[]
  /** Array of ontologies, one per persona */
  personaOntologies: PersonaOntology[]
  /** ID of the currently active persona, or null if none selected */
  activePersonaId: string | null
  /** Loading state for async operations */
  isLoading: boolean
  /** Error message from failed operations */
  error: string | null
  /** Flag indicating whether there are unsaved changes */
  unsavedChanges: boolean
}

const initialState: PersonaState = {
  personas: [],
  personaOntologies: [],
  activePersonaId: null,
  isLoading: false,
  error: null,
  unsavedChanges: false,
}

/**
 * Redux slice for persona and ontology management.
 *
 * Manages the state of personas (analysts with different ontological perspectives)
 * and their associated ontologies (entity types, event types, roles, and relations).
 * Each persona has their own ontology that defines how they interpret and annotate videos.
 *
 * Key features:
 * - CRUD operations for personas
 * - CRUD operations for ontology types (entities, roles, events, relation types)
 * - CRUD operations for ontology relations (instances of relation types)
 * - Import functionality to copy types between personas
 * - Active persona tracking for UI context
 * - Unsaved changes tracking for data persistence warnings
 */
const personaSlice = createSlice({
  name: 'persona',
  initialState,
  reducers: {
    /**
     * Replaces all personas with a new array.
     * Used when loading data from API or file import.
     */
    setPersonas: (state, action: PayloadAction<Persona[]>) => {
      state.personas = action.payload
      state.unsavedChanges = false
    },

    /**
     * Replaces all persona ontologies with a new array.
     * Used when loading data from API or file import.
     */
    setPersonaOntologies: (state, action: PayloadAction<PersonaOntology[]>) => {
      state.personaOntologies = action.payload
      state.unsavedChanges = false
    },

    /**
     * Sets the active persona for the UI context.
     * The active persona determines which ontology is used for annotations.
     */
    setActivePersona: (state, action: PayloadAction<string>) => {
      state.activePersonaId = action.payload
    },

    /**
     * Adds a new persona and its associated ontology.
     * The ontology is created empty and can be populated separately.
     */
    addPersona: (state, action: PayloadAction<{ persona: Persona; ontology: PersonaOntology }>) => {
      state.personas.push(action.payload.persona)
      state.personaOntologies.push(action.payload.ontology)
      state.unsavedChanges = true
    },

    /**
     * Updates an existing persona's basic information.
     * Does not modify the associated ontology.
     */
    updatePersona: (state, action: PayloadAction<Persona>) => {
      const index = state.personas.findIndex(p => p.id === action.payload.id)
      if (index !== -1) {
        state.personas[index] = action.payload
        state.unsavedChanges = true
      }
    },

    /**
     * Deletes a persona and its associated ontology.
     * If the deleted persona was active, switches to the first remaining persona.
     */
    deletePersona: (state, action: PayloadAction<string>) => {
      state.personas = state.personas.filter(p => p.id !== action.payload)
      state.personaOntologies = state.personaOntologies.filter(o => o.personaId !== action.payload)
      if (state.activePersonaId === action.payload) {
        state.activePersonaId = state.personas.length > 0 ? state.personas[0].id : null
      }
      state.unsavedChanges = true
    },
    /**
     * Copies a persona and its entire ontology.
     * Creates a new persona with a deep copy of the source persona's ontology.
     */
    copyPersona: (state, action: PayloadAction<{ sourcePersonaId: string; newPersona: Persona }>) => {
      const sourceOntology = state.personaOntologies.find(o => o.personaId === action.payload.sourcePersonaId)
      if (sourceOntology) {
        const newOntology: PersonaOntology = {
          ...sourceOntology,
          id: generateId(),
          personaId: action.payload.newPersona.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        state.personas.push(action.payload.newPersona)
        state.personaOntologies.push(newOntology)
        state.unsavedChanges = true
      }
    },

    /**
     * Imports selected types from one persona's ontology to another.
     * Allows selective copying of entity types, roles, events, and relation types
     * between personas for ontology reuse.
     */
    importFromPersona: (state, action: PayloadAction<ImportRequest>) => {
      const { fromPersonaId, toPersonaId, entityIds, roleIds, eventIds, relationTypeIds } = action.payload

      const sourceOntology = state.personaOntologies.find(o => o.personaId === fromPersonaId)
      const targetOntology = state.personaOntologies.find(o => o.personaId === toPersonaId)

      if (sourceOntology && targetOntology) {
        const now = new Date().toISOString()

        if (entityIds && entityIds.length > 0) {
          const entitiesToImport = sourceOntology.entities.filter(e => entityIds.includes(e.id))
          const newEntities = entitiesToImport.map(e => ({
            ...e,
            id: generateId(),
            createdAt: now,
            updatedAt: now,
          }))
          targetOntology.entities.push(...newEntities)
        }

        if (roleIds && roleIds.length > 0) {
          const rolesToImport = sourceOntology.roles.filter(r => roleIds.includes(r.id))
          const newRoles = rolesToImport.map(r => ({
            ...r,
            id: generateId(),
            createdAt: now,
            updatedAt: now,
          }))
          targetOntology.roles.push(...newRoles)
        }

        if (eventIds && eventIds.length > 0) {
          const eventsToImport = sourceOntology.events.filter(e => eventIds.includes(e.id))
          const newEvents = eventsToImport.map(e => ({
            ...e,
            id: generateId(),
            createdAt: now,
            updatedAt: now,
          }))
          targetOntology.events.push(...newEvents)
        }

        if (relationTypeIds && relationTypeIds.length > 0) {
          const relationTypesToImport = sourceOntology.relationTypes.filter(r => relationTypeIds.includes(r.id))
          const newRelationTypes = relationTypesToImport.map(r => ({
            ...r,
            id: generateId(),
            createdAt: now,
            updatedAt: now,
          }))
          targetOntology.relationTypes.push(...newRelationTypes)
        }

        targetOntology.updatedAt = now
        state.unsavedChanges = true
      }
    },
    /**
     * Adds an entity type to a persona's ontology.
     */
    addEntityToPersona: (state, action: PayloadAction<{ personaId: string; entity: EntityType }>) => {
      const ontology = state.personaOntologies.find(o => o.personaId === action.payload.personaId)
      if (ontology) {
        ontology.entities.push(action.payload.entity)
        ontology.updatedAt = new Date().toISOString()
        state.unsavedChanges = true
      }
    },

    /**
     * Updates an existing entity type in a persona's ontology.
     */
    updateEntityInPersona: (state, action: PayloadAction<{ personaId: string; entity: EntityType }>) => {
      const ontology = state.personaOntologies.find(o => o.personaId === action.payload.personaId)
      if (ontology) {
        const index = ontology.entities.findIndex(e => e.id === action.payload.entity.id)
        if (index !== -1) {
          ontology.entities[index] = action.payload.entity
          ontology.updatedAt = new Date().toISOString()
          state.unsavedChanges = true
        }
      }
    },

    /**
     * Deletes an entity type from a persona's ontology.
     */
    deleteEntityFromPersona: (state, action: PayloadAction<{ personaId: string; entityId: string }>) => {
      const ontology = state.personaOntologies.find(o => o.personaId === action.payload.personaId)
      if (ontology) {
        ontology.entities = ontology.entities.filter(e => e.id !== action.payload.entityId)
        ontology.updatedAt = new Date().toISOString()
        state.unsavedChanges = true
      }
    },
    addRoleToPersona: (state, action: PayloadAction<{ personaId: string; role: RoleType }>) => {
      const ontology = state.personaOntologies.find(o => o.personaId === action.payload.personaId)
      if (ontology) {
        ontology.roles.push(action.payload.role)
        ontology.updatedAt = new Date().toISOString()
        state.unsavedChanges = true
      }
    },
    updateRoleInPersona: (state, action: PayloadAction<{ personaId: string; role: RoleType }>) => {
      const ontology = state.personaOntologies.find(o => o.personaId === action.payload.personaId)
      if (ontology) {
        const index = ontology.roles.findIndex(r => r.id === action.payload.role.id)
        if (index !== -1) {
          ontology.roles[index] = action.payload.role
          ontology.updatedAt = new Date().toISOString()
          state.unsavedChanges = true
        }
      }
    },
    deleteRoleFromPersona: (state, action: PayloadAction<{ personaId: string; roleId: string }>) => {
      const ontology = state.personaOntologies.find(o => o.personaId === action.payload.personaId)
      if (ontology) {
        ontology.roles = ontology.roles.filter(r => r.id !== action.payload.roleId)
        ontology.updatedAt = new Date().toISOString()
        state.unsavedChanges = true
      }
    },
    addEventToPersona: (state, action: PayloadAction<{ personaId: string; event: EventType }>) => {
      const ontology = state.personaOntologies.find(o => o.personaId === action.payload.personaId)
      if (ontology) {
        ontology.events.push(action.payload.event)
        ontology.updatedAt = new Date().toISOString()
        state.unsavedChanges = true
      }
    },
    updateEventInPersona: (state, action: PayloadAction<{ personaId: string; event: EventType }>) => {
      const ontology = state.personaOntologies.find(o => o.personaId === action.payload.personaId)
      if (ontology) {
        const index = ontology.events.findIndex(e => e.id === action.payload.event.id)
        if (index !== -1) {
          ontology.events[index] = action.payload.event
          ontology.updatedAt = new Date().toISOString()
          state.unsavedChanges = true
        }
      }
    },
    deleteEventFromPersona: (state, action: PayloadAction<{ personaId: string; eventId: string }>) => {
      const ontology = state.personaOntologies.find(o => o.personaId === action.payload.personaId)
      if (ontology) {
        ontology.events = ontology.events.filter(e => e.id !== action.payload.eventId)
        ontology.updatedAt = new Date().toISOString()
        state.unsavedChanges = true
      }
    },
    addRelationType: (state, action: PayloadAction<{ personaId: string; relationType: RelationType }>) => {
      const ontology = state.personaOntologies.find(o => o.personaId === action.payload.personaId)
      if (ontology) {
        ontology.relationTypes.push(action.payload.relationType)
        ontology.updatedAt = new Date().toISOString()
        state.unsavedChanges = true
      }
    },
    updateRelationType: (state, action: PayloadAction<{ personaId: string; relationType: RelationType }>) => {
      const ontology = state.personaOntologies.find(o => o.personaId === action.payload.personaId)
      if (ontology) {
        const index = ontology.relationTypes.findIndex(r => r.id === action.payload.relationType.id)
        if (index !== -1) {
          ontology.relationTypes[index] = action.payload.relationType
          ontology.updatedAt = new Date().toISOString()
          state.unsavedChanges = true
        }
      }
    },
    deleteRelationType: (state, action: PayloadAction<{ personaId: string; relationTypeId: string }>) => {
      const ontology = state.personaOntologies.find(o => o.personaId === action.payload.personaId)
      if (ontology) {
        ontology.relationTypes = ontology.relationTypes.filter(r => r.id !== action.payload.relationTypeId)
        ontology.relations = ontology.relations.filter(r => r.relationTypeId !== action.payload.relationTypeId)
        ontology.updatedAt = new Date().toISOString()
        state.unsavedChanges = true
      }
    },
    addRelation: (state, action: PayloadAction<{ personaId: string; relation: OntologyRelation }>) => {
      const ontology = state.personaOntologies.find(o => o.personaId === action.payload.personaId)
      if (ontology) {
        ontology.relations.push(action.payload.relation)
        ontology.updatedAt = new Date().toISOString()
        state.unsavedChanges = true
      }
    },
    updateRelation: (state, action: PayloadAction<{ personaId: string; relation: OntologyRelation }>) => {
      const ontology = state.personaOntologies.find(o => o.personaId === action.payload.personaId)
      if (ontology) {
        const index = ontology.relations.findIndex(r => r.id === action.payload.relation.id)
        if (index !== -1) {
          ontology.relations[index] = action.payload.relation
          ontology.updatedAt = new Date().toISOString()
          state.unsavedChanges = true
        }
      }
    },
    deleteRelation: (state, action: PayloadAction<{ personaId: string; relationId: string }>) => {
      const ontology = state.personaOntologies.find(o => o.personaId === action.payload.personaId)
      if (ontology) {
        ontology.relations = ontology.relations.filter(r => r.id !== action.payload.relationId)
        ontology.updatedAt = new Date().toISOString()
        state.unsavedChanges = true
      }
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
    markSaved: (state) => {
      state.unsavedChanges = false
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPersonas.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchPersonas.fulfilled, (state, action) => {
        state.isLoading = false
        state.personas = action.payload
        if (action.payload.length > 0 && !state.activePersonaId) {
          state.activePersonaId = action.payload[0].id
        }
      })
      .addCase(fetchPersonas.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message || 'Failed to fetch personas'
      })
      .addCase(fetchPersonaOntology.fulfilled, (state, action) => {
        const { personaId, ontology } = action.payload
        const existingIndex = state.personaOntologies.findIndex(o => o.personaId === personaId)
        if (existingIndex !== -1) {
          state.personaOntologies[existingIndex] = { personaId, ...ontology }
        } else {
          state.personaOntologies.push({ personaId, ...ontology })
        }
      })
  },
})

export const {
  setPersonas,
  setPersonaOntologies,
  setActivePersona,
  addPersona,
  updatePersona,
  deletePersona,
  copyPersona,
  importFromPersona,
  addEntityToPersona,
  updateEntityInPersona,
  deleteEntityFromPersona,
  addRoleToPersona,
  updateRoleInPersona,
  deleteRoleFromPersona,
  addEventToPersona,
  updateEventInPersona,
  deleteEventFromPersona,
  addRelationType,
  updateRelationType,
  deleteRelationType,
  addRelation,
  updateRelation,
  deleteRelation,
  setLoading,
  setError,
  markSaved,
} = personaSlice.actions

export default personaSlice.reducer