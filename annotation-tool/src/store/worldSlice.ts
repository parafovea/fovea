import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit'
import {
  Entity,
  Event,
  Time,
  Location,
  EntityCollection,
  EventCollection,
  TimeCollection,
  OntologyRelation,
  EventInterpretation,
  EntityTypeAssignment
} from '../models/types'
import { generateId } from '../utils/uuid'

/**
 * API client for world state operations.
 * Provides functions to load and save world state to the backend.
 */
const worldApi = {
  /**
   * Fetches the world state for the current authenticated user.
   * Creates an empty world state if one doesn't exist.
   */
  async getWorldState() {
    const response = await fetch('/api/world', {
      credentials: 'include'
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch world state: ${response.statusText}`)
    }
    return response.json()
  },

  /**
   * Updates the world state for the current authenticated user.
   * Saves all entities, events, times, collections, and relations.
   */
  async updateWorldState(worldState: Partial<{
    entities: Entity[]
    events: Event[]
    times: Time[]
    entityCollections: EntityCollection[]
    eventCollections: EventCollection[]
    timeCollections: TimeCollection[]
    relations: OntologyRelation[]
  }>) {
    const response = await fetch('/api/world', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(worldState)
    })
    if (!response.ok) {
      throw new Error(`Failed to update world state: ${response.statusText}`)
    }
    return response.json()
  }
}

/**
 * Async thunk to load world state from the backend.
 * Fetches all entities, events, times, collections, and relations for the current user.
 */
export const loadWorldState = createAsyncThunk(
  'world/load',
  async () => {
    const data = await worldApi.getWorldState()
    return data
  }
)

/**
 * Async thunk to save world state to the backend.
 * Sends all entities, events, times, collections, and relations to persist.
 */
export const saveWorldState = createAsyncThunk(
  'world/save',
  async (_, { getState }) => {
    const state = (getState() as any).world
    const worldState = {
      entities: state.entities,
      events: state.events,
      times: state.times,
      entityCollections: state.entityCollections,
      eventCollections: state.eventCollections,
      timeCollections: state.timeCollections,
      relations: state.relations
    }
    const data = await worldApi.updateWorldState(worldState)
    return data
  }
)

interface WorldState {
  // Core objects
  entities: Entity[]
  events: Event[]
  times: Time[]
  
  // Collections
  entityCollections: EntityCollection[]
  eventCollections: EventCollection[]
  timeCollections: TimeCollection[]
  
  // Relations (including temporal)
  relations: OntologyRelation[]
  
  // UI state
  selectedEntity: Entity | null
  selectedEvent: Event | null
  selectedTime: Time | null
  selectedLocation: Location | null
  selectedCollection: EntityCollection | EventCollection | TimeCollection | null
  
  // Loading and error states
  isLoading: boolean
  error: string | null
}

const initialState: WorldState = {
  entities: [],
  events: [],
  times: [],
  entityCollections: [],
  eventCollections: [],
  timeCollections: [],
  relations: [],
  selectedEntity: null,
  selectedEvent: null,
  selectedTime: null,
  selectedLocation: null,
  selectedCollection: null,
  isLoading: false,
  error: null,
}

const worldSlice = createSlice({
  name: 'world',
  initialState,
  reducers: {
    // Entity actions
    addEntity: (state, action: PayloadAction<Omit<Entity, 'id' | 'createdAt' | 'updatedAt'>>) => {
      const entity: Entity = {
        ...action.payload,
        id: generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      state.entities.push(entity)
    },
    
    updateEntity: (state, action: PayloadAction<Entity>) => {
      const index = state.entities.findIndex(e => e.id === action.payload.id)
      if (index !== -1) {
        state.entities[index] = {
          ...action.payload,
          updatedAt: new Date().toISOString(),
        }
      }
    },
    
    deleteEntity: (state, action: PayloadAction<string>) => {
      state.entities = state.entities.filter(e => e.id !== action.payload)
      // Clean up relations involving this entity
      state.relations = state.relations.filter(
        r => !(r.sourceType === 'entity' && r.sourceId === action.payload) &&
             !(r.targetType === 'entity' && r.targetId === action.payload)
      )
    },
    
    // Event actions
    addEvent: (state, action: PayloadAction<Omit<Event, 'id' | 'createdAt' | 'updatedAt'>>) => {
      const event: Event = {
        ...action.payload,
        id: generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      state.events.push(event)
    },
    
    updateEvent: (state, action: PayloadAction<Event>) => {
      const index = state.events.findIndex(e => e.id === action.payload.id)
      if (index !== -1) {
        state.events[index] = {
          ...action.payload,
          updatedAt: new Date().toISOString(),
        }
      }
    },
    
    deleteEvent: (state, action: PayloadAction<string>) => {
      state.events = state.events.filter(e => e.id !== action.payload)
      // Clean up relations involving this event
      state.relations = state.relations.filter(
        r => !(r.sourceType === 'event' && r.sourceId === action.payload) &&
             !(r.targetType === 'event' && r.targetId === action.payload)
      )
    },
    
    // Event interpretation actions
    addEventInterpretation: (state, action: PayloadAction<{ eventId: string; interpretation: EventInterpretation }>) => {
      const event = state.events.find(e => e.id === action.payload.eventId)
      if (event) {
        // Remove any existing interpretation for this persona
        event.personaInterpretations = event.personaInterpretations.filter(
          i => i.personaId !== action.payload.interpretation.personaId
        )
        event.personaInterpretations.push(action.payload.interpretation)
        event.updatedAt = new Date().toISOString()
      }
    },
    
    removeEventInterpretation: (state, action: PayloadAction<{ eventId: string; personaId: string }>) => {
      const event = state.events.find(e => e.id === action.payload.eventId)
      if (event) {
        event.personaInterpretations = event.personaInterpretations.filter(
          i => i.personaId !== action.payload.personaId
        )
        event.updatedAt = new Date().toISOString()
      }
    },
    
    // Time actions
    addTime: (state, action: PayloadAction<Omit<Time, 'id'>>) => {
      const time: Time = {
        ...action.payload,
        id: generateId(),
      }
      state.times.push(time)
    },
    
    updateTime: (state, action: PayloadAction<Time>) => {
      const index = state.times.findIndex(t => t.id === action.payload.id)
      if (index !== -1) {
        state.times[index] = action.payload
      }
    },
    
    deleteTime: (state, action: PayloadAction<string>) => {
      state.times = state.times.filter(t => t.id !== action.payload)
      // Clean up relations involving this time
      state.relations = state.relations.filter(
        r => !(r.sourceType === 'time' && r.sourceId === action.payload) &&
             !(r.targetType === 'time' && r.targetId === action.payload)
      )
    },
    
    // Entity collection actions
    addEntityCollection: (state, action: PayloadAction<Omit<EntityCollection, 'id' | 'createdAt' | 'updatedAt'>>) => {
      const collection: EntityCollection = {
        ...action.payload,
        id: generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      state.entityCollections.push(collection)
    },
    
    updateEntityCollection: (state, action: PayloadAction<EntityCollection>) => {
      const index = state.entityCollections.findIndex(c => c.id === action.payload.id)
      if (index !== -1) {
        state.entityCollections[index] = {
          ...action.payload,
          updatedAt: new Date().toISOString(),
        }
      }
    },
    
    deleteEntityCollection: (state, action: PayloadAction<string>) => {
      state.entityCollections = state.entityCollections.filter(c => c.id !== action.payload)
    },
    
    // Event collection actions
    addEventCollection: (state, action: PayloadAction<Omit<EventCollection, 'id' | 'createdAt' | 'updatedAt'>>) => {
      const collection: EventCollection = {
        ...action.payload,
        id: generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      state.eventCollections.push(collection)
    },
    
    updateEventCollection: (state, action: PayloadAction<EventCollection>) => {
      const index = state.eventCollections.findIndex(c => c.id === action.payload.id)
      if (index !== -1) {
        state.eventCollections[index] = {
          ...action.payload,
          updatedAt: new Date().toISOString(),
        }
      }
    },
    
    deleteEventCollection: (state, action: PayloadAction<string>) => {
      state.eventCollections = state.eventCollections.filter(c => c.id !== action.payload)
    },
    
    // Time collection actions
    addTimeCollection: (state, action: PayloadAction<Omit<TimeCollection, 'id'>>) => {
      const collection: TimeCollection = {
        ...action.payload,
        id: generateId(),
      }
      state.timeCollections.push(collection)
    },
    
    updateTimeCollection: (state, action: PayloadAction<TimeCollection>) => {
      const index = state.timeCollections.findIndex(c => c.id === action.payload.id)
      if (index !== -1) {
        state.timeCollections[index] = action.payload
      }
    },
    
    deleteTimeCollection: (state, action: PayloadAction<string>) => {
      state.timeCollections = state.timeCollections.filter(c => c.id !== action.payload)
    },
    
    // Relation actions
    addRelation: (state, action: PayloadAction<Omit<OntologyRelation, 'id' | 'createdAt' | 'updatedAt'>>) => {
      const relation: OntologyRelation = {
        ...action.payload,
        id: generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      state.relations.push(relation)
    },
    
    updateRelation: (state, action: PayloadAction<OntologyRelation>) => {
      const index = state.relations.findIndex(r => r.id === action.payload.id)
      if (index !== -1) {
        state.relations[index] = {
          ...action.payload,
          updatedAt: new Date().toISOString(),
        }
      }
    },
    
    deleteRelation: (state, action: PayloadAction<string>) => {
      state.relations = state.relations.filter(r => r.id !== action.payload)
    },
    
    // Entity type assignment actions
    addEntityTypeAssignment: (state, action: PayloadAction<{ entityId: string; assignment: EntityTypeAssignment }>) => {
      const entity = state.entities.find(e => e.id === action.payload.entityId)
      if (entity) {
        // Remove any existing assignment for this persona
        entity.typeAssignments = entity.typeAssignments.filter(
          a => a.personaId !== action.payload.assignment.personaId
        )
        entity.typeAssignments.push(action.payload.assignment)
        entity.updatedAt = new Date().toISOString()
      }
    },
    
    removeEntityTypeAssignment: (state, action: PayloadAction<{ entityId: string; personaId: string }>) => {
      const entity = state.entities.find(e => e.id === action.payload.entityId)
      if (entity) {
        entity.typeAssignments = entity.typeAssignments.filter(
          a => a.personaId !== action.payload.personaId
        )
        entity.updatedAt = new Date().toISOString()
      }
    },
    
    // Selection actions
    selectEntity: (state, action: PayloadAction<Entity | null>) => {
      state.selectedEntity = action.payload
      // If it's a location, also set selectedLocation
      if (action.payload && 'locationType' in action.payload) {
        state.selectedLocation = action.payload as Location
      } else {
        state.selectedLocation = null
      }
    },
    
    selectEvent: (state, action: PayloadAction<Event | null>) => {
      state.selectedEvent = action.payload
    },
    
    selectTime: (state, action: PayloadAction<Time | null>) => {
      state.selectedTime = action.payload
    },
    
    selectCollection: (state, action: PayloadAction<EntityCollection | EventCollection | TimeCollection | null>) => {
      state.selectedCollection = action.payload
    },
    
    // Bulk actions
    setWorldData: (state, action: PayloadAction<{
      entities?: Entity[]
      events?: Event[]
      times?: Time[]
      entityCollections?: EntityCollection[]
      eventCollections?: EventCollection[]
      timeCollections?: TimeCollection[]
      relations?: OntologyRelation[]
    }>) => {
      if (action.payload.entities) state.entities = action.payload.entities
      if (action.payload.events) state.events = action.payload.events
      if (action.payload.times) state.times = action.payload.times
      if (action.payload.entityCollections) state.entityCollections = action.payload.entityCollections
      if (action.payload.eventCollections) state.eventCollections = action.payload.eventCollections
      if (action.payload.timeCollections) state.timeCollections = action.payload.timeCollections
      if (action.payload.relations) state.relations = action.payload.relations
    },
    
    // Loading and error states
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
    
    clearWorld: () => {
      return initialState
    },
  },
  extraReducers: (builder) => {
    builder
      // Load world state
      .addCase(loadWorldState.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(loadWorldState.fulfilled, (state, action) => {
        state.isLoading = false
        state.entities = action.payload.entities || []
        state.events = action.payload.events || []
        state.times = action.payload.times || []
        state.entityCollections = action.payload.entityCollections || []
        state.eventCollections = action.payload.eventCollections || []
        state.timeCollections = action.payload.timeCollections || []
        state.relations = action.payload.relations || []
      })
      .addCase(loadWorldState.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message || 'Failed to load world state'
      })
      // Save world state
      .addCase(saveWorldState.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(saveWorldState.fulfilled, (state) => {
        state.isLoading = false
      })
      .addCase(saveWorldState.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message || 'Failed to save world state'
      })
  },
})

export const {
  addEntity,
  updateEntity,
  deleteEntity,
  addEvent,
  updateEvent,
  deleteEvent,
  addEventInterpretation,
  removeEventInterpretation,
  addTime,
  updateTime,
  deleteTime,
  addEntityCollection,
  updateEntityCollection,
  deleteEntityCollection,
  addEventCollection,
  updateEventCollection,
  deleteEventCollection,
  addTimeCollection,
  updateTimeCollection,
  deleteTimeCollection,
  addRelation,
  updateRelation,
  deleteRelation,
  addEntityTypeAssignment,
  removeEntityTypeAssignment,
  selectEntity,
  selectEvent,
  selectTime,
  selectCollection,
  setWorldData,
  setLoading,
  setError,
  clearWorld,
} = worldSlice.actions

export default worldSlice.reducer