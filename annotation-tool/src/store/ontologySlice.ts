import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { Ontology, EntityType, RoleType, EventType, Persona } from '../models/types'

interface OntologyState {
  currentOntology: Ontology | null
  isLoading: boolean
  error: string | null
  unsavedChanges: boolean
}

const initialState: OntologyState = {
  currentOntology: null,
  isLoading: false,
  error: null,
  unsavedChanges: false,
}

const ontologySlice = createSlice({
  name: 'ontology',
  initialState,
  reducers: {
    setOntology: (state, action: PayloadAction<Ontology>) => {
      state.currentOntology = action.payload
      state.unsavedChanges = false
    },
    setPersona: (state, action: PayloadAction<Persona>) => {
      if (state.currentOntology) {
        state.currentOntology.persona = action.payload
        state.currentOntology.updatedAt = new Date().toISOString()
        state.unsavedChanges = true
      }
    },
    addEntity: (state, action: PayloadAction<EntityType>) => {
      if (state.currentOntology) {
        state.currentOntology.entities.push(action.payload)
        state.currentOntology.updatedAt = new Date().toISOString()
        state.unsavedChanges = true
      }
    },
    updateEntity: (state, action: PayloadAction<EntityType>) => {
      if (state.currentOntology) {
        const index = state.currentOntology.entities.findIndex(e => e.id === action.payload.id)
        if (index !== -1) {
          state.currentOntology.entities[index] = action.payload
          state.currentOntology.updatedAt = new Date().toISOString()
          state.unsavedChanges = true
        }
      }
    },
    deleteEntity: (state, action: PayloadAction<string>) => {
      if (state.currentOntology) {
        state.currentOntology.entities = state.currentOntology.entities.filter(e => e.id !== action.payload)
        state.currentOntology.updatedAt = new Date().toISOString()
        state.unsavedChanges = true
      }
    },
    addRole: (state, action: PayloadAction<RoleType>) => {
      if (state.currentOntology) {
        state.currentOntology.roles.push(action.payload)
        state.currentOntology.updatedAt = new Date().toISOString()
        state.unsavedChanges = true
      }
    },
    updateRole: (state, action: PayloadAction<RoleType>) => {
      if (state.currentOntology) {
        const index = state.currentOntology.roles.findIndex(r => r.id === action.payload.id)
        if (index !== -1) {
          state.currentOntology.roles[index] = action.payload
          state.currentOntology.updatedAt = new Date().toISOString()
          state.unsavedChanges = true
        }
      }
    },
    deleteRole: (state, action: PayloadAction<string>) => {
      if (state.currentOntology) {
        state.currentOntology.roles = state.currentOntology.roles.filter(r => r.id !== action.payload)
        state.currentOntology.updatedAt = new Date().toISOString()
        state.unsavedChanges = true
      }
    },
    addEvent: (state, action: PayloadAction<EventType>) => {
      if (state.currentOntology) {
        state.currentOntology.events.push(action.payload)
        state.currentOntology.updatedAt = new Date().toISOString()
        state.unsavedChanges = true
      }
    },
    updateEvent: (state, action: PayloadAction<EventType>) => {
      if (state.currentOntology) {
        const index = state.currentOntology.events.findIndex(e => e.id === action.payload.id)
        if (index !== -1) {
          state.currentOntology.events[index] = action.payload
          state.currentOntology.updatedAt = new Date().toISOString()
          state.unsavedChanges = true
        }
      }
    },
    deleteEvent: (state, action: PayloadAction<string>) => {
      if (state.currentOntology) {
        state.currentOntology.events = state.currentOntology.events.filter(e => e.id !== action.payload)
        state.currentOntology.updatedAt = new Date().toISOString()
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
})

export const {
  setOntology,
  setPersona,
  addEntity,
  updateEntity,
  deleteEntity,
  addRole,
  updateRole,
  deleteRole,
  addEvent,
  updateEvent,
  deleteEvent,
  setLoading,
  setError,
  markSaved,
} = ontologySlice.actions

export default ontologySlice.reducer