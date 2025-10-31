import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { useWikidataImport, WikidataImportData } from '../../src/hooks/useWikidataImport'
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
})
