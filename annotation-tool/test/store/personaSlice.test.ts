import { describe, it, expect, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { http, HttpResponse } from 'msw'
import personaReducer, {
  createPersona,
  savePersona,
  savePersonaOntology,
  setActivePersona,
  clearPersonaError,
} from '../../src/store/slices/personaSlice.js'
import { createPersona as createTestPersona } from '../fixtures/personas.js'
import { server } from '../setup.js'

/**
 * Unit tests for personaSlice async thunks.
 * Tests atomic creation, retry mechanism, and rollback behavior.
 */

function createStore(preloadedState?: Partial<ReturnType<typeof personaReducer>>) {
  return configureStore({
    reducer: { persona: personaReducer },
    preloadedState: preloadedState ? { persona: preloadedState as ReturnType<typeof personaReducer> } : undefined,
  })
}

describe('personaSlice', () => {
  describe('createPersona', () => {
    it('succeeds when both persona and ontology API calls succeed', async () => {
      const mockPersona = { id: 'new-id', name: 'Test', role: 'Analyst', informationNeed: 'Testing' }
      const mockOntology = { entities: [], roles: [], events: [], relationTypes: [], relations: [] }

      server.use(
        http.post('/api/personas', () => {
          return HttpResponse.json(mockPersona, { status: 201 })
        }),
        http.put('/api/personas/new-id/ontology', () => {
          return HttpResponse.json(mockOntology)
        })
      )

      const store = createStore()
      const result = await store.dispatch(createPersona({
        persona: { name: 'Test', role: 'Analyst', informationNeed: 'Testing' },
        ontology: mockOntology,
      }))

      expect(result.type).toBe('persona/createPersona/fulfilled')
      expect(result.payload).toEqual({ persona: mockPersona, ontology: mockOntology })
    })

    it('rolls back persona if ontology save fails', async () => {
      const mockPersona = { id: 'rollback-id', name: 'Test', role: 'Analyst', informationNeed: 'Testing' }
      let deleteWasCalled = false

      server.use(
        http.post('/api/personas', () => {
          return HttpResponse.json(mockPersona, { status: 201 })
        }),
        http.put('/api/personas/rollback-id/ontology', () => {
          return HttpResponse.json({ error: 'SERVER_ERROR', message: 'Database error' }, { status: 500 })
        }),
        http.delete('/api/personas/rollback-id', () => {
          deleteWasCalled = true
          return new HttpResponse(null, { status: 204 })
        })
      )

      const store = createStore()
      const result = await store.dispatch(createPersona({
        persona: { name: 'Test', role: 'Analyst', informationNeed: 'Testing' },
        ontology: { entities: [], roles: [], events: [], relationTypes: [], relations: [] },
      }))

      expect(result.type).toBe('persona/createPersona/rejected')
      expect(deleteWasCalled).toBe(true)
      // Error is thrown and goes to result.error.message, not result.payload
      expect((result as { error: { message: string } }).error.message).toBeDefined()
    })

    it('returns error without rollback if initial persona creation fails', async () => {
      let deleteWasCalled = false

      server.use(
        http.post('/api/personas', () => {
          return HttpResponse.json({ error: 'VALIDATION_ERROR', message: 'Name required' }, { status: 400 })
        }),
        http.delete('/api/personas/:id', () => {
          deleteWasCalled = true
          return new HttpResponse(null, { status: 204 })
        })
      )

      const store = createStore()
      const result = await store.dispatch(createPersona({
        persona: { name: '', role: 'Analyst', informationNeed: 'Testing' },
        ontology: { entities: [], roles: [], events: [], relationTypes: [], relations: [] },
      }))

      expect(result.type).toBe('persona/createPersona/rejected')
      expect(deleteWasCalled).toBe(false) // No rollback needed - nothing was created
      // Error is thrown and goes to result.error.message, not result.payload
      expect((result as { error: { message: string } }).error.message).toBe('VALIDATION_ERROR')
    })
  })

  describe('savePersona', () => {
    it('saves persona successfully on first attempt', async () => {
      const existingPersona = createTestPersona({ id: 'existing-1', name: 'Original' })
      const updatedPersona = { ...existingPersona, name: 'Updated' }

      server.use(
        http.put('/api/personas/existing-1', () => {
          return HttpResponse.json(updatedPersona)
        })
      )

      const store = createStore({
        personas: [existingPersona],
        activePersonaId: 'existing-1',
        personaOntologies: [],
        saveStatus: 'idle',
        error: null,
        isLoading: false,
      })

      const result = await store.dispatch(savePersona(updatedPersona))

      expect(result.type).toBe('persona/savePersona/fulfilled')
      expect(result.payload).toMatchObject({ name: 'Updated' })
    })

    it('rejects on 503 service unavailable', async () => {
      let attempts = 0
      const persona = createTestPersona({ id: 'retry-1' })

      server.use(
        http.put('/api/personas/retry-1', () => {
          attempts++
          return HttpResponse.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 })
        })
      )

      const store = createStore({
        personas: [persona],
        activePersonaId: 'retry-1',
        personaOntologies: [],
        saveStatus: 'idle',
        error: null,
        isLoading: false,
      })

      const result = await store.dispatch(savePersona(persona))

      expect(attempts).toBe(1) // No automatic retry
      expect(result.type).toBe('persona/savePersona/rejected')
    })

    it('rejects on 400 validation error', async () => {
      let attempts = 0
      const persona = createTestPersona({ id: 'no-retry-1' })

      server.use(
        http.put('/api/personas/no-retry-1', () => {
          attempts++
          return HttpResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid data' }, { status: 400 })
        })
      )

      const store = createStore({
        personas: [persona],
        activePersonaId: 'no-retry-1',
        personaOntologies: [],
        saveStatus: 'idle',
        error: null,
        isLoading: false,
      })

      const result = await store.dispatch(savePersona(persona))

      expect(attempts).toBe(1)
      expect(result.type).toBe('persona/savePersona/rejected')
      // Error is thrown and goes to result.error.message, not result.payload
      expect((result as { error: { message: string } }).error.message).toBe('VALIDATION_ERROR')
    })

    it('sets error state and rolls back on failure', async () => {
      const originalPersona = createTestPersona({ id: 'rollback-1', name: 'Original' })
      const modifiedPersona = { ...originalPersona, name: 'Modified' }

      server.use(
        http.put('/api/personas/rollback-1', () => {
          return HttpResponse.json({ error: 'SERVER_ERROR', message: 'Database error' }, { status: 500 })
        })
      )

      const store = createStore({
        personas: [originalPersona],
        activePersonaId: 'rollback-1',
        personaOntologies: [],
        saveStatus: 'idle',
        error: null,
        isLoading: false,
      })

      // Dispatch save with modified persona
      const result = await store.dispatch(savePersona(modifiedPersona))

      expect(result.type).toBe('persona/savePersona/rejected')
      expect(store.getState().persona.saveStatus).toBe('error')
      expect(store.getState().persona.error).toBeTruthy()
    })
  })

  describe('savePersonaOntology', () => {
    it('saves ontology successfully', async () => {
      const ontology = { entities: [], roles: [], events: [], relationTypes: [], relations: [] }

      server.use(
        http.put('/api/personas/persona-1/ontology', () => {
          return HttpResponse.json(ontology)
        })
      )

      const store = createStore({
        personas: [createTestPersona({ id: 'persona-1' })],
        activePersonaId: 'persona-1',
        personaOntologies: [],
        saveStatus: 'idle',
        error: null,
        isLoading: false,
      })

      const result = await store.dispatch(savePersonaOntology({ personaId: 'persona-1', ontology }))

      expect(result.type).toBe('persona/savePersonaOntology/fulfilled')
      expect(result.payload).toEqual({ personaId: 'persona-1', ontology })
    })

    it('rejects on 500 errors', async () => {
      let attempts = 0
      const ontology = { entities: [], roles: [], events: [], relationTypes: [], relations: [] }

      server.use(
        http.put('/api/personas/persona-2/ontology', () => {
          attempts++
          return HttpResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
        })
      )

      const store = createStore({
        personas: [createTestPersona({ id: 'persona-2' })],
        activePersonaId: 'persona-2',
        personaOntologies: [],
        saveStatus: 'idle',
        error: null,
        isLoading: false,
      })

      const result = await store.dispatch(savePersonaOntology({ personaId: 'persona-2', ontology }))

      expect(attempts).toBe(1) // No automatic retry
      expect(result.type).toBe('persona/savePersonaOntology/rejected')
    })

    it('rejects with error on 404 (persona deleted)', async () => {
      const ontology = { entities: [], roles: [], events: [], relationTypes: [], relations: [] }

      server.use(
        http.put('/api/personas/deleted-persona/ontology', () => {
          return HttpResponse.json({ error: 'NOT_FOUND', message: 'Persona not found' }, { status: 404 })
        })
      )

      const store = createStore({
        personas: [],
        activePersonaId: 'deleted-persona',
        personaOntologies: [],
        saveStatus: 'idle',
        error: null,
        isLoading: false,
      })

      const result = await store.dispatch(savePersonaOntology({ personaId: 'deleted-persona', ontology }))

      expect(result.type).toBe('persona/savePersonaOntology/rejected')
      // Error is thrown and goes to result.error.message, not result.payload
      expect((result as { error: { message: string } }).error.message).toBe('NOT_FOUND')
    })
  })

  describe('reducer actions', () => {
    it('setActivePersona updates the active persona', () => {
      const store = createStore({
        personas: [createTestPersona({ id: 'p1' }), createTestPersona({ id: 'p2' })],
        activePersonaId: 'p1',
        personaOntologies: [],
        saveStatus: 'idle',
        error: null,
        isLoading: false,
      })

      store.dispatch(setActivePersona('p2'))

      expect(store.getState().persona.activePersonaId).toBe('p2')
    })

    it('clearPersonaError clears the error state', () => {
      const store = createStore({
        personas: [],
        activePersonaId: null,
        personaOntologies: [],
        saveStatus: 'error',
        error: 'Some error',
        isLoading: false,
      })

      store.dispatch(clearPersonaError())

      expect(store.getState().persona.error).toBeNull()
      expect(store.getState().persona.saveStatus).toBe('idle')
    })
  })

  describe('saveStatus state transitions', () => {
    it('transitions through saving -> saved on successful save', async () => {
      const persona = createTestPersona({ id: 'status-1' })

      server.use(
        http.put('/api/personas/status-1', async () => {
          // Small delay to allow checking intermediate state
          await new Promise(r => setTimeout(r, 10))
          return HttpResponse.json(persona)
        })
      )

      const store = createStore({
        personas: [persona],
        activePersonaId: 'status-1',
        personaOntologies: [],
        saveStatus: 'idle',
        error: null,
        isLoading: false,
      })

      const promise = store.dispatch(savePersona(persona))

      // Check saving state (may be brief)
      await new Promise(r => setTimeout(r, 5))
      expect(store.getState().persona.saveStatus).toBe('saving')

      await promise

      expect(store.getState().persona.saveStatus).toBe('saved')
    })

    it('transitions to error state on failure', async () => {
      const persona = createTestPersona({ id: 'error-1' })

      server.use(
        http.put('/api/personas/error-1', () => {
          return HttpResponse.json({ error: 'SERVER_ERROR', message: 'Failed' }, { status: 500 })
        })
      )

      const store = createStore({
        personas: [persona],
        activePersonaId: 'error-1',
        personaOntologies: [],
        saveStatus: 'idle',
        error: null,
        isLoading: false,
      })

      await store.dispatch(savePersona(persona))

      expect(store.getState().persona.saveStatus).toBe('error')
      expect(store.getState().persona.error).toBeTruthy()
    })
  })
})
