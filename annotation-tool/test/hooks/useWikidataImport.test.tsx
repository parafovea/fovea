import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { useWikidataImport, WikidataImportData } from '../../src/hooks/useWikidataImport'
import { DuplicateImportError } from '../../src/lib/errors'
import personaSlice from '../../src/store/personaSlice'
import worldSlice from '../../src/store/worldSlice'

// Mock timer functions
vi.useFakeTimers()

const createMockStore = () => {
  return configureStore({
    reducer: {
      persona: personaSlice,
      world: worldSlice,
    },
    preloadedState: {
      persona: {
        personas: [],
        personaOntologies: [],
        activePersonaId: 'test-persona-id',
        isLoading: false,
        error: null,
        unsavedChanges: false,
      },
      world: {
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
      },
    },
  })
}

const createWrapper = () => {
  const store = createMockStore()
  return ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
}

const mockImportData: WikidataImportData = {
  name: 'Test Entity',
  description: 'A test entity from Wikidata',
  wikidataId: 'Q12345',
  wikidataUrl: 'https://www.wikidata.org/wiki/Q12345',
  aliases: ['Test', 'Entity'],
}

describe('useWikidataImport', () => {
  beforeEach(() => {
    vi.clearAllTimers()
    vi.clearAllMocks()
  })

  describe('importItem', () => {
    it('imports entity-type successfully', async () => {
      const { result } = renderHook(
        () => useWikidataImport('entity-type', 'test-persona-id'),
        { wrapper: createWrapper() }
      )

      expect(result.current.importing).toBe(false)
      expect(result.current.error).toBeNull()

      let importedId: string | undefined
      await act(async () => {
        importedId = await result.current.importItem(mockImportData)
      })

      expect(importedId).toBeDefined()
      expect(result.current.importing).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('imports role-type successfully', async () => {
      const { result } = renderHook(
        () => useWikidataImport('role-type', 'test-persona-id'),
        { wrapper: createWrapper() }
      )

      let importedId: string | undefined
      await act(async () => {
        importedId = await result.current.importItem(mockImportData)
      })

      expect(importedId).toBeDefined()
      expect(result.current.error).toBeNull()
    })

    it('imports event-type successfully', async () => {
      const { result } = renderHook(
        () => useWikidataImport('event-type', 'test-persona-id'),
        { wrapper: createWrapper() }
      )

      let importedId: string | undefined
      await act(async () => {
        importedId = await result.current.importItem(mockImportData)
      })

      expect(importedId).toBeDefined()
      expect(result.current.error).toBeNull()
    })

    it('imports relation-type successfully', async () => {
      const { result } = renderHook(
        () => useWikidataImport('relation-type', 'test-persona-id'),
        { wrapper: createWrapper() }
      )

      let importedId: string | undefined
      await act(async () => {
        importedId = await result.current.importItem(mockImportData)
      })

      expect(importedId).toBeDefined()
      expect(result.current.error).toBeNull()
    })

    it('imports entity successfully', async () => {
      const { result } = renderHook(
        () => useWikidataImport('entity'),
        { wrapper: createWrapper() }
      )

      let importedId: string | undefined
      await act(async () => {
        importedId = await result.current.importItem(mockImportData)
      })

      expect(importedId).toBeDefined()
      expect(result.current.error).toBeNull()
    })

    it('imports event successfully', async () => {
      const { result } = renderHook(
        () => useWikidataImport('event'),
        { wrapper: createWrapper() }
      )

      let importedId: string | undefined
      await act(async () => {
        importedId = await result.current.importItem(mockImportData)
      })

      expect(importedId).toBeDefined()
      expect(result.current.error).toBeNull()
    })

    it('imports location successfully', async () => {
      const locationData: WikidataImportData = {
        ...mockImportData,
        coordinates: { latitude: 40.7128, longitude: -74.0060 },
      }

      const { result } = renderHook(
        () => useWikidataImport('location'),
        { wrapper: createWrapper() }
      )

      let importedId: string | undefined
      await act(async () => {
        importedId = await result.current.importItem(locationData)
      })

      expect(importedId).toBeDefined()
      expect(result.current.error).toBeNull()
    })

    it('throws error when personaId is missing for type imports', async () => {
      const { result } = renderHook(
        () => useWikidataImport('entity-type'),
        { wrapper: createWrapper() }
      )

      await expect(async () => {
        await act(async () => {
          await result.current.importItem(mockImportData)
        })
      }).rejects.toThrow('personaId required for entity-type import')
    })

    it('calls onSuccess callback', async () => {
      const onSuccess = vi.fn()
      const { result } = renderHook(
        () => useWikidataImport('entity-type', 'test-persona-id', onSuccess),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        await result.current.importItem(mockImportData)
      })

      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(onSuccess).toHaveBeenCalledWith(expect.any(String))
    })
  })

  describe('undo functionality', () => {
    it('undoes import within timeout', async () => {
      const { result } = renderHook(
        () => useWikidataImport('entity-type', 'test-persona-id'),
        { wrapper: createWrapper() }
      )

      let importedId: string | undefined
      await act(async () => {
        importedId = await result.current.importItem(mockImportData)
      })

      expect(importedId).toBeDefined()

      // Undo immediately
      act(() => {
        result.current.undo(importedId!)
      })

      // Should not throw error
      expect(result.current.error).toBeNull()
    })

    it('throws error when undo timeout expires', async () => {
      const { result } = renderHook(
        () => useWikidataImport('entity-type', 'test-persona-id'),
        { wrapper: createWrapper() }
      )

      let importedId: string | undefined
      await act(async () => {
        importedId = await result.current.importItem(mockImportData)
      })

      // Advance timers past the 10-second undo window
      act(() => {
        vi.advanceTimersByTime(10001)
      })

      // Try to undo after timeout
      expect(() => {
        result.current.undo(importedId!)
      }).toThrow('Undo timeout expired or invalid ID')
    })

    it('throws error for invalid ID', () => {
      const { result } = renderHook(
        () => useWikidataImport('entity-type', 'test-persona-id'),
        { wrapper: createWrapper() }
      )

      expect(() => {
        result.current.undo('non-existent-id')
      }).toThrow('Undo timeout expired or invalid ID')
    })

    it('clears undo queue on clearUndo', async () => {
      const { result } = renderHook(
        () => useWikidataImport('entity-type', 'test-persona-id'),
        { wrapper: createWrapper() }
      )

      let importedId: string | undefined
      await act(async () => {
        importedId = await result.current.importItem(mockImportData)
      })

      act(() => {
        result.current.clearUndo()
      })

      // Trying to undo should fail
      expect(() => {
        result.current.undo(importedId!)
      }).toThrow('Undo timeout expired or invalid ID')
    })
  })

  describe('loading states', () => {
    it('sets importing state during import', async () => {
      const { result } = renderHook(
        () => useWikidataImport('entity-type', 'test-persona-id'),
        { wrapper: createWrapper() }
      )

      expect(result.current.importing).toBe(false)

      const importPromise = act(async () => {
        return result.current.importItem(mockImportData)
      })

      await importPromise

      expect(result.current.importing).toBe(false)
    })
  })

  describe('duplicate detection', () => {
    // Create a mock store with existing items that have wikidataIds
    const createMockStoreWithExistingItems = () => {
      return configureStore({
        reducer: {
          persona: personaSlice,
          world: worldSlice,
        },
        preloadedState: {
          persona: {
            personas: [],
            personaOntologies: [{
              id: 'test-ontology-id',
              personaId: 'test-persona-id',
              entities: [{
                id: 'existing-entity-type',
                name: 'Existing Entity Type',
                wikidataId: 'Q12345',
                gloss: [],
                examples: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }],
              roles: [{
                id: 'existing-role-type',
                name: 'Existing Role Type',
                wikidataId: 'Q67890',
                gloss: [],
                allowedFillerTypes: ['entity'],
                examples: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }],
              events: [{
                id: 'existing-event-type',
                name: 'Existing Event Type',
                wikidataId: 'Q11111',
                gloss: [],
                roles: [],
                examples: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }],
              relationTypes: [{
                id: 'existing-relation-type',
                name: 'Existing Relation Type',
                wikidataId: 'Q22222',
                gloss: [],
                sourceTypes: ['entity'],
                targetTypes: ['entity'],
                symmetric: false,
                transitive: false,
                examples: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }],
              relations: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }],
            activePersonaId: 'test-persona-id',
            isLoading: false,
            error: null,
            unsavedChanges: false,
          },
          world: {
            entities: [{
              id: 'existing-entity',
              name: 'Existing Entity',
              wikidataId: 'Q33333',
              description: [],
              typeAssignments: [],
              metadata: { alternateNames: [], externalIds: {}, properties: {} },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }],
            events: [{
              id: 'existing-event',
              name: 'Existing Event',
              wikidataId: 'Q44444',
              description: [],
              personaInterpretations: [],
              metadata: { certainty: 1.0, properties: {} },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }],
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
          },
        },
      })
    }

    const createWrapperWithExistingItems = () => {
      const store = createMockStoreWithExistingItems()
      return ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      )
    }

    it('throws DuplicateImportError for duplicate entity-type', async () => {
      const duplicateData: WikidataImportData = {
        name: 'New Entity Type',
        description: 'A duplicate entity type',
        wikidataId: 'Q12345', // Same as existing
        wikidataUrl: 'https://www.wikidata.org/wiki/Q12345',
      }

      const { result } = renderHook(
        () => useWikidataImport('entity-type', 'test-persona-id'),
        { wrapper: createWrapperWithExistingItems() }
      )

      await expect(async () => {
        await act(async () => {
          await result.current.importItem(duplicateData)
        })
      }).rejects.toThrow(DuplicateImportError)
    })

    it('throws DuplicateImportError for duplicate role-type', async () => {
      const duplicateData: WikidataImportData = {
        name: 'New Role Type',
        description: 'A duplicate role type',
        wikidataId: 'Q67890',
        wikidataUrl: 'https://www.wikidata.org/wiki/Q67890',
      }

      const { result } = renderHook(
        () => useWikidataImport('role-type', 'test-persona-id'),
        { wrapper: createWrapperWithExistingItems() }
      )

      await expect(async () => {
        await act(async () => {
          await result.current.importItem(duplicateData)
        })
      }).rejects.toThrow(DuplicateImportError)
    })

    it('throws DuplicateImportError for duplicate event-type', async () => {
      const duplicateData: WikidataImportData = {
        name: 'New Event Type',
        description: 'A duplicate event type',
        wikidataId: 'Q11111',
        wikidataUrl: 'https://www.wikidata.org/wiki/Q11111',
      }

      const { result } = renderHook(
        () => useWikidataImport('event-type', 'test-persona-id'),
        { wrapper: createWrapperWithExistingItems() }
      )

      await expect(async () => {
        await act(async () => {
          await result.current.importItem(duplicateData)
        })
      }).rejects.toThrow(DuplicateImportError)
    })

    it('throws DuplicateImportError for duplicate relation-type', async () => {
      const duplicateData: WikidataImportData = {
        name: 'New Relation Type',
        description: 'A duplicate relation type',
        wikidataId: 'Q22222',
        wikidataUrl: 'https://www.wikidata.org/wiki/Q22222',
      }

      const { result } = renderHook(
        () => useWikidataImport('relation-type', 'test-persona-id'),
        { wrapper: createWrapperWithExistingItems() }
      )

      await expect(async () => {
        await act(async () => {
          await result.current.importItem(duplicateData)
        })
      }).rejects.toThrow(DuplicateImportError)
    })

    it('throws DuplicateImportError for duplicate entity', async () => {
      const duplicateData: WikidataImportData = {
        name: 'New Entity',
        description: 'A duplicate entity',
        wikidataId: 'Q33333',
        wikidataUrl: 'https://www.wikidata.org/wiki/Q33333',
      }

      const { result } = renderHook(
        () => useWikidataImport('entity'),
        { wrapper: createWrapperWithExistingItems() }
      )

      await expect(async () => {
        await act(async () => {
          await result.current.importItem(duplicateData)
        })
      }).rejects.toThrow(DuplicateImportError)
    })

    it('throws DuplicateImportError for duplicate event', async () => {
      const duplicateData: WikidataImportData = {
        name: 'New Event',
        description: 'A duplicate event',
        wikidataId: 'Q44444',
        wikidataUrl: 'https://www.wikidata.org/wiki/Q44444',
      }

      const { result } = renderHook(
        () => useWikidataImport('event'),
        { wrapper: createWrapperWithExistingItems() }
      )

      await expect(async () => {
        await act(async () => {
          await result.current.importItem(duplicateData)
        })
      }).rejects.toThrow(DuplicateImportError)
    })

    it('throws DuplicateImportError for duplicate location', async () => {
      const duplicateData: WikidataImportData = {
        name: 'New Location',
        description: 'A duplicate location',
        wikidataId: 'Q33333', // Same as existing entity (locations are entities)
        wikidataUrl: 'https://www.wikidata.org/wiki/Q33333',
        coordinates: { latitude: 40.7128, longitude: -74.0060 },
      }

      const { result } = renderHook(
        () => useWikidataImport('location'),
        { wrapper: createWrapperWithExistingItems() }
      )

      await expect(async () => {
        await act(async () => {
          await result.current.importItem(duplicateData)
        })
      }).rejects.toThrow(DuplicateImportError)
    })

    it('allows importing when wikidataId is different', async () => {
      const newData: WikidataImportData = {
        name: 'New Entity Type',
        description: 'A new entity type with different wikidataId',
        wikidataId: 'Q99999', // Different from existing
        wikidataUrl: 'https://www.wikidata.org/wiki/Q99999',
      }

      const { result } = renderHook(
        () => useWikidataImport('entity-type', 'test-persona-id'),
        { wrapper: createWrapperWithExistingItems() }
      )

      let importedId: string | undefined
      await act(async () => {
        importedId = await result.current.importItem(newData)
      })

      expect(importedId).toBeDefined()
      expect(result.current.error).toBeNull()
    })

    it('calls onError callback for duplicate imports', async () => {
      const onError = vi.fn()
      const duplicateData: WikidataImportData = {
        name: 'New Entity Type',
        description: 'A duplicate',
        wikidataId: 'Q12345',
        wikidataUrl: 'https://www.wikidata.org/wiki/Q12345',
      }

      const { result } = renderHook(
        () => useWikidataImport('entity-type', 'test-persona-id', undefined, onError),
        { wrapper: createWrapperWithExistingItems() }
      )

      try {
        await act(async () => {
          await result.current.importItem(duplicateData)
        })
      } catch {
        // Expected to throw
      }

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(expect.any(DuplicateImportError))
    })

    it('sets error state for duplicate imports', async () => {
      const duplicateData: WikidataImportData = {
        name: 'New Entity Type',
        description: 'A duplicate',
        wikidataId: 'Q12345',
        wikidataUrl: 'https://www.wikidata.org/wiki/Q12345',
      }

      const { result } = renderHook(
        () => useWikidataImport('entity-type', 'test-persona-id'),
        { wrapper: createWrapperWithExistingItems() }
      )

      // Track that error was thrown
      let thrownError: Error | null = null

      // The act wrapper needs to catch the error internally for state to be flushed
      await act(async () => {
        try {
          await result.current.importItem(duplicateData)
        } catch (e) {
          thrownError = e as Error
        }
      })

      // Verify error was thrown
      expect(thrownError).toBeInstanceOf(DuplicateImportError)
      // Verify error state was set
      expect(result.current.error).toBe('A entity type with Wikidata ID "Q12345" already exists: "Existing Entity Type"')
    })

    it('provides correct error message format', async () => {
      const duplicateData: WikidataImportData = {
        name: 'New Entity Type',
        description: 'A duplicate',
        wikidataId: 'Q12345',
        wikidataUrl: 'https://www.wikidata.org/wiki/Q12345',
      }

      const { result } = renderHook(
        () => useWikidataImport('entity-type', 'test-persona-id'),
        { wrapper: createWrapperWithExistingItems() }
      )

      await expect(async () => {
        await act(async () => {
          await result.current.importItem(duplicateData)
        })
      }).rejects.toThrow('A entity type with Wikidata ID "Q12345" already exists: "Existing Entity Type"')
    })
  })
})
